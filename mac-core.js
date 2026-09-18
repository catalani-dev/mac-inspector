// SPDX-FileCopyrightText: 2026 CatalaniDev <catalanidev@gmail.com>
// SPDX-License-Identifier: LicenseRef-MAC-Inspector-1.0
//
// mac-core.js — shared, dependency-free logic.
//
// Loaded by the content script, the service worker (importScripts), the popup,
// the side panel and the Node test suite. It never touches the DOM.
// It holds no user-facing text: describe() receives a translation function
// from i18n.js, so results stay language-neutral (e.g. in the stored history).

(function (root) {
  'use strict';

  // ─── MAC detection ─────────────────────────────────────────────────────────

  const H = '[0-9A-Fa-f]';

  // Supported notations. Each one uses a single kind of separator, so mixed
  // input such as "AA:BB-CC:DD-EE:FF" is rejected.
  const FORMATS = [
    `(?:${H}{2}:){5}${H}{2}`,   // 00:1C:0E:11:22:33
    `(?:${H}{2}-){5}${H}{2}`,   // 00-1C-0E-11-22-33
    `(?:${H}{4}\\.){2}${H}{4}`, // 001c.0e11.2233    (Cisco)
    `(?:${H}{4}-){2}${H}{4}`,   // 001c-0e11-2233    (Huawei / H3C)
    `${H}{6}-${H}{6}`,          // 001c0e-112233     (HP / Aruba)
    `${H}{12}`,                 // 001C0E112233      (no separators)
  ];

  // Boundaries: no adjacent alphanumerics and no neighbouring hex groups, so
  // certificate fingerprints, EUI-64 identifiers and hashes are not split into
  // false MAC addresses.
  const BEFORE = `(?<![0-9A-Za-z])(?<!(?:^|[^0-9A-Za-z])(?:${H}{2}|${H}{4}|${H}{6})[:.\\-])`;
  const AFTER = `(?![0-9A-Za-z])(?![:.\\-]${H})`;
  const MAC_RE = new RegExp(`${BEFORE}(?:${FORMATS.join('|')})${AFTER}`, 'g');

  // Analysis window around the cursor. A MAC is at most 17 characters long and
  // the lookarounds inspect at most 8 characters before and 2 after it.
  const WINDOW = 48;
  const LOOKBEHIND = 8;
  const LOOKAHEAD = 2;

  /**
   * Finds every MAC address in a string.
   * @param {string} text
   * @returns {{mac: string, index: number}[]} matches in order of appearance
   */
  function findMacs(text) {
    const out = [];
    MAC_RE.lastIndex = 0;
    let m;
    while ((m = MAC_RE.exec(text)) !== null) out.push({ mac: m[0], index: m.index });
    return out;
  }

  /**
   * Returns the MAC address that contains `offset` (both ends inclusive).
   * Only a small window around the offset is scanned, so the cost stays
   * constant even on multi-megabyte text nodes.
   * @param {string} text
   * @param {number} offset character offset, e.g. from caretPositionFromPoint
   * @returns {{mac: string, index: number} | null}
   */
  function findMacAt(text, offset) {
    if (typeof text !== 'string' || !Number.isInteger(offset) || offset < 0) return null;
    const start = Math.max(0, offset - WINDOW);
    const end = Math.min(text.length, offset + WINDOW);
    const slice = text.slice(start, end);
    for (const { mac, index } of findMacs(slice)) {
      // At the window edges the lookarounds cannot see the real surrounding text
      if (start > 0 && index < LOOKBEHIND) continue;
      if (end < text.length && index + mac.length > slice.length - LOOKAHEAD) continue;
      const abs = start + index;
      if (offset >= abs && offset <= abs + mac.length) return { mac, index: abs };
    }
    return null;
  }

  // ─── Normalisation and formatting ──────────────────────────────────────────

  function toHex(input) {
    return String(input).replace(/[\s:.\-]/g, '').toUpperCase();
  }

  /**
   * Strips separators and upper-cases a MAC address.
   * @param {string} mac
   * @returns {string | null} 12 hex digits, or null if the input is not a full MAC
   */
  function normalize(mac) {
    const hex = toHex(mac);
    return /^[0-9A-F]{12}$/.test(hex) ? hex : null;
  }

  /**
   * Formats hex digits as colon-separated pairs.
   * "001C0E" → "00:1C:0E", "70B3D51" → "70:B3:D5:1"
   * @param {string} hex
   * @returns {string}
   */
  function formatHex(hex) {
    return String(hex).match(/.{1,2}/g)?.join(':') ?? '';
  }

  /**
   * Splits a formatted MAC into [vendor prefix, device part]. The prefix length
   * follows the matched IEEE block (6, 7 or 9 hex digits) and defaults to the OUI.
   * @param {string} hex 12 hex digits
   * @param {number} [prefixDigits]
   * @returns {[string, string]} e.g. ["70:B3:D5:1F:0", "0:01"]
   */
  function splitMac(hex, prefixDigits) {
    const full = formatHex(hex);
    const n = Math.min(Math.max(prefixDigits || 6, 1), hex.length);
    const cut = n + Math.floor((n - 1) / 2); // digits plus the separators between them
    return [full.slice(0, cut), full.slice(cut)];
  }

  // ─── Addresses with a protocol meaning ─────────────────────────────────────

  // IEEE 802.1 reserved link-local addresses 01:80:C2:00:00:0X
  const IEEE_8021_LINK_LOCAL = { 0x00: 'stp', 0x01: 'pause', 0x02: 'slowProtocols', 0x03: 'pae', 0x0E: 'lldp' };

  /**
   * Identifies well-known group and virtual-router addresses.
   * @param {string} hex 12 hex digits
   * @returns {{id: string, params?: object} | null} id is an i18n key suffix ("special.<id>")
   */
  function specialAddress(hex) {
    const byteAt = (from, to) => parseInt(hex.slice(from, to), 16);
    if (hex === 'FFFFFFFFFFFF') return { id: 'broadcast' };
    if (hex === '000000000000') return { id: 'null' };
    if (hex.startsWith('01005E')) return { id: byteAt(6, 8) < 0x80 ? 'ipv4Multicast' : 'ianaReserved' };
    if (hex.startsWith('3333')) return { id: 'ipv6Multicast' };
    if (hex.startsWith('0180C200000')) return { id: IEEE_8021_LINK_LOCAL[byteAt(10, 12)] || 'linkLocalReserved' };
    if (hex === '01000CCCCCCC') return { id: 'cdp' };
    if (hex === '01000CCCCCCD') return { id: 'pvst' };
    if (hex.startsWith('00005E0001')) return { id: 'vrrp4', params: { id: byteAt(10, 12) } };
    if (hex.startsWith('00005E0002')) return { id: 'vrrp6', params: { id: byteAt(10, 12) } };
    if (hex.startsWith('00000C07AC')) return { id: 'hsrp1', params: { group: byteAt(10, 12) } };
    if (hex.startsWith('00000C9FF')) return { id: 'hsrp2', params: { group: byteAt(9, 12) } };
    return null;
  }

  // ─── Registry lookup ───────────────────────────────────────────────────────

  /**
   * @typedef {object} LookupResult
   * @property {boolean} valid        false when the input is not 6–12 hex digits
   * @property {string} hex           normalised input
   * @property {boolean} complete     true for a full 12-digit address
   * @property {boolean} isMulticast  I/G bit set (group address)
   * @property {boolean} isLocal      U/L bit set (locally administered)
   * @property {{id: string, params?: object}|null} special  protocol meaning, see specialAddress()
   * @property {string|null} vendor   organisation name from the registry
   * @property {string|null} registry "MA-L" | "MA-M" | "MA-S" | "CID"
   * @property {string|null} prefix   matched prefix in hex digits
   */

  /**
   * Builds a lookup function over the data produced by build-oui-database.py.
   * Universally administered addresses use a longest-prefix match
   * (MA-S → MA-M → MA-L); locally administered ones are checked against CID.
   * @param {{meta?: object, L?: object, M?: object, S?: object, CID?: object}} data
   * @returns {{lookup: (input: string) => LookupResult, stats: {generated: string|null, counts: object}}}
   */
  function createLookup(data) {
    const table = key => (data && typeof data[key] === 'object' && data[key]) || {};
    const tables = { L: table('L'), M: table('M'), S: table('S'), CID: table('CID') };
    // Own properties only: keys such as "__proto__" must never resolve
    const own = (obj, key) => (Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : null);

    function lookup(input) {
      const hex = toHex(input ?? '');
      if (!/^[0-9A-F]{6,12}$/.test(hex)) return { valid: false };

      const first = parseInt(hex.slice(0, 2), 16);
      const result = {
        valid: true,
        hex,
        complete: hex.length === 12,
        isMulticast: !!(first & 0x01),
        isLocal: !!(first & 0x02),
        special: hex.length === 12 ? specialAddress(hex) : null,
        vendor: null,
        registry: null,
        prefix: null,
      };

      // For group addresses the owner is found by clearing the I/G bit
      const base = (first & 0xFE).toString(16).padStart(2, '0').toUpperCase() + hex.slice(2);
      const tryTable = (name, tbl, len) => {
        if (base.length < len) return false;
        const vendor = own(tbl, base.slice(0, len));
        if (typeof vendor !== 'string') return false;
        Object.assign(result, { vendor, registry: name, prefix: base.slice(0, len) });
        return true;
      };

      if (result.isLocal) {
        tryTable('CID', tables.CID, 6);
      } else {
        tryTable('MA-S', tables.S, 9) || tryTable('MA-M', tables.M, 7) || tryTable('MA-L', tables.L, 6);
      }
      return result;
    }

    const stats = {
      generated: (data && data.meta && data.meta.generated) || null,
      counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, Object.keys(v).length])),
    };

    return { lookup, stats };
  }

  // ─── Presentation ──────────────────────────────────────────────────────────

  const BLOCK_BITS = { 'MA-L': 24, 'MA-M': 28, 'MA-S': 36, CID: 24 };

  /**
   * Turns a lookup result into the text shown to the user.
   * `kind` drives the colour code: vendor | local | group | unknown | invalid.
   * @param {LookupResult} r
   * @param {(key: string, params?: object) => string} t translator from i18n.js
   * @returns {{kind: string, category: string, title: string, detail: string}}
   */
  function describe(r, t) {
    if (!r || !r.valid) {
      return { kind: 'invalid', category: t('kind.invalid.category'), title: t('kind.invalid.title'), detail: t('kind.invalid.detail') };
    }
    const block = r.prefix
      ? t('kind.block', { registry: r.registry, bits: BLOCK_BITS[r.registry], prefix: formatHex(r.prefix) })
      : '';
    if (r.special && typeof r.special.id === 'string') {
      return {
        kind: 'group',
        category: t('kind.special.category'),
        title: t(`special.${r.special.id}`, r.special.params),
        detail: r.vendor ? t('kind.special.assigned', { vendor: r.vendor }) : '',
      };
    }
    if (r.isLocal) {
      return r.vendor
        ? { kind: 'local', category: t('kind.localVendor.category'), title: r.vendor, detail: block }
        : { kind: 'local', category: t('kind.random.category'), title: t('kind.random.title'), detail: t('kind.random.detail') };
    }
    if (r.isMulticast) {
      return r.vendor
        ? { kind: 'group', category: t('kind.group.category'), title: r.vendor, detail: block }
        : { kind: 'group', category: t('kind.group.category'), title: t('kind.group.unregistered'), detail: '' };
    }
    if (r.vendor) return { kind: 'vendor', category: t('kind.vendor.category'), title: r.vendor, detail: block };
    return { kind: 'unknown', category: t('kind.unknown.category'), title: t('kind.unknown.title'), detail: t('kind.unknown.detail', { prefix: formatHex(r.hex.slice(0, 6)) }) };
  }

  // ─── Site permissions ──────────────────────────────────────────────────────

  /**
   * Builds the optional host permission pattern for a page origin.
   * @param {string} url
   * @returns {string | null} "https://host/*", "file:///*" or null if unsupported
   */
  function sitePatternFromUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') return `${u.protocol}//${u.hostname}/*`;
      if (u.protocol === 'file:') return 'file:///*';
    } catch { /* not a valid URL */ }
    return null;
  }

  /**
   * Simplified Chrome match-pattern test (scheme and host only), used to decide
   * whether a revoked permission applies to the current page.
   * @param {string} pattern e.g. "<all_urls>", "*://*.example.com/*"
   * @param {string} url
   * @returns {boolean}
   */
  function patternMatchesUrl(pattern, url) {
    let u;
    try { u = new URL(url); } catch { return false; }
    const scheme = u.protocol.slice(0, -1);
    if (pattern === '<all_urls>') return ['http', 'https', 'file'].includes(scheme);
    const m = /^(\*|https?|file):\/\/([^/]*)\//.exec(pattern);
    if (!m) return false;
    if (m[1] === '*' ? !['http', 'https'].includes(scheme) : m[1] !== scheme) return false;
    if (scheme === 'file') return true;
    const host = m[2];
    if (host === '*') return true;
    if (host.startsWith('*.')) return u.hostname === host.slice(2) || u.hostname.endsWith(host.slice(1));
    return u.hostname === host;
  }

  const api = Object.freeze({
    findMacs,
    findMacAt,
    normalize,
    formatHex,
    splitMac,
    createLookup,
    describe,
    sitePatternFromUrl,
    patternMatchesUrl,
  });

  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.MacCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
