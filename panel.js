// SPDX-FileCopyrightText: 2026 CatalaniDev <catalanidev@gmail.com>
// SPDX-License-Identifier: LicenseRef-MAC-Inspector-1.0
//
// panel.js — side panel.
//
// Shows the last MAC hovered in the active tab and the history of that tab.
// The panel does not need to stay open: history is kept by the service worker
// and is also listed in the popup. Alt+Shift+L opens and closes it.

'use strict';

const $ = id => document.getElementById(id);
const t = (key, params) => MacUI.t(key, params);
let windowId = null;
let activeTabId = null;

const historyKey = tabId => `history:${tabId}`;

async function render() {
  const key = historyKey(activeTabId);
  const entries = activeTabId === null ? [] : (await chrome.storage.session.get(key))[key] || [];

  const current = $('current');
  if (entries.length) {
    current.replaceChildren(MacUI.tape(entries[0]));
  } else {
    current.replaceChildren(MacUI.el('p', 'waiting', t('panel.waiting')));
  }

  const older = entries.slice(1);
  MacUI.renderHistory($('history'), older);
  $('history').parentElement.hidden = older.length === 0;
  $('historyTitle').textContent = t('panel.olderTitle', { count: older.length });
  $('clearBtn').hidden = entries.length === 0;
}

async function refreshMode() {
  const { discreet } = await chrome.storage.local.get({ discreet: false });
  $('modeHint').hidden = discreet !== true;
}

async function renderFooter() {
  const cmd = (await chrome.commands.getAll()).find(c => c.name === 'toggle-panel');
  const info = $('shortcutInfo');
  info.replaceChildren();
  if (cmd?.shortcut) {
    // The {key} placeholder becomes a <kbd> element; the text around it is translated
    const [before, after = ''] = t('panel.shortcut', { key: '\u0000' }).split('\u0000');
    info.append(document.createTextNode(before), MacUI.el('kbd', '', MacUI.formatShortcut(cmd.shortcut)), document.createTextNode(after));
  } else {
    info.textContent = t('panel.noShortcut');
  }
  MacUI.renderRegistryInfo($('dbInfo'));
  MacUI.renderCredit($('footer'));
}

// Loads the language setting and renders every text of the panel in it
async function applyLanguage() {
  const loaded = await MacI18n.load();
  MacUI.setI18n(loaded);
  MacI18n.applyToDocument(document, loaded);
  await Promise.all([render(), renderFooter()]);
}

// Port to the service worker: tells it the panel is open and receives the close command
function connect() {
  let port;
  try {
    port = chrome.runtime.connect({ name: `panel:${windowId}` });
  } catch {
    return; // extension reloaded: the panel will be reopened by the user
  }
  port.onMessage.addListener(msg => { if (msg?.type === 'CLOSE') window.close(); });
  // The worker can be suspended by Chrome: reconnect when that happens
  port.onDisconnect.addListener(() => setTimeout(connect, 500));
}

async function init() {
  windowId = (await chrome.windows.getCurrent()).id;
  connect();

  $('closeBtn').addEventListener('click', () => window.close());
  $('clearBtn').addEventListener('click', () => {
    if (activeTabId !== null) chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY', tabId: activeTabId });
  });

  chrome.tabs.onActivated.addListener(info => {
    if (info.windowId === windowId) { activeTabId = info.tabId; render(); }
  });
  chrome.storage.session.onChanged.addListener(changes => {
    if (activeTabId !== null && historyKey(activeTabId) in changes) render();
  });
  chrome.storage.local.onChanged.addListener(changes => {
    if (changes.discreet) refreshMode();
    if (changes.lang) applyLanguage();
  });

  const [tab] = await chrome.tabs.query({ active: true, windowId });
  activeTabId = tab?.id ?? null;
  await Promise.all([applyLanguage(), refreshMode()]);
}

init();
