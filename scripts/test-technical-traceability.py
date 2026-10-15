"""Exercise the actual traceability CLI with synthetic status evidence only.

This verifies report aggregation; it does not execute or approve original CU cases.
All generated fixtures and matrices stay in a disposable temporary directory.
"""
import csv
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class TraceabilityStatusRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="zarix-traceability-regression-")
        fixture = Path(cls.temp.name)
        statuses = {
            "CB-R01": ["passed", "PASS"],
            "CB-R02": ["passed", "failed"],
            "CB-R03": ["PASS", "BLOCKED"],
            "CB-R04": ["BLOCKED", "FAIL"],
            "CB-R05": ["BLOCKED", "blocked"],
        }
        assertions = [
            {"fullName": f"Synthetic {case_id} result {index}", "status": status}
            for case_id, values in statuses.items()
            for index, status in enumerate(values)
        ]
        (fixture / "final-vitest.json").write_text(json.dumps({
            "testResults": [{"name": "synthetic-status-evidence.test.ts", "assertionResults": assertions}]
        }))
        for name in ["balance-sql.json", "shared-sql.json", "database-verification.json"]:
            (fixture / name).write_text(json.dumps({"results": []}))
        system = [
            {"case_id": case_id, "status": status, "complete_original_contract": True,
             "assertions": [f"Synthetic status mapping {status}"], "evidence": "synthetic-fixture-only",
             "scope": "Status aggregation fixture; no original CU acceptance claimed",
             "blocker": "Synthetic unavailable prerequisite" if status == "BLOCKED" else ""}
            for case_id, status in [("CP1-01", "PASS"), ("CP1-02", "FAIL"), ("CP1-03", "BLOCKED")]
        ]
        (fixture / "system-case-results.json").write_text(json.dumps(system))
        completed = subprocess.run(
            [sys.executable, str(ROOT / "scripts/build-technical-traceability.py"), "--evidence-dir", str(fixture)],
            cwd=ROOT, capture_output=True, text=True,
        )
        if completed.returncode:
            raise AssertionError(f"Traceability CLI failed: {completed.stderr}")
        with (fixture / "case-traceability.csv").open() as stream:
            cls.rows = list(csv.DictReader(stream))
        cls.by_id = {row["case_id"]: row for row in cls.rows}
        cls.summary = json.loads((fixture / "traceability-summary.json").read_text())

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_system_pass_fail_and_blocked_keep_their_distinct_results(self):
        for case_id, expected in [("CP1-01", "PASS"), ("CP1-02", "FAIL"), ("CP1-03", "BLOCKED")]:
            with self.subTest(case_id=case_id):
                self.assertEqual(self.by_id[case_id]["status"], expected)
        self.assertEqual(self.by_id["CP1-03"]["blocker"], "Synthetic unavailable prerequisite")

    def test_mixed_statuses_preserve_failure_then_blocked_precedence(self):
        for case_id, expected in [("CB-R01", "PASS"), ("CB-R02", "FAIL"),
                                  ("CB-R03", "BLOCKED"), ("CB-R04", "FAIL"), ("CB-R05", "BLOCKED")]:
            with self.subTest(case_id=case_id):
                self.assertEqual(self.by_id[case_id]["status"], expected)

    def test_unmatched_cases_remain_blocked_and_summary_counts_match_matrix(self):
        self.assertEqual(self.by_id["CB-R06"]["status"], "BLOCKED")
        self.assertTrue(self.by_id["CB-R06"]["blocker"])
        with (ROOT / "docs/tif/v2.13/casos_prueba.csv").open(encoding="utf-8-sig") as stream:
            original = list(csv.DictReader(stream))
        self.assertEqual(len(self.rows), len(original))
        self.assertEqual(len(self.by_id), len(original))
        self.assertEqual(self.summary["original_cases"], len(original))
        self.assertEqual(self.summary["use_cases"], ["CU001", "CU002", "CU003", "CU004"])
        self.assertEqual(self.summary["counts"], {
            status: sum(row["status"] == status for row in self.rows)
            for status in ["PASS", "FAIL", "BLOCKED"]
        })
        self.assertEqual(sum(self.summary["counts"].values()), len(original))

    def test_native_layouts_reference_existing_evidence_without_promoting_complete_cases(self):
        for native_directory in ["native-full", "native"]:
            with self.subTest(native_directory=native_directory):
                fixture = Path(self.temp.name) / native_directory
                core = fixture / "core"
                core.mkdir(parents=True)
                (core / "final-vitest.json").write_text(json.dumps({"testResults": []}))
                for name in ["balance-sql.json", "shared-sql.json", "database-verification.json"]:
                    (core / name).write_text(json.dumps({"results": []}))
                native = fixture / native_directory
                native.mkdir()
                (native / "native-verification.json").write_text(json.dumps({
                    "status": "PASS", "scope": "Synthetic layout fixture only; no original acceptance"
                }))
                environment = fixture / "environment"
                environment.mkdir()
                (environment / "runtime-manifest.json").write_text(json.dumps({
                    "scope": "Synthetic local runtime layout fixture only"
                }))
                if native_directory == "native-full":
                    (environment / "at-rest.json").write_text(json.dumps({
                        "status": "PASS_LOCAL_VOLUME_ENCRYPTION_OBSERVED",
                        "scope": "Synthetic local encryption metadata; not complete original acceptance"
                    }))
                completed = subprocess.run(
                    [sys.executable, str(ROOT / "scripts/build-technical-traceability.py"),
                     "--evidence-dir", str(fixture)],
                    cwd=ROOT, capture_output=True, text=True,
                )
                self.assertEqual(completed.returncode, 0, completed.stderr)
                with (fixture / "case-traceability.csv").open() as stream:
                    rows = list(csv.DictReader(stream))
                by_id = {row["case_id"]: row for row in rows}
                self.assertTrue(all(row["status"] == "BLOCKED" for row in rows))
                for case_id in ["CP1-01", "CP2-01", "CP3-01", "CP4-01", "CNF-12"]:
                    row = by_id[case_id]
                    self.assertNotIn("EPERM", row["blocker"])
                    self.assertNotIn("socket creation denied", row["blocker"])
                    self.assertIn(f"{native_directory}/native-verification.json", row["evidence"])
                    self.assertIn("environment/runtime-manifest.json", row["evidence"])
                    self.assertNotIn("environment-and-blockers.json", row["evidence"])
                    for reference in row["evidence"].split("; "):
                        self.assertTrue((fixture / reference).is_file(), reference)
                self.assertIn("original timed snapshot fixture", by_id["CNF-12"]["blocker"])
                self.assertIn("post-restore browser journey", by_id["CNF-12"]["blocker"])
                self.assertEqual(by_id["CNF-04"]["status"], "BLOCKED")
                if native_directory == "native-full":
                    self.assertNotIn("No encryption-at-rest evidence", by_id["CNF-04"]["blocker"])
                    self.assertIn("FileVault", by_id["CNF-04"]["blocker"])
                    self.assertIn("CP2-19 API/JWT", by_id["CNF-04"]["blocker"])
                    self.assertIn("environment/at-rest.json", by_id["CNF-04"]["evidence"])
                else:
                    self.assertIn("No encryption-at-rest evidence", by_id["CNF-04"]["blocker"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
