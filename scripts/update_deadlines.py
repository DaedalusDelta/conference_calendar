from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from openai import OpenAI

ROOT = Path(__file__).resolve().parents[1]
CONF_FILE = ROOT / "conferences.json"
DATA_DIR = ROOT / "data"
CACHE_FILE = DATA_DIR / "deadlines.json"
DEFAULT_EDITION_YEAR = datetime.now(timezone.utc).year
DEFAULT_OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5")

OUTPUT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "conference": {"type": "string"},
                    "title": {"type": "string"},
                    "type": {"type": "string"},
                    "date": {
                        "type": "string",
                        "description": "Deadline date in ISO format YYYY-MM-DD, or empty string if unavailable.",
                    },
                    "is_extension": {"type": "boolean"},
                    "source": {"type": "string"},
                    "source_kind": {"type": "string"},
                    "alternate_sources": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "url": {"type": "string"},
                                "kind": {"type": "string"},
                                "note": {"type": "string"},
                            },
                            "required": ["url", "kind", "note"],
                        },
                    },
                    "expectations_summary": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "raw": {"type": "string"},
                    "notes": {"type": "string"},
                    "conflict_note": {"type": "string"},
                },
                "required": [
                    "conference",
                    "title",
                    "type",
                    "date",
                    "is_extension",
                    "source",
                    "source_kind",
                    "alternate_sources",
                    "expectations_summary",
                    "raw",
                    "notes",
                    "conflict_note",
                ],
            },
        }
    },
    "required": ["items"],
}

RESOLUTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "edition_url": {"type": "string"},
        "resolved_year": {"type": "integer"},
        "used_fallback_year": {"type": "boolean"},
        "workshop_index_urls": {
            "type": "array",
            "items": {"type": "string"},
        },
        "notes": {"type": "string"},
    },
    "required": [
        "edition_url",
        "resolved_year",
        "used_fallback_year",
        "workshop_index_urls",
        "notes",
    ],
}


def load_conferences() -> list[dict]:
    return json.loads(CONF_FILE.read_text(encoding="utf-8"))


def load_previous_payload() -> dict:
    if not CACHE_FILE.exists():
        return {}

    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def resolve_target_year(conference: dict) -> int:
    raw_year = conference.get("year")
    if isinstance(raw_year, int):
        return raw_year
    if isinstance(raw_year, str) and raw_year.isdigit():
        return int(raw_year)
    return DEFAULT_EDITION_YEAR


def get_openai_client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Export it in your shell before running the updater."
        )
    return OpenAI(api_key=api_key)


def run_openai_structured(
    prompt: str,
    schema: dict,
    error_prefix: str,
    schema_name: str,
) -> dict:
    client = get_openai_client()

    try:
        response = client.responses.create(
            model=DEFAULT_OPENAI_MODEL,
            tools=[{"type": "web_search_preview"}],
            input=prompt,
            text={
                "format": {
                    "type": "json_schema",
                    "name": schema_name,
                    "schema": schema,
                    "strict": True,
                }
            },
        )
    except Exception as exc:
        raise RuntimeError(f"{error_prefix}: {exc}") from exc

    output_text = getattr(response, "output_text", "") or ""
    if not output_text:
        raise RuntimeError(f"{error_prefix}: OpenAI returned no structured output.")

    try:
        return json.loads(output_text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{error_prefix}: OpenAI output was not valid JSON: {exc}") from exc


def build_resolution_prompt(conference: dict) -> str:
    conference_name = conference["name"]
    target_year = resolve_target_year(conference)
    fallback_year = target_year - 1
    series_url = conference.get("series_url") or conference.get("edition_url") or conference.get("url") or ""
    configured_edition_url = conference.get("edition_url") or conference.get("url") or ""
    configured_discovery_urls = conference.get("discovery_urls", [])
    discovery_lines = ""
    if isinstance(configured_discovery_urls, list) and configured_discovery_urls:
        urls = "\n".join(
            f"- {url}" for url in configured_discovery_urls if isinstance(url, str) and url.strip()
        )
        if urls:
            discovery_lines = f"""

Configured workshop discovery URLs:
{urls}
"""

    return f"""
You are resolving the current official conference edition URL and workshop index URLs.

Conference:
- Name: {conference_name}
- Target year: {target_year}
- Fallback year: {fallback_year}
- Series URL: {series_url}
- Configured edition URL: {configured_edition_url}
{discovery_lines}

Tasks:
1. Find the official edition URL for the target year.
2. If the target-year edition site is unavailable, incomplete, or clearly not live, fall back to the immediately previous year only.
3. Find official workshop index URLs for the resolved edition year when they exist. Prefer official workshop listing pages, official program pages, or official submission portal workshop index pages.
4. Keep configured workshop discovery URLs if they match the resolved year or remain clearly useful.

Rules:
- Prefer official conference domains and official submission portals.
- Do not return aggregator or event-listing sites as the edition URL.
- Only use the fallback year if the target-year edition cannot be established reliably.
- If you use fallback, say so clearly in notes.
- Return JSON only matching the schema.

Examples of acceptable workshop index URLs:
- OpenReview workshop group page for the resolved edition year
- official conference workshops landing page
- official workshop program page
""".strip()


def resolve_conference_context(conference: dict) -> dict:
    prompt = build_resolution_prompt(conference)
    result = run_openai_structured(
        prompt,
        RESOLUTION_SCHEMA,
        "OpenAI edition resolution failed",
        "conference_resolution",
    )

    resolved = dict(conference)
    resolved["edition_url"] = str(result.get("edition_url", "")).strip() or (
        conference.get("edition_url") or conference.get("url") or conference.get("series_url") or ""
    )
    resolved["year"] = int(result.get("resolved_year", resolve_target_year(conference)))
    configured = conference.get("discovery_urls", [])
    configured_urls = [
        url.strip() for url in configured if isinstance(url, str) and url.strip()
    ] if isinstance(configured, list) else []
    discovered_urls = [
        url.strip()
        for url in result.get("workshop_index_urls", [])
        if isinstance(url, str) and url.strip()
    ]
    merged_urls: list[str] = []
    for url in configured_urls + discovered_urls:
        if url not in merged_urls:
            merged_urls.append(url)
    resolved["discovery_urls"] = merged_urls
    resolved["resolution_notes"] = str(result.get("notes", "")).strip()
    resolved["used_fallback_year"] = bool(result.get("used_fallback_year", False))
    return resolved


def build_prompt(conference: dict) -> str:
    conference_name = conference["name"]
    edition_url = conference.get("edition_url") or conference.get("url") or ""
    series_url = conference.get("series_url") or edition_url
    target_year = resolve_target_year(conference)
    fallback_year = target_year - 1
    resolution_notes = conference.get("resolution_notes", "")
    discovery_urls = conference.get("discovery_urls", [])
    discovery_lines = ""
    resolution_lines = ""
    if isinstance(discovery_urls, list) and discovery_urls:
        urls = "\n".join(f"- {url}" for url in discovery_urls if isinstance(url, str) and url.strip())
        if urls:
            discovery_lines = f"""

High-priority discovery URLs:
{urls}
"""
    if isinstance(resolution_notes, str) and resolution_notes.strip():
        resolution_lines = f"""

Edition resolution notes:
- {resolution_notes.strip()}
"""
    return f"""
You are updating a conference deadlines dataset.

Your job is to retrieve authoritative deadline information for exactly one conference and its individual workshops, then return structured JSON.

Target conference:
- Name: {conference_name}
- Target year: {target_year}
- Edition URL: {edition_url}
- Series URL: {series_url}
{discovery_lines}
{resolution_lines}

High-level goal:
- Inspect the official conference website for the target year and the submission portal if one exists.
- Discover whether this conference has individual workshops with their own pages and deadlines.
- Extract submission-related deadlines for the conference itself and for those workshops.
- Distinguish normal deadlines from extensions.
- Preserve evidence and ambiguity notes.
- Prefer completeness, but do not invent missing dates.

Edition targeting rules:
- Prefer deadlines for the target year only.
- Use the Edition URL as the primary source for the current edition.
- Use the Series URL to recover if the edition site redirects, is outdated, or links to the active edition site.
- Do not accidentally report deadlines from an older or newer edition. If you encounter conflicting years, prefer the target year and mention the mismatch in notes.
- If you cannot find a working or authoritative page for the target year, you may fall back to the immediately previous year ({fallback_year}) as a last resort.
- If you use the fallback year, you must state clearly in notes that the deadline came from the previous edition because the target-year page was unavailable or incomplete.
- Never silently mix target-year and fallback-year deadlines in the same item.

Required workshop discovery procedure:
1. Start at the Edition URL.
2. If High-priority discovery URLs are provided above, inspect all of them before concluding workshop discovery is complete.
3. Find the workshops landing page, workshop program page, or call-for-workshops page if it exists.
4. From there, inspect individual workshop pages when they appear to have separate submission calls or deadlines.
5. If the conference has no workshops page or no workshop-specific deadlines, say so in the notes of the relevant unavailable item.
6. Do not skip workshop discovery. It is part of the task even if conference-level deadlines are already found.

Coverage requirement:
- When a discovery URL is a workshop index page, enumerate the workshop entries listed there and inspect as many of those workshop pages or linked submission pages as needed to capture their individual deadlines.
- Do not stop after finding only a few workshops if the index clearly lists many more.
- If a workshop is listed on the index but no deadline is visible on its page, you may omit that workshop unless you can support an unavailable item with an authoritative workshop-specific source.

Research procedure:
1. Start at the Edition URL provided above.
2. Look for pages such as Call for Papers, Authors, Important Dates, Submission, Workshop Call, or similar.
3. If the conference site lists individual workshops, inspect workshop-specific pages and collect workshop-specific deadlines as separate items.
4. Find and inspect the submission portal if it exists or is linked from the official site. Common examples include OpenReview, CMT, Microsoft CMT, PaperPlaza, HotCRP, or a dedicated submission page.
5. Cross-check dates between the official site and the submission portal.
6. Resolve conflicts with this strict priority order:
   - official conference or workshop website
   - official submission portal linked from the official site
   - miscellaneous sources
7. If multiple sources disagree, keep the date from the highest-priority source and explain the disagreement in conflict_note.

What to extract:
- paper deadlines
- abstract deadlines
- demo deadlines
- workshop deadlines, including specific named workshop deadlines under a conference when they have their own pages
- rebuttal deadlines
- supplementary deadlines
- registration deadlines only when clearly tied to the conference/workshop timeline and stated on an official page

Submission expectation summary:
- For each item, also summarize what the page expects from submitters when that information is available.
- This may include abstract required, paper format, page limit, supplementary material, anonymization, template requirements, or submission system requirements.
- Store this as `expectations_summary`, a list of short bullet-style strings.
- If nothing useful is stated, use an empty list.

What not to extract:
- camera-ready deadlines unless they are the only substantive author-facing deadline and clearly important
- visa deadlines
- hotel deadlines
- sponsorship deadlines
- general event dates unless they are explicitly a submission-related deadline

Rules for extensions:
- Set is_extension=true when the source explicitly says a deadline was extended or when a newer date clearly replaces an earlier deadline.
- If both the original and extended dates are visible, prefer the currently effective deadline as the main item and explain the extension in notes.
- If the page only says "extended" without clearly restating the final date, do not guess. Use type="unavailable" if necessary and explain why.

Normalization rules:
- Return JSON only matching the provided schema.
- Do not include markdown fences or explanatory prose outside the JSON.
- conference must exactly match one of the provided names.
- title should name the specific event this deadline belongs to. Use the conference name for conference-level items. Use the specific workshop name for workshop-level items.
- date must be YYYY-MM-DD or "".
- type must be a short lowercase label such as paper, abstract, demo, workshop, rebuttal, supplementary, registration, or unavailable.
- source must be the URL of the page that most directly supports the item.
- source_kind must be exactly "website", "submission_portal", or "miscellaneous".
- alternate_sources must list any other relevant pages consulted for this item, especially conflicting sources. Each entry must contain:
  - url: the page URL
  - kind: one of "website", "submission_portal", or "miscellaneous"
  - note: short explanation such as "older date", "portal still lists previous deadline", or "workshop page confirmed extension"
- If there were no other relevant pages for the item, use an empty list.
- expectations_summary must be an array of short strings. Prefer 2-6 items when useful.
- raw should briefly quote or paraphrase the relevant evidence text, ideally one short sentence or fragment.
- notes should capture ambiguity, timezone details, whether the portal disagreed with the site, or why an item was marked as an extension or unavailable.
- conflict_note should be empty when there is no conflict. When sources disagree, summarize the disagreement and indicate which source won by priority.

Completeness rules:
- Emit one item per distinct deadline you can support with evidence.
- If a conference has multiple deadline types, emit multiple items.
- If individual workshops have separate published deadlines, emit separate items for them with distinct titles.
- If you find workshop deadlines but not a conference-level deadline, still emit the workshop items and optionally a conference-level unavailable item if that is useful.
- Only emit a single unavailable item for the conference when no reliable conference-level or workshop-level deadline could be found anywhere official.
- Never omit the target conference entirely.

Source priority:
- Highest priority: official conference/workshop page with Important Dates / CFP / Submission instructions
- Next: official submission portal linked from the official site
- Lower priority: other official subpages under the same conference domain
- Lowest priority: miscellaneous sources
- Avoid non-official aggregators unless they are only used to locate the official source

Examples of good output items:
{{
  "conference": "ICRA",
  "title": "ICRA",
  "type": "paper",
  "date": "2026-09-15",
  "is_extension": false,
  "source": "https://2026.ieee-icra.org/call-for-papers/",
  "source_kind": "website",
  "alternate_sources": [],
  "expectations_summary": [
    "Full paper submission required.",
    "Use the official conference template.",
    "Supplementary material is allowed."
  ],
  "raw": "Full paper submission deadline: September 15, 2026.",
  "notes": "Date listed on the official call for papers page.",
  "conflict_note": ""
}}

{{
  "conference": "CoRL",
  "title": "CoRL",
  "type": "paper",
  "date": "2026-06-30",
  "is_extension": true,
  "source": "https://openreview.net/group?id=CoRL.cc/2026/Conference",
  "source_kind": "submission_portal",
  "alternate_sources": [
    {{
      "url": "https://www.corl.org/",
      "kind": "website",
      "note": "Main site still shows the earlier June 23, 2026 deadline."
    }}
  ],
  "expectations_summary": [
    "Submission is handled through OpenReview.",
    "Anonymous paper submission is required."
  ],
  "raw": "Submission deadline extended to June 30, 2026.",
  "notes": "Marked as extension because the portal states this supersedes the earlier deadline.",
  "conflict_note": "Official site showed June 23, 2026, but the linked submission portal states the deadline was extended to June 30, 2026."
}}

Example workshop item:
{{
  "conference": "RSS",
  "title": "Workshop on Safe Robot Learning",
  "type": "workshop",
  "date": "2026-03-14",
  "is_extension": false,
  "source": "https://roboticsconference.org/workshops/safe-robot-learning",
  "source_kind": "website",
  "alternate_sources": [
    {{
      "url": "https://openreview.net/group?id=RSS.cc/2026/Workshop/SafeRobotLearning",
      "kind": "submission_portal",
      "note": "Submission portal matched the same deadline."
    }}
  ],
  "expectations_summary": [
    "Workshop paper submission is required.",
    "Authors should follow the workshop formatting instructions."
  ],
  "raw": "Workshop paper submission deadline: March 14, 2026.",
  "notes": "Workshop-specific call linked from the main conference workshops page.",
  "conflict_note": ""
}}

Example unavailable item:
{{
  "conference": "RSS",
  "title": "RSS",
  "type": "unavailable",
  "date": "",
  "is_extension": false,
  "source": "https://roboticsconference.org/",
  "source_kind": "website",
  "alternate_sources": [],
  "expectations_summary": [],
  "raw": "Checked the official site and did not find a current important dates or submission page with deadlines.",
  "notes": "No authoritative submission deadline was visible.",
  "conflict_note": ""
}}
""".strip()


def run_openai_agent(conference: dict[str, str]) -> dict:
    prompt = build_prompt(conference)
    return run_openai_structured(
        prompt,
        OUTPUT_SCHEMA,
        "OpenAI deadline retrieval failed",
        "conference_deadlines",
    )


def normalize_items(payload: dict, conferences: list[dict[str, str]]) -> list[dict[str, str | bool]]:
    valid_names = {conference["name"] for conference in conferences}
    items = payload.get("items")
    if not isinstance(items, list):
        raise RuntimeError("OpenAI output did not contain an items list.")

    normalized: list[dict[str, str | bool]] = []
    for item in items:
        if not isinstance(item, dict):
            continue

        conference = str(item.get("conference", "")).strip()
        if conference not in valid_names:
            continue

        normalized.append(
            {
                "conference": conference,
                "title": str(item.get("title", "")).strip() or conference,
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
                ] if isinstance(item.get("expectations_summary", []), list) else [],
                "raw": str(item.get("raw", "")).strip(),
                "notes": str(item.get("notes", "")).strip(),
                "conflict_note": str(item.get("conflict_note", "")).strip(),
            }
        )

    if not normalized:
        raise RuntimeError("OpenAI returned no usable deadline items.")

    deduped: dict[tuple[str, str, str, str], dict[str, str | bool]] = {}
    for item in normalized:
        key = (
            str(item["conference"]),
            str(item["title"]),
            str(item["type"]),
            str(item["date"]),
        )
        existing = deduped.get(key)
        if existing is None or (
            existing.get("source_kind") != "website" and item.get("source_kind") == "website"
        ):
            deduped[key] = item

    return sorted(
        deduped.values(),
        key=lambda item: (
            item["conference"],
            item["title"],
            item["date"] == "",
            item["date"],
            item["type"],
        ),
    )


def annotate_changes(items: list[dict[str, str | bool]], previous_payload: dict) -> tuple[list[dict[str, str | bool]], dict[str, int]]:
    previous_items = previous_payload.get("items")
    if not isinstance(previous_items, list):
        previous_items = []

    previous_index: dict[tuple[str, str, str], dict] = {}
    for item in previous_items:
        if not isinstance(item, dict):
            continue
        key = (
            str(item.get("conference", "")).strip(),
            str(item.get("title", "")).strip() or str(item.get("conference", "")).strip(),
            str(item.get("type", "")).strip(),
        )
        previous_index[key] = item

    summary = {
        "new": 0,
        "updated": 0,
        "extended": 0,
        "unchanged": 0,
    }

    annotated: list[dict[str, str | bool]] = []
    for item in items:
        key = (
            str(item["conference"]),
            str(item["title"]),
            str(item["type"]),
        )
        previous = previous_index.get(key)
        current = dict(item)

        if previous is None:
            current["change_status"] = "new"
            current["change_summary"] = "New deadline entry in the latest refresh."
            current["previous_date"] = ""
            summary["new"] += 1
        else:
            previous_date = str(previous.get("date", "")).strip()
            previous_extension = bool(previous.get("is_extension", False))
            fields_changed = []

            for field in ("date", "source", "source_kind", "conflict_note"):
                if str(previous.get(field, "")).strip() != str(current.get(field, "")).strip():
                    fields_changed.append(field)

            if not previous_extension and bool(current.get("is_extension", False)):
                current["change_status"] = "extended"
                current["change_summary"] = (
                    f"Marked as extended. Previous date was {previous_date or 'unavailable'}."
                )
                summary["extended"] += 1
            elif fields_changed or previous_extension != bool(current.get("is_extension", False)):
                current["change_status"] = "updated"
                if "date" in fields_changed and previous_date:
                    current["change_summary"] = f"Date changed from {previous_date} to {current.get('date', '')}."
                elif fields_changed:
                    current["change_summary"] = "Source or conflict details changed in the latest refresh."
                else:
                    current["change_summary"] = "Deadline metadata changed in the latest refresh."
                summary["updated"] += 1
            else:
                current["change_status"] = "unchanged"
                current["change_summary"] = ""
                summary["unchanged"] += 1

            current["previous_date"] = previous_date

        annotated.append(current)

    return annotated, summary


def log_progress(message: str) -> None:
    print(message, flush=True)


def update_deadlines() -> dict:
    conferences = load_conferences()
    previous_payload = load_previous_payload()
    aggregated_items: list[dict] = []
    total = len(conferences)
    log_progress(f"Starting deadline refresh for {total} conferences...")

    for index, conference in enumerate(conferences, start=1):
        conference_name = conference.get("name", "Unknown")
        log_progress(f"[{index}/{total}] Resolving edition and workshop sources for {conference_name}...")
        resolved_conference = resolve_conference_context(conference)
        resolved_year = resolved_conference.get("year", resolve_target_year(conference))
        fallback_note = " (fallback year)" if resolved_conference.get("used_fallback_year") else ""
        log_progress(
            f"[{index}/{total}] Fetching deadlines for {conference_name} {resolved_year}{fallback_note}..."
        )
        agent_payload = run_openai_agent(resolved_conference)
        conference_items = agent_payload.get("items")
        if isinstance(conference_items, list):
            aggregated_items.extend(conference_items)
            log_progress(
                f"[{index}/{total}] Collected {len(conference_items)} item"
                f"{'' if len(conference_items) == 1 else 's'} for {conference_name}."
            )
        else:
            log_progress(f"[{index}/{total}] No items returned for {conference_name}.")

    log_progress("Normalizing and annotating refreshed entries...")
    items = normalize_items({"items": aggregated_items}, conferences)
    items, change_summary = annotate_changes(items, previous_payload)

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(items),
        "change_summary": change_summary,
        "items": items,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    log_progress(
        "Refresh summary: "
        f"{change_summary['extended']} extended, "
        f"{change_summary['updated']} updated, "
        f"{change_summary['new']} new, "
        f"{change_summary['unchanged']} unchanged."
    )
    return payload


if __name__ == "__main__":
    result = update_deadlines()
    print(f"Updated {result['count']} entries at {result['updated_at']}")
