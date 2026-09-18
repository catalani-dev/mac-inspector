# SPDX-FileCopyrightText: 2026 CatalaniDev <catalanidev@gmail.com>
# SPDX-License-Identifier: LicenseRef-MAC-Inspector-1.0
"""Tests for build-oui-database.py.  Run with: python -m unittest discover -s tests"""

import importlib.util
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("builder", os.path.join(HERE, "..", "build-oui-database.py"))
assert _spec is not None and _spec.loader is not None
builder = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(builder)

HEADER = "Registry,Assignment,Organization Name,Organization Address\n"


class ParseRegistryTest(unittest.TestCase):
    def test_valid_rows(self):
        csv_text = HEADER + 'MA-L,001C0E,"Cisco Systems, Inc",addr\nMA-L,b827eb,Raspberry Pi Foundation,addr\n'
        entries, skipped = builder.parse_registry(csv_text, 6)
        self.assertEqual(entries, {"001C0E": "Cisco Systems, Inc", "B827EB": "Raspberry Pi Foundation"})
        self.assertEqual(skipped, 0)

    def test_invalid_rows_are_skipped(self):
        csv_text = HEADER + "MA-L,XYZ123,Bad,a\nMA-L,00112,Short,a\nMA-L,001122,,a\nbroken\n"
        entries, skipped = builder.parse_registry(csv_text, 6)
        self.assertEqual(entries, {})
        self.assertEqual(skipped, 4)

    def test_names_are_cleaned_of_control_characters(self):
        csv_text = HEADER + 'MA-L,001122,"Acme\n  Corp\u2028 ""x""",a\n'
        entries, _ = builder.parse_registry(csv_text, 6)
        self.assertEqual(entries["001122"], 'Acme Corp "x"')

    def test_error_page_is_rejected(self):
        with self.assertRaises(builder.RegistryError):
            builder.parse_registry("<html><body>Error</body></html>", 6)


class ValidateTest(unittest.TestCase):
    def test_rejects_too_small_database(self):
        with self.assertRaises(builder.RegistryError):
            builder.validate({"L": {"001122": "x"}, "M": {}, "S": {}, "CID": {}})

    def test_rejects_malformed_prefixes(self):
        big = {f"{i:06X}": "v" for i in range(builder.MIN_MA_L_ENTRIES)}
        big["00112G"] = "x"
        with self.assertRaises(builder.RegistryError):
            builder.validate({"L": big, "M": {}, "S": {}, "CID": {}})

    def test_accepts_well_formed_database(self):
        big = {f"{i:06X}": "v" for i in range(builder.MIN_MA_L_ENTRIES)}
        builder.validate({"L": big, "M": {"70B3D51": "m"}, "S": {"70B3D5123": "s"}, "CID": {"0A1B2C": "c"}})


if __name__ == "__main__":
    unittest.main()
