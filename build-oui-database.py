#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 CatalaniDev <catalanidev@gmail.com>
# SPDX-License-Identifier: LicenseRef-MAC-Inspector-1.0
"""
Build oui-data.json from the public IEEE Registration Authority listings.

Downloads the MA-L, MA-M, MA-S, IAB and CID registries and writes
oui-data.json next to this script (the extension root, beside manifest.json).
The output is plain JSON data, never code: a tampered registry cannot execute
anything inside the extension.

Usage:
    python build-oui-database.py            download and rebuild
    python build-oui-database.py --check    validate the existing file only

Requirements:
    Python 3.8+, no third-party packages, internet access.

Safeguards:
    - HTTPS only, with certificate verification (urllib default)
    - size limit on every download
    - every row validated (hex prefix of the expected length)
    - minimum entry counts: an empty download or an error page never replaces
      the existing database
    - atomic write (temporary file + rename)
    - an optional registry that fails to download is taken from the previous file
"""

import argparse
import csv
import io
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request

BASE_URL = "https://standards-oui.ieee.org/"
HERE = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(HERE, "oui-data.json")

MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024
MAX_NAME_LENGTH = 160
MIN_MA_L_ENTRIES = 30000

# (table, path, prefix length in hex digits, required, minimum entries)
# IAB and MA-S are both 36-bit blocks and share table "S"; MA-S is processed
# last so it wins if the two ever overlap.
REGISTRIES = [
    ("L",   "oui/oui.csv",     6, True,  MIN_MA_L_ENTRIES),
    ("M",   "oui28/mam.csv",   7, False, 1000),
    ("S",   "iab/iab.csv",     9, False, 1000),
    ("S",   "oui36/oui36.csv", 9, False, 1000),
    ("CID", "cid/cid.csv",     6, False, 10),
]

TABLE_PREFIX_LENGTHS = {"L": 6, "M": 7, "S": 9, "CID": 6}

CONTROL_CHARS = re.compile("[\x00-\x1f\x7f-\x9f\u2028\u2029]")
SPACES = re.compile(r"\s+")


class RegistryError(Exception):
    """A registry could not be downloaded or does not look valid."""


def download(path):
    """Downloads one registry CSV and returns it as text."""
    url = BASE_URL + path
    req = urllib.request.Request(url, headers={
        "User-Agent": "MAC-Inspector-Builder/3.4.1",
        "Accept": "text/csv,*/*",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read(MAX_DOWNLOAD_BYTES + 1)
    except urllib.error.URLError as e:
        raise RegistryError(f"download failed ({getattr(e, 'reason', e)})")
    if len(data) > MAX_DOWNLOAD_BYTES:
        raise RegistryError("file exceeds the size limit")
    return data.decode("utf-8-sig", errors="replace")


def clean_name(name):
    """Removes control characters, collapses whitespace and caps the length."""
    name = CONTROL_CHARS.sub(" ", name)
    name = SPACES.sub(" ", name).strip()
    return name[:MAX_NAME_LENGTH]


def parse_registry(csv_text, hex_len):
    """
    Parses an IEEE registry CSV.

    Returns ({prefix: organisation}, skipped_rows).
    Raises RegistryError if the header is not the expected IEEE header.
    """
    reader = csv.reader(io.StringIO(csv_text))
    header = next(reader, None)
    if not header or len(header) < 3 or header[1].strip() != "Assignment":
        raise RegistryError("unexpected CSV header (error page?)")

    prefix_re = re.compile(rf"[0-9A-F]{{{hex_len}}}")
    entries = {}
    skipped = 0
    for row in reader:
        if len(row) < 3:
            skipped += 1
            continue
        prefix = row[1].strip().upper()
        name = clean_name(row[2])
        if not prefix_re.fullmatch(prefix) or not name:
            skipped += 1
            continue
        entries[prefix] = name
    return entries, skipped


def load_previous():
    """Returns the current oui-data.json as a dict, or {} if missing or unreadable."""
    try:
        with open(OUTPUT_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def write_atomic(payload):
    """Writes the JSON to a temporary file and renames it over the output."""
    fd, tmp = tempfile.mkstemp(prefix=".oui-data-", suffix=".json", dir=HERE)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            json.dump(payload, f, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        os.replace(tmp, OUTPUT_FILE)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def validate(payload):
    """Structural checks on the final JSON (also used by --check)."""
    for key, hex_len in TABLE_PREFIX_LENGTHS.items():
        table = payload.get(key)
        if not isinstance(table, dict):
            raise RegistryError(f"table {key} is missing")
        prefix_re = re.compile(rf"[0-9A-F]{{{hex_len}}}")
        for prefix, name in table.items():
            if not prefix_re.fullmatch(prefix) or not isinstance(name, str) or not name:
                raise RegistryError(f"invalid entry in {key}: {prefix!r}")
    if len(payload["L"]) < MIN_MA_L_ENTRIES:
        raise RegistryError("MA-L has too few entries")


def build():
    """Downloads every registry, validates the result and writes oui-data.json."""
    previous = load_previous()
    tables = {"L": {}, "M": {}, "S": {}, "CID": {}}
    sources = []

    for key, path, hex_len, required, minimum in REGISTRIES:
        print(f"  -> {BASE_URL}{path}")
        try:
            entries, skipped = parse_registry(download(path), hex_len)
            if len(entries) < minimum:
                raise RegistryError(f"only {len(entries)} entries (minimum {minimum})")
            tables[key].update(entries)
            sources.append(path)
            print(f"     {len(entries):,} entries" + (f", {skipped} rows skipped" if skipped else ""))
        except RegistryError as e:
            if required:
                raise SystemExit(f"\nERROR {path}: {e}\n      oui-data.json was NOT modified.")
            old = previous.get(key)
            if not isinstance(old, dict):
                old = {}
            print(f"     WARNING {e}; reusing {len(old)} entries from the previous file")
            tables[key].update(old)

    payload = {
        "meta": {
            "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "source": BASE_URL,
            "registries": sources,
        },
        **tables,
    }
    validate(payload)
    write_atomic(payload)
    return payload


def main():
    parser = argparse.ArgumentParser(description="Build oui-data.json from the IEEE registries.")
    parser.add_argument("--check", action="store_true", help="validate the existing file without downloading")
    args = parser.parse_args()

    if args.check:
        payload = load_previous()
        try:
            validate(payload)
        except (RegistryError, AttributeError, KeyError) as e:
            raise SystemExit(f"ERROR oui-data.json is not valid: {e}")
        counts = ", ".join(f"{k}={len(payload[k])}" for k in TABLE_PREFIX_LENGTHS)
        print(f"OK oui-data.json is valid ({counts}, generated {payload.get('meta', {}).get('generated')})")
        return 0

    print("\nMAC Inspector - IEEE registry builder\n")
    payload = build()
    kb = os.path.getsize(OUTPUT_FILE) // 1024
    counts = ", ".join(f"{k}: {len(payload[k]):,}" for k in TABLE_PREFIX_LENGTHS)
    print(f"\nOK {OUTPUT_FILE} ({kb} KB)\n   {counts}")
    print("   Reload the extension in chrome://extensions to use the new data.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
