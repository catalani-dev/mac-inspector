// SPDX-FileCopyrightText: 2026 CatalaniDev <catalanidev@gmail.com>
// SPDX-License-Identifier: LicenseRef-MAC-Inspector-1.0
//
// i18n.js — interface texts in English and Italian.
//
// Loaded by the content script, the service worker, the popup, the side panel,
// the About page (for the shared components only; the page itself is always in
// English) and the Node test suite. The language is chosen by the user
// ("auto", "en" or "it", stored as `lang` in chrome.storage.local); "auto"
// follows the browser UI language.
//
// Texts are always inserted with textContent: placeholders such as {vendor}
// may contain registry data and must never be treated as HTML.

(function (root) {
  'use strict';

  const LANGS = ['en', 'it'];
  const SETTINGS = ['auto', ...LANGS];
  const DEFAULT_LANG = 'en';

  const DICT = {
    en: {
      // Address descriptions (tooltip, popup, side panel)
      'kind.invalid.category': 'Invalid format',
      'kind.invalid.title': 'Not a MAC address',
      'kind.invalid.detail': 'Enter 6 to 12 hexadecimal digits, with or without separators',
      'kind.block': '{registry} block, {bits} bits: {prefix}',
      'kind.special.category': 'Special address',
      'kind.special.assigned': 'Assigned to {vendor}',
      'kind.localVendor.category': 'Locally administered',
      'kind.random.category': 'Random or virtual MAC',
      'kind.random.title': 'Vendor cannot be determined',
      'kind.random.detail': 'Local bit set: typical of private addresses on phones, VMs and containers',
      'kind.group.category': 'Group address',
      'kind.group.unregistered': 'Unregistered group',
      'kind.vendor.category': 'Registered vendor',
      'kind.unknown.category': 'Not registered',
      'kind.unknown.title': 'Unknown vendor',
      'kind.unknown.detail': 'Prefix {prefix} is not in the IEEE registry',

      // Special addresses
      'special.broadcast': 'Broadcast',
      'special.null': 'Null address',
      'special.ipv4Multicast': 'IPv4 multicast (IANA)',
      'special.ianaReserved': 'Reserved IANA multicast',
      'special.ipv6Multicast': 'IPv6 multicast',
      'special.stp': 'STP / Bridge Group (IEEE 802.1D)',
      'special.pause': 'Pause frame (IEEE 802.3x)',
      'special.slowProtocols': 'Slow Protocols: LACP / OAM (IEEE 802.3)',
      'special.pae': '802.1X PAE / LLDP (Nearest non-TPMR Bridge)',
      'special.lldp': 'LLDP / PTP (Nearest Bridge)',
      'special.linkLocalReserved': 'Reserved IEEE 802.1 link-local',
      'special.cdp': 'Cisco CDP / VTP / DTP / UDLD',
      'special.pvst': 'Cisco PVST+',
      'special.vrrp4': 'VRRP IPv4 (VRID {id})',
      'special.vrrp6': 'VRRP IPv6 (VRID {id})',
      'special.hsrp1': 'HSRP v1 (group {group})',
      'special.hsrp2': 'HSRP v2 (group {group})',

      // Tooltip and errors
      'tooltip.loading': 'Looking up vendor…',
      'tooltip.failed': 'Lookup failed',
      'error.unknown': 'Unknown error',
      'error.invalid_input': 'Invalid input',

      // Popup
      'popup.openPanel': 'Open panel',
      'popup.closePanel': 'Close panel',
      'popup.browserPage': 'Browser page',
      'popup.localFiles': 'Local files',
      'popup.alwaysOnSite': 'Always on this site',
      'popup.alwaysOnFiles': 'Always on local files',
      'popup.alwaysOnAll': 'Always on all sites',
      'popup.notAllowedHere': 'Chrome does not allow extensions here',
      'popup.activeOnSite': 'Active on this site',
      'popup.activeUntilReload': 'Active until reload',
      'popup.inactive': 'Not active',
      'popup.activateNow': 'Activate now',
      'popup.deactivate': 'Deactivate',
      'popup.hintReload': 'Reload the page or use Activate now.',
      'popup.hintActivate': 'Activate now applies to this tab. To avoid repeating it, enable the site permanently.',
      'popup.hintFiles': 'Local files also require "Allow access to file URLs" in the extension details.',
      'popup.actionFailed': 'Failed: {error}',
      'popup.searchLabel': 'MAC address to look up',
      'popup.searchPlaceholder': 'Paste a MAC address or a line of text',
      'popup.search': 'Search',
      'popup.lookupFailed': 'Lookup failed: {error}',
      'popup.historyTitle': 'Seen in this tab',
      'popup.historyTitleCount': 'Seen in this tab ({count})',
      'popup.historyEmpty': 'Hover over a MAC address on the page and it will appear here.',
      'popup.discreet': 'Discreet mode',
      'popup.discreetHint': 'Nothing on the page: results only here and in the panel.',
      'popup.language': 'Language',
      'popup.languageAuto': 'Automatic',
      'popup.key.popup': 'popup',
      'popup.key.toggleTab': 'activate',
      'popup.key.togglePanel': 'panel',

      // Side panel
      'panel.close': 'Close',
      'panel.discreet': 'Discreet mode',
      'panel.currentLabel': 'MAC address under the cursor',
      'panel.waiting': 'Hover over a MAC address on the page to see its vendor here.',
      'panel.olderTitle': 'Seen earlier in this tab ({count})',
      'panel.shortcut': '{key} opens and closes the panel. Seen addresses are also listed in the popup.',
      'panel.noShortcut': 'Seen addresses are also listed in the popup.',

      // Shared components
      'common.clear': 'Clear',
      'common.copied': 'Copied',
      'common.copyFailed': 'Copy failed',
      'common.clickToCopy': 'Click to copy',
      'common.credits': 'License and credits',
      'common.registryLoading': 'Loading IEEE registry…',
      'common.registryData': 'Data: IEEE Registration Authority, {date}',
      'common.registrySource': 'IEEE Registration Authority, {date}',
      'common.registryPrefixes': '{count} prefixes',
      'common.registryUnavailable': 'IEEE registry unavailable: {error}',
      'common.unknownDate': 'unknown date',

      // Toolbar badge
      'badge.title': 'MAC Inspector\n{mac}\n{title}',
    },

    it: {
      'kind.invalid.category': 'Formato non valido',
      'kind.invalid.title': 'Non è un MAC',
      'kind.invalid.detail': 'Scrivi da 6 a 12 cifre esadecimali, con o senza separatori',
      'kind.block': 'Blocco {registry} da {bits} bit: {prefix}',
      'kind.special.category': 'Indirizzo speciale',
      'kind.special.assigned': 'Assegnato a {vendor}',
      'kind.localVendor.category': 'Amministrato localmente',
      'kind.random.category': 'MAC casuale o virtuale',
      'kind.random.title': 'Vendor non ricavabile',
      'kind.random.detail': 'Bit locale attivo: tipico di MAC privati di smartphone, VM e container',
      'kind.group.category': 'Indirizzo di gruppo',
      'kind.group.unregistered': 'Gruppo non registrato',
      'kind.vendor.category': 'Vendor registrato',
      'kind.unknown.category': 'Non registrato',
      'kind.unknown.title': 'Vendor sconosciuto',
      'kind.unknown.detail': 'Il prefisso {prefix} non è nel registro IEEE',

      'special.broadcast': 'Broadcast',
      'special.null': 'Indirizzo nullo',
      'special.ipv4Multicast': 'Multicast IPv4 (IANA)',
      'special.ianaReserved': 'Multicast IANA riservato',
      'special.ipv6Multicast': 'Multicast IPv6',
      'special.stp': 'STP / Bridge Group (IEEE 802.1D)',
      'special.pause': 'Pause frame (IEEE 802.3x)',
      'special.slowProtocols': 'Slow Protocols: LACP / OAM (IEEE 802.3)',
      'special.pae': '802.1X PAE / LLDP (Nearest non-TPMR Bridge)',
      'special.lldp': 'LLDP / PTP (Nearest Bridge)',
      'special.linkLocalReserved': 'IEEE 802.1 link-local riservato',
      'special.cdp': 'Cisco CDP / VTP / DTP / UDLD',
      'special.pvst': 'Cisco PVST+',
      'special.vrrp4': 'VRRP IPv4 (VRID {id})',
      'special.vrrp6': 'VRRP IPv6 (VRID {id})',
      'special.hsrp1': 'HSRP v1 (gruppo {group})',
      'special.hsrp2': 'HSRP v2 (gruppo {group})',

      'tooltip.loading': 'Cerco il vendor…',
      'tooltip.failed': 'Ricerca non riuscita',
      'error.unknown': 'Errore sconosciuto',
      'error.invalid_input': 'Input non valido',

      'popup.openPanel': 'Apri pannello',
      'popup.closePanel': 'Chiudi pannello',
      'popup.browserPage': 'Pagina del browser',
      'popup.localFiles': 'File locali',
      'popup.alwaysOnSite': 'Attiva sempre su questo sito',
      'popup.alwaysOnFiles': 'Attiva sempre sui file locali',
      'popup.alwaysOnAll': 'Attiva sempre su tutti i siti',
      'popup.notAllowedHere': 'Chrome non consente estensioni qui',
      'popup.activeOnSite': 'Attivo su questo sito',
      'popup.activeUntilReload': 'Attivo fino al ricaricamento',
      'popup.inactive': 'Non attivo',
      'popup.activateNow': 'Attiva ora',
      'popup.deactivate': 'Disattiva',
      'popup.hintReload': 'Ricarica la pagina oppure usa Attiva ora.',
      'popup.hintActivate': 'Attiva ora vale per questa scheda. Per non doverlo ripetere, attiva sempre il sito.',
      'popup.hintFiles': 'Per i file locali serve anche "Consenti l\'accesso agli URL dei file" nei dettagli dell\'estensione.',
      'popup.actionFailed': 'Non riuscito: {error}',
      'popup.searchLabel': 'MAC da cercare',
      'popup.searchPlaceholder': 'Incolla un MAC o una riga di testo',
      'popup.search': 'Cerca',
      'popup.lookupFailed': 'Ricerca non riuscita: {error}',
      'popup.historyTitle': 'Visti in questa scheda',
      'popup.historyTitleCount': 'Visti in questa scheda ({count})',
      'popup.historyEmpty': 'Passa il cursore su un MAC nella pagina: comparirà qui.',
      'popup.discreet': 'Modalità discreta',
      'popup.discreetHint': 'Niente nella pagina: risultati solo qui e nel pannello.',
      'popup.language': 'Lingua',
      'popup.languageAuto': 'Automatica',
      'popup.key.popup': 'popup',
      'popup.key.toggleTab': 'attiva',
      'popup.key.togglePanel': 'pannello',

      'panel.close': 'Chiudi',
      'panel.discreet': 'Modalità discreta',
      'panel.currentLabel': 'MAC sotto il cursore',
      'panel.waiting': 'Passa il cursore su un MAC nella pagina: il vendor compare qui.',
      'panel.olderTitle': 'Visti prima in questa scheda ({count})',
      'panel.shortcut': '{key} apre e chiude il pannello. I MAC visti restano anche nel popup.',
      'panel.noShortcut': 'I MAC visti restano anche nel popup.',

      'common.clear': 'Svuota',
      'common.copied': 'Copiato',
      'common.copyFailed': 'Copia non riuscita',
      'common.clickToCopy': 'Clic per copiare',
      'common.credits': 'Licenza e crediti',
      'common.registryLoading': 'Caricamento del registro IEEE…',
      'common.registryData': 'Dati: IEEE Registration Authority, {date}',
      'common.registrySource': 'IEEE Registration Authority, {date}',
      'common.registryPrefixes': '{count} prefissi',
      'common.registryUnavailable': 'Registro IEEE non disponibile: {error}',
      'common.unknownDate': 'data sconosciuta',

      'badge.title': 'MAC Inspector\n{mac}\n{title}',
    },
  };

  // BCP 47 locale used for dates and numbers
  const LOCALES = { en: 'en-GB', it: 'it-IT' };

  /**
   * Resolves the stored setting to a supported language.
   * @param {string} setting "auto", "en" or "it"; anything else counts as "auto"
   * @param {string} [uiLanguage] browser UI language, e.g. "it-IT"
   * @returns {"en"|"it"}
   */
  function resolveLang(setting, uiLanguage) {
    if (LANGS.includes(setting)) return setting;
    const base = String(uiLanguage || '').toLowerCase().split(/[-_]/)[0];
    return LANGS.includes(base) ? base : DEFAULT_LANG;
  }

  /**
   * Builds a translation function for a language.
   * Unknown keys fall back to English, then to the key itself, so a missing
   * text is visible instead of breaking the interface.
   * @param {"en"|"it"} lang
   * @returns {(key: string, params?: object) => string}
   */
  function translator(lang) {
    const dict = DICT[LANGS.includes(lang) ? lang : DEFAULT_LANG];
    return (key, params) => {
      const template = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key]
        : Object.prototype.hasOwnProperty.call(DICT[DEFAULT_LANG], key) ? DICT[DEFAULT_LANG][key]
          : key;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match);
    };
  }

  function uiLanguage() {
    try { return root.chrome?.i18n?.getUILanguage?.() || root.navigator?.language || ''; } catch { return ''; }
  }

  /**
   * Reads the language setting from chrome.storage.local (extension contexts only).
   * @returns {Promise<{setting: string, lang: "en"|"it", locale: string, t: Function}>}
   */
  async function load() {
    let setting = 'auto';
    try {
      const stored = (await root.chrome.storage.local.get({ lang: 'auto' })).lang;
      if (SETTINGS.includes(stored)) setting = stored;
    } catch { /* storage unavailable: keep "auto" */ }
    const lang = resolveLang(setting, uiLanguage());
    return { setting, lang, locale: LOCALES[lang], t: translator(lang) };
  }

  /**
   * Applies translations to static markup:
   *   data-i18n="key"                → textContent
   *   data-i18n-placeholder="key"    → placeholder attribute
   *   data-i18n-aria-label="key"     → aria-label attribute
   * Also sets <html lang>.
   * @param {Document} doc
   * @param {{lang: string, t: Function}} i18n
   */
  function applyToDocument(doc, { lang, t }) {
    doc.documentElement.lang = lang;
    for (const node of doc.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
    for (const node of doc.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = t(node.dataset.i18nPlaceholder);
    for (const node of doc.querySelectorAll('[data-i18n-aria-label]')) node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
  }

  const api = Object.freeze({ LANGS, SETTINGS, DICT, LOCALES, resolveLang, translator, load, applyToDocument });

  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.MacI18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
