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
    # rent verification: unverified rent shows the lower-income effect; proof hides it; no document data is sent
    pg.goto("file://" + page_path + "?v=3#ready"); pg.wait_for_timeout(500)
    pg.select_option("#emirate", "abu_dhabi"); pg.fill("#price", "1000000"); pg.fill("#annual_rent", "70000"); pg.wait_for_timeout(500)
    ind = pg.text_content("#ind"); assert "غير موثّق" in ind and "← " in ind, ind
    assert "غير موثّق" in pg.text_content("#k-net-s")
    assert "داري" in pg.inner_html("#rv_steps") and "ADDC" in pg.inner_html("#rv_steps")
    pg.click("#rv_box summary"); pg.select_option("#rent_src", "proof"); pg.dispatch_event("#rent_src", "input"); pg.wait_for_timeout(400)
    assert "غير موثّق" not in pg.text_content("#ind") and pg.locator("#rent_cut_w").is_hidden()
    pg.select_option("#emirate", "dubai"); pg.dispatch_event("#emirate", "input"); pg.wait_for_timeout(400)
    assert "إيجاري" in pg.inner_html("#rv_steps")
    # simple first screen: advanced inputs hidden on ready until "more options"; finance tab keeps them
    pg.goto("file://" + page_path + "?v=6#ready"); pg.wait_for_timeout(400)
    assert pg.locator("#price").is_visible() and pg.locator("#annual_rent").is_visible()
    assert pg.locator("#fin_on").is_hidden() and pg.locator("#str_on").is_hidden() and pg.locator("#resale").is_hidden()
    pg.fill("#price", "900000"); pg.fill("#annual_rent", "60000"); pg.wait_for_timeout(400); assert "%" in pg.text_content("#k-net")
    pg.click("#adv-btn"); pg.wait_for_timeout(200); assert pg.locator("#fin_on").is_visible() and pg.locator("#str_on").is_visible()
    pg.goto("file://" + page_path + "?v=7#finance"); pg.wait_for_timeout(400); assert pg.locator("#salary").is_visible()
    pg.goto("file://" + page_path + "?v=5#portfolio"); pg.wait_for_timeout(400)
    pg.select_option("#emirate", "abu_dhabi"); pg.wait_for_timeout(200); assert pg.input_value("#pf_rg") == "0", pg.input_value("#pf_rg")
    pg.select_option("#emirate", "dubai"); pg.wait_for_timeout(200); assert pg.input_value("#pf_rg") == "2"
    assert pg.locator("#fb-kind option[value=question]").count() == 1 and pg.input_value("#fb-kind") == "idea"
    pg.goto("file://" + page_path + "?v=4#guide"); pg.wait_for_timeout(500)
    assert pg.locator("#g-tenant").is_visible() and "المادة 28" in pg.inner_html("#g-tenant") and "سيناريو 4" in pg.inner_html("#g-tenant")
    assert not errs, errs
    pg.screenshot(path=sys.argv[2], full_page=False)
    b.close(); print("E2E PASS")
