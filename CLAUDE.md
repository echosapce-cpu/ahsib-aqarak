# احسب عقارك 100% — repo rules for Claude

Public page: https://echosapce-cpu.github.io/ahsib-aqarak/ (GitHub Pages, branch main, root).
Owner: Echo. Replies to him in short Gulf Arabic.

## Layout
- `index.html`, `fees.json` (root) — BUILT output served by Pages. Never hand-edit; run `bash src/release.sh`.
- `src/web/template.html` — the page source (Arabic RTL). `src/web/engine.js` — calculation engine (mirror of `src/scripts/calc.py`).
- `src/scripts/fees.json` — official fees table (source of truth). `src/backend/Code.gs` — Google Apps Script backend.
- `backend/API_URL` — the deployed Apps Script web-app URL (one line). Ratings/feedback/usage go to Google Sheet `1YSHVjzU62NttytNINZ-S4oXpiciKjv40j70u1i9wrU8`.
- Tests: `node src/tests/parity.js`, `python3 src/tests/test_calc.py`, `python3 src/tests/e2e_api.py <built index> <png>`. `release.sh` runs them all and refuses to publish on failure.

## Auto-fix policy (Echo approved 2026-10-19)
AUTO (do it, test, release, push, then report what/why/how to undo with the commit hash):
- clear bugs (broken button, wrong label, JS error, layout broken on phone, a number shown wrong because of a code error);
- wording that users report as unclear; small UX simplifications that remove friction;
- at most 3 small changes per day; one commit per change; `git revert <hash>` is the rollback.
REVIEW TEXT MODERATION (protects Echo legally): written reviews are public only when column `approved` in sheet tab reviews is TRUE. AUTO-approve only text that names no person, company, developer, project or broker, has no phone/email/link, no insult, accusation or claim of fraud, and is about the tool itself. Anything doubtful stays pending and goes to Echo with a one-line reason. Never edit a review's wording.
ASK ECHO FIRST: any new feature or new page; any change to calculation formulas or to fees (fees follow the weekly fee rules only); hiding a review; writing an owner reply; anything that collects new data.
NEVER: collect salary, debts, age, names, phones or emails; remove the tracking opt-out; fake reviews or counters; name or rank developers/projects; give buy/sell commands; store keys/passwords; touch any other repo.

## Commits
Author `Claude <noreply@anthropic.com>`; end messages with the attribution lines the session provides.
