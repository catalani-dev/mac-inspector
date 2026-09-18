<p align="center">
  <img src="icons/logo.svg" width="112" height="112" alt="MAC Inspector logo">
</p>

<h1 align="center">MAC Inspector</h1>

<p align="center">
  <strong>Hover over a MAC address, see who made the device.</strong><br>
  A Google Chrome extension for ARP tables, DHCP leases, switch and firewall consoles, logs and tickets.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-3.4.1-2F6FDF" alt="Version 3.4.1">
  <img src="https://img.shields.io/badge/Chrome-120%2B-2F6FDF" alt="Chrome 120 or later">
  <img src="https://img.shields.io/badge/Manifest-V3-2F6FDF" alt="Manifest V3">
  <img src="https://img.shields.io/badge/license-MAC%20Inspector%201.0-1D2127" alt="MAC Inspector License 1.0">
</p>

![Tooltip on an ARP table](docs/img/tooltip.png)

## Features

- **Vendor on hover.** No clicking, no copy and paste. The part of the address that identifies the manufacturer is shown in bold.
- **Complete IEEE registry.** MA-L, MA-M, MA-S, IAB and CID blocks with longest-prefix matching, so small blocks resolve to their real owner instead of "IEEE Registration Authority".
- **Colour-coded address types.**

  | Colour | Address type |
  |---|---|
  | Blue | Registered vendor |
  | Orange | Random or virtual MAC (locally administered) |
  | Purple | Group or special address |
  | Grey | Not registered |

- **Special addresses.** Broadcast, IPv4 and IPv6 multicast, STP, LACP, LLDP, CDP, PVST+, VRRP and HSRP.
- **Notations.**

  | Notation | Example |
  |---|---|
  | Colon | `00:1C:0E:11:22:33` |
  | Hyphen | `00-1C-0E-11-22-33` |
  | Cisco | `001c.0e11.2233` |
  | Huawei / H3C | `001c-0e11-2233` |
  | HP / Aruba | `001c0e-112233` |
  | No separators | `001C0E112233` |

- **Works in** plain text, tables, text inputs and text areas, editable content, SVG, web components and iframes.
- **History per tab.** Hovered addresses are listed in the popup and in the side panel; one click copies MAC and vendor.
- **English and Italian.** Choose the language in the popup, or let it follow the browser.
- **Light and dark theme**, following Chrome.
- **About page** with version, copyright, license and data credits, opened from the "License and credits" link in the popup and in the side panel.

| Popup | Side panel |
|---|---|
| ![Popup](docs/img/popup.png) | ![Side panel](docs/img/panel.png) |

## Installation

MAC Inspector is not published on the Chrome Web Store. Install it from this repository; it takes about a minute.

1. **Download.** On this page click **Code → Download ZIP**, then extract the ZIP to a permanent folder, for example `Documents\mac-inspector`. Chrome loads the extension from that folder every time it starts, so do not delete or move it afterwards.
   With Git you can clone the repository instead:

   ```bash
   git clone https://github.com/catalani-dev/mac-inspector.git
   ```

2. **Open the extensions page.** In Chrome, type `chrome://extensions` in the address bar and turn on **Developer mode** (top right).
3. **Load the extension.** Click **Load unpacked** and select the folder that contains `manifest.json`. After extracting a ZIP this is usually the inner folder, e.g. `mac-inspector-main`.
4. **Pin it.** Open the extensions menu (puzzle icon in the toolbar) and click the pin next to MAC Inspector, so the magnifying glass icon is always visible.

Requires Chrome 120 or later. Other Chromium browsers (Edge, Brave) usually work the same way but are not tested.

**Updating.** Download the new version, replace the files in the same folder, then click the **Reload** arrow on the MAC Inspector card in `chrome://extensions`. Settings are kept.

**Removing.** Click **Remove** on the MAC Inspector card in `chrome://extensions`, then delete the folder.

## How it works

1. **Enable it where you need it.** Click the magnifying glass icon on a page with MAC addresses (a router, a switch console, a DHCP server, a log viewer) and choose **Activate now** or **Always on this site**.
2. **Hover over a MAC address.** The address is highlighted and a small card appears next to the cursor:

   | Line | Example |
   |---|---|
   | Address type, colour coded | *Registered vendor* |
   | Manufacturer | *Cisco Systems, Inc* |
   | The address, vendor prefix in bold | ***00:1C:0E***:11:22:33 |
   | Registry block that matched | *MA-L block, 24 bits: 00:1C:0E* |

3. **Find it again later.** Every address you hover is added to the list of that tab: the toolbar icon shows how many, the popup and the side panel list them, and a click copies MAC and vendor to the clipboard.
4. **Look one up by hand.** Paste a MAC address, or a whole line of text that contains one, in the search box of the popup.

Nothing is sent anywhere: the lookup uses the copy of the IEEE registry included in the extension.

## Usage

After installation MAC Inspector has **no access to any website**. Choose where to enable it from the popup:

| Option in the popup | Effect |
|---|---|
| **Activate now** | Current tab only, until the page is reloaded. No permission prompt. |
| **Always on this site** | Every page of that site, e.g. `https://192.168.1.1`. Chrome asks for confirmation. |
| **Always on all sites** | Everywhere. Chrome asks for confirmation. |

Then hover over any MAC address. Press `Esc` to close the tooltip.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+V` | Open the popup with the addresses seen in the tab |
| `Alt+Shift+M` | Activate or deactivate MAC Inspector in the current tab |
| `Alt+Shift+L` | Open or close the side panel |

Shortcuts can be changed at `chrome://extensions/shortcuts`.

### Discreet mode

**Discreet mode** adds nothing to the page: no tooltip and no highlight. Results appear only in the popup, in the side panel and in the toolbar badge.

### Language

The **Language** menu at the bottom of the popup switches the tooltip, popup and side panel between **English** and **Italiano**. **Automatic** follows the browser language. The About page, with the license and legal notices, is always in English.

The extension name, description and shortcut names in `chrome://extensions` follow the browser language, as Chrome does not let extensions change them.

### Local files

To use MAC Inspector on `file://` pages, enable **Allow access to file URLs** in the extension details.

## Privacy and security

- **Everything runs locally.** No network requests, no analytics, no external services. The IEEE registry ships with the extension.
- **The page is never rewritten.** Forms, editable content and web applications are left untouched.
- **Password fields** are never read.
- **History** is kept in browser memory only. It is cleared when the tab or the browser is closed, and can be cleared at any time.
- **Permissions:**
  - `activeTab`, `scripting`: activation in the tab you choose;
  - `storage`: settings and history;
  - `sidePanel`: the side panel.

  Site access is optional and granted per site.
- **Strict Content Security Policy** on every extension page: only the extension's own scripts, styles, images and files can load; inline code, remote resources and framing are blocked.
- **No remote code.** The registry is plain JSON data; all text, including vendor names, is inserted as text and never interpreted as HTML.
- **Messages are validated.** The service worker accepts messages only from the extension itself and checks every field.

## Updating the IEEE registry

`oui-data.json` is rebuilt with the included script (Python 3.8+, no third-party packages):

```bash
python build-oui-database.py
```

The script downloads the IEEE registries and checks their structure and entry counts:

- if the main MA-L registry cannot be downloaded or looks wrong, the existing database is left untouched;
- if a secondary registry fails, its entries are taken from the previous file;
- the file is replaced in a single atomic step, so it is never left half-written.

To validate the current file without downloading anything:

```bash
python build-oui-database.py --check
```

After an update, click **Reload** on the extension in `chrome://extensions`.

## Development

Running the tests requires Node.js 18+ and Python 3.8+:

```bash
node --test tests/mac-core.test.js
python -B -m unittest discover -s tests
```

`-B` stops Python from writing `__pycache__` folders: Chrome refuses to load an extension folder that contains files or folders whose name starts with `_`, other than `_locales`.

| File | Purpose |
|---|---|
| `manifest.json` | Extension configuration (Manifest V3) |
| `mac-core.js` | MAC detection, registry lookup, special addresses, display texts |
| `content.js` | Hover detection, highlight and tooltip inside web pages |
| `background.js` | Service worker: registry, site access, history, side panel, shortcuts |
| `i18n.js` | English and Italian interface texts, language setting |
| `_locales/` | Extension name, description and shortcut names for `chrome://extensions` |
| `popup.html`, `popup.css`, `popup.js` | Toolbar popup |
| `panel.html`, `panel.css`, `panel.js` | Side panel |
| `about.html`, `about.css`, `about.js` | About page: version, copyright, license, third-party notices |
| `ui.css`, `ui.js` | Styles and components shared by popup, side panel and About page |
| `build-oui-database.py` | Builds `oui-data.json` from the IEEE registries |
| `oui-data.json` | IEEE registry data (third-party data, see [NOTICE.md](NOTICE.md)) |
| `icons/` | Logo (`logo.svg`, `logo-small.svg` for 16 px) and the PNG icons rendered from it |
| `tests/` | Automated tests |
| `docs/img/` | Screenshots and social preview image used on GitHub |

Every source file starts with an [SPDX](https://spdx.dev/) header that identifies the copyright holder and the license.

## License

Copyright (c) 2026 CatalaniDev. Released under the **MAC Inspector License 1.0**. This is a source-available license, not an open source license. The full terms are in [LICENSE](LICENSE).

| | |
|---|---|
| **Allowed** | Read the code; use MAC Inspector personally or inside your organisation, including at work; modify it for your own use. |
| **Allowed with credit** | Include MAC Inspector, modified or not, in your own **free, non-commercial** tool, as long as that tool adds substantial functionality and you keep the credits (below). |
| **Requires written permission** | Including MAC Inspector in a **commercial** product or service (paid, subscription, paid tier, paid online service, bundled with paid offerings, or ad-supported); redistributing it on its own; publishing it or a clone on an extension store; selling it on its own; removing copyright notices. |

### Including MAC Inspector in your tool

**Commercial products.** If your product or service makes money in any way, write to <catalanidev@gmail.com> before including MAC Inspector. Permission is granted case by case.

**Free, non-commercial tools.** Follow these steps:

1. Keep the SPDX header in every file you reuse.
2. Ship a copy of [LICENSE](LICENSE) or a link to it.
3. Credit it in your documentation and in your "About" or "Credits" section:

   ```text
   Includes MAC Inspector, Copyright (c) 2026 CatalaniDev,
   used under the MAC Inspector License 1.0.
   ```

4. Say so if you modified the code.
5. Do not name your tool "MAC Inspector" or imply endorsement by the author.
6. If you reuse the popup, the side panel or the About page, keep the "© 2026 CatalaniDev" line and its "License and credits" link visible.

The IEEE registry data and the trademarks mentioned belong to their respective owners and are not covered by this license: see [NOTICE.md](NOTICE.md). MAC Inspector is not affiliated with or endorsed by the IEEE or Google.

## Author

**CatalaniDev**, <catalanidev@gmail.com>

For permissions beyond the license, feedback or bug reports, write to the address above.
