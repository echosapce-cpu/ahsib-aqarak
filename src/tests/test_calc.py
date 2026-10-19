import json, os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scripts"))
import calc

FEES = json.load(open(os.path.join(HERE, "..", "scripts", "fees.json")))
YAS = json.load(open(os.path.join(HERE, "..", "examples", "yas_studio.json")))


def close(a, b, tol=0.01):
    assert abs(a - b) <= tol, f"{a} != {b}"


def test_abu_dhabi_cash_purchase():
    r = calc.run(YAS, FEES)
    up = r["upfront_fees"]
    close(up["transfer_registration"], 749000 * 0.02)
    close(up["broker_incl_vat"], 749000 * 0.02 * 1.05)
    close(r["upfront_fees_total"], 14980 + 1000 + 450 + 15729 + 2000 + 1550 + 15000)
    lt = r["income"]["long_term"]
    close(lt["net"], 40000 * 0.95 - (463 * 13 + 749000 * 0.003 + 1000 + 2000))
    st = r["income"]["short_term"]
    nights = 365 * 0.65
    gross = 450 * nights
    costs = gross * (0.15 + 0.20 + 0.06 + 0.03) + 150 * nights / 3 + 900 * 12 + 900 + (463 * 13 + 2247 + 1000)
    close(st["gross"], gross)
    close(st["net"], gross - costs)
    be = st["breakeven_occupancy"]
    # at break-even occupancy, net STR income must be ~0 (no debt)
    m = calc.str_model(FEES["emirates"]["abu_dhabi"], calc.merge(calc.DEFAULTS, YAS),
                       calc.merge(calc.STR_DEFAULTS, YAS["short_term"]), be, 450, r["annual_owner_costs"])
    close(m["net"], 0, tol=1)


def test_dubai_financed_and_ltv_cap():
    deal = {"price": 1_200_000, "emirate": "dubai", "buyer": "expat", "first_home": False,
            "size_sqft": 700, "bedrooms": 1, "service_charge_psf": 18,
            "financing": {"ltv": 0.80, "rate": 0.045, "years": 25},
            "long_term": {"annual_rent": 90000}}
    r = calc.run(deal, FEES)
    assert r["warnings"], "LTV above investment cap should warn"
    close(r["loan"], 1_200_000 * 0.60)
    up = r["upfront_fees"]
    close(up["transfer_registration"], 48000)
    close(up["trustee"], 4200 * 1.05)
    close(up["mortgage_registration"], 720000 * 0.0025 + 290)
    close(up["bank_fee_incl_vat"], 7200 * 1.05)
    m = calc.pmt(720000, 0.045, 25)
    close(m, 4002.02, tol=0.5)   # standard amortisation check
    close(calc.balance_after(720000, 0.045, 25, 300), 0, tol=1)


def test_all_emirates_run_and_specific_rules():
    for em in FEES["emirates"]:
        r = calc.run({"price": 600000, "emirate": em, "buyer": "expat", "size_sqft": 600,
                      "bedrooms": 1, "service_charge_psf": 12,
                      "long_term": {"annual_rent": 40000},
                      "short_term": {"adr": 400, "occupancy": 0.6}}, FEES)
        assert r["income"]["short_term"]["breakeven_occupancy"] is not None, em
    # Ajman: nationals 2% (min 2,500), non-citizens 3% (min 3,000)
    nat = calc.run({"price": 100000, "emirate": "ajman", "buyer": "national"}, FEES)
    exp = calc.run({"price": 600000, "emirate": "ajman", "buyer": "expat"}, FEES)
    close(nat["upfront_fees"]["transfer_registration"], 2500)
    close(exp["upfront_fees"]["transfer_registration"], 18000)
    # RAK: buyer 2% + scheme 200 + title deed 200
    rak = calc.run({"price": 500000, "emirate": "ras_al_khaimah", "broker": False, "resale": False}, FEES)
    close(rak["upfront_fees_total"], 10000 + 400)
    # Sharjah STR licence: 100 + min(300*2,1200) + 550 = 1,250; per-unit-night fee 10
    sh = FEES["emirates"]["sharjah"]["str"]
    close(calc.str_licence(sh, 2), 1250)
    close(calc.str_licence(sh, 6), 100 + 1200 + 550)
    low = calc.run({"price": 500000, "emirate": "fujairah"}, FEES)
    assert any("low-confidence" in w for w in low["warnings"])


def test_irr():
    close(calc.irr([-100, 10, 110]), 0.10, tol=1e-4)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("PASS", name)
