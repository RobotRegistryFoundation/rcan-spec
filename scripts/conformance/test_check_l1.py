"""Unit tests for RCAN L1 conformance checker (scripts/conformance/check_l1.py)."""

import io
import os
import sys
import unittest
from contextlib import redirect_stdout
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_l1


class TestCheckL1(unittest.TestCase):
    def test_ruri_validation_passes_and_rejects_invalid(self):
        checker = check_l1.L1Checker("127.0.0.1", 8080, None, False)
        self.assertTrue(checker.test_ruri_valid().passed)
        self.assertTrue(checker.test_ruri_invalid_missing_segments().passed)

    def test_skipped_tests_never_count_as_pass(self):
        results = [
            check_l1.TestResult("L1-RURI-001", "valid", True, "ok"),
            check_l1.TestResult("L1-RBAC-001", "rbac", False, "unreachable", skipped=True),
        ]
        buf = io.StringIO()
        with redirect_stdout(buf):
            ok = check_l1.print_report(results)
        self.assertFalse(ok)
        self.assertEqual(check_l1.evaluate_exit_code(results), 2)
        self.assertIn("INCOMPLETE", buf.getvalue())
        self.assertNotIn("L1 CORE CONFORMANT", buf.getvalue())

    def test_failed_test_returns_exit_code_1_even_with_skips(self):
        results = [
            check_l1.TestResult("L1-RURI-001", "valid", True, "ok"),
            check_l1.TestResult("L1-AUDIT-001", "audit", False, "connection refused"),
            check_l1.TestResult("L1-RBAC-001", "rbac", False, "unreachable", skipped=True),
        ]
        buf = io.StringIO()
        with redirect_stdout(buf):
            ok = check_l1.print_report(results)
        self.assertFalse(ok)
        self.assertEqual(check_l1.evaluate_exit_code(results), 1)
        self.assertIn("NOT CONFORMANT", buf.getvalue())

    def test_mdns_unreachable_is_skipped_not_passed(self):
        checker = check_l1.L1Checker("127.0.0.1", 1, None, False)
        with mock.patch.object(check_l1, "_request", side_effect=ConnectionError("refused")):
            res = checker.test_mdns_service_type()
        self.assertFalse(res.passed)
        self.assertTrue(res.skipped)

    def test_all_passing_returns_conformant(self):
        results = [
            check_l1.TestResult("L1-RURI-001", "valid", True, "ok"),
            check_l1.TestResult("L1-AUDIT-001", "audit", True, "ok"),
        ]
        buf = io.StringIO()
        with redirect_stdout(buf):
            ok = check_l1.print_report(results)
        self.assertTrue(ok)
        self.assertEqual(check_l1.evaluate_exit_code(results), 0)
        self.assertIn("L1 CORE CONFORMANT", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
