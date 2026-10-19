# Weekly fee-table maintenance for "احسب عقارك 100%"

Echo approved automatic fee updates on 2026-10-19. This replaces the old instructions that edited the claude.ai artifact's fees.json.

- Attach this repo (echosapce-cpu/ahsib-aqarak) with push access, read CLAUDE.md. Source of the fee table: `src/scripts/fees.json`.
- Change a value ONLY when an official government/regulator source, or two independent reputable sources dated within the last 60 days, confirm a different current value. Never on a single unverified claim. Keep the JSON structure and every key; edit values only; set `_meta.last_verified` to today and update the matching `_meta.sources` entry (URL + date). Raise `"confidence": "low"` (Fujairah, Umm Al Quwain) only with a cited source.
- Nothing changed: set `_meta.last_verified` to today only if Dubai and Abu Dhabi core fees were re-verified this run; otherwise leave the file untouched.
- Publish: `bash src/release.sh` (tests, rebuilds root index.html and fees.json; refuses on failure), commit as Claude <noreply@anthropic.com> with the session attribution lines, push to main.
- Report every change: old → new with source link, or "رسوم العقار: لا تغيير".
- Usage/feedback analysis is done by tasks/daily.md — don't repeat it in the weekly report.
