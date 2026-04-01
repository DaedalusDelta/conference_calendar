from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from dateutil import parser as date_parser

ROOT = Path(__file__).resolve().parents[1]
CONF_FILE = ROOT / "conferences.json"
DATA_DIR = ROOT / "data"
CACHE_FILE = DATA_DIR / "deadlines.json"

DATE_REGEX = re.compile(
    r"\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"\s+\d{1,2}(?:,\s*\d{4})?\b",
    re.IGNORECASE,
)

KEYWORDS = ("deadline", "submission", "paper", "demo", "abstract")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; conference-deadline-bot/1.0; +https://github.com/)"
}


def load_conferences() -> list[dict[str, str]]:
    return json.loads(CONF_FILE.read_text(encoding="utf-8"))


def normalize_date(raw: str) -> str | None:
    try:
        dt = date_parser.parse(raw, fuzzy=True)
        return dt.date().isoformat()
    except Exception:
        return None


def scrape_conference(conference: dict[str, str]) -> list[dict[str, str]]:
    name = conference["name"]
    url = conference["url"]
    try:
        response = requests.get(url, timeout=20, headers=HEADERS)
        response.raise_for_status()
    except Exception as exc:
        return [{"conference": name, "type": "unavailable", "date": "", "source": url, "note": str(exc)}]

    soup = BeautifulSoup(response.text, "html.parser")
    chunks = [c.strip() for c in soup.stripped_strings if c.strip()]

    matches: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()

    for chunk in chunks:
        lowered = chunk.lower()
        if not any(k in lowered for k in KEYWORDS):
            continue

        for date_match in DATE_REGEX.findall(chunk):
            normalized = normalize_date(date_match)
            if not normalized:
                continue

            dtype = "demo" if "demo" in lowered else "paper" if "paper" in lowered else "submission"
            key = (name, dtype, normalized)
            if key in seen:
                continue
            seen.add(key)

            matches.append(
                {
                    "conference": name,
                    "type": dtype,
                    "date": normalized,
                    "raw": chunk[:220],
                    "source": url,
                }
            )

    if not matches:
        matches.append(
            {
                "conference": name,
                "type": "unavailable",
                "date": "",
                "raw": "No explicit deadline strings detected automatically.",
                "source": url,
            }
        )

    return matches


def update_deadlines() -> dict:
    all_items: list[dict[str, str]] = []
    for conference in load_conferences():
        all_items.extend(scrape_conference(conference))

    dated = sorted((item for item in all_items if item.get("date")), key=lambda i: i["date"])
    undated = [item for item in all_items if not item.get("date")]

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(all_items),
        "items": dated + undated,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


if __name__ == "__main__":
    result = update_deadlines()
    print(f"Updated {result['count']} entries at {result['updated_at']}")
