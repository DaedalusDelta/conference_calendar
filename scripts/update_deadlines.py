from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

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

KEYWORDS = ("deadline", "submission", "paper", "demo", "abstract", "important dates")
SUBMISSION_HINTS = ("openreview", "cmt", "submission", "submit", "paperplaza", "easychair", "microsoft")
WORKSHOP_HINTS = ("workshop", "workshops")
EXTENSION_HINTS = ("extension", "extended", "deadline extended")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; conference-deadline-bot/2.0; +https://github.com/)"
}


def load_conferences() -> list[dict[str, str]]:
    return json.loads(CONF_FILE.read_text(encoding="utf-8"))


def normalize_date(raw: str) -> str | None:
    try:
        dt = date_parser.parse(raw, fuzzy=True)
        return dt.date().isoformat()
    except Exception:
        return None


def fetch_html(url: str) -> str | None:
    try:
        response = requests.get(url, timeout=20, headers=HEADERS)
        response.raise_for_status()
        return response.text
    except Exception:
        return None


def discover_priority_links(homepage_url: str, html: str, max_links: int = 12) -> list[dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    domain = urlparse(homepage_url).netloc
    links: list[dict[str, str]] = []
    seen: set[str] = set()

    for a in soup.find_all("a", href=True):
        href = a.get("href", "").strip()
        text = " ".join(a.get_text(" ", strip=True).split()).lower()
        if not href:
            continue

        full = urljoin(homepage_url, href)
        if full in seen:
            continue
        seen.add(full)

        lower_url = full.lower()
        combined = f"{text} {lower_url}"

        is_submission = any(h in combined for h in SUBMISSION_HINTS)
        is_workshop = any(h in combined for h in WORKSHOP_HINTS)

        if not is_submission and not is_workshop:
            continue

        # keep crawling scoped near the conference unless it is a known submission portal
        keep = (domain in urlparse(full).netloc) or any(h in lower_url for h in ("openreview", "cmt", "easychair", "paperplaza"))
        if not keep:
            continue

        page_type = "submission_portal" if is_submission else "workshop_page"
        links.append({"url": full, "page_type": page_type, "link_text": text or full})

    # prioritize submission portals first, then workshop pages
    links.sort(key=lambda x: 0 if x["page_type"] == "submission_portal" else 1)
    return links[:max_links]


def extract_deadlines(conference_name: str, source_url: str, page_type: str, html: str) -> list[dict[str, str | bool]]:
    soup = BeautifulSoup(html, "html.parser")
    chunks = [c.strip() for c in soup.stripped_strings if c.strip()]
    results: list[dict[str, str | bool]] = []
    seen: set[tuple[str, str, str, str]] = set()

    for chunk in chunks:
        lowered = chunk.lower()
        if not any(k in lowered for k in KEYWORDS):
            continue

        is_extension = any(h in lowered for h in EXTENSION_HINTS)
        if "demo" in lowered:
            deadline_type = "demo_submission"
        elif "abstract" in lowered:
            deadline_type = "abstract_submission"
        elif "paper" in lowered:
            deadline_type = "paper_submission"
        else:
            deadline_type = "submission"

        venue_type = "workshop" if ("workshop" in lowered or page_type == "workshop_page") else "conference"

        for date_match in DATE_REGEX.findall(chunk):
            normalized = normalize_date(date_match)
            if not normalized:
                continue

            key = (conference_name, deadline_type, normalized, source_url)
            if key in seen:
                continue
            seen.add(key)

            results.append(
                {
                    "conference": conference_name,
                    "venue_type": venue_type,
                    "deadline_type": deadline_type,
                    "date": normalized,
                    "is_extension": is_extension,
                    "source_page": page_type,
                    "source": source_url,
                    "snippet": chunk[:240],
                }
            )

    return results


def scrape_conference(conference: dict[str, str]) -> list[dict[str, str | bool]]:
    name = conference["name"]
    homepage = conference["url"]
    homepage_html = fetch_html(homepage)
    if not homepage_html:
        return [
            {
                "conference": name,
                "venue_type": "conference",
                "deadline_type": "unavailable",
                "date": "",
                "is_extension": False,
                "source_page": "homepage",
                "source": homepage,
                "snippet": "Failed to fetch conference homepage.",
            }
        ]

    pages = [{"url": homepage, "page_type": "homepage", "link_text": "homepage"}]
    pages.extend(discover_priority_links(homepage, homepage_html))

    all_results: list[dict[str, str | bool]] = []
    for page in pages:
        html = homepage_html if page["url"] == homepage else fetch_html(page["url"])
        if not html:
            continue
        all_results.extend(extract_deadlines(name, page["url"], page["page_type"], html))

    if not all_results:
        all_results.append(
            {
                "conference": name,
                "venue_type": "conference",
                "deadline_type": "unavailable",
                "date": "",
                "is_extension": False,
                "source_page": "homepage",
                "source": homepage,
                "snippet": "No explicit deadline strings detected automatically.",
            }
        )

    return all_results


def update_deadlines() -> dict:
    entries: list[dict[str, str | bool]] = []
    for conference in load_conferences():
        entries.extend(scrape_conference(conference))

    dated = sorted((item for item in entries if item.get("date")), key=lambda i: str(i["date"]))
    undated = [item for item in entries if not item.get("date")]

    payload = {
        "format_version": "2.0",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(entries),
        "items": dated + undated,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


if __name__ == "__main__":
    result = update_deadlines()
    print(f"Updated {result['count']} entries at {result['updated_at']}")
