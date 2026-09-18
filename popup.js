// SPDX-FileCopyrightText: 2026 CatalaniDev <catalanidev@gmail.com>
// SPDX-License-Identifier: LicenseRef-MAC-Inspector-1.0
//
// popup.js — toolbar popup.
//
// Shows the state of the current tab and its site access, a manual lookup,
// the MAC addresses seen in the tab, the discreet-mode and language settings,
// and a button that opens or closes the side panel.

'use strict';

const $ = id => document.getElementById(id);
const t = (key, params) => MacUI.t(key, params);
const ALL_SITES = '<all_urls>';

let tab = null;
let sitePattern = null;  // "https://host/*", "file:///*", or null for unsupported pages
let panelOpen = false;
let lastLookup = null;   // last manual lookup, re-rendered when the language changes

function siteName() {
  if (!sitePattern) return t('popup.browserPage');
  return sitePattern === 'file:///*' ? t('popup.localFiles') : new URL(tab.url).hostname;
}

async function isRunning() {
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'PING' }, { frameId: 0 });
    return !!res?.ok;
  } catch {
    return false;
  }
}

// ─── Current tab and site access ─────────────────────────────────────────────

async function refreshAccess() {
  const allGranted = await chrome.permissions.contains({ origins: [ALL_SITES] });
  const siteGranted = sitePattern !== null && await chrome.permissions.contains({ origins: [sitePattern] });
  const running = sitePattern !== null && await isRunning();

  $('siteName').textContent = siteName();
  $('siteLabel').textContent = t(sitePattern === 'file:///*' ? 'popup.alwaysOnFiles' : 'popup.alwaysOnSite');
  $('siteToggle').checked = siteGranted;
  $('siteToggle').disabled = sitePattern === null || allGranted;
  $('allToggle').checked = allGranted;
  $('dot').classList.toggle('on', running);

  const btn = $('tabBtn');
  btn.hidden = sitePattern === null;
  let hint = '';
  if (sitePattern === null) {
    $('status').textContent = t('popup.notAllowedHere');
  } else if (running) {
    $('status').textContent = t(siteGranted ? 'popup.activeOnSite' : 'popup.activeUntilReload');
    btn.textContent = t('popup.deactivate');
    btn.dataset.action = 'DEACTIVATE_TAB';
  } else {
    $('status').textContent = t('popup.inactive');
    btn.textContent = t('popup.activateNow');
    btn.dataset.action = 'ACTIVATE_TAB';
    hint = t(siteGranted ? 'popup.hintReload' : 'popup.hintActivate');
  }
  if (sitePattern === 'file:///*') hint = t('popup.hintFiles');
  $('accessHint').textContent = hint;
  $('accessHint').hidden = !hint;
}

// Permissions must be requested directly inside the click handler (user gesture).
// The popup may close when Chrome shows its prompt, so script registration and
// tab activation happen in the service worker (permissions.onAdded).
function setOrigin(origin, wanted) {
  const request = wanted
    ? chrome.permissions.request({ origins: [origin] })
    : chrome.permissions.remove({ origins: [origin] });
  request.catch(() => false).then(refreshAccess);
}

// ─── History of the current tab ──────────────────────────────────────────────

const historyKey = () => `history:${tab?.id}`;

async function refreshHistory() {
  const entries = tab ? (await chrome.storage.session.get(historyKey()))[historyKey()] || [] : [];
  MacUI.renderHistory($('history'), entries);
  $('historyEmpty').hidden = entries.length > 0;
  $('clearBtn').hidden = entries.length === 0;
  $('historyTitle').textContent = entries.length
    ? t('popup.historyTitleCount', { count: entries.length })
    : t('popup.historyTitle');
}

// ─── Manual lookup ───────────────────────────────────────────────────────────

function renderLookup() {
  const out = $('result');
  if (!lastLookup) { out.replaceChildren(); return; }
  if (lastLookup.error) {
    out.replaceChildren(MacUI.el('p', 'empty', t('popup.lookupFailed', { error: MacUI.errorText(lastLookup.error) })));
  } else {
    out.replaceChildren(MacUI.tape(lastLookup));
  }
}

async function doLookup(event) {
  event.preventDefault();
  const raw = $('macIn').value.trim();
  if (!raw) { lastLookup = null; renderLookup(); return; }

  // Pasted text is accepted too: the first MAC found in it is used
  const found = MacCore.findMacs(raw)[0];
  const query = found ? found.mac : raw;
  if (query.length > 64) {
    lastLookup = { hex: '', result: { valid: false } };
  } else {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'LOOKUP', mac: query });
      lastLookup = res?.ok ? { hex: res.result.hex, result: res.result } : { error: res?.error || 'unknown' };
    } catch (err) {
      lastLookup = { error: err.message };
    }
  }
  renderLookup();
}

// ─── Footer ──────────────────────────────────────────────────────────────────

async function renderKeys() {
  const labels = { _execute_action: 'popup.key.popup', 'toggle-tab': 'popup.key.toggleTab', 'toggle-panel': 'popup.key.togglePanel' };
  const keys = $('keys');
  keys.replaceChildren();
  for (const cmd of await chrome.commands.getAll()) {
    if (!cmd.shortcut || !labels[cmd.name]) continue; // unassigned or unknown command
    const item = MacUI.el('span');
    item.append(MacUI.el('kbd', '', MacUI.formatShortcut(cmd.shortcut)), document.createTextNode(` ${t(labels[cmd.name])}`));
    keys.append(item);
  }
  keys.hidden = !keys.childElementCount;
}

function renderPanelButton() {
  $('panelBtn').textContent = t(panelOpen ? 'popup.closePanel' : 'popup.openPanel');
}

// ─── Language ────────────────────────────────────────────────────────────────

// Loads the language setting and renders every text of the popup in it
async function applyLanguage() {
  const loaded = await MacI18n.load();
  MacUI.setI18n(loaded);
  MacI18n.applyToDocument(document, loaded);
  $('langSelect').value = loaded.setting;
  renderPanelButton();
  renderLookup();
  MacUI.renderRegistryInfo($('dbInfo'));
  MacUI.renderCredit($('footer'));
  await Promise.all([refreshAccess(), refreshHistory(), renderKeys()]);
}

// ─── Startup ─────────────────────────────────────────────────────────────────

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  sitePattern = tab ? MacCore.sitePatternFromUrl(tab.url) : null;
  await applyLanguage();

  $('lookupForm').addEventListener('submit', doLookup);

  $('tabBtn').addEventListener('click', async e => {
    const res = await chrome.runtime.sendMessage({ type: e.currentTarget.dataset.action, tabId: tab.id })
      .catch(err => ({ ok: false, error: err.message }));
    if (!res?.ok) $('status').textContent = t('popup.actionFailed', { error: MacUI.errorText(res?.error || 'unknown') });
    else refreshAccess();
  });
  $('siteToggle').addEventListener('change', e => { if (sitePattern) setOrigin(sitePattern, e.target.checked); });
  $('allToggle').addEventListener('change', e => setOrigin(ALL_SITES, e.target.checked));

  $('clearBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY', tabId: tab.id }).then(refreshHistory);
  });
  chrome.storage.session.onChanged.addListener(changes => { if (historyKey() in changes) refreshHistory(); });

  const { discreet } = await chrome.storage.local.get({ discreet: false });
  $('discreetToggle').checked = discreet === true;
  $('discreetToggle').addEventListener('change', e => chrome.storage.local.set({ discreet: e.target.checked }));

  $('langSelect').addEventListener('change', async e => {
    // Only known values are stored; anything else falls back to automatic
    const setting = MacI18n.SETTINGS.includes(e.target.value) ? e.target.value : 'auto';
    await chrome.storage.local.set({ lang: setting });
    applyLanguage();
  });

  $('panelBtn').addEventListener('click', () => {
    if (panelOpen) {
      chrome.runtime.sendMessage({ type: 'CLOSE_PANEL', windowId: tab.windowId });
      panelOpen = false;
      renderPanelButton();
      return;
    }
    // sidePanel.open() must run immediately, inside the user gesture
    chrome.sidePanel.open({ windowId: tab.windowId }).then(() => window.close(), () => {});
  });
  chrome.runtime.sendMessage({ type: 'PANEL_STATE', windowId: tab.windowId })
    .then(res => { panelOpen = !!res?.open; renderPanelButton(); }, () => {});

  $('macIn').focus();
}

init();
