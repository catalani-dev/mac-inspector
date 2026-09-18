// SPDX-FileCopyrightText: 2026 CatalaniDev <catalanidev@gmail.com>
// SPDX-License-Identifier: LicenseRef-MAC-Inspector-1.0
//
// about.js — About page: version, copyright, license and third-party notices.
//
// The page is always in English, whatever the language setting, so the legal
// information reads the same for every user. The license and notices are read
// from the LICENSE and NOTICE.md files bundled with the extension, so the page
// always shows the terms that ship with this copy. They are inserted with
// textContent and never interpreted as HTML.

'use strict';

const $ = id => document.getElementById(id);

// Only these bundled files can be displayed
const DOCUMENTS = { license: 'LICENSE', notice: 'NOTICE.md' };

async function loadDocument(id) {
  const file = DOCUMENTS[id];
  const target = $(id);
  target.textContent = 'Loading…';
  try {
    const res = await fetch(chrome.runtime.getURL(file));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    target.textContent = await res.text();
  } catch {
    target.textContent = `${file} is not available.`;
  }
}

async function render() {
  // Shared components (registry date and counts) are rendered in English too
  MacUI.setI18n({ setting: 'en', lang: 'en', locale: MacI18n.LOCALES.en, t: MacI18n.translator('en') });
  $('version').textContent = `Version ${chrome.runtime.getManifest().version}`;
  $('copyright').textContent = MacUI.copyrightText();
  MacUI.renderRegistryInfo($('dbInfo'), { label: false });
  await Promise.all(Object.keys(DOCUMENTS).map(loadDocument));
}

render();
