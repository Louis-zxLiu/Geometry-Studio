from __future__ import annotations

import csv
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPO_ROOT / "tools" / "geobuildbench_geometry_studio_eval.py"


def load_eval_module():
    spec = importlib.util.spec_from_file_location("geobuildbench_geometry_studio_eval", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load geobuildbench eval module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class GeoBuildBenchEvalPrivacyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = load_eval_module()

    def test_redacts_sensitive_text_in_tables_and_csv(self):
        secret = "sk-1234567890abcdef"
        table = self.module.markdown_table(["Error"], [[f"apiKey: {secret}"]])
        self.assertNotIn(secret, table)
        self.assertIn("sk-***redacted***", table)

        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir)
            self.module.write_csv(
                output_dir,
                [
                    {
                        "problem_id": "1",
                        "difficulty": "easy",
                        "category": "triangle",
                        "agent_status": "failed",
                        "validation_result": {},
                        "error_text": f"Bearer abcdefghijklmnop and {secret}",
                    }
                ],
            )
            with (output_dir / "per_problem.csv").open(encoding="utf-8-sig", newline="") as handle:
                row = next(csv.DictReader(handle))

        self.assertNotIn(secret, row["error_text"])
        self.assertNotIn("abcdefghijklmnop", row["error_text"])
        self.assertIn("***redacted***", row["error_text"])


if __name__ == "__main__":
    unittest.main()
