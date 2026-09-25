# Changelog

All notable changes to MAC Inspector are listed here. Versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Added
- Italian translation of the README (`README.it.md`), with a language switch at the top of both files.

### Changed
- README: installation starts from the ZIP of the latest GitHub release; the source ZIP and `git clone` are listed as alternatives.

## 3.4.1

### Added
- New logo: a magnifying glass over the vendor prefix of a MAC address. Sources in `icons/logo.svg` and `icons/logo-small.svg` (drawn for 16 px); the PNG icons are rendered from them.
- 32 px icon for high-density screens.
- README header with logo, and a social preview image for GitHub (`docs/img/social-preview.png`).
- Link to the GitHub repository in the extension details (`homepage_url`).
- README: step-by-step installation from GitHub, updating, removing, and a "How it works" section.

### Changed
- The popup, side panel and About page headers use the SVG logo, sharp at every size.
- The About page is always in English, whatever the language setting, so the legal information reads the same for every user.
- Remaining Italian comments in project files translated to English.

### Fixed
- The i18n test now really compares the placeholders of the English and Italian texts.

## 3.4.0

### Added
- English and Italian interface, with a language menu in the popup (Automatic, English, Italiano). The tooltip, popup, side panel and About page switch language immediately.
- Localised extension name, description and shortcut names in `chrome://extensions`.

### Changed
- The About page contains only the essential information, in the selected language.
- Shortcut modifier names follow the selected language.
- Stored history is language-neutral, so earlier entries are shown in the current language.

### Security
- Strict Content Security Policy for all extension pages: no inline code or styles, no remote resources, no framing.
- Page styles moved from inline blocks to stylesheet files.
- The language setting is validated against the supported values.

## 3.3.0

### Added
- Copyright line and "License and credits" link at the bottom of the popup and of the side panel.
- IEEE Registration Authority credited as the data source in the popup and in the side panel.
- About page with version, copyright, contact, license text and third-party notices.

### Changed
- License: including MAC Inspector in a commercial product or service now requires written permission, and reused interfaces must keep the copyright line visible.

## 3.2.1

### Fixed
- In iframes the tooltip was clipped by the frame. It is now shown by the top page.
- The tooltip of the top page stayed open when the cursor moved into an iframe.
- With a long history the popup exceeded Chrome's 600 px limit, causing a double scrollbar and a cut-off footer.

### Changed
- The highlight colour now matches the interface.
- Code documentation and project documents are in English, with SPDX headers in every source file.
- Unused internal functions were removed.

## 3.2.0

### Added
- Hover history for each tab, listed in the popup and in the side panel; one click copies MAC and vendor.
- Toolbar badge with the number of addresses seen and the last vendor in its tooltip.
- `Alt+Shift+V` opens the popup and `Alt+Shift+L` opens or closes the side panel.
- The vendor prefix is shown in bold, with its real length (24, 28 or 36 bits).

### Changed
- New interface for tooltip, popup and side panel, in a light and a dark theme, with a colour code for address types.

## 3.1.0

### Added
- On-demand site access: activate now, always on one site or always on all sites.
- Discreet mode, which adds nothing to the page.
- Side panel.

### Changed
- The highlight name is random for each page and its CSS is injected as a user stylesheet.

### Security
- The extension no longer requests access to every website at install.

## 3.0.0

### Changed
- Complete rewrite. The page is no longer modified: the MAC under the cursor is detected on hover.

### Added
- IEEE MA-M, MA-S, IAB and CID registries, with longest-prefix matching.
- Special addresses: broadcast, multicast, STP, LACP, LLDP, CDP, PVST+, VRRP and HSRP.
- Huawei/H3C and HP/Aruba notations.
- Support for text inputs, shadow DOM and iframes.
- Automated tests.

### Fixed
- MAC addresses were removed from text areas, and markup was inserted into editable content.
- Text inside SVG disappeared.
- Order numbers, certificate fingerprints and EUI-64 identifiers were detected as MAC addresses.
- The popup did not work under Manifest V3.

## 2.0.0

- First version.
