# Web Deadline Research Prompt

Use this in the ChatGPT web UI with web browsing enabled.

## Generic Prompt

```text
You are updating a conference deadlines dataset.

Your job is to retrieve authoritative deadline information for exactly one conference and its individual workshops, then return structured JSON only.

Target conference:
- Name: [CONFERENCE_NAME]
- Target year: [TARGET_YEAR]
- Edition URL: [EDITION_URL]
- Series URL: [SERIES_URL]

High-priority discovery URLs:
[PASTE_DISCOVERY_URLS_AS_BULLETS]

Goal:
- Inspect the official conference website for the target year and the submission portal if one exists.
- Inspect workshop index pages and individual workshop pages thoroughly.
- Extract submission-related deadlines for the conference itself and for workshops.
- Distinguish normal deadlines from extensions.
- Prefer completeness. Missing workshops can cause users to miss submission opportunities.

Rules:
- Prefer the target year only.
- If the target-year site is unavailable, you may fall back to the previous year only if necessary, and you must say so in notes.
- Use this source priority:
  1. official conference/workshop website
  2. official submission portal linked from the official site
  3. miscellaneous sources
- If sources disagree, keep the highest-priority date and explain the conflict in `conflict_note`.
- If a workshop index page lists many workshops, enumerate the listed workshops explicitly and inspect them one by one.
- Do not stop after finding only a few workshops.
- If a workshop page exists but no deadline is visible, emit an `unavailable` item for that workshop if you have an authoritative URL.
- Never omit the target conference entirely.

What to extract:
- paper
- abstract
- demo
- workshop
- rebuttal
- supplementary
- registration only if clearly tied to submission/author timeline
- use `unavailable` if no reliable deadline is published

For each item also provide:
- `expectations_summary`: short bullet-style strings summarizing what submitters are expected to provide
- `raw`: short evidence quote/paraphrase
- `notes`
- `conflict_note`
- `source`
- `source_kind`
- `alternate_sources`

Return JSON only in this exact shape:

{
  "items": [
    {
      "conference": "[CONFERENCE_NAME]",
      "title": "specific conference or workshop title",
      "type": "paper|abstract|demo|workshop|rebuttal|supplementary|registration|unavailable",
      "date": "YYYY-MM-DD or empty string",
      "is_extension": true,
      "source": "https://...",
      "source_kind": "website|submission_portal|miscellaneous",
      "alternate_sources": [
        {
          "url": "https://...",
          "kind": "website|submission_portal|miscellaneous",
          "note": "short note"
        }
      ],
      "expectations_summary": [
        "short bullet",
        "short bullet"
      ],
      "raw": "short evidence text",
      "notes": "short explanation",
      "conflict_note": "empty string if none"
    }
  ]
}
```

## Ready-To-Use Conference Blocks

### IROS

```text
Target conference:
- Name: IROS
- Target year: 2026
- Edition URL: https://www.ieee-iros.org/
- Series URL: https://www.ieee-iros.org/

High-priority discovery URLs:
- https://openreview.net/group?id=IEEE.org/IROS/2026/Workshop
```

### ICRA

```text
Target conference:
- Name: ICRA
- Target year: 2026
- Edition URL: https://2026.ieee-icra.org/
- Series URL: https://www.ieee-icra.org/

High-priority discovery URLs:
- https://openreview.net/group?id=IEEE.org/ICRA/2026/Workshop
- https://openreview.net/venue?id=IEEE.org
```

### CoRL

```text
Target conference:
- Name: CoRL
- Target year: 2026
- Edition URL: https://www.corl.org/
- Series URL: https://www.corl.org/

High-priority discovery URLs:
- https://openreview.net/group?id=robot-learning.org/CoRL/2025/Workshop
- https://openreview.net/venue?id=robot-learning.org/CoRL
```

### RSS

```text
Target conference:
- Name: RSS
- Target year: 2026
- Edition URL: https://roboticsconference.org/
- Series URL: https://roboticsconference.org/

High-priority discovery URLs:
- https://openreview.net/group?id=roboticsfoundation.org/RSS/2026/Workshop
- https://openreview.net/venue?id=roboticsfoundation.org/RSS
```

### Humanoids

```text
Target conference:
- Name: Humanoids
- Target year: 2026
- Edition URL: https://humanoids.global/
- Series URL: https://humanoids.global/

High-priority discovery URLs:
- https://openreview.net/group?id=IEEE.org/RAS/Humanoids/2025/Workshop
- https://openreview.net/venue?id=IEEE.org
```

### RoboSoft

```text
Target conference:
- Name: RoboSoft
- Target year: 2026
- Edition URL: https://www.robosoft2026.org/
- Series URL: https://softroboticsconference.org/

High-priority discovery URLs:
- https://openreview.net/group?id=IEEE.org/RoboSoft/2026/Workshop
- https://openreview.net/group?id=IEEE.org/RoboSoft/2026/Workshop_Proposals
```

### NeurIPS

```text
Target conference:
- Name: NeurIPS
- Target year: 2026
- Edition URL: https://neurips.cc/
- Series URL: https://neurips.cc/

High-priority discovery URLs:
- https://openreview.net/group?id=NeurIPS.cc/2025/Workshop
- https://openreview.net/venue?id=NeurIPS.cc
```
