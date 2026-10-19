// احسب عقارك 100% — calculation engine (mirror of scripts/calc.py; keep both in sync)
(function (root) {
  const DEFAULTS = {
    emirate: "abu_dhabi", status: "ready", resale: true, buyer: "national", first_home: false,
    size_sqft: 0, bedrooms: 0, service_charge_psf: 0, broker: true, furnishing: 0,
    maintenance_pct: 0.003, insurance: 1000, chiller_monthly: 0, service_charge_annual: null, financing: null, long_term: null, short_term: null,
    exit: { years: 5, appreciation: 0.03, sell_broker_pct: 0.02 }, relief: false,
  };
  const STR_DEFAULTS = {
    adr: 0, occupancy: 0.6, avg_stay: 3, platform_pct: 0.15, management_pct: 0.20,
    cleaning_per_stay: 150, cleaning_fee_charged: 0, utilities_monthly: 900, consumables_pct: 0.03,
    tourism_passed_to_guest: false, scenario_adr_pct: 0.15, scenario_occ_pts: 0.10,
  };
  const merge = (a, b) => Object.assign({}, a, b || {});
  const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);

  function pmt(P, rate, years) {
    if (P <= 0) return 0;
    const r = rate / 12, n = years * 12;
    return r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
  }
  function balanceAfter(P, rate, years, months) {
    if (P <= 0) return 0;
    const r = rate / 12, m = pmt(P, rate, years);
    if (r === 0) return Math.max(P - m * months, 0);
    return Math.max(P * Math.pow(1 + r, months) - (m * (Math.pow(1 + r, months) - 1)) / r, 0);
  }
  function irr(flows, lo = -0.99, hi = 1.0) {
    const npv = (r) => flows.reduce((s, f, i) => s + f / Math.pow(1 + r, i), 0);
    if (npv(lo) * npv(hi) > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }
  function ltvCap(fees, d, price) {
    const t = fees.ltv;
    let cap;
    if (d.buyer === "nonresident") cap = t.nonresident.any;
    else {
      const row = t[d.buyer];
      cap = d.first_home ? (price < 5e6 ? row.first_under_5m : row.first_over_5m) : row.investment;
    }
    if (d.status === "offplan") cap = Math.min(cap, t.offplan_bank_typical);
    return cap;
  }
  function upfront(fees, e, d, price, loan) {
    const vat = fees.vat, items = {};
    const pct = (e.transfer_pct_by_buyer || {})[d.buyer] ?? e.transfer_pct;
    const tmin = (e.transfer_min_by_buyer || {})[d.buyer] ?? 0;
    items.transfer_registration = Math.max(price * pct, tmin);
    for (const [k, v] of Object.entries(e.fixed)) items[k] = v;
    if (e.trustee && d.resale) {
      const t = e.trustee, fee = price <= t.threshold ? t.low : t.high;
      items.trustee = fee * (t.vat ? 1 + vat : 1);
    }
    if (d.broker && d.resale) items.broker_incl_vat = price * e.broker_pct * (1 + vat);
    if (d.resale) items.developer_noc_est = e.noc_estimate;
    if (loan > 0) {
      let mr = loan * e.mortgage_reg_pct;
      mr = Math.max(mr, e.mortgage_reg_min || 0);
      if (e.mortgage_reg_max) mr = Math.min(mr, e.mortgage_reg_max);
      items.mortgage_registration = mr + e.mortgage_reg_fixed;
      items.bank_fee_incl_vat = Math.min(loan * e.bank_fee_pct, e.bank_fee_cap) * (1 + vat);
      items.valuation_incl_vat = e.valuation * (1 + vat);
    }
    return items;
  }
  function strLicence(st, bedrooms) {
    if ("licence_annual" in st) return st.licence_annual;
    return st.licence_base + Math.min(st.licence_per_bedroom * Math.max(bedrooms, 1), st.licence_cap) + (st.licence_extra || 0);
  }
  function strRates(e, d, s) {
    const st = e.str, relief = d.relief && d.emirate === "dubai";
    const lic = relief ? 0 : strLicence(st, d.bedrooms);
    if (relief || s.tourism_passed_to_guest) return [0, 0, 0, lic];
    return [st.tourism_fee_pct, st.tourism_per_room_night, st.tourism_per_unit_night || 0, lic];
  }
  function strModel(e, d, s, occ, adr, fixedOwner) {
    const rooms = Math.max(d.bedrooms, 1), nights = 365 * occ;
    const stays = s.avg_stay ? nights / s.avg_stay : 0, gross = adr * nights;
    const [tpct, prn, pun, licence] = strRates(e, d, s);
    const costs = Object.assign({
      platform: gross * s.platform_pct,
      management: gross * s.management_pct,
      tourism_fees: gross * tpct + (prn * rooms + pun) * nights,
      cleaning_net: Math.max(s.cleaning_per_stay - s.cleaning_fee_charged, 0) * stays,
      consumables: gross * s.consumables_pct,
      utilities: s.utilities_monthly * 12,
      licence,
    }, fixedOwner);
    return { nights: Math.round(nights), gross, costs, net: gross - sum(costs), vat_registration_required: gross > 375000 };
  }
  function breakevenOcc(e, d, s, adr, fixedOwner, debt) {
    const rooms = Math.max(d.bedrooms, 1);
    const [tpct, prn, pun, licence] = strRates(e, d, s);
    const varPct = s.platform_pct + s.management_pct + s.consumables_pct + tpct;
    const perNight = adr * (1 - varPct) - Math.max(s.cleaning_per_stay - s.cleaning_fee_charged, 0) / s.avg_stay - prn * rooms - pun;
    const fixed = s.utilities_monthly * 12 + licence + sum(fixedOwner) + debt;
    return perNight <= 0 ? null : fixed / (365 * perNight);
  }

  function run(deal, fees) {
    const d = merge(DEFAULTS, deal);
    d.exit = merge(DEFAULTS.exit, deal.exit);
    const e = fees.emirates[d.emirate];
    const price = Number(d.price), warnings = [];
    if (e.confidence === "low") warnings.push("low_confidence");
    const fin = d.financing, cap = ltvCap(fees, d, price);
    let loan = 0, monthly = 0, debt = 0;
    if (fin) {
      let ltv = fin.ltv ?? cap;
      if (ltv > cap + 1e-9) { warnings.push("ltv_capped"); ltv = cap; }
      loan = price * ltv; monthly = pmt(loan, fin.rate, fin.years); debt = monthly * 12;
    }
    const up = upfront(fees, e, d, price, loan);
    if (d.short_term && e.str.setup_one_off && !(d.relief && d.emirate === "dubai")) up.holiday_home_setup = e.str.setup_one_off;
    if (d.furnishing) up.furnishing = d.furnishing;
    const feesTotal = sum(up), cashNeeded = price - loan + feesTotal, allIn = price + feesTotal;
    const fixedOwner = { service_charge: d.service_charge_annual != null ? d.service_charge_annual : d.size_sqft * d.service_charge_psf, maintenance: price * d.maintenance_pct, insurance: d.insurance, chiller: (d.chiller_monthly || 0) * 12 };
    const res = { price, emirate: d.emirate, upfront_fees: up, upfront_fees_total: feesTotal, fees_pct_of_price: feesTotal / price,
      loan, ltv_cap: cap, monthly_payment: monthly, annual_debt_service: debt, cash_needed: cashNeeded,
      annual_owner_costs: fixedOwner, warnings, income: {} };
    if (d.long_term) {
      const lt = merge({ vacancy: 0.05, leasing_fee_pct: 0.05 }, d.long_term);
      const rent = lt.annual_rent, eff = rent * (1 - lt.vacancy);
      const costs = Object.assign({}, fixedOwner, { leasing_fee: rent * lt.leasing_fee_pct });
      const net = eff - sum(costs), setup = up.holiday_home_setup || 0;
      res.income.long_term = { gross_rent: rent, effective_rent: eff, costs, net, gross_yield: rent / price,
        net_yield: net / (allIn - setup), cash_flow: net - debt, cash_on_cash: (net - debt) / (cashNeeded - setup), cash_needed: cashNeeded - setup };
    }
    if (d.short_term) {
      const s = merge(STR_DEFAULTS, d.short_term);
      const base = strModel(e, d, s, s.occupancy, s.adr, fixedOwner);
      Object.assign(base, { gross_yield: base.gross / price, net_yield: base.net / allIn, cash_flow: base.net - debt,
        cash_on_cash: (base.net - debt) / cashNeeded });
      base.breakeven_occupancy = breakevenOcc(e, d, s, s.adr, fixedOwner, debt);
      if (base.breakeven_occupancy !== null && base.breakeven_occupancy > 1) warnings.push("str_never_breaks_even");
      base.scenarios = {};
      for (const [name, a, o] of [["low", -1, -1], ["base", 0, 0], ["high", 1, 1]]) {
        const occ = Math.min(Math.max(s.occupancy + o * s.scenario_occ_pts, 0.05), 0.95);
        const adr = s.adr * (1 + a * s.scenario_adr_pct), m = strModel(e, d, s, occ, adr, fixedOwner);
        base.scenarios[name] = { occupancy: occ, adr, gross: m.gross, net: m.net, net_yield: m.net / allIn, cash_flow: m.net - debt };
      }
      res.income.short_term = base;
      if (base.vat_registration_required) warnings.push("vat_required");
    }
    const x = d.exit, yrs = x.years, sale = price * Math.pow(1 + x.appreciation, yrs);
    const sellCosts = sale * x.sell_broker_pct * (1 + fees.vat);
    const bal = fin ? balanceAfter(loan, fin.rate, fin.years, yrs * 12) : 0, proceeds = sale - sellCosts - bal;
    res.exit = {};
    for (const [k, inc] of Object.entries(res.income)) {
      const invested = inc.cash_needed ?? cashNeeded, cf = inc.cash_flow;
      const flows = [-invested].concat(Array(Math.max(yrs - 1, 0)).fill(cf), [cf + proceeds]);
      const total = flows.reduce((s, f) => s + f, 0);
      res.exit[k] = { years: yrs, sale_price: sale, sale_costs: sellCosts, loan_balance: bal, net_sale_proceeds: proceeds,
        total_profit: total, irr: irr(flows), equity_multiple: (total + invested) / invested, invested };
    }
    return res;
  }

  // "سعرك الصح": highest price at which the chosen strategy still reaches the target net yield.
  function rightPrice(deal, fees, strategy, target) {
    const y = (p) => { const r = run(Object.assign({}, deal, { price: p }), fees).income[strategy]; return r ? r.net_yield : null; };
    if (y(deal.price) === null) return null;
    let lo = 1000, hi = deal.price * 3;
    if (y(lo) < target) return null;
    if (y(hi) >= target) return hi;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (y(mid) >= target) lo = mid; else hi = mid; }
    return lo;
  }

  // Stress test: rent/ADR -10%, service charge +15%, one extra vacant month (LT) / occupancy -8 pts (STR).
  function stress(deal, fees) {
    const d = JSON.parse(JSON.stringify(deal));
    d.service_charge_psf = (d.service_charge_psf || 0) * 1.15;
    if (d.service_charge_annual != null) d.service_charge_annual *= 1.15;
    if (d.long_term) { d.long_term.annual_rent *= 0.9; d.long_term.vacancy = Math.min((d.long_term.vacancy ?? 0.05) + 1 / 12, 0.9); }
    if (d.short_term) { d.short_term.adr *= 0.9; d.short_term.occupancy = Math.max((d.short_term.occupancy ?? 0.6) - 0.08, 0.05); }
    return run(d, fees);
  }

  // Largest loan a monthly payment can service (inverse annuity).
  function loanFromPayment(pay, rate, years) {
    if (pay <= 0) return 0;
    const r = rate / 12, n = years * 12;
    return r === 0 ? pay * n : (pay * (1 - Math.pow(1 + r, -n))) / r;
  }
  // Bank affordability under the CBUAE debt-burden cap (all monthly debt <= 50% of income).
  function affordability(deal, fees, salary, existingDebts, age) {
    const fin = deal.financing;
    if (!fin || !salary) return null;
    const m = fees.mortgage, ageLimit = m.age_at_maturity[deal.buyer || "national"];
    const maxYears = Math.max(Math.min(m.max_tenure_years, age ? ageLimit - age : m.max_tenure_years), 0);
    if (fin.years > maxYears) deal = Object.assign({}, deal, { financing: Object.assign({}, fin, { years: maxYears }) });
    const r = run(deal, fees), dbr = fees.ltv.dbr_max;
    const room = salary * dbr - (existingDebts || 0);
    const yrs = deal.financing.years;
    const pay = r.monthly_payment, maxLoan = yrs > 0 ? loanFromPayment(Math.max(room, 0), fin.rate, yrs) : 0;
    const ltv = r.loan / r.price || r.ltv_cap;
    return { payment: pay, room, max_payment: Math.max(room, 0), ok: pay <= room + 1e-6,
      dbr_after: (pay + (existingDebts || 0)) / salary, max_loan: maxLoan,
      max_price: ltv ? maxLoan / ltv : null, debt_to_clear: Math.max(pay - room, 0),
      existing_debts: existingDebts || 0, total_deductions: pay + (existingDebts || 0),
      salary_left: salary - pay - (existingDebts || 0), years_used: yrs, max_years: maxYears,
      years_capped: fin.years > maxYears,
      total_interest: pay * yrs * 12 - r.loan,
      early_settlement_fee_cap: Math.min(r.loan * m.early_settlement_cap_pct, m.early_settlement_cap_aed) };
  }

  // Cash vs mortgage: which costs less and which grows the money faster, same deal.
  function cashVsLoan(deal, fees, strategy) {
    if (!deal.financing) return null;
    const c = run(Object.assign({}, deal, { financing: null }), fees), l = run(deal, fees);
    const f = deal.financing, interest = l.monthly_payment * f.years * 12 - l.loan;
    const k = strategy && l.income[strategy] ? strategy : Object.keys(l.income)[0];
    if (!k) return null;
    return { cash: { cash_needed: c.cash_needed, monthly_net: c.income[k].cash_flow / 12, irr: c.exit[k].irr, profit: c.exit[k].total_profit },
      loan: { cash_needed: l.cash_needed, monthly_net: l.income[k].cash_flow / 12, irr: l.exit[k].irr, profit: l.exit[k].total_profit,
        monthly_payment: l.monthly_payment, total_interest: interest, extra_fees: l.upfront_fees_total - c.upfront_fees_total },
      strategy: k };
  }

  // Developer payment plan (off-plan, interest-free), the common UAE shape:
  // down payment at booking (+ registration fees), a monthly % of price every month until handover,
  // an extra % lump at each year-end before handover, the remainder at handover, optional post-handover share.
  function paymentPlan(deal, fees, plan) {
    const p = Object.assign({ down_pct: 0.2, monthly_pct: 0.01, annual_pct: 0.1, construction_months: 24,
      post_pct: 0, post_years: 0, start: null }, plan);
    const price = Number(deal.price), M = Math.max(Math.round(p.construction_months), 0);
    const r = run(Object.assign({}, deal, { financing: null }), fees);
    const feesAtSigning = r.upfront_fees_total - (r.upfront_fees.furnishing || 0);
    const down = price * p.down_pct, monthly = price * p.monthly_pct;
    const nAnnual = M > 0 ? Math.floor((M - 1) / 12) : 0;           // year-ends strictly before handover
    const annual = price * p.annual_pct;
    const monthlyTotal = monthly * M, annualTotal = annual * nAnnual;
    const handoverPct = 1 - p.down_pct - p.monthly_pct * M - p.annual_pct * nAnnual - p.post_pct;
    const handover = price * handoverPct, post = price * p.post_pct;
    const nPost = Math.round(p.post_years * 12), postMonthly = nPost > 0 ? post / nPost : 0;
    const lt = r.income.long_term, st = r.income.short_term;
    const rentMonthly = lt ? lt.net / 12 : st ? st.net / 12 : 0;
    const schedule = [{ m: 0, kind: "signing", amount: down + feesAtSigning }];
    for (let i = 1; i <= M; i++) {
      if (monthly > 0 && i < M) schedule.push({ m: i, kind: "monthly", amount: monthly });
      if (i % 12 === 0 && i < M && annual > 0) schedule.push({ m: i, kind: "annual", amount: annual });
    }
    schedule.push({ m: M, kind: "handover", amount: handover + (monthly > 0 ? monthly : 0) });
    for (let i = 1; i <= nPost; i++) schedule.push({ m: M + i, kind: "post", amount: postMonthly });
    let cum = 0;
    for (const it of schedule) { cum += it.amount; it.cumulative = cum; }
    let handoverDate = null, endDate = null;
    if (p.start && /^\d{4}-\d{2}$/.test(p.start)) {
      const [y, m] = p.start.split("-").map(Number);
      const add = (k) => { const t = (y * 12 + (m - 1)) + k; return Math.floor(t / 12) + "-" + String((t % 12) + 1).padStart(2, "0"); };
      handoverDate = add(M); endDate = add(M + nPost);
    }
    const months = Math.max(M, 1);
    const setAside = (monthlyTotal + annualTotal + handover) / months;
    return {
      sum_ok: handoverPct >= -1e-9, handover_pct: handoverPct,
      down_payment: down, fees_at_signing: feesAtSigning, pay_at_signing: down + feesAtSigning,
      monthly_instalment: monthly, monthly_count: M, monthly_total: monthlyTotal,
      annual_payment: annual, annual_count: nAnnual, annual_total: annualTotal,
      at_handover: handover, post_handover_total: post, post_monthly: postMonthly, post_yearly: postMonthly * 12,
      before_handover_pct: p.down_pct + p.monthly_pct * M + p.annual_pct * nAnnual,
      remaining_after_signing: price - down, remaining_before_handover: handover + post, remaining_after_handover: post,
      paid_by_handover: down + monthlyTotal + annualTotal + handover + feesAtSigning,
      handover_date: handoverDate, end_date: endDate,
      rent_net_monthly: rentMonthly, rent_covers_instalment: post > 0 ? rentMonthly >= postMonthly : true,
      monthly_gap: rentMonthly - postMonthly, total_paid: price + feesAtSigning, plan: p,
      schedule, monthly_set_aside: setAside, extra_over_instalment: setAside - monthly };
  }

  // Portfolio builder: start with cash, save monthly, reinvest all cash flow, buy another
  // unit like the current deal whenever cash covers down payment + fees. Yearly steps.
  function portfolio(deal, fees, opts) {
    const o = Object.assign({ start_cash: 0, monthly_savings: 0, rent_growth: 0.02, appreciation: 0.03,
      strategy: "long_term", horizon: 15, max_units: 50, salary: 0, existing_debts: 0 }, opts);
    const base = JSON.parse(JSON.stringify(deal));
    const P0 = Number(base.price), fin = base.financing;
    const unitAt = (y, isFirst, cashOnly) => {
      const g = Math.pow(1 + o.rent_growth, y), d = JSON.parse(JSON.stringify(base));
      if (cashOnly) d.financing = null;
      d.price = P0 * Math.pow(1 + o.appreciation, y);
      if (d.long_term) d.long_term.annual_rent *= g;
      if (d.short_term) d.short_term.adr *= g;
      if (!isFirst) d.first_home = false;
      const r = run(d, fees);
      const inc = r.income[o.strategy];
      const setup = o.strategy === "long_term" ? (r.upfront_fees.holiday_home_setup || 0) : 0;
      return { price: d.price, need: r.cash_needed - setup, loan: r.loan, pay: r.monthly_payment, noi: inc ? inc.net : 0 };
    };
    const units = [], snaps = {};
    let cash = o.start_cash;
    let blockedByIncome = 0;
    const monthlyInstalments = (y) => units.reduce((s, u) => s + (y - u.year < u.term ? u.pay / 12 : 0), 0);
    const buy = (y) => {
      while (units.length < o.max_units) {
        const first = units.length === 0;
        let u = fin ? unitAt(y, first, false) : null, financed = !!fin;
        if (fin && o.salary > 0) {
          const dbr = (monthlyInstalments(y) + u.pay + o.existing_debts) / o.salary;
          if (dbr > fees.ltv.dbr_max + 1e-9) { financed = false; blockedByIncome++; }
        }
        if (!financed) u = unitAt(y, first, true);
        if (cash < u.need) break;
        cash -= u.need;
        units.push({ year: y, price: u.price, loan: financed ? u.loan : 0, noi0: u.noi, financed,
          pay: financed ? pmt(u.loan, fin.rate, fin.years) * 12 : 0, term: financed ? fin.years : 0 });
      }
    };
    const state = (y) => {
      let value = 0, debtLeft = 0, noi = 0, debt = 0;
      for (const u of units) {
        const age = y - u.year;
        value += u.price * Math.pow(1 + o.appreciation, age);
        debtLeft += u.financed ? balanceAfter(u.loan, fin.rate, fin.years, age * 12) : 0;
        noi += u.noi0 * Math.pow(1 + o.rent_growth, age);
        if (age < u.term) debt += u.pay;
      }
      return { value, debtLeft, noi, debt };
    };
    buy(0);
    for (let y = 1; y <= o.horizon; y++) {
      const s = state(y - 1); // income earned during year y, with each unit's age at the start of that year
      cash += s.noi - s.debt + o.monthly_savings * 12;
      buy(y);
      {
        const e = state(y), contributed = o.start_cash + o.monthly_savings * 12 * y;
        const netYear = e.noi - e.debt;
        snaps[y] = { units: units.length, property_value: e.value, debt_left: e.debtLeft, cash,
          net_worth: e.value - e.debtLeft + cash, contributed,
          income_year: netYear, income_month: netYear / 12,
          income_year_debt_free: e.noi, income_month_debt_free: e.noi / 12,
          financed_units: units.filter((u) => u.financed).length };
      }
    }
    return { first_unit_need: unitAt(0, true, !fin).need, snapshots: snaps, blocked_by_income: blockedByIncome > 0 };
  }

  const api = { run, rightPrice, stress, portfolio, affordability, cashVsLoan, paymentPlan, loanFromPayment, pmt, balanceAfter, irr, strLicence };
  if (typeof module !== "undefined") module.exports = api; else root.AqarEngine = api;
})(this);
