# احسب عقارك 100% — repo rules for Claude

Public page: https://echosapce-cpu.github.io/ahsib-aqarak/ (GitHub Pages, branch main, root).
Owner: Echo. Replies to him in short Gulf Arabic.

## Layout
- `index.html`, `fees.json` (root) — BUILT output served by Pages. Never hand-edit; run `bash src/release.sh`.
- `src/web/template.html` — the page source (Arabic RTL). `src/web/engine.js` — calculation engine (mirror of `src/scripts/calc.py`).
- `src/scripts/fees.json` — official fees table (source of truth). `src/backend/Code.gs` — Google Apps Script backend.
- `backend/API_URL` — the deployed Apps Script web-app URL (one line). Ratings/feedback/usage go to Google Sheet `1YSHVjzU62NttytNINZ-S4oXpiciKjv40j70u1i9wrU8`.
- Tests: `node src/tests/parity.js`, `python3 src/tests/test_calc.py`, `python3 src/tests/e2e_api.py <built index> <png>`. `release.sh` runs them all and refuses to publish on failure.

## Accuracy principle (Echo, 2026-10-19)
The goal is accuracy, or the closest path to it. Every number comes from an official source with a date. When a value cannot be confirmed officially or varies by contract, do not guess: give the user an explicit choice with the conservative option as default, label the unconfirmed value visibly, and keep looking for the official source in the weekly task. Verify Echo's claims against sources before changing anything, and report what was confirmed, corrected or unconfirmed.

## Autonomy policy (Echo, 2026-10-19: "everything automatic")
Claude reads, evaluates, fixes AND develops the tool on its own, then reports. No change waits for Echo's approval, but every change must pass the gates below.
AUTO, every run:
- fixes: bugs, unclear wording, friction, layout on phone;
- development: new features, new pages/sections, calculation improvements, rent/price references, anything that serves accuracy and the users' real needs seen in the data — at most ONE new feature per day, plus up to 3 small fixes;
- review moderation: approve clean texts (see below); hide (hidden=TRUE) spam, abuse, insults, accusations, or texts naming people/companies/projects or containing contacts — never edit wording;
- owner replies: only short, neutral, factual replies about how the tool works (no promises, no advice to buy/sell, no naming anyone).
GATES (a change that fails any gate is not published; report instead):
1. `bash src/release.sh` passes (parity, Python tests, E2E incl. the private-data check). New logic gets a test in the same commit; JS and Python engines stay identical.
2. Accuracy principle above: every number has an official dated source; unconfirmed values are an explicit user choice, conservative default, visibly labelled. Fees change only under tasks/fees-weekly.md rules.
3. Legal/neutrality: keep the disclaimer, terms, privacy text in sync with any new data or feature; no buy/sell commands; no naming/ranking developers, projects or brokers.
4. One commit per change, `git revert <hash>` is the rollback; WebFetch the live page after pushing and revert immediately if it is broken.
5. Report every change in the daily report: what, why (which signal), commit hash, how to undo.
NEVER: collect salary, debts, age, external commitments, names, phones or emails; remove the tracking opt-out; fake reviews or counters; store keys/passwords; touch any other repo; delete the sheet's data.

REVIEW TEXT MODERATION (protects Echo legally): written reviews are public only when column `approved` in sheet tab reviews is TRUE. Approve only text that names no person, company, developer, project or broker, has no phone/email/link, no insult, accusation or claim of fraud, and is about the tool itself. Everything else: hidden=TRUE, with a one-line reason in the report.

## Commits
Author `Claude <noreply@anthropic.com>`; end messages with the attribution lines the session provides.
