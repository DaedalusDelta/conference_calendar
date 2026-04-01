# Manual Response Files

Use this folder for raw JSON responses copied from the ChatGPT web UI.

Recommended naming:

- `responses/icra_2026.json`
- `responses/rss_2026.json`
- `responses/neurips_2026.json`

Workflow:

```bash
python scripts/merge_manual_response.py responses/icra_2026.json
```

Notes:

- Files in this folder are git-ignored by default.
- Keep one conference per file.
- If the web UI returns malformed JSON, keep the file here anyway and repair it before merging.
- Do not keep appending multiple conferences into one scratch file.
