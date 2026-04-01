# Robot Learning Conference Deadline Tracker (Static)

Static website (`index.html`, `styles.css`, `script.js`) + generated JSON (`data/deadlines.json`).

## What the updater does

Given each conference homepage in `conferences.json`, the updater script:

1. Fetches the main conference homepage.
2. Discovers likely links for:
   - submission portals (OpenReview/CMT/EasyChair/etc.)
   - workshop pages.
3. Extracts deadline-like entries from homepage + discovered pages.
4. Marks deadline extensions when extension wording is detected.
5. Writes normalized results to `data/deadlines.json`.

This is implemented in `scripts/update_deadlines.py`.

## Local preview

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Update deadlines data manually

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/update_deadlines.py
```

## Output format (`data/deadlines.json`)

Each item contains structured fields such as:

- `conference`
- `venue_type` (`conference` or `workshop`)
- `deadline_type` (`paper_submission`, `demo_submission`, etc.)
- `date` (ISO `YYYY-MM-DD`)
- `is_extension` (boolean)
- `source_page` (`homepage`, `submission_portal`, `workshop_page`)
- `source` (URL)
- `snippet` (supporting text)

## Automation (optional)

A workflow at `.github/workflows/update-deadlines.yml` runs every 3 days and on manual trigger.
