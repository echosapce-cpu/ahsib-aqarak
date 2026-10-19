"""Build the page.
  python3 web/build.py <share_url> [api_url] [--standalone]
--standalone wraps the page in its own document skeleton (GitHub Pages); the artifact host adds one itself.
api_url = Google Apps Script web-app URL used for ratings/feedback/usage when the page runs outside claude.ai."""
import json, os, sys
H = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
standalone = "--standalone" in sys.argv
share = args[0] if len(args) > 0 else "__SHARE_URL__"
api = args[1] if len(args) > 1 else ""
t = open(os.path.join(H, "template.html"), encoding="utf-8").read()
eng = open(os.path.join(H, "engine.js"), encoding="utf-8").read()
fees = json.load(open(os.path.join(H, "..", "scripts", "fees.json"), encoding="utf-8"))
out = (t.replace("__ENGINE__", eng)
        .replace("__FEES__", json.dumps(fees, ensure_ascii=False, separators=(",", ":")))
        .replace('"__SHARE_URL__"', json.dumps(share))
        .replace('"__API_URL__"', json.dumps(api)))
if standalone:
    desc = "احسب أي عقار في الإمارات بكل رسومه: المبلغ الحقيقي، العائد بعد التكاليف، ودفعات العقار قيد الإنشاء. مجانية."
    out = ('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'
           '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
           f'<meta name="description" content="{desc}"><meta property="og:title" content="احسب عقارك 100%">'
           f'<meta property="og:description" content="{desc}"><meta property="og:url" content="{share}">'
           f'<meta property="og:type" content="website"><meta property="og:image" content="{share}og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">'
           '</head><body>' + out + '</body></html>')
os.makedirs(os.path.join(H, "dist"), exist_ok=True)
open(os.path.join(H, "dist", "index.html"), "w", encoding="utf-8").write(out)
print("built", len(out.encode()), "bytes", "standalone" if standalone else "", "api" if api else "no-api")
