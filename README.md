# Robot Learning Conference Deadline Tracker (Static)

This project is now a static website: `index.html + styles.css + script.js` reading from `data/deadlines.json`.

## Why static

- Works well with GitHub Pages / Netlify / Cloudflare Pages.
- Super lightweight (no always-on backend needed).
- You can still refresh deadlines manually from Codex, or automatically with GitHub Actions.

## Local preview

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Update deadlines data

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/update_deadlines.py
```

## Conferences

Edit `conferences.json` to add/remove conferences.

## Automation (optional)

A workflow is included at `.github/workflows/update-deadlines.yml` to refresh `data/deadlines.json` every 3 days.
