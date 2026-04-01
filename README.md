# Robot Learning Conference Deadline Tracker (Static)

This project is now a static website: `index.html + styles.css + script.js` reading from `data/deadlines.json`.

## Why static

- Works well with GitHub Pages / Netlify / Cloudflare Pages.
- Super lightweight (no always-on backend needed).
- You can still refresh deadlines manually with the OpenAI API, or automatically with GitHub Actions.

## Local preview

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Update deadlines data

```bash
source .venv/bin/activate
export OPENAI_API_KEY=your_api_key_here
python scripts/update_deadlines.py
```

The updater now calls the OpenAI API directly from Python. It uses your local `OPENAI_API_KEY` environment variable, asks the model to inspect the official conference site plus any linked submission portal, and writes the resulting structured data to `data/deadlines.json`.

Notes:
- The API key is not stored in the repo.
- `.env` files are git-ignored to reduce the chance of accidentally committing secrets.
- You can override the model with `OPENAI_MODEL`, otherwise the updater defaults to `gpt-5`.

## Conferences

Edit `conferences.json` to add/remove conferences.
Use `series_url` for the stable conference series site and `edition_url` for the current year-specific site. `year` is optional; if omitted, the updater targets the current year based on the current date. If the target-year site is unavailable, the model is allowed to fall back one year, but it must say so in the notes. If a conference has workshop index pages or other high-signal discovery pages, add them under `discovery_urls` so the model is forced to inspect them during workshop discovery.

## Automation (optional)

A workflow is included at `.github/workflows/update-deadlines.yml` to refresh `data/deadlines.json` every 3 days.
