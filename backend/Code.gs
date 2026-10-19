/** احسب عقارك 100% — backend for ratings, feedback and anonymous usage.
 *  Paste into Extensions > Apps Script of the sheet, then Deploy > Web app
 *  (Execute as: Me, Who has access: Anyone). Stores nothing personal:
 *  no salary, debts, age, names or numbers are ever sent by the page. */
const COLS = {
  uses: ["ts", "uid", "ref"],
  reviews: ["ts", "uid", "stars", "review", "owner_reply", "hidden"],
  feedback: ["ts", "uid", "kind", "tab", "text", "emirate", "price", "status"],
  events: ["ts", "uid", "session", "tab", "emirate", "status", "beds", "price_band", "seller", "financed",
    "str", "sc_mode", "plan", "net_yield", "payback", "right_vs_price", "dbr_ok", "fields", "tab_visits"],
};

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function clean_(v, n) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "boolean") return v;
  let s = String(v).replace(/[\u0000-\u001f]/g, " ").slice(0, n || 100);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // block spreadsheet formula injection
  return s;
}
function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (sh.getLastRow() === 0) sh.appendRow(COLS[name]);
  return sh;
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, err: "bad json" }); }
  const uid = clean_(b.uid, 40);
  if (!/^[a-z0-9]{8,40}$/.test(String(uid))) return out_({ ok: false, err: "bad uid" });
  // throttle: max 40 writes per visitor per 10 min, 3000 total per 10 min
  const cache = CacheService.getScriptCache();
  const k = "n_" + uid, g = "n_all", n = +(cache.get(k) || 0), ga = +(cache.get(g) || 0);
  if (n > 40 || ga > 3000) return out_({ ok: false, err: "slow down" });
  cache.put(k, String(n + 1), 600); cache.put(g, String(ga + 1), 600);

  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const now = new Date();
    if (b.t === "use") {
      const ref = String(clean_(b.ref, 40)); sheet_("uses").appendRow([now, uid, /^[a-z0-9]{8,40}$/.test(ref) && ref !== uid ? ref : ""]);
    } else if (b.t === "review") {
      const stars = Math.round(+b.stars);
      if (!(stars >= 1 && stars <= 5)) return out_({ ok: false, err: "bad stars" });
      const sh = sheet_("reviews"), last = sh.getLastRow();
      const row = [now, uid, stars, clean_(b.review, 280)];
      if (last > 1) { // one review per visitor: update instead of duplicating
        const ids = sh.getRange(2, 2, last - 1, 1).getValues();
        for (let i = 0; i < ids.length; i++) if (ids[i][0] === uid) { sh.getRange(i + 2, 1, 1, 4).setValues([row]); cache.remove("stats"); return out_({ ok: true, updated: true }); }
      }
      sh.appendRow(row.concat(["", ""]));
    } else if (b.t === "feedback") {
      const text = clean_(b.text, 600); if (!text) return out_({ ok: false, err: "empty" });
      const c = b.ctx || {};
      sheet_("feedback").appendRow([now, uid, clean_(b.kind, 20), clean_(b.tab, 20), text, clean_(c.emirate, 20), clean_(+c.price || "", 20), clean_(c.status, 20)]);
    } else if (b.t === "event") {
      const s = b.snap || {}, r = s.res || {};
      sheet_("events").appendRow([now, uid, clean_(b.session, 20), clean_(s.tab, 20), clean_(s.emirate, 20), clean_(s.status, 20),
        clean_(s.beds, 10), clean_(s.price_band, 20), clean_(s.seller, 20), !!s.financed, !!s.str, clean_(s.sc_mode, 20),
        clean_(s.plan, 30), clean_(r.net_yield, 10), clean_(r.payback, 10), clean_(r.right_vs_price, 10), clean_(r.dbr_ok, 10),
        clean_((s.fields || []).join(","), 400), clean_(JSON.stringify(b.tabs || {}), 200)]);
    } else return out_({ ok: false, err: "bad type" });
    cache.remove("stats");
    return out_({ ok: true });
  } finally { lock.releaseLock(); }
}

/** Public read: only totals and visible reviews — never feedback or events. */
function doGet() {
  const cache = CacheService.getScriptCache(), hit = cache.get("stats");
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  const uses = Math.max(0, sheet_("uses").getLastRow() - 1);
  const sh = sheet_("reviews"), last = sh.getLastRow();
  const rows = last > 1 ? sh.getRange(2, 1, last - 1, 6).getValues() : [];
  let raters = 0, sum = 0; const revs = [];
  for (const [ts, , stars, review, reply, hidden] of rows) {
    if (hidden === true || String(hidden).toLowerCase() === "true" || hidden === "1") continue;
    const st = +stars; if (!(st >= 1 && st <= 5)) continue;
    raters++; sum += st;
    if (review) revs.push({ stars: st, review: String(review).replace(/^'/, ""), owner_reply: String(reply || ""), ts: new Date(ts).getTime() });
  }
  revs.sort((a, b) => b.ts - a.ts);
  const body = JSON.stringify({ ok: true, uses: uses, raters: raters, avg: raters ? sum / raters : 0, reviews: revs.slice(0, 8) });
  cache.put("stats", body, 60);
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}
