// SPDX-FileCopyrightText: 2026 CatalaniDev <catalanidev@gmail.com>
// SPDX-License-Identifier: LicenseRef-MAC-Inspector-1.0
//
// ui.js — DOM components shared by the popup, the side panel and the About page.
// All text goes through textContent: no HTML is ever built from data.
// Call MacUI.setI18n() with the result of MacI18n.load() before rendering.

'use strict';

const MacUI = (() => {
  const COPYRIGHT_YEAR = 2026;

  // Translator and locale in use; English until setI18n() is called
  let i18n = { lang: 'en', locale: 'en-GB', t: MacI18n.translator('en') };

  /**
   * Sets the language used by every component.
   * @param {{lang: string, locale: string, t: Function}} loaded result of MacI18n.load()
   */
  function setI18n(loaded) {
    i18n = loaded;
  }

  const t = (key, params) => i18n.t(key, params);

  /**
   * Creates an element with an optional class name and text.
   * @param {string} tag
   * @param {string} [className]
   * @param {string} [text]
   * @returns {HTMLElement}
   */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /**
   * Translates an error code from the service worker; other messages are returned as they are.
   * @param {string} error
   * @returns {string}
   */
  function errorText(error) {
    const key = `error.${error}`;
    const text = t(key);
    return text === key ? String(error) : text;
  }

  // Chrome writes shortcut modifiers in the browser language (e.g. "Maiusc", "Umschalt"):
  // map them to a canonical name, then to the name used by the selected language
  const MODIFIER_ALIASES = {
    shift: 'Shift', maiusc: 'Shift', umschalt: 'Shift', maj: 'Shift', 'mayús': 'Shift', 'mayúsculas': 'Shift',
    ctrl: 'Ctrl', strg: 'Ctrl', alt: 'Alt', command: 'Command', macctrl: 'MacCtrl',
  };
  const MODIFIER_NAMES = { it: { Shift: 'Maiusc' } };

  /**
   * Formats a Chrome shortcut ("Alt+Maiusc+L") with the modifier names of the selected language.
   * @param {string} shortcut
   * @returns {string}
   */
  function formatShortcut(shortcut) {
    return String(shortcut).split('+').map(part => {
      const canonical = MODIFIER_ALIASES[part.trim().toLowerCase()];
      if (!canonical) return part;
      return MODIFIER_NAMES[i18n.lang]?.[canonical] || canonical;
    }).join('+');
  }

  // ─── Tape cards ────────────────────────────────────────────────────────────

  // MAC address with the vendor prefix in bold
  function macLine(hex, result) {
    const [head, tail] = MacCore.splitMac(hex, result?.prefix?.length);
    const line = el('span', 'tape-mac');
    line.append(el('b', '', head), document.createTextNode(tail));
    return line;
  }

  /**
   * Renders a lookup result as a "tape" card (see ui.css).
   * @param {{hex: string, result: object}} entry
   * @param {{compact?: boolean, interactive?: boolean}} [options]
   *   compact: one-line variant for history lists; interactive: rendered as a button
   * @returns {HTMLElement}
   */
  function tape(entry, { compact = false, interactive = false } = {}) {
    const view = MacCore.describe(entry.result, t);
    const root = el(interactive ? 'button' : 'div', compact ? 'tape tape--compact' : 'tape');
    if (interactive) root.type = 'button';
    root.dataset.kind = view.kind;

    // The compact card has no visible category: keep it for screen readers
    if (compact) root.append(el('span', 'visually-hidden', `${view.category}: `));
    else root.append(el('span', 'tape-cat', view.category));
    root.append(el('span', 'tape-title', view.title));
    if (entry.result?.valid) root.append(macLine(entry.hex, entry.result));
    if (!compact && view.detail) root.append(el('span', 'tape-detail', view.detail));
    if (compact) root.title = [view.category, view.detail].filter(Boolean).join('\n');
    return root;
  }

  // Short confirmation badge on a card, e.g. after copying
  function flash(node, text) {
    let badge = node.querySelector('.tape-flash');
    if (!badge) {
      badge = el('span', 'tape-flash');
      badge.setAttribute('role', 'status');
      node.append(badge);
    }
    badge.textContent = text;
    node.classList.add('is-flashing');
    clearTimeout(node.flashTimer);
    node.flashTimer = setTimeout(() => node.classList.remove('is-flashing'), 1100);
  }

  async function copyEntry(node, entry) {
    const view = MacCore.describe(entry.result, t);
    try {
      await navigator.clipboard.writeText(`${MacCore.formatHex(entry.hex)}\t${view.title}`);
      flash(node, t('common.copied'));
    } catch {
      flash(node, t('common.copyFailed'));
    }
  }

  /**
   * Fills a list with clickable compact cards; a click copies "MAC<TAB>vendor".
   * @param {HTMLElement} listEl
   * @param {{hex: string, result: object}[]} entries
   */
  function renderHistory(listEl, entries) {
    listEl.replaceChildren();
    for (const entry of entries) {
      const item = tape(entry, { compact: true, interactive: true });
      item.title = `${item.title}\n${t('common.clickToCopy')}`;
      item.addEventListener('click', () => copyEntry(item, entry));
      const li = el('li');
      li.append(item);
      listEl.append(li);
    }
  }

  // ─── Credits ───────────────────────────────────────────────────────────────

  /**
   * Copyright line shown in the interface. The author name comes from the
   * "author" field of manifest.json, so it is defined in a single place.
   * @returns {string} e.g. "© 2026 CatalaniDev"
   */
  function copyrightText() {
    return `© ${COPYRIGHT_YEAR} ${chrome.runtime.getManifest().author || 'CatalaniDev'}`;
  }

  /**
   * Appends the copyright line with a link to the About page (license and credits).
   * The MAC Inspector License requires this line to stay visible when the popup,
   * the side panel or the About page is reused in another product.
   * @param {HTMLElement} container
   */
  function renderCredit(container) {
    container.querySelector(':scope > .credit')?.remove();
    const line = el('div', 'credit');
    line.append(el('span', '', copyrightText()));
    const link = el('a', 'credit-link', t('common.credits'));
    link.href = 'about.html';
    link.addEventListener('click', event => {
      event.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('about.html') });
    });
    line.append(link);
    container.append(line);
  }

  /**
   * Fills an element with the source and date of the bundled IEEE registry.
   * Entry counts per registry are shown in the element tooltip.
   * @param {HTMLElement} target
   * @param {{label?: boolean}} [options] label: prefix the text with "Data:"
   */
  async function renderRegistryInfo(target, { label = true } = {}) {
    target.textContent = t('common.registryLoading');
    try {
      const res = await chrome.runtime.sendMessage({ type: 'STATS' });
      if (!res?.ok) throw new Error(errorText(res?.error || 'unknown'));
      const { counts, generated } = res.stats;
      const numbers = new Intl.NumberFormat(i18n.locale, { useGrouping: 'always' });
      const date = generated
        ? new Date(generated).toLocaleDateString(i18n.locale, { day: 'numeric', month: 'short', year: 'numeric' })
        : t('common.unknownDate');
      const total = (counts.L || 0) + (counts.M || 0) + (counts.S || 0);
      target.textContent = t(label ? 'common.registryData' : 'common.registrySource', { date });
      target.title = [t('common.registryPrefixes', { count: numbers.format(total) })]
        .concat(['L', 'M', 'S', 'CID'].map(k => `${k === 'CID' ? 'CID' : 'MA-' + k}: ${numbers.format(counts[k] || 0)}`))
        .join('\n');
    } catch (err) {
      target.textContent = t('common.registryUnavailable', { error: err.message });
    }
  }

  return { setI18n, t, el, errorText, formatShortcut, tape, renderHistory, copyrightText, renderCredit, renderRegistryInfo };
})();
