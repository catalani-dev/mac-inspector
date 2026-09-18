// SPDX-FileCopyrightText: 2026 CatalaniDev <catalanidev@gmail.com>
// SPDX-License-Identifier: LicenseRef-MAC-Inspector-1.0
//
// Tests for mac-core.js and i18n.js.  Run with: node --test tests/mac-core.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const core = require('../mac-core.js');
const i18n = require('../i18n.js');

const en = i18n.translator('en');
const it = i18n.translator('it');

const first = s => (core.findMacs(s)[0] || {}).mac || null;

// ─── Detection ───────────────────────────────────────────────────────────────

test('detects every supported notation', () => {
  assert.equal(first('MAC 00:1c:0e:11:22:33'), '00:1c:0e:11:22:33');
  assert.equal(first('MAC:00:1C:0E:11:22:33.'), '00:1C:0E:11:22:33');
  assert.equal(first('00-1C-0E-11-22-33'), '00-1C-0E-11-22-33');
  assert.equal(first('mac=001C.0E11.2233,'), '001C.0E11.2233');
  assert.equal(first('hw 001c-0e11-2233'), '001c-0e11-2233');
  assert.equal(first('hp 001c0e-112233'), '001c0e-112233');
  assert.equal(first('(001C0E112233)'), '001C0E112233');
  assert.equal(first('vlan10-00:11:22:33:44:55'), '00:11:22:33:44:55');
});

test('rejects strings that only look like MAC addresses', () => {
  for (const s of [
    'Fingerprint=AB:CD:EF:01:23:45:67:89:AB:CD',
    'EUI-64 00:11:22:33:44:55:66:77',
    'AA:BB-CC:DD-EE:FF',
    'sha a1b2c3d4e5f6a7b8',
    'ipv6 fe80::1c:0e11:2233',
    'x00:11:22:33:44:55',
    '00:11:22:33:44:55y',
  ]) assert.equal(first(s), null, s);
});

test('findMacAt returns only the MAC under the offset', () => {
  const text = 'a 00:11:22:33:44:55 b 3C:5A:B4:00:00:01 c';
  assert.equal(core.findMacAt(text, 2).mac, '00:11:22:33:44:55');
  assert.equal(core.findMacAt(text, 19).mac, '00:11:22:33:44:55'); // end offset is inclusive
  assert.equal(core.findMacAt(text, 25).mac, '3C:5A:B4:00:00:01');
  assert.equal(core.findMacAt(text, 0), null);
  assert.equal(core.findMacAt(text, 21), null);
  assert.equal(core.findMacAt(null, 0), null);
  assert.equal(core.findMacAt(text, -1), null);
});

test('findMacAt is not fooled by the edges of its analysis window', () => {
  const fingerprint = 'AB:CD:EF:01:23:45:67:89:'.repeat(6) + 'AB:CD';
  for (let off = 0; off <= fingerprint.length; off++) {
    assert.equal(core.findMacAt(fingerprint, off), null, `offset ${off}`);
  }
  const long = 'x'.repeat(1_000_000) + ' 00:1C:0E:11:22:33 ' + 'y'.repeat(1_000_000);
  assert.equal(core.findMacAt(long, 1_000_005).mac, '00:1C:0E:11:22:33');
});

test('detection runs in linear time on pathological input', () => {
  const start = Date.now();
  core.findMacs('0a:'.repeat(2e6) + '!');
  core.findMacs('0000.'.repeat(1e6));
  core.findMacs('a'.repeat(5e6));
  assert.ok(Date.now() - start < 2000);
});

// ─── Formatting ──────────────────────────────────────────────────────────────

test('normalize and formatHex', () => {
  assert.equal(core.normalize('001c.0e11.2233'), '001C0E112233');
  assert.equal(core.normalize('00:1C:0E'), null);
  assert.equal(core.formatHex('70B3D51'), '70:B3:D5:1');
});

test('splitMac separates the vendor prefix from the device part', () => {
  assert.deepEqual(core.splitMac('001C0E112233', 6), ['00:1C:0E', ':11:22:33']);
  assert.deepEqual(core.splitMac('70B3D51F0001', 7), ['70:B3:D5:1', 'F:00:01']);
  assert.deepEqual(core.splitMac('70B3D51F0001', 9), ['70:B3:D5:1F:0', '0:01']);
  assert.deepEqual(core.splitMac('001C0E112233'), ['00:1C:0E', ':11:22:33']);
});

// ─── Lookup ──────────────────────────────────────────────────────────────────

const fixture = {
  meta: { generated: '2026-01-01T00:00:00Z' },
  L: { '00000C': 'Cisco Systems, Inc', '70B3D5': 'IEEE Registration Authority', '00005E': 'ICANN, IANA Department' },
  M: { '70B3D51': 'Vendor MA-M' },
  S: { '70B3D5123': 'Vendor MA-S' },
  CID: { '0A1B2C': 'Azienda CID' },
};
const { lookup, stats } = core.createLookup(fixture);

test('lookup uses the longest matching prefix', () => {
  assert.equal(lookup('70:B3:D5:12:34:56').vendor, 'Vendor MA-S');
  assert.equal(lookup('70:B3:D5:12:34:56').registry, 'MA-S');
  assert.equal(lookup('70:B3:D5:1F:00:00').vendor, 'Vendor MA-M');
  assert.equal(lookup('70:B3:D5:F0:00:00').vendor, 'IEEE Registration Authority');
  assert.equal(lookup('00000C').vendor, 'Cisco Systems, Inc'); // OUI only
  assert.equal(stats.counts.L, 3);
  assert.equal(stats.generated, '2026-01-01T00:00:00Z');
});

test('local, group and special addresses', () => {
  const local = lookup('0A:1B:2C:00:00:01');
  assert.equal(local.isLocal, true);
  assert.equal(local.vendor, 'Azienda CID');
  assert.equal(lookup('DA:A1:19:00:00:01').vendor, null);
  const title = mac => core.describe(lookup(mac), en).title;
  assert.equal(title('01:00:0C:CC:CC:CC'), 'Cisco CDP / VTP / DTP / UDLD');
  assert.equal(lookup('01:00:0C:CC:CC:CC').vendor, 'Cisco Systems, Inc'); // I/G bit cleared
  assert.equal(title('FF:FF:FF:FF:FF:FF'), 'Broadcast');
  assert.equal(title('01:00:5E:01:02:03'), 'IPv4 multicast (IANA)');
  assert.equal(title('33:33:00:00:00:01'), 'IPv6 multicast');
  assert.equal(title('01:80:C2:00:00:0E'), 'LLDP / PTP (Nearest Bridge)');
  assert.equal(title('00:00:5E:00:01:0A'), 'VRRP IPv4 (VRID 10)');
  assert.equal(title('00:00:0C:07:AC:05'), 'HSRP v1 (group 5)');
  assert.equal(core.describe(lookup('00:00:0C:07:AC:05'), it).title, 'HSRP v1 (gruppo 5)');
  assert.equal(title('00:00:0C:9F:F0:64'), 'HSRP v2 (group 100)');
  assert.deepEqual(lookup('00:00:0C:9F:F0:64').special, { id: 'hsrp2', params: { group: 100 } });
});

test('lookup rejects invalid input without throwing', () => {
  for (const v of [undefined, null, 123, {}, [], '', 'zzzzzz', '__proto__', 'constructor', '00:11']) {
    assert.equal(lookup(v).valid, false, String(v));
  }
});

test('describe maps every case to a kind and a text (Italian)', () => {
  const d = mac => core.describe(lookup(mac), it);
  assert.deepEqual([d('00:00:0C:11:22:33').kind, d('00:00:0C:11:22:33').title], ['vendor', 'Cisco Systems, Inc']);
  assert.equal(d('00:00:0C:11:22:33').detail, 'Blocco MA-L da 24 bit: 00:00:0C');
  assert.equal(d('70:B3:D5:12:34:56').detail, 'Blocco MA-S da 36 bit: 70:B3:D5:12:3');
  assert.deepEqual([d('DA:A1:19:00:00:01').kind, d('DA:A1:19:00:00:01').category], ['local', 'MAC casuale o virtuale']);
  assert.deepEqual([d('0A:1B:2C:00:00:01').kind, d('0A:1B:2C:00:00:01').title], ['local', 'Azienda CID']);
  assert.deepEqual([d('FF:FF:FF:FF:FF:FF').kind, d('FF:FF:FF:FF:FF:FF').title], ['group', 'Broadcast']);
  assert.equal(d('00:AA:BB:00:00:01').kind, 'unknown');
  assert.equal(core.describe({ valid: false }, it).kind, 'invalid');
});

const DB_FILE = path.join(__dirname, '..', 'oui-data.json');

test('bundled oui-data.json: structure and well-known vendors', { skip: !fs.existsSync(DB_FILE) }, () => {
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const db = core.createLookup(data);
  assert.ok(db.stats.counts.L > 30000);
  assert.ok(db.stats.counts.M > 1000);
  assert.ok(db.stats.counts.S > 1000);
  assert.match(db.lookup('00:1C:0E:00:00:00').vendor, /Cisco/i);
  assert.match(db.lookup('B8:27:EB:00:00:00').vendor, /Raspberry/i);
  // An MA-M block must resolve to its owner, not to "IEEE Registration Authority"
  const prefix = Object.keys(data.M).find(p => p.startsWith('70B3D5')) || Object.keys(data.M)[0];
  const r = db.lookup(prefix.padEnd(12, '0'));
  assert.notEqual(r.vendor, 'IEEE Registration Authority');
  assert.ok(r.registry === 'MA-M' || r.registry === 'MA-S');
});

// ─── Site permissions ────────────────────────────────────────────────────────

test('sitePatternFromUrl builds per-site permission patterns', () => {
  assert.equal(core.sitePatternFromUrl('https://192.168.1.1:8443/status'), 'https://192.168.1.1/*');
  assert.equal(core.sitePatternFromUrl('http://router.lan/'), 'http://router.lan/*');
  assert.equal(core.sitePatternFromUrl('file:///C:/dump.txt'), 'file:///*');
  assert.equal(core.sitePatternFromUrl('chrome://extensions'), null);
  assert.equal(core.sitePatternFromUrl('not a url'), null);
});

test('patternMatchesUrl compares scheme and host', () => {
  assert.equal(core.patternMatchesUrl('https://192.168.1.1/*', 'https://192.168.1.1:8443/x'), true);
  assert.equal(core.patternMatchesUrl('https://192.168.1.1/*', 'http://192.168.1.1/'), false);
  assert.equal(core.patternMatchesUrl('https://192.168.1.1/*', 'https://192.168.1.10/'), false);
  assert.equal(core.patternMatchesUrl('*://*.example.com/*', 'https://a.example.com/'), true);
  assert.equal(core.patternMatchesUrl('*://*.example.com/*', 'https://example.com/'), true);
  assert.equal(core.patternMatchesUrl('*://*.example.com/*', 'https://badexample.com/'), false);
  assert.equal(core.patternMatchesUrl('<all_urls>', 'file:///C:/x.txt'), true);
  assert.equal(core.patternMatchesUrl('<all_urls>', 'chrome://settings'), false);
  assert.equal(core.patternMatchesUrl('file:///*', 'file:///C:/x.txt'), true);
});

test('describe in English', () => {
  const d = mac => core.describe(lookup(mac), en);
  assert.equal(d('00:00:0C:11:22:33').category, 'Registered vendor');
  assert.equal(d('00:00:0C:11:22:33').detail, 'MA-L block, 24 bits: 00:00:0C');
  assert.equal(d('DA:A1:19:00:00:01').title, 'Vendor cannot be determined');
  assert.equal(d('00:AA:BB:00:00:01').detail, 'Prefix 00:AA:BB is not in the IEEE registry');
  assert.equal(core.describe({ valid: false }, en).title, 'Not a MAC address');
});

// ─── i18n ────────────────────────────────────────────────────────────────────

test('English and Italian define the same keys and placeholders', () => {
  const keys = lang => Object.keys(i18n.DICT[lang]).sort();
  assert.deepEqual(keys('it'), keys('en'));
  const placeholders = text => (text.match(/\{\w+\}/g) || []).sort();
  for (const key of keys('en')) {
    assert.deepEqual(placeholders(i18n.DICT.it[key]), placeholders(i18n.DICT.en[key]), key);
    assert.ok(i18n.DICT.en[key].trim() && i18n.DICT.it[key].trim(), `empty text: ${key}`);
  }
});

test('every special address id has a text in both languages', () => {
  const ids = ['broadcast', 'null', 'ipv4Multicast', 'ianaReserved', 'ipv6Multicast', 'stp', 'pause', 'slowProtocols',
    'pae', 'lldp', 'linkLocalReserved', 'cdp', 'pvst', 'vrrp4', 'vrrp6', 'hsrp1', 'hsrp2'];
  for (const lang of i18n.LANGS) for (const id of ids) assert.ok(`special.${id}` in i18n.DICT[lang], `${lang}: ${id}`);
});

test('resolveLang accepts only supported settings', () => {
  assert.equal(i18n.resolveLang('it', 'en-US'), 'it');
  assert.equal(i18n.resolveLang('en', 'it-IT'), 'en');
  assert.equal(i18n.resolveLang('auto', 'it-IT'), 'it');
  assert.equal(i18n.resolveLang('auto', 'it'), 'it');
  assert.equal(i18n.resolveLang('auto', 'de-DE'), 'en');
  for (const bad of ['fr', '__proto__', 'constructor', '', null, undefined, 42, {}]) {
    assert.equal(i18n.resolveLang(bad, 'en-US'), 'en', String(bad));
  }
});

test('translator substitutes parameters literally and falls back safely', () => {
  assert.equal(en('kind.special.assigned', { vendor: '<img src=x onerror=alert(1)>' }), 'Assigned to <img src=x onerror=alert(1)>');
  assert.equal(en('kind.unknown.detail', { prefix: '$& $1 {prefix}' }), 'Prefix $& $1 {prefix} is not in the IEEE registry');
  assert.equal(en('missing.key'), 'missing.key');
  assert.equal(en('__proto__'), '__proto__');
  assert.equal(i18n.translator('fr')('popup.search'), 'Search');
  assert.equal(it('special.hsrp1', {}), 'HSRP v1 (gruppo {group})');
});
