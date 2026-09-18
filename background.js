// SPDX-FileCopyrightText: 2026 CatalaniDev <catalanidev@gmail.com>
// SPDX-License-Identifier: LicenseRef-MAC-Inspector-1.0
//
// background.js — service worker.
//
// Responsibilities:
// - Loads the IEEE registry (oui-data.json, plain data) and answers lookups.
// - On-demand site access: the extension has no host permissions at install.
//   The content script reaches a page in two ways:
//     1. "activate now": activeTab (toolbar click or Alt+Shift+M), until reload;
//     2. "always": an optional host permission granted for one site or for all
//        sites, with a content script registered only on the granted origins.
// - Per-tab hover history, toolbar badge and side panel toggling.
// - Injects the highlight CSS as a user stylesheet, invisible to the page.

'use strict';

importScripts('i18n.js', 'mac-core.js');

const MAX_INPUT_LENGTH = 64;
const SCRIPT_ID = 'mac-inspector';
const CONTENT_FILES = ['i18n.js', 'mac-core.js', 'content.js'];
const HIGHLIGHT_NAME_RE = /^mi-[a-z0-9]{12}$/;
const EXTENSION_ORIGIN = chrome.runtime.getURL('');

// Popup and side panel run on the extension origin; content scripts report the page URL
const fromExtensionPage = sender => typeof sender.url === 'string' && sender.url.startsWith(EXTENSION_ORIGIN);
const fromContentScript = sender => !!sender.tab && !fromExtensionPage(sender);

// ─── Registry ────────────────────────────────────────────────────────────────

let lookupPromise = null;

// Loaded once per service-worker lifetime and shared by every tab
function getLookup() {
  if (!lookupPromise) {
    lookupPromise = fetch(chrome.runtime.getURL('oui-data.json'))
      .then(res => {
        if (!res.ok) throw new Error(`oui-data.json: HTTP ${res.status}`);
        return res.json();
      })
      .then(data => MacCore.createLookup(data))
      .catch(err => {
        lookupPromise = null; // retry on the next request
        throw err;
      });
  }
  return lookupPromise;
}

// ─── Site access ─────────────────────────────────────────────────────────────

let syncChain = Promise.resolve();

// Keeps the registered content script in line with the granted host permissions
function syncRegistration() {
  syncChain = syncChain.then(async () => {
    const { origins = [] } = await chrome.permissions.getAll();
    const [existing] = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    if (!origins.length) {
      if (existing) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
      return;
    }
    const script = {
      id: SCRIPT_ID,
      matches: origins,
      js: CONTENT_FILES,
      runAt: 'document_idle',
      allFrames: true,
      matchOriginAsFallback: true,
      persistAcrossSessions: true,
    };
    if (existing) await chrome.scripting.updateContentScripts([script]);
    else await chrome.scripting.registerContentScripts([script]);
  }).catch(err => console.error('MAC Inspector: content script registration failed', err));
  return syncChain;
}

async function injectIntoTab(tabId) {
  const target = { tabId, allFrames: true };
  try {
    await chrome.scripting.executeScript({ target, files: CONTENT_FILES });
  } catch {
    // With activeTab, frames from other origins are off limits: top frame only
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
  }
}

async function isRunning(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'PING' }, { frameId: 0 });
    return !!res?.ok;
  } catch {
    return false;
  }
}

async function deactivateTab(tabId) {
  try { await chrome.tabs.sendMessage(tabId, { type: 'DISABLE' }); } catch { /* not running */ }
}

chrome.runtime.onInstalled.addListener(() => { syncRegistration(); });
chrome.runtime.onStartup.addListener(() => { syncRegistration(); });

chrome.permissions.onAdded.addListener(async ({ origins = [] }) => {
  await syncRegistration();
  if (!origins.length) return;
  // Activate right away in tabs that are already open on the new origins
  const tabs = await chrome.tabs.query({ url: origins }).catch(() => []);
  await Promise.all(tabs.map(tab => injectIntoTab(tab.id).catch(() => {})));
});

chrome.permissions.onRemoved.addListener(async ({ origins = [] }) => {
  await syncRegistration();
  if (!origins.length) return;
  // Without the permission tab URLs are no longer readable: every content
  // script checks by itself whether its site is among the revoked origins
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab =>
    chrome.tabs.sendMessage(tab.id, { type: 'ORIGINS_REMOVED', origins }).catch(() => {})));
});

// ─── Per-tab history and toolbar badge ───────────────────────────────────────
// History lives in storage.session (browser memory, never written to disk), so
// the popup and the side panel can read it without having to stay open.

const HISTORY_MAX = 50;
const BADGE_COLORS = { vendor: '#2F6FDF', local: '#AD5710', group: '#7353CC', unknown: '#6B737D' };
const historyKey = tabId => `history:${tabId}`;
let historyChain = Promise.resolve();

function recordHover(tab, message) {
  const hex = MacCore.normalize(message.mac);
  const result = message.result;
  if (!hex || !result || result.valid !== true || result.hex !== hex) return;

  // Serialised writes: concurrent hovers must not overwrite each other
  historyChain = historyChain.then(async () => {
    const key = historyKey(tab.id);
    const { [key]: previous = [] } = await chrome.storage.session.get(key);
    const list = [{ hex, result, at: Date.now() }, ...previous.filter(e => e.hex !== hex)].slice(0, HISTORY_MAX);
    await chrome.storage.session.set({ [key]: list });

    const { t } = await MacI18n.load();
    const view = MacCore.describe(result, t);
    await chrome.action.setBadgeText({ tabId: tab.id, text: String(list.length) });
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: BADGE_COLORS[view.kind] || BADGE_COLORS.unknown });
    await chrome.action.setTitle({ tabId: tab.id, title: t('badge.title', { mac: MacCore.formatHex(hex), title: view.title }) });
  }).catch(err => console.warn('MAC Inspector: history not updated', err));
}

async function clearHistory(tabId) {
  await chrome.storage.session.remove(historyKey(tabId));
  await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  await chrome.action.setTitle({ tabId, title: 'MAC Inspector' }).catch(() => {});
}

chrome.tabs.onRemoved.addListener(tabId => { chrome.storage.session.remove(historyKey(tabId)); });

// ─── Side panel ──────────────────────────────────────────────────────────────
// Each open panel keeps a port to the worker, so the shortcut knows whether to
// open or to close it.

const panelPorts = new Map(); // windowId → port

chrome.runtime.onConnect.addListener(port => {
  if (port.sender?.id !== chrome.runtime.id || !fromExtensionPage(port.sender) || !port.name.startsWith('panel:')) return;
  const windowId = Number(port.name.slice(6));
  if (!Number.isInteger(windowId)) return;
  panelPorts.set(windowId, port);
  port.onDisconnect.addListener(() => {
    if (panelPorts.get(windowId) === port) panelPorts.delete(windowId);
  });
});

function togglePanel(windowId) {
  const port = panelPorts.get(windowId);
  if (port) {
    port.postMessage({ type: 'CLOSE' });
    return Promise.resolve(false);
  }
  // Must be called synchronously: sidePanel.open() requires a user gesture
  return chrome.sidePanel.open({ windowId }).then(() => true);
}

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────

chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab?.id) return;
  if (command === 'toggle-panel') {
    togglePanel(tab.windowId).catch(err => console.warn('MAC Inspector: side panel unavailable', err));
    return;
  }
  if (command === 'toggle-tab') {
    // The shortcut itself grants activeTab for this tab
    isRunning(tab.id).then(running => running
      ? deactivateTab(tab.id)
      : injectIntoTab(tab.id)
    ).catch(err => console.warn('MAC Inspector: activation failed', err));
  }
});

// ─── Messages ────────────────────────────────────────────────────────────────

function reply(sendResponse, work) {
  Promise.resolve()
    .then(work)
    .then(data => sendResponse({ ok: true, ...data }))
    .catch(err => sendResponse({ ok: false, error: String(err && err.message || err) }));
  return true; // asynchronous response
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only contexts of this extension (content scripts, popup, side panel)
  if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') return false;

  switch (message.type) {
    // ── From any extension context ──
    case 'LOOKUP':
      if (typeof message.mac !== 'string' || message.mac.length > MAX_INPUT_LENGTH) {
        sendResponse({ ok: false, error: 'invalid_input' }); // error code, translated by the caller
        return false;
      }
      return reply(sendResponse, async () => ({ result: (await getLookup()).lookup(message.mac) }));

    case 'STATS':
      return reply(sendResponse, async () => ({ stats: (await getLookup()).stats }));

    // ── From content scripts ──
    case 'HIGHLIGHT_CSS': {
      // A user-origin stylesheet is not listed in the page's document.styleSheets
      if (!fromContentScript(sender) || !HIGHLIGHT_NAME_RE.test(message.name)) return false;
      return reply(sendResponse, () => chrome.scripting.insertCSS({
        target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
        origin: 'USER',
        css: `::highlight(${message.name}){background-color:rgba(47,111,223,.16);text-decoration:underline dashed rgba(47,111,223,.85)}`,
      }).then(() => ({})));
    }

    case 'HOVER':
      if (fromContentScript(sender) && typeof message.mac === 'string' && message.mac.length <= MAX_INPUT_LENGTH) {
        recordHover(sender.tab, message);
      }
      return false;

    case 'FRAME_TIP': {
      // Relays a tooltip request from a child frame to the top frame of the same tab
      if (!fromContentScript(sender) || !sender.frameId) return false;
      const { action, mac, result, x, y } = message;
      let relay;
      if (action === 'hide') {
        relay = { type: 'FRAME_TIP', action };
      } else if (action === 'show' && typeof mac === 'string' && mac.length <= MAX_INPUT_LENGTH &&
                 Number.isFinite(x) && Number.isFinite(y) && result && typeof result === 'object' &&
                 JSON.stringify(result).length <= 2000) {
        relay = { type: 'FRAME_TIP', action, mac, result, x, y };
      } else {
        return false;
      }
      chrome.tabs.sendMessage(sender.tab.id, relay, { frameId: 0 })
        .then(res => sendResponse({ ok: !!res?.ok }), () => sendResponse({ ok: false }));
      return true;
    }

    // ── From the popup or the side panel ──
    case 'CLEAR_HISTORY':
      if (!fromExtensionPage(sender) || !Number.isInteger(message.tabId)) return false;
      return reply(sendResponse, () => clearHistory(message.tabId).then(() => ({})));

    case 'PANEL_STATE':
      if (!fromExtensionPage(sender) || !Number.isInteger(message.windowId)) return false;
      sendResponse({ ok: true, open: panelPorts.has(message.windowId) });
      return false;

    case 'CLOSE_PANEL':
      if (!fromExtensionPage(sender) || !Number.isInteger(message.windowId)) return false;
      panelPorts.get(message.windowId)?.postMessage({ type: 'CLOSE' });
      sendResponse({ ok: true });
      return false;

    case 'ACTIVATE_TAB':
    case 'DEACTIVATE_TAB':
      if (!fromExtensionPage(sender) || !Number.isInteger(message.tabId)) return false;
      return reply(sendResponse, async () => {
        if (message.type === 'ACTIVATE_TAB') await injectIntoTab(message.tabId);
        else await deactivateTab(message.tabId);
        return {};
      });

    default:
      return false;
  }
});
