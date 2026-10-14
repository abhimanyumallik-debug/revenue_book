// Run: node test/report.test.js
// Loads Config.gs + Report.gs as plain JS and checks the book against
// fixtures shaped exactly like the MIS tabs (headers copied from the sheet).
// Fixture amounts are small made-up figures, not company data, except the
// CXO P/L excerpt which uses the Sep-26 layout with round numbers.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ctx = {};
vm.createContext(ctx);
for (const f of ['Config.gs', 'Report.gs']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', f), 'utf8'), ctx);
}
vm.runInContext('this.CONFIG = CONFIG; this.Report = Report;', ctx);
const { CONFIG, Report } = ctx;
const C = JSON.parse(JSON.stringify(CONFIG));

let pass = 0;
function t(name, fn) { fn(); pass++; console.log('ok  ' + name); }
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);
const same = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);
const Cr = 1e7;

/* ---------- helpers ---------- */
t('num: Indian commas, brackets, dashes, #N/A', () => {
  assert.strictEqual(Report._num('1,23,456.5'), 123456.5);
  assert.strictEqual(Report._num('(8,638,646.94)'), -8638646.94);
  assert.strictEqual(Report._num('-'), 0);
  assert.strictEqual(Report._num('#N/A'), 0);
});

t('monthYear reads Month_YY, P&L headers, ISO dates and Date objects', () => {
  same(Report._monthYear('Apr-26'), { m: 'Apr', y: 2026 });
  same(Report._monthYear('Sep-26'), { m: 'Sep', y: 2026 });
  same(Report._monthYear('2026-10-07'), { m: 'Oct', y: 2026 });
  same(Report._monthYear(new Date(2026, 5, 3)), { m: 'Jun', y: 2026 });
  assert.strictEqual(Report._monthYear('Sell'), null);
});

/* ---------- Revenue Data fixture (real header row) ---------- */
const H = ['Company_Id','Company_Name','Invoice_date','Financial_Year','QTR','Month_YY','Week','Invoice_no','Voucher_Type',
  'Revenue_Netof_Tax','Revenue_inCr','Revenue_inLacs','Count','Receipt Amount','Outstanding','Receipt Date','Collection month',
  'collection_year','O/s_Status','Receipt QTR','Business_Unit','IP','Project','Region','CXO','Billing Entity','Revenue_Type',
  'Frequency','Narration','Customer Type','Business Type'];
function row(o) {
  const r = H.map(() => '');
  const set = (k, v) => { r[H.indexOf(k)] = v; };
  set('Company_Name', o.cust); set('Invoice_date', o.date); set('Financial_Year', o.fy); set('Month_YY', o.mon);
  set('Voucher_Type', o.vt || 'INV'); set('Revenue_Netof_Tax', o.amt); set('Receipt Amount', o.rc ?? '');
  set('Outstanding', o.os ?? 0); set('O/s_Status', o.os ? 'Open' : 'Closed'); set('Business_Unit', o.bu || 'Commerce');
  set('IP', o.ip || 'Storefront'); set('Region', o.reg || 'India'); set('CXO', o.cxo); set('Billing Entity', o.ent || 'FYND');
  set('Revenue_Type', o.rt || 'Subscription'); set('Frequency', o.freq || 'MRR'); set('Business Type', o.bt || 'Existing Business');
  return r;
}
const rev = [H,
  // FY27
  row({ cust: 'Alpha Retail', date: '2026-04-05', fy: 'FY2026-27', mon: 'Apr-26', cxo: 'Ragini', amt: '10,00,00,000', rc: '10,00,00,000' }),
  row({ cust: 'Alpha Retail', date: '2026-05-05', fy: 'FY2026-27', mon: 'May-26', cxo: 'Ragini', amt: 50000000, rc: 20000000, os: 30000000, freq: 'Variable', rt: 'Transaction Fees' }),
  row({ cust: 'Beta Foods', date: '2026-05-09', fy: 'FY2026-27', mon: 'May-26', cxo: 'Ragini', amt: -5000000, vt: 'CN', rc: -5000000 }),
  row({ cust: 'Gamma LLC', date: '2026-04-10', fy: 'FY2026-27', mon: 'Apr-26', cxo: 'Dharam', amt: 30000000, rc: 0, os: 30000000, reg: 'MEA', ent: 'Yavi', freq: 'QRR' }),
  row({ cust: 'Delta', date: '2026-10-07', fy: 'FY2026-27', mon: 'Oct-26', cxo: 'Ragini', amt: 10000000, os: 10000000 }),
  row({ cust: 'Reliance Group', date: '2026-04-30', fy: 'FY2026-27', mon: 'Apr-26', cxo: 'JCP', amt: 900000000, rc: 900000000, bu: 'JCP + Central Billing', ip: 'JCP' }),
  row({ cust: 'Reliance Group', date: '2026-04-30', fy: 'FY2026-27', mon: 'Apr-26', cxo: 'JCP', amt: 500000000, rc: 500000000, rt: 'Inter Company Deposit' }),
  row({ cust: 'Bank', date: '2026-04-30', fy: 'FY2026-27', mon: 'Apr-26', cxo: 'Central', amt: 800000, rc: 800000, rt: 'Other Income' }),
  row({ cust: 'Ghost', date: '2026-04-30', fy: 'FY2026-27', mon: 'Apr-26', cxo: 'Nobody', amt: 10000000 }),
  // FY26 same months
  row({ cust: 'Alpha Retail', date: '2025-04-05', fy: 'FY2025-26', mon: 'Apr-25', cxo: 'Ragini', amt: 80000000, rc: 80000000 }),
  row({ cust: 'Alpha Retail', date: '2025-05-05', fy: 'FY2025-26', mon: 'May-25', cxo: 'Ragini', amt: 40000000, rc: 30000000, os: 10000000 }),
  row({ cust: 'Old', date: '2024-05-05', fy: 'FY2024-25', mon: 'May-24', cxo: 'Ragini', amt: 99999999 })
];

/* ---------- CXO P/L fixture (real layout: header row per month) ---------- */
const PH = (m) => [m, 'Ragini', 'Ronak', 'Dharmendra', 'SMG', 'Salman', 'Debajit', 'Jigar', 'Kushan', 'Kavish', 'Central', 'JCP', '', 'Ragini + Ronak', 'Diff'];
const line = (label, rag, ron, jcp) => [label, rag, ron, '0', '0', '0', '0', '0', '0', '0', '0', jcp, '', '999', '0'];
const pnl = [
  PH('Sep-26'),
  line('Revenue', '21,500,000', '7,300,000', '295,000,000'),
  ['', '', ''],
  ['Expenses:'],
  line('Ops Cost', '4,600,000', '0', '0'),
  line('People Cost:', '17,300,000', '9,500,000', '96,000,000'),
  line('Build', '6,600,000', '3,000,000', '94,000,000'),
  line('Sell', '10,000,000', '5,800,000', '600,000'),
  line('Support', '700,000', '700,000', '1,400,000'),
  line('Total Expenses', '30,200,000', '12,800,000', '113,000,000'),
  [],
  line('EBITDA', '(8,700,000)', '(5,500,000)', '182,000,000'),
  ['Cost Savings', '1', '2'],
  [], [],
  PH('Aug-26'),
  line('Revenue', '18,300,000', '3,600,000', '309,000,000'),
  line('Total Expenses', '32,300,000', '13,100,000', '115,000,000'),
  line('EBITDA', '(14,000,000)', '(9,500,000)', '194,000,000')
];

/* ---------- Order Form fixture (real two-row header) ---------- */
const of = [
  ['SUM of INR Value', '', '', '', '', '', '', '', '', '', '', 'Segment'],
  ['Order_Form_No','Customer_Name','Services','Business Type','Sales_Representative','CXO','Region','QTR','Date_of_Signing','Signing Week','Order_Form_Term','AI Others','Commerce','Manufacturing','Media','Physical AI','Grand Total','Annualised Value'],
  ['1', 'Alpha Retail', 'Fynd Create', 'Diversified', 'Rep A', 'Ragini', 'India', 'Q1 FY27', '2026-06-22', '', '1', '', '', '4,000,000', '', '', '4,000,000', '4,000,000'],
  ['2', 'Alpha Retail', 'Fynd Create', 'Diversified', 'Rep A', 'Ragini', 'India', 'Q2 FY27', '2026-08-01', '', '2', '', '', '6,000,000', '', '', '6,000,000', '3,000,000'],
  ['3', 'Gamma LLC', 'Storefront', 'New', 'Rep B', 'Dharmendra', 'MEA', 'Q2 FY27', '2026-09-01', '', '1', '', '10,000,000', '', '', '', '10,000,000', '10,000,000'],
  ['4', 'Old Co', 'Storefront', 'New', 'Rep B', 'Ragini', 'India', 'Q4 FY26', '2026-02-01', '', '1', '', '1', '', '', '', '1', '1']
];

const recon = [['CXO', 'Billed', 'SUM of Receipt Amount', 'Collected', 'Billed as per report'],
  ['Ragini', '15.50', '', '', '15.50'], ['Dharmendra', '2.00', '', '', '2.00'], [], ['CXO', 'Billed'], ['Ragini', '99']];

const book = Report.build({ asOf: '2026-10-14T06:00:00Z', revenue: rev, pnl, orderForms: of, recon }, C);
const R = book.revenue;
const sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0);

/* ---------- revenue ---------- */
t('FY27 months in FY order, October flagged partial and left out of LY comparison', () => {
  same(R.months, ['Apr', 'May', 'Oct']);
  assert.strictEqual(R.partialMonth, 'Oct');
  same(R.compareMonths, ['Apr', 'May']);
});

t('billed nets credit notes, in Rs Cr', () => {
  close(R.byCxo.Ragini.billed.Apr, 10, 'Ragini Apr');
  close(R.byCxo.Ragini.billed.May, 4.5, 'Ragini May = 5.0 - 0.5 CN');
  close(sum(R.byCxo.Ragini.billed), 15.5, 'Ragini YTD');
});

t('collected by invoice month', () => {
  close(sum(R.byCxo.Ragini.collected), 11.5, 'Ragini collected');
});

t('CXO alias "Dharam" resolves to Dharmendra', () => {
  close(sum(R.byCxo.Dharmendra.billed), 3, 'Dharmendra');
});

t('same period last year uses FY26 rows only', () => {
  close(R.lyByCxo.Ragini.Apr, 8, 'LY Apr');
  close(R.lyByCxo.Ragini.May, 4, 'LY May');
  assert.ok(!R.lyByCxo.Ragini.Oct);
});

t('inter-company deposit dropped, other income on its own line', () => {
  close(sum(R.byCxo.JCP.billed), 90, 'JCP excl. deposit');
  close(R.excluded.Apr, 50, 'excluded');
  close(R.otherIncome.Apr.billed, 0.08, 'other income');
  close(sum(R.byCxo.Central.billed), 0, 'Central not credited with other income');
});

t('outstanding sums open amounts across FY26 and FY27', () => {
  close(R.outstanding.Ragini, 3 + 1 + 1, 'Ragini AR');
  assert.strictEqual(R.openInvoices.Ragini, 3);
});

t('mix by frequency, region and entity', () => {
  close(R.mix.frequency.Ragini.Variable, 5, 'Variable');
  close(R.mix.region.Dharmendra.MEA, 3, 'MEA');
  close(R.mix.entity.Dharmendra.Yavi, 3, 'Yavi');
});

t('customers ranked by billed', () => {
  const top = R.customers.filter(c => c.cxo === 'Ragini');
  assert.strictEqual(top[0].customer, 'Alpha Retail');
  close(top[0].billed, 15, 'Alpha FY27');
});

t('unknown CXO and excluded rows raise warnings', () => {
  assert.ok(book.warnings.some(w => w.includes('"Nobody"')));
  assert.ok(book.warnings.some(w => w.includes('Inter-company')));
});

/* ---------- P&L ---------- */
t('P&L blocks parsed and sorted Aug, Sep', () => {
  same(book.pnl.months, ['Aug-26', 'Sep-26']);
});

t('P&L values in Rs Cr, brackets negative, "People Cost:" colon stripped', () => {
  close(book.pnl.data['Sep-26'].Revenue.Ragini, 2.15, 'Rev');
  close(book.pnl.data['Sep-26'].EBITDA.Ragini, -0.87, 'EBITDA');
  close(book.pnl.data['Sep-26']['People Cost'].JCP, 9.6, 'People');
  assert.strictEqual(book.pnl.parent.Build, 'People Cost');
});

t('P&L ignores helper columns and rows after EBITDA', () => {
  assert.ok(!('Ragini + Ronak' in book.pnl.data['Sep-26'].Revenue));
  assert.ok(!book.pnl.lines.includes('Cost Savings'));
  assert.strictEqual(book.pnl.lines[book.pnl.lines.length - 1], 'EBITDA');
});

/* ---------- order forms ---------- */
t('order forms: FY27 only, by CXO and quarter', () => {
  const rg = book.orderForms.byCxo.Ragini;
  assert.strictEqual(rg.count, 2);
  close(rg.value, 1.0, 'value');
  close(rg.annualised, 0.7, 'annualised');
  close(rg.byQtr.Q2, 0.6, 'Q2');
  assert.strictEqual(book.orderForms.list[0].customer, 'Gamma LLC');
});

/* ---------- reconciliation ---------- */
t('reconciliation reads the first table only and matches', () => {
  const r = book.recon.find(x => x.cxo === 'Ragini');
  close(r.diff, 0, 'Ragini diff');
  assert.ok(!book.warnings.some(w => w.startsWith('Ragini: portal billed')));
  const d = book.recon.find(x => x.cxo === 'Dharmendra');
  close(d.diff, 1, 'Dharmendra diff');
  assert.ok(book.warnings.some(w => w.startsWith('Dharmendra: portal billed')));
});

/* ---------- access ---------- */
t('CXO view holds only their own numbers everywhere', () => {
  const v = Report.filterFor(book, { role: 'cxo', cxos: ['Ragini'] });
  const s = JSON.stringify(v);
  for (const other of ['Dharmendra', 'JCP', 'Gamma', 'Reliance', 'Ronak']) {
    assert.ok(!s.includes(other), `leaked ${other}`);
  }
  assert.strictEqual(v.revenue.otherIncome, null);
  assert.strictEqual(v.recon, null);
  assert.ok(!('schema' in v));
  assert.ok(!('revenueType' in v.revenue.mix));
  same(Object.keys(v.pnl.data['Sep-26'].EBITDA), ['Ragini']);
});

t('CXO with two areas sees both and nothing else', () => {
  const v = Report.filterFor(book, { role: 'cxo', cxos: ['Ragini', 'Dharmendra'] });
  same(v.cxos, ['Ragini', 'Dharmendra']);
  assert.ok(!JSON.stringify(v).includes('JCP'));
});

t('admin view holds everything', () => {
  const v = Report.filterFor(book, { role: 'admin' });
  assert.ok(v.revenue.byCxo.JCP && v.recon && v.schema);
});

t('no mapping refused', () => {
  assert.throws(() => Report.filterFor(book, { role: 'cxo', cxos: [] }));
  assert.throws(() => Report.filterFor(book, { role: 'cxo', cxos: ['Somebody'] }));
});

console.log(`\n${pass} checks passed`);
