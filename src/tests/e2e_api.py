"""E2E: page in standalone/API mode with a mocked Apps Script backend."""
import json, sys
from playwright.sync_api import sync_playwright
page_path = sys.argv[1]
posts, gets = [], []
STATS = {"ok": True, "uses": 12, "raters": 3, "avg": 4.33, "reviews": [{"stars": 5, "review": "ممتازة وسهلة", "owner_reply": "", "ts": 1}]}
def handle(route, req):
    if req.method == "POST":
        posts.append(json.loads(req.post_data)); route.fulfill(status=200, content_type="application/json", body='{"ok":true}', headers={"Access-Control-Allow-Origin": "*"})
    else:
        gets.append(req.url); route.fulfill(status=200, content_type="application/json", body=json.dumps(STATS, ensure_ascii=False), headers={"Access-Control-Allow-Origin": "*"})
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 390, "height": 844})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("https://script.google.com/**", handle)
    pg.route("**/fees.json", lambda r, q: r.fulfill(status=404))
    pg.goto("file://" + page_path + "?r=abcdef123456"); pg.wait_for_timeout(800)
    assert gets, "stats not fetched"
    assert pg.text_content("#uses").strip() == "12", pg.text_content("#uses")
    assert pg.text_content("#rate").strip() == "4.3"
    assert "ممتازة" in pg.text_content("#revs")
    pg.fill("#price", "800000"); pg.wait_for_timeout(500)
    pg.goto("file://" + page_path + "#finance"); pg.wait_for_timeout(500)
    pg.fill("#price", "800000")
    for f, v in (("salary", "30000"), ("debts", "2000"), ("age", "35"), ("ext_debts", "3333")):
        pg.evaluate("([f,v])=>{const e=document.getElementById(f); if(e){e.value=v; e.dispatchEvent(new Event('input',{bubbles:true}));}}", [f, v])
    pg.wait_for_timeout(7500)
    pg.goto("file://" + page_path + "?v=2#ready"); pg.wait_for_timeout(600); assert pg.locator("#p-rate").is_hidden(), "rate panel before result"; pg.fill("#price", "900000"); pg.wait_for_timeout(600); assert pg.locator("#p-rate").is_visible(), "rate panel not shown"
    pg.locator("#stars button").nth(4).click(); pg.fill("#rev-text", "تجربة"); pg.click("#rev-send"); pg.wait_for_timeout(400)
    pg.fill("#fb-text", "ملاحظة تجربة"); pg.click("#fb-send"); pg.wait_for_timeout(400)
    assert any(x.get("ref") == "abcdef123456" for x in posts if x["t"] == "use")
    kinds = [x["t"] for x in posts]; print("posts:", kinds, "errors:", errs)
    for k in ("use", "event", "review", "feedback"): assert k in kinds, k
    blob = json.dumps(posts)
    assert "3333" not in blob and "ext_debts" not in blob and "30000" not in blob and '"salary"' not in blob and '"age"' not in blob and '"debts"' not in blob, "private field leaked"
    assert all(x.get("uid") for x in posts)
    assert pg.locator("#rate-share").is_visible(), "share CTA after 5 stars"
    assert pg.text_content("#rev-msg").startswith("شكراً") and "وصلت" in pg.text_content("#fb-msg")
    assert not errs, errs
    pg.screenshot(path=sys.argv[2], full_page=False)
    b.close(); print("E2E PASS")
