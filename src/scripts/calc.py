#!/usr/bin/env python3
"""UAE property deal calculator.

Usage: python3 calc.py deal.json [--fees fees.json]
Prints a JSON result: upfront costs, financing, long-term rent, short-term
(holiday home) rent, break-even occupancy, scenarios and exit projection.
All amounts in AED. Every assumption used is echoed back in "assumptions".
"""
import json, sys, os, math

HERE = os.path.dirname(os.path.abspath(__file__))

DEFAULTS = {
    "emirate": "abu_dhabi",          # dubai | abu_dhabi | sharjah | ajman | ras_al_khaimah | fujairah | umm_al_quwain
    "status": "ready",               # ready | offplan
    "resale": True,                  # bought from an owner (broker/NOC/trustee apply)
    "buyer": "national",             # national | expat | nonresident
    "first_home": False,
    "size_sqft": 0,
    "bedrooms": 0,                   # 0 = studio
    "service_charge_psf": 0.0,
    "broker": True,
    "furnishing": 0,
    "maintenance_pct": 0.003,        # of price per year
    "insurance": 1000,
    "chiller_monthly": 0,            # district cooling paid by the owner
    "service_charge_annual": None,   # total yearly service charge; overrides size x rate when given
    "financing": None,               # {"ltv":0.6,"rate":0.045,"years":25}
    "long_term": None,               # {"annual_rent":60000,"vacancy":0.05,"leasing_fee_pct":0.05}
    "short_term": None,              # see str_defaults
    "exit": {"years": 5, "appreciation": 0.03, "sell_broker_pct": 0.02},
    "relief": False,                 # apply Dubai 2026 holiday-home fee relief
}

STR_DEFAULTS = {
    "adr": 0, "occupancy": 0.6, "avg_stay": 3,
    "platform_pct": 0.155,           # Airbnb single host-only fee (all non-EU hosts from Sept 2026)
    "management_pct": 0.20,          # 0 if self-managed
    "cleaning_per_stay": 150, "cleaning_fee_charged": 0,
    "utilities_monthly": 900,        # electricity/water/cooling/internet
    "consumables_pct": 0.03,
    "tourism_passed_to_guest": False,
    "scenario_adr_pct": 0.15, "scenario_occ_pts": 0.10,
}


def merge(base, over):
    out = dict(base)
    for k, v in (over or {}).items():
        out[k] = v
    return out


def pmt(principal, rate, years):
    if principal <= 0:
        return 0.0
    r, n = rate / 12, years * 12
    if r == 0:
        return principal / n
    return principal * r / (1 - (1 + r) ** -n)


def balance_after(principal, rate, years, months):
    if principal <= 0:
        return 0.0
    r = rate / 12
    m = pmt(principal, rate, years)
    if r == 0:
        return max(principal - m * months, 0)
    return max(principal * (1 + r) ** months - m * ((1 + r) ** months - 1) / r, 0)


def irr(flows, lo=-0.99, hi=1.0):
    def npv(r):
        return sum(f / (1 + r) ** i for i, f in enumerate(flows))
    if npv(lo) * npv(hi) > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        if npv(lo) * npv(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def ltv_cap(fees, d, price):
    t = fees["ltv"]
    if d["buyer"] == "nonresident":
        cap = t["nonresident"]["any"]
    else:
        row = t[d["buyer"]]
        if d["first_home"]:
            cap = row["first_under_5m"] if price < 5_000_000 else row["first_over_5m"]
        else:
            cap = row["investment"]
    if d["status"] == "offplan":
        cap = min(cap, t["offplan_bank_typical"])
    return cap


def upfront(fees, e, d, price, loan):
    vat = fees["vat"]
    items = {}
    pct = e.get("transfer_pct_by_buyer", {}).get(d["buyer"], e["transfer_pct"])
    tmin = e.get("transfer_min_by_buyer", {}).get(d["buyer"], 0)
    items["transfer_registration"] = max(price * pct, tmin)
    for k, v in e["fixed"].items():
        items[k] = v
    if e.get("trustee") and d["resale"]:
        t = e["trustee"]
        fee = t["low"] if price <= t["threshold"] else t["high"]
        items["trustee"] = fee * (1 + vat if t.get("vat") else 1)
    if d["broker"] and d["resale"]:
        items["broker_incl_vat"] = price * e["broker_pct"] * (1 + vat)
    if d["resale"]:
        items["developer_noc_est"] = e["noc_estimate"]
    if loan > 0:
        mr = loan * e["mortgage_reg_pct"]
        mr = max(mr, e["mortgage_reg_min"] or 0)
        if e["mortgage_reg_max"]:
            mr = min(mr, e["mortgage_reg_max"])
        items["mortgage_registration"] = mr + e["mortgage_reg_fixed"]
        items["bank_fee_incl_vat"] = min(loan * e["bank_fee_pct"], e["bank_fee_cap"]) * (1 + vat)
        items["valuation_incl_vat"] = e["valuation"] * (1 + vat)
    return items


def str_licence(st, bedrooms):
    """Annual holiday-home licence: flat amount, or base + per-bedroom (capped) + extras."""
    if "licence_annual" in st:
        return st["licence_annual"]
    return st["licence_base"] + min(st["licence_per_bedroom"] * max(bedrooms, 1), st["licence_cap"]) + st.get("licence_extra", 0)


def str_rates(e, d, s):
    """(tourism %, per-room-night, per-unit-night, licence) after relief/pass-through."""
    st = e["str"]
    relief = d["relief"] and d["emirate"] == "dubai"
    lic = 0 if relief else str_licence(st, d["bedrooms"])
    if relief or s["tourism_passed_to_guest"]:
        return 0, 0, 0, lic
    return st["tourism_fee_pct"], st["tourism_per_room_night"], st.get("tourism_per_unit_night", 0), lic


def str_model(e, d, s, occ, adr, fixed_owner):
    rooms = max(d["bedrooms"], 1)
    nights = 365 * occ
    stays = nights / s["avg_stay"] if s["avg_stay"] else 0
    gross = adr * nights
    tourism_pct, per_room, per_unit, licence = str_rates(e, d, s)
    tourism = gross * tourism_pct + (per_room * rooms + per_unit) * nights
    costs = {
        "platform": gross * s["platform_pct"],
        "management": gross * (1 - s["platform_pct"]) * s["management_pct"],  # operators usually charge on the payout after the platform fee
        "tourism_fees": tourism,
        "cleaning_net": max(s["cleaning_per_stay"] - s["cleaning_fee_charged"], 0) * stays,
        "consumables": gross * s["consumables_pct"],
        "utilities": s["utilities_monthly"] * 12,
        "licence": licence,
    }
    costs.update(fixed_owner)
    net = gross - sum(costs.values())
    return {"nights": round(nights), "gross": gross, "costs": costs, "net": net,
            "vat_registration_required": gross > 375_000}


def breakeven_occ(e, d, s, adr, fixed_owner, debt):
    rooms = max(d["bedrooms"], 1)
    tpct, prn, pun, licence = str_rates(e, d, s)
    var_pct = s["platform_pct"] + (1 - s["platform_pct"]) * s["management_pct"] + s["consumables_pct"] + tpct
    per_night = adr * (1 - var_pct) - (max(s["cleaning_per_stay"] - s["cleaning_fee_charged"], 0) / s["avg_stay"]) - prn * rooms - pun
    fixed = s["utilities_monthly"] * 12 + licence + sum(fixed_owner.values()) + debt
    if per_night <= 0:
        return None
    return fixed / (365 * per_night)


def run(deal, fees):
    d = merge(DEFAULTS, deal)
    d["exit"] = merge(DEFAULTS["exit"], deal.get("exit"))
    e = fees["emirates"][d["emirate"]]
    price = float(d["price"])
    warnings = []
    if e.get("confidence") == "low":
        warnings.append(f"Fees for {d['emirate']} are low-confidence estimates (no itemised official source found); confirm with the land department.")

    # financing
    fin = d["financing"]
    cap = ltv_cap(fees, d, price)
    loan, monthly, debt = 0.0, 0.0, 0.0
    if fin:
        ltv = fin.get("ltv", cap)
        if ltv > cap + 1e-9:
            warnings.append(f"Requested LTV {ltv:.0%} exceeds the cap {cap:.0%} for this buyer/property; capped.")
            ltv = cap
        loan = price * ltv
        monthly = pmt(loan, fin["rate"], fin["years"])
        debt = monthly * 12

    up = upfront(fees, e, d, price, loan)
    if d["short_term"]:
        if e["str"]["setup_one_off"] and not (d["relief"] and d["emirate"] == "dubai"):
            up["holiday_home_setup"] = e["str"]["setup_one_off"]
    if d["furnishing"]:
        up["furnishing"] = d["furnishing"]
    fees_total = sum(up.values())
    cash_needed = price - loan + fees_total
    all_in = price + fees_total

    fixed_owner = {
        "service_charge": d["service_charge_annual"] if d.get("service_charge_annual") is not None else d["size_sqft"] * d["service_charge_psf"],
        "maintenance": price * d["maintenance_pct"],
        "insurance": d["insurance"],
        "chiller": d.get("chiller_monthly", 0) * 12,
    }

    res = {"price": price, "emirate": d["emirate"], "upfront_fees": up,
           "upfront_fees_total": fees_total, "fees_pct_of_price": fees_total / price,
           "loan": loan, "ltv_cap": cap, "monthly_payment": monthly,
           "annual_debt_service": debt, "cash_needed": cash_needed,
           "annual_owner_costs": fixed_owner, "warnings": warnings}

    incomes = {}
    if d["long_term"]:
        lt = merge({"vacancy": 0.05, "leasing_fee_pct": 0.05}, d["long_term"])
        rent = lt["annual_rent"]
        eff = rent * (1 - lt["vacancy"])
        costs = dict(fixed_owner, leasing_fee=rent * lt["leasing_fee_pct"])
        net = eff - sum(costs.values())
        str_setup = up.get("holiday_home_setup", 0)  # not incurred for a long-term let
        incomes["long_term"] = {
            "gross_rent": rent, "effective_rent": eff, "costs": costs, "net": net,
            "gross_yield": rent / price, "net_yield": net / (all_in - str_setup),
            "cash_flow": net - debt, "cash_on_cash": (net - debt) / (cash_needed - str_setup),
            "cash_needed": cash_needed - str_setup}

    if d["short_term"]:
        s = merge(STR_DEFAULTS, d["short_term"])
        base = str_model(e, d, s, s["occupancy"], s["adr"], fixed_owner)
        base.update({"gross_yield": base["gross"] / price, "net_yield": base["net"] / all_in,
                     "cash_flow": base["net"] - debt, "cash_on_cash": (base["net"] - debt) / cash_needed})
        be = breakeven_occ(e, d, s, s["adr"], fixed_owner, debt)
        base["breakeven_occupancy"] = be
        if be is not None and be > 1:
            warnings.append("Short-term rental cannot cover costs even at 100% occupancy at this ADR.")
        scen = {}
        for name, a, o in (("low", -1, -1), ("base", 0, 0), ("high", 1, 1)):
            occ = min(max(s["occupancy"] + o * s["scenario_occ_pts"], 0.05), 0.95)
            adr = s["adr"] * (1 + a * s["scenario_adr_pct"])
            m = str_model(e, d, s, occ, adr, fixed_owner)
            scen[name] = {"occupancy": occ, "adr": adr, "gross": m["gross"], "net": m["net"],
                          "net_yield": m["net"] / all_in, "cash_flow": m["net"] - debt}
        base["scenarios"] = scen
        incomes["short_term"] = base
        if base["vat_registration_required"]:
            warnings.append("Gross STR revenue exceeds AED 375,000/yr: VAT registration (5%) required.")

    res["income"] = incomes

    # exit projection per strategy
    x = d["exit"]
    yrs = x["years"]
    sale = price * (1 + x["appreciation"]) ** yrs
    sell_costs = sale * x["sell_broker_pct"] * (1 + fees["vat"])
    bal = balance_after(loan, fin["rate"], fin["years"], yrs * 12) if fin else 0.0
    proceeds = sale - sell_costs - bal
    exits = {}
    for k, inc in incomes.items():
        cf = inc["cash_flow"]
        invested = inc.get("cash_needed", cash_needed)
        flows = [-invested] + [cf] * (yrs - 1) + [cf + proceeds]
        r = irr(flows)
        total = sum(flows)
        exits[k] = {"years": yrs, "sale_price": sale, "sale_costs": sell_costs,
                    "loan_balance": bal, "net_sale_proceeds": proceeds,
                    "total_profit": total, "irr": r,
                    "equity_multiple": (total + invested) / invested}
    res["exit"] = exits
    res["assumptions"] = d
    return res


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    fees_path = os.path.join(HERE, "fees.json")
    if "--fees" in args:
        fees_path = args[args.index("--fees") + 1]
    with open(args[0]) as f:
        deal = json.load(f)
    with open(fees_path) as f:
        fees = json.load(f)
    out = run(deal, fees)
    print(json.dumps(out, indent=2, default=lambda o: round(o, 4) if isinstance(o, float) else str(o)))


if __name__ == "__main__":
    main()
