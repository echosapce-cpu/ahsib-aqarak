const E = require('../web/engine.js'); const fs=require('fs'); const {execFileSync}=require('child_process');
const fees = JSON.parse(fs.readFileSync('scripts/fees.json'));
const cases=[];
for (const em of Object.keys(fees.emirates)) for (const fin of [null,{ltv:0.6,rate:0.045,years:25}]) for (const buyer of ['national','expat'])
  cases.push({price:850000,emirate:em,buyer,size_sqft:650,bedrooms:1,service_charge_psf:14,furnishing:20000,chiller_monthly:350,service_charge_annual:(buyer==="expat"?9000:null),financing:fin,
    long_term:{annual_rent:55000},short_term:{adr:480,occupancy:0.62},exit:{years:6,appreciation:0.025}});
let bad=0;
function cmp(a,b,path){ if (typeof a==='number'&&typeof b==='number'){ if(Math.abs(a-b)>1e-6*Math.max(1,Math.abs(b))){bad++;console.log('DIFF',path,a,b);} return;}
  if (a&&typeof a==='object'&&b&&typeof b==='object') for(const k of Object.keys(b)) if(k!=='assumptions'&&k!=='warnings'&&k!=='nights'&&k!=='vat_registration_required') cmp(a[k],b[k],path+'.'+k); }
for (const c of cases){ fs.writeFileSync(require('path').join(require('os').tmpdir(),'aqar-parity.json'),JSON.stringify(c));
  const py=JSON.parse(execFileSync('python3',['-c',`import json,sys;sys.path.insert(0,'scripts');import calc;print(json.dumps(calc.run(json.load(open('${require('path').join(require('os').tmpdir(),'aqar-parity.json')}')),json.load(open('scripts/fees.json'))),default=str))`]));
  cmp(E.run(c,fees),py,c.emirate+'/'+c.buyer+'/'+(c.financing?'fin':'cash')); }
const rp=E.rightPrice(cases[0],fees,'long_term',0.05); const chk=E.run(Object.assign({},cases[0],{price:rp}),fees).income.long_term.net_yield;
console.log('cases',cases.length,'diffs',bad,'rightPrice',Math.round(rp),'yield at rp',chk.toFixed(5));
// portfolio invariant: cash purchase, zero growth/savings -> after 5 years cash = 5 * net income, 1 unit
{ const deal=Object.assign({},cases[0],{financing:null,short_term:null,emirate:'abu_dhabi'});
  const need=E.portfolio(deal,fees,{}).first_unit_need;
  const p=E.portfolio(deal,fees,{start_cash:need,monthly_savings:0,rent_growth:0,appreciation:0});
  const noi=E.run(deal,fees).income.long_term.net, s=p.snapshots[5];
  const ok=s.units===1 && Math.abs(s.cash-5*noi)<1e-6 && Math.abs(s.income_year-noi)<1e-6;
  console.log('portfolio invariant', ok?'PASS':'FAIL', s.units, Math.round(s.cash), Math.round(5*noi)); if(!ok) process.exit(1); }
// affordability: payment check and inverse annuity round-trip
{ const d=Object.assign({},cases[0],{financing:{ltv:0.6,rate:0.045,years:25}});
  const a=E.affordability(d,fees,30000,4000), pay=E.run(d,fees).monthly_payment;
  const rt=Math.abs(E.pmt(E.loanFromPayment(5000,0.045,25),0.045,25)-5000)<1e-6;
  const ok=rt && Math.abs(a.room-11000)<1e-9 && a.ok===(pay<=11000);
  const b=E.affordability(d,fees,8000,3000); // room 1000 -> not ok
  const ok2=!b.ok && Math.abs(b.debt_to_clear-(b.payment-1000))<1e-6;
  console.log('affordability', ok&&ok2?'PASS':'FAIL', Math.round(pay), Math.round(a.max_loan)); if(!(ok&&ok2)) process.exit(1);
  const p=E.portfolio(d,fees,{start_cash:400000,monthly_savings:8000,salary:20000,existing_debts:2000});
  const s=p.snapshots[15]; console.log('portfolio w/ salary: units',s.units,'financed',s.financed_units,'blocked',p.blocked_by_income,'inc/m',Math.round(s.income_month)); }
