"""Prepare a reviewed, licensed local dataset. This command never calls a hosted API."""

import argparse
import hashlib
import json
from pathlib import Path


def prepare(source: Path, destination: Path) -> dict:
    if destination.exists():
        raise ValueError("Use a new dataset version directory.")
    records = []
    seen = set()
    rejected = 0
    for line in source.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        eligible = (
            item.get("reviewed") is True
            and item.get("training_rights") == "approved"
            and item.get("teacher") in {"human", "local", "licensed-external"}
            and item.get("context_origin") in {"synthetic", "curated-public"}
            and isinstance(item.get("license_source"), str)
            and bool(item["license_source"].strip())
            and type(item.get("quality")) in {float, int}
            and item["quality"] >= 0.8
            and isinstance(item.get("prompt"), str)
            and isinstance(item.get("response"), str)
            and bool(item["prompt"].strip())
            and bool(item["response"].strip())
        )
        if not eligible:
            rejected += 1
            continue
        identity = hashlib.sha256(
            (item["prompt"].strip() + "\0" + item["response"].strip()).encode()
        ).hexdigest()
        if identity in seen:
            rejected += 1
            continue
        seen.add(identity)
        prompt_hash = hashlib.sha256(item["prompt"].strip().encode()).hexdigest()
        records.append({
            "id": identity,
            "split": "evaluation" if int(prompt_hash[:8], 16) % 10 == 0 else "train",
            "messages": [
                {"role": "user", "content": item["prompt"].strip()},
                {"role": "assistant", "content": item["response"].strip()},
            ],
            "provenance": {key: item[key] for key in (
                "teacher", "context_origin", "training_rights", "license_source", "quality"
            )},
        })
    if not records:
        raise ValueError("No records passed the review and rights gates.")
    destination.mkdir(parents=True)
    for split in ("train", "evaluation"):
        rows = [record for record in records if record["split"] == split]
        content = "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows)
        (destination / f"{split}.jsonl").write_text(content, encoding="utf-8")
    manifest = {
        "schema_version": 1,
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "accepted": len(records),
        "rejected_or_duplicate": rejected,
        "train": sum(row["split"] == "train" for row in records),
        "evaluation": sum(row["split"] == "evaluation" for row in records),
        "hosted_teacher_generation": "disabled",
    }
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    print(json.dumps(prepare(args.source, args.destination), indent=2))
