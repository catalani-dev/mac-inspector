// SPDX-FileCopyrightText: 2026 CatalaniDev <catalanidev@gmail.com>
// SPDX-License-Identifier: LicenseRef-MAC-Inspector-1.0
//
// content.js — detects the MAC address under the cursor and shows its vendor.
//
// The page is never rewritten: no wrapper elements, no DOM scans, no
// MutationObserver. At most once per animation frame the character under the
// cursor is read with caretPositionFromPoint and a MAC is searched around it.
//
// Normal mode:   the MAC is highlighted with the CSS Custom Highlight API
//                (random name, CSS injected as a user stylesheet) and the
//                tooltip lives in a closed shadow root in the top layer, attached
//                to the DOM only while it is visible.
// Discreet mode: nothing is added to the page; results are only recorded for the
//                popup, the toolbar badge and the side panel.
//
// Supported targets: text, open shadow roots, text <input>, <textarea>, iframes.
// Password fields are never read.
//
// This file can be injected more than once into the same frame (registered
// script + "activate now"); the __macInspectorActive flag keeps one instance.

(() => {
  'use strict';

  const core = globalThis.MacCore;
  const i18n = globalThis.MacI18n;
  if (!core || !i18n || globalThis.__macInspectorActive) return;
  if (!(document.documentElement instanceof HTMLElement)) return; // XML/SVG documents
  globalThis.__macInspectorActive = true;

  // ─── Constants and state ───────────────────────────────────────────────────

  const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email']);
  const NON_RENDERED = new Set(['script', 'style', 'noscript', 'template', 'title']);
  const FRAME_TAGS = new Set(['iframe', 'frame']);
  const CACHE_MAX = 500;

  // A frame that is a direct child of the top page hands its tooltip to the top
  // page, otherwise the tooltip would be clipped by a small iframe.
  const IS_TOP = window === window.top;
  const CHILD_OF_TOP = !IS_TOP && (() => { try { return window.parent === window.top; } catch { return false; } })();
  const TOP_URL = getTopUrl();

  // Random per-page highlight name: the page cannot probe for a known name
  const HIGHLIGHT_NAME = 'mi-' + Array.from(crypto.getRandomValues(new Uint8Array(6)),
    b => b.toString(36).padStart(2, '0').slice(-2)).join('');

  let enabled = true;
  let discreet = false;
  let t = i18n.translator('en'); // replaced by the user's language in loadSettings()
  let mouseX = -1;
  let mouseY = -1;
  let mouseButtons = 0;
  let frameRequested = false;
  let current = null;        // hovered target: { node, index, mac, range }
  let dismissed = null;      // target closed with Esc, until the cursor leaves it
  let requestSeq = 0;        // invalidates lookups that finish after the cursor moved
  let highlightCss = null;   // Promise of the highlight stylesheet injection
  let enteredFrame = null;   // top page: iframe element the cursor entered last
  let frameTipShown = false; // top page: tooltip currently shown for a child frame
  let delegated = false;     // child frame: tooltip currently shown by the top page
  const cache = new Map();   // normalised MAC → lookup result

  // The site that permissions refer to is the top-level page, also inside frames
  function getTopUrl() {
    const origins = location.ancestorOrigins;
    const top = origins && origins.length ? origins[origins.length - 1] : null;
    return top && top !== 'null' ? `${top}/` : location.href;
  }

  // ─── Settings ──────────────────────────────────────────────────────────────

  function loadSettings() {
    chrome.storage.local.get({ discreet: false }).then(s => {
      discreet = s.discreet === true;
      hide();
    }, () => {});
    i18n.load().then(loaded => { t = loaded.t; }, () => {});
  }

  // Error codes from the service worker are translated; other messages are shown as they are
  function errorText(error) {
    const key = `error.${error}`;
    const text = t(key);
    return text === key ? String(error) : text;
  }

  // ─── Messaging with the service worker ─────────────────────────────────────

  function isContextValid() {
    try { return !!chrome.runtime?.id; } catch { return false; }
  }

  // Resolves to a LookupResult, { error } on failure, or null once torn down
  function lookup(mac) {
    const hex = core.normalize(mac);
    if (!hex) return Promise.resolve({ valid: false });
    if (cache.has(hex)) return Promise.resolve(cache.get(hex));

    return new Promise(resolve => {
      if (!isContextValid()) { teardown(); resolve(null); return; }
      try {
        chrome.runtime.sendMessage({ type: 'LOOKUP', mac: hex }, response => {
          const err = chrome.runtime.lastError;
          if (err || !response?.ok) {
            resolve({ error: response?.error || err?.message || 'unknown' });
            return;
          }
          if (cache.size >= CACHE_MAX) cache.clear();
          cache.set(hex, response.result);
          resolve(response.result);
        });
      } catch {
        // "Extension context invalidated": the extension was reloaded or updated
        teardown();
        resolve(null);
      }
    });
  }

  // Records the result for the popup history, the badge and the side panel
  function publish(mac, result) {
    try {
      chrome.runtime.sendMessage({ type: 'HOVER', mac, result }).catch(() => {});
    } catch { /* context invalidated */ }
  }

  function sendFrameTip(payload) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type: 'FRAME_TIP', ...payload }, res => {
          void chrome.runtime.lastError;
          resolve(!!res?.ok);
        });
      } catch {
        resolve(false);
      }
    });
  }

  // ─── Hit testing: which MAC is under the cursor ────────────────────────────

  // caretPositionFromPoint only enters shadow roots it is given explicitly
  function openShadowRootsAt(x, y) {
    const roots = [];
    let el = document.elementFromPoint(x, y);
    while (el && el.shadowRoot && roots.length < 16) {
      roots.push(el.shadowRoot);
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return roots;
  }

  function caretFromPoint(x, y) {
    try {
      if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y, { shadowRoots: openShadowRootsAt(x, y) });
        return pos && pos.offsetNode ? { node: pos.offsetNode, offset: pos.offset } : null;
      }
      const range = document.caretRangeFromPoint?.(x, y);
      return range ? { node: range.startContainer, offset: range.startOffset } : null;
    } catch {
      return null;
    }
  }

  function pointInRects(rects, x, y) {
    const T = 2; // tolerance in CSS pixels
    for (const r of rects) {
      if (x >= r.left - T && x <= r.right + T && y >= r.top - T && y <= r.bottom + T) return true;
    }
    return false;
  }

  function isTextControl(node) {
    return node.localName === 'textarea' ||
      (node.localName === 'input' && TEXT_INPUT_TYPES.has(node.type));
  }

  // Text controls expose no per-character rectangles, and in the empty space
  // after a line the caret stays on the last character. If moving about one
  // character to the left does not move the caret, the cursor is not on text.
  function caretMovesLeft(node, offset, x, y) {
    const step = Math.max(4, (parseFloat(getComputedStyle(node).fontSize) || 12) * 0.9);
    const back = caretFromPoint(x - step, y);
    return !!back && back.node === node && back.offset < offset;
  }

  function hitTest(x, y) {
    const caret = caretFromPoint(x, y);
    if (!caret) return null;
    const { node, offset } = caret;

    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement;
      if (!parent || NON_RENDERED.has(parent.localName)) return null;
      const found = core.findMacAt(node.data, offset);
      if (!found) return null;
      const range = document.createRange();
      range.setStart(node, found.index);
      range.setEnd(node, found.index + found.mac.length);
      // The caret API returns the nearest character even when the cursor is far
      // from any text: confirm the cursor is really over the MAC
      if (!pointInRects(range.getClientRects(), x, y)) return null;
      return { node, index: found.index, mac: found.mac, range };
    }

    if (node.nodeType === Node.ELEMENT_NODE && isTextControl(node)) {
      const found = core.findMacAt(node.value, offset);
      if (!found || !pointInRects([node.getBoundingClientRect()], x, y)) return null;
      if (offset >= found.index + found.mac.length && !caretMovesLeft(node, offset, x, y)) return null;
      return { node, index: found.index, mac: found.mac, range: null };
    }

    return null;
  }

  const sameTarget = (a, b) => !!a && !!b && a.node === b.node && a.index === b.index && a.mac === b.mac;

  // ─── Highlight (no DOM changes) ────────────────────────────────────────────

  function ensureHighlightCss() {
    if (!highlightCss) {
      highlightCss = new Promise(resolve => {
        try {
          chrome.runtime.sendMessage({ type: 'HIGHLIGHT_CSS', name: HIGHLIGHT_NAME }, () => {
            void chrome.runtime.lastError;
            resolve();
          });
        } catch { resolve(); }
      });
    }
    return highlightCss;
  }

  function setHighlight(range) {
    if (discreet || !range || !globalThis.CSS?.highlights || typeof Highlight !== 'function') return;
    ensureHighlightCss();
    try { CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range)); } catch { /* unsupported */ }
  }

  function clearHighlight() {
    try { globalThis.CSS?.highlights?.delete(HIGHLIGHT_NAME); } catch { /* unsupported */ }
  }

  // ─── Tooltip (closed shadow root + manual popover in the top layer) ────────

  // Same visual language as the popup and side panel: a cable-label card with a
  // colour stripe for the address type and the vendor prefix in bold.
  const TOOLTIP_CSS = `
    .tip {
      --paper: #FFFFFF; --ink: #1D2127; --muted: #5B6470; --faint: #6E767F; --line: #C9CFD6;
      --kind: #6B737D;
      box-sizing: border-box; display: flex; flex-direction: column; gap: 1px;
      min-width: 200px; max-width: 340px; padding: 7px 11px 8px; text-align: left;
      background: var(--paper); color: var(--ink);
      border: 1px solid var(--line); border-left: 4px solid var(--kind); border-radius: 3px;
      box-shadow: 0 1px 2px rgb(0 0 0 / .12), 0 6px 18px rgb(0 0 0 / .16);
      font: 13px/1.4 "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
      animation: mi-in 90ms ease-out;
    }
    @media (prefers-color-scheme: dark) {
      .tip { --paper: #262A31; --ink: #E7E9EC; --muted: #A1A9B3; --faint: #8B939E; --line: #3E444E;
             box-shadow: 0 6px 20px rgb(0 0 0 / .45); }
    }
    .tip[data-kind="vendor"]  { --kind: #2F6FDF; }
    .tip[data-kind="local"]   { --kind: #AD5710; }
    .tip[data-kind="group"]   { --kind: #7353CC; }
    .tip[data-kind="invalid"] { --kind: #C23B3B; }
    @media (prefers-color-scheme: dark) {
      .tip[data-kind="vendor"] { --kind: #7AA7FF; }
      .tip[data-kind="local"]  { --kind: #F0A45A; }
      .tip[data-kind="group"]  { --kind: #AE95FF; }
      .tip[data-kind="unknown"] { --kind: #9AA3AE; }
    }
    @keyframes mi-in { from { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .tip { animation: none; } }
    .cat { font-size: 11.5px; font-weight: 600; color: var(--kind); }
    .title { font-size: 14.5px; font-weight: 600; overflow-wrap: anywhere; }
    .mac { font: 13px/1.5 "Cascadia Mono", "Cascadia Code", "SF Mono", ui-monospace, Consolas, monospace;
           color: var(--faint); letter-spacing: .02em; }
    .mac b { font-weight: 700; color: var(--ink); }
    .detail { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
    [hidden] { display: none !important; }
  `;

  // Inline !important styles: page CSS cannot hide or distort the host element
  const HOST_STYLE = {
    position: 'fixed', inset: 'auto', left: '0px', top: '0px', margin: '0', padding: '0',
    border: '0', outline: '0', background: 'transparent', 'box-shadow': 'none',
    width: 'auto', height: 'auto', 'max-width': 'none', 'max-height': 'none',
    overflow: 'visible', display: 'block', opacity: '1', visibility: 'visible',
    transform: 'none', filter: 'none', 'pointer-events': 'none', 'z-index': '2147483647',
  };

  const tooltip = (() => {
    let host = null;
    let parts = null;
    let visible = false;

    function el(tag, className, parent) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      parent.appendChild(node);
      return node;
    }

    // Built with createElement (never innerHTML): works under Trusted Types
    function build() {
      host = document.createElement('div');
      if ('popover' in host) host.popover = 'manual';
      for (const [prop, value] of Object.entries(HOST_STYLE)) host.style.setProperty(prop, value, 'important');

      const root = host.attachShadow({ mode: 'closed' });
      el('style', '', root).textContent = TOOLTIP_CSS;
      const box = el('div', 'tip', root);
      box.setAttribute('role', 'tooltip');
      parts = {
        box,
        cat: el('div', 'cat', box),
        title: el('div', 'title', box),
        mac: el('div', 'mac', box),
        detail: el('div', 'detail', box),
      };
    }

    // result: LookupResult, { error }, or null while the lookup is pending
    function render(mac, result) {
      if (!host) build();
      const hex = core.normalize(mac);

      let view;
      if (!result) view = { kind: 'unknown', category: t('tooltip.loading'), title: '', detail: '' };
      else if (result.error) view = { kind: 'invalid', category: t('tooltip.failed'), title: '', detail: errorText(result.error) };
      else view = core.describe(result, t);

      parts.box.dataset.kind = view.kind;
      parts.cat.textContent = view.category;
      parts.title.textContent = view.title;
      parts.title.hidden = !view.title;
      const [head, tail] = hex ? core.splitMac(hex, result?.prefix?.length) : [mac, ''];
      const strong = document.createElement('b');
      strong.textContent = head;
      parts.mac.replaceChildren(strong, document.createTextNode(tail));
      parts.detail.textContent = view.detail;
      parts.detail.hidden = !view.detail;

      if (!visible) {
        document.documentElement.appendChild(host);
        try { host.showPopover?.(); } catch { /* popover unsupported */ }
        visible = true;
      }
    }

    // Places the tooltip next to the cursor, flipping it to stay in the viewport
    function moveTo(x, y) {
      if (!visible) return;
      const w = host.offsetWidth;
      const h = host.offsetHeight;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = document.documentElement.clientHeight || window.innerHeight;
      let left = x + 14;
      let top = y + 18;
      if (left + w > vw - 6) left = Math.max(6, x - w - 14);
      if (top + h > vh - 6) top = Math.max(6, y - h - 12);
      host.style.setProperty('left', `${Math.round(left)}px`, 'important');
      host.style.setProperty('top', `${Math.round(top)}px`, 'important');
    }

    function hide() {
      if (!visible) return;
      visible = false;
      try { host.hidePopover?.(); } catch { /* already closed */ }
      host.remove();
    }

    return { render, moveTo, hide, get visible() { return visible; } };
  })();

  // ─── Hover lifecycle ───────────────────────────────────────────────────────

  function show(hit) {
    current = hit;
    const seq = ++requestSeq;
    // Twelve decimal digits are often an order number, a phone number or a date:
    // treat them as a MAC only when the prefix is registered to a vendor
    const digitsOnly = /^\d{12}$/.test(hit.mac);
    const inPage = !discreet && !digitsOnly;

    tooltip.hide();
    frameTipShown = false;
    clearHighlight();
    if (inPage) {
      setHighlight(hit.range);
      // The loading state appears only if the answer is slow: no flicker
      setTimeout(() => {
        if (seq !== requestSeq || current !== hit || tooltip.visible || CHILD_OF_TOP) return;
        tooltip.render(hit.mac, null);
        tooltip.moveTo(mouseX, mouseY);
      }, 120);
    }

    lookup(hit.mac).then(result => {
      if (seq !== requestSeq || current !== hit || !result) return; // the cursor moved on
      if (digitsOnly && (!result.vendor || result.isLocal || result.isMulticast)) return;
      if (!result.error) publish(hit.mac, result);
      if (discreet) return;
      if (digitsOnly) setHighlight(hit.range);
      displayResult(hit, result, seq);
    });
  }

  function displayResult(hit, result, seq) {
    if (!CHILD_OF_TOP || result.error) {
      tooltip.render(hit.mac, result);
      tooltip.moveTo(mouseX, mouseY);
      return;
    }
    delegated = true;
    sendFrameTip({ action: 'show', mac: hit.mac, result, x: mouseX, y: mouseY }).then(shown => {
      if (shown || seq !== requestSeq || current !== hit) return;
      // Top page unavailable (e.g. not authorised): fall back to a local tooltip
      delegated = false;
      tooltip.render(hit.mac, result);
      tooltip.moveTo(mouseX, mouseY);
    });
  }

  function hide() {
    if (delegated) {
      delegated = false;
      sendFrameTip({ action: 'hide' });
    }
    if (!current && !tooltip.visible) return;
    current = null;
    frameTipShown = false;
    requestSeq++;
    clearHighlight();
    tooltip.hide();
  }

  // Top page: shows a tooltip requested by a child frame, translating frame
  // coordinates into page coordinates
  function showFrameTip(message) {
    const frame = enteredFrame;
    if (!IS_TOP || !enabled || discreet || !frame?.isConnected) return false;
    if (typeof message.mac !== 'string' || !message.result || !Number.isFinite(message.x) || !Number.isFinite(message.y)) return false;
    hide();
    const r = frame.getBoundingClientRect();
    tooltip.render(message.mac, message.result);
    tooltip.moveTo(r.left + frame.clientLeft + message.x, r.top + frame.clientTop + message.y);
    frameTipShown = true;
    return true;
  }

  function check() {
    frameRequested = false;
    if (!enabled) return;
    if (!isContextValid()) { teardown(); return; }
    if (mouseButtons !== 0) { hide(); return; } // selection or drag in progress

    const hit = hitTest(mouseX, mouseY);
    if (!hit) {
      dismissed = null;
      hide();
      return;
    }
    if (sameTarget(current, hit)) {
      tooltip.moveTo(mouseX, mouseY);
      return;
    }
    if (sameTarget(dismissed, hit)) return;
    dismissed = null;
    show(hit);
  }

  function scheduleCheck() {
    if (!enabled || frameRequested || mouseX < 0) return;
    frameRequested = true;
    requestAnimationFrame(check);
  }

  // ─── Event handlers ────────────────────────────────────────────────────────

  function onMouseMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    mouseButtons = e.buttons;
    scheduleCheck();
  }

  function onScroll() {
    if (current) scheduleCheck(); // the text moved under the cursor
  }

  function onMouseOut(e) {
    const to = e.relatedTarget;
    if (!to) { hide(); return; } // the cursor left the window
    // Once the cursor is inside an iframe this document receives no more moves:
    // close the tooltip and remember the frame for tooltips it will request
    if (FRAME_TAGS.has(to.localName)) {
      enteredFrame = to;
      hide();
    }
  }

  function onMouseOver(e) {
    if (FRAME_TAGS.has(e.target.localName)) enteredFrame = e.target;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && current) {
      dismissed = current;
      hide();
    }
  }

  function onVisibilityChange() {
    if (document.hidden) hide();
  }

  // Messages from the service worker (never from other content scripts)
  function onRuntimeMessage(message, sender, sendResponse) {
    if (sender.id !== chrome.runtime.id || !message || sender.tab) return false;
    switch (message.type) {
      case 'PING':
        sendResponse({ ok: true, discreet });
        return false;
      case 'DISABLE':
        teardown();
        return false;
      case 'ORIGINS_REMOVED':
        if (Array.isArray(message.origins) && message.origins.some(p => core.patternMatchesUrl(p, TOP_URL))) teardown();
        return false;
      case 'FRAME_TIP':
        if (message.action === 'hide') {
          if (frameTipShown) hide();
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: showFrameTip(message) });
        }
        return false;
      default:
        return false;
    }
  }

  function onStorageChanged(changes, area) {
    if (area === 'local' && (changes.discreet || changes.lang)) loadSettings();
  }

  // ─── Setup and teardown ────────────────────────────────────────────────────

  const LISTENERS = [
    [document, 'mousemove', onMouseMove, { capture: true, passive: true }],
    [document, 'mousedown', hide, { capture: true, passive: true }],
    [document, 'mouseout', onMouseOut, { capture: true, passive: true }],
    [document, 'mouseover', onMouseOver, { capture: true, passive: true }],
    [document, 'keydown', onKeyDown, { capture: true }],
    [document, 'visibilitychange', onVisibilityChange, false],
    [window, 'scroll', onScroll, { capture: true, passive: true }],
    [window, 'blur', hide, false],
  ];

  function teardown() {
    hide();
    enabled = false;
    for (const [target, type, fn, opts] of LISTENERS) target.removeEventListener(type, fn, opts);
    try {
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      chrome.storage.onChanged.removeListener(onStorageChanged);
    } catch { /* context invalidated */ }
    globalThis.__macInspectorActive = false; // allows a later re-activation
  }

  for (const [target, type, fn, opts] of LISTENERS) target.addEventListener(type, fn, opts);
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  chrome.storage.onChanged.addListener(onStorageChanged);
  loadSettings();
})();
