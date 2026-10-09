"""Exercise the dataset's provenance, rights, and version gates offline."""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("prepare_dataset", Path(__file__).with_name("prepare-dataset.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
prepare = module.prepare


class DatasetTests(unittest.TestCase):
    def test_review_and_rights_gates_deduplicate_and_preserve_versions(self):
        valid = {
            "prompt": "A synthetic screen is idle.", "response": "Remain silent.",
            "reviewed": True, "training_rights": "approved", "teacher": "human",
            "context_origin": "synthetic", "license_source": "MIT original example",
            "quality": 0.9,
        }
        variants = [
            valid, valid,
            {**valid, "teacher": "kimi"},
            {**valid, "teacher": "gemini"},
            {**valid, "context_origin": "private"},
            {**valid, "training_rights": "unreviewed"},
            {**valid, "reviewed": False},
            {**valid, "quality": True},
        ]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "reviewed.jsonl"
            source.write_text("".join(json.dumps(row) + "\n" for row in variants), encoding="utf-8")
            destination = root / "v001"
            manifest = prepare(source, destination)
            self.assertEqual(manifest["accepted"], 1)
            self.assertEqual(manifest["rejected_or_duplicate"], 7)
            self.assertEqual(manifest["hosted_teacher_generation"], "disabled")
            with self.assertRaisesRegex(ValueError, "new dataset version"):
                prepare(source, destination)

    def test_empty_approved_dataset_does_not_create_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "unreviewed.jsonl"
            source.write_text('{"teacher":"gemini"}\n', encoding="utf-8")
            destination = root / "v001"
            with self.assertRaisesRegex(ValueError, "No records passed"):
                prepare(source, destination)
            self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
