from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "deadlines.json"


def clean_text(text: str) -> str:
    return re.sub(r"\[(https?://[^\]]+)\]\([^)]*\)", r"\1", text)


def canonicalize_title(conference: str, title: str) -> str:
    patterns = [
        rf"^{re.escape(conference)} \d{{4}} Conference$",
        rf"^{re.escape(conference)} \d{{4}} main conference paper submission$",
        rf"^{re.escape(conference)} \d{{4}} author registration deadline$",
        rf"^{re.escape(conference)} \d{{4}} workshop/tutorial proposal submission$",
        rf"^{re.escape(conference)} \d{{4}} Conference supplementary materials$",
        rf"^{re.escape(conference)} \d{{4}} Conference rebuttal$",
        rf"^{re.escape(conference)} \d{{4}} main conference$",
    ]
    for pattern in patterns:
        if re.match(pattern, title):
            return conference
    if title == f"{conference} Workshops":
        return title
    return title


def source_rank(item: dict) -> int:
    source_kind = item.get("source_kind", "")
    if source_kind == "website":
        return 3
    if source_kind == "submission_portal":
        return 2
    return 1


def richness_score(item: dict) -> tuple[int, int, int]:
    return (
        len(item.get("alternate_sources", [])),
        len(item.get("expectations_summary", [])),
        len(item.get("notes", "")),
    )


def choose_better(existing: dict, incoming: dict) -> dict:
    if source_rank(incoming) != source_rank(existing):
        return incoming if source_rank(incoming) > source_rank(existing) else existing
    return incoming if richness_score(incoming) > richness_score(existing) else existing


def normalize_item(item: dict) -> dict:
    conference = str(item.get("conference", "")).strip()
    title = canonicalize_title(conference, str(item.get("title", "")).strip() or conference)
    return {
        "conference": conference,
        "title": title,
        "type": str(item.get("type", "")).strip() or "unavailable",
        "date": str(item.get("date", "")).strip(),
        "is_extension": bool(item.get("is_extension", False)),
        "source": str(item.get("source", "")).strip(),
        "source_kind": str(item.get("source_kind", "")).strip() or "website",
        "alternate_sources": [
            {
                "url": str(source.get("url", "")).strip(),
                "kind": str(source.get("kind", "")).strip() or "miscellaneous",
                "note": str(source.get("note", "")).strip(),
            }
            for source in item.get("alternate_sources", [])
            if isinstance(source, dict) and str(source.get("url", "")).strip()
        ],
        "expectations_summary": [
            str(entry).strip()
            for entry in item.get("expectations_summary", [])
            if str(entry).strip()
        ],
        "raw": str(item.get("raw", "")).strip(),
        "notes": str(item.get("notes", "")).strip(),
        "conflict_note": str(item.get("conflict_note", "")).strip(),
        "change_status": str(item.get("change_status", "")).strip() or "new",
        "change_summary": str(item.get("change_summary", "")).strip() or "New deadline entry from a manual web research pass.",
        "previous_date": str(item.get("previous_date", "")).strip(),
    }


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/merge_manual_response.py <response_file>")
        return 1

    response_path = Path(sys.argv[1]).resolve()
    payload = json.loads(clean_text(response_path.read_text(encoding="utf-8")))
    incoming_items = payload.get("items", [])
    if not isinstance(incoming_items, list):
        raise RuntimeError("Response file does not contain an items list.")

    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    merged: dict[tuple[str, str, str, str], dict] = {}
    for item in data.get("items", []):
        normalized = normalize_item(item)
        key = (
            normalized["conference"],
            normalized["title"],
            normalized["type"],
            normalized["date"],
        )
        merged[key] = normalized

    for item in incoming_items:
        if not isinstance(item, dict):
            continue
        normalized = normalize_item(item)
        key = (
            normalized["conference"],
            normalized["title"],
            normalized["type"],
            normalized["date"],
        )
        existing = merged.get(key)
        merged[key] = normalized if existing is None else choose_better(existing, normalized)

    data["items"] = sorted(
        merged.values(),
        key=lambda item: (
            item.get("conference", ""),
            item.get("title", ""),
            item.get("date", "") == "",
            item.get("date", ""),
            item.get("type", ""),
        ),
    )
    data["count"] = len(data["items"])
    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Merged {len(incoming_items)} incoming items into {DATA_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
