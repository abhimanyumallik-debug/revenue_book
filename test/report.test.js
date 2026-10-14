// Run: node test/report.test.js
// Loads Config.gs and Report.gs as plain JS and checks the book rules
// against small fixtures built from the FY27 revenue book v0.7.
// Fixture months are the rounded page-3 figures, so sums can differ by 0.01.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ctx = { module: undefined };
vm.createContext(ctx);
for (const f of ['Config.gs', 'Report.gs']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', f), 'utf8'), ctx);
}
vm.runInContext('this.CONFIG = CONFIG; this.Report = Report;', ctx);
const { CONFIG, Report } = ctx;
const C = JSON.parse(JSON.stringify(CONFIG));
C.UNIT_DIVISOR = 1; // fixtures are already in Rs Cr

let pass = 0;
function t(name, fn) { fn(); pass++; console.log('ok  ' + name); }
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.015, `${msg}: ${a} vs ${b}`);

// ---- helpers
t('num parses Indian commas, brackets, dashes', () => {
  assert.strictEqual(Report._num('1,23,456.5'), 123456.5);
  assert.strictEqual(Report._num('(500)'), -500);
  assert.strictEqual(Report._num('-'), 0);
  assert.strictEqual(Report._num(''), 0);
});

t('monthOf reads dates and labels', () => {
  assert.strictEqual(Report._monthOf(new Date(2026, 3, 15)), 'Apr');
  assert.strictEqual(Report._monthOf('Sep-26'), 'Sep');
  assert.strictEqual(Report._monthOf('2026-08-01'), 'Aug');
  assert.strictEqual(Report._monthOf('July 2026'), 'Jul');
});

t('header row found below a title row, aliases matched', () => {
  const h = Report._mapHeaders([['MIS FY27'], [], ['PNL Owner', 'AOP/ Target']], C.TABS.SUMMARY.fields);
  assert.strictEqual(h.headerRow, 2);
  assert.strictEqual(h.missing.length, 0);
});

t('status rules follow v0.7 footnote', () => {
  const S = C.STATUS;
  assert.strictEqual(Report._classify({ ofStatus: 'Signed' }, S), 'signed');
  assert.strictEqual(Report._classify({ ofStatus: '', live: 'Yes' }, S), 'signed');
  assert.strictEqual(Report._classify({ invoicedYtd: 5 }, S), 'signed');
  assert.strictEqual(Report._classify({ ofStatus: 'OF sent for signing' }, S), 'sent');
  assert.strictEqual(Report._classify({ ofStatus: '', customerStatus: 'Proposal Sent' }, S), 'sent');
  assert.strictEqual(Report._classify({ ofStatus: 'Signed', customerStatus: 'Churned' }, S), 'dropped');
  assert.strictEqual(Report._classify({ ofStatus: 'Prospect' }, S), null);
});

// ---- fixture: Salman's and Ragini's billed months from page 3, plus JCP
const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
const billedRows = [['PNL Owner', 'Invoice Month', 'Amount', 'Amount Received', 'Revenue Type']];
const salB = [1.47, 2.00, 2.01, 2.02, 2.57, 2.83], salR = [1.30, 1.94, 1.93, 1.92, 0.99, 0.59];
const ragB = [1.30, 1.14, 3.25, 2.00, 1.83, 2.15], ragR = [1.18, 1.01, 3.09, 1.82, 0.87, 0.30];
const jcpB = [16.14, 20.23, 14.10, 17.02, 14.88, 13.50];
months.forEach((m, i) => {
  billedRows.push(['Salman', m + '-26', salB[i], salR[i], 'Recurring']);
  billedRows.push(['Ragini', m + '-26', ragB[i], ragR[i], 'MRR']);
  billedRows.push(['JCP', m + '-26', jcpB[i], jcpB[i], 'Recurring']);
});
billedRows.push(['Salman', 'Sep-26', 99, 99, 'Inter-company deposit']); // must be dropped
billedRows.push(['Central', 'Sep-26', 0.27, 0.27, 'Other Income']);      // own line
billedRows.push(['Unknown Person', 'Sep-26', 1, 1, 'MRR']);              // warning

const summary = [['CXO', 'AOP/ Target'], ['Salman', 219], ['Ragini', 1206], ['Jigar', 0]];

const ownerHdr = ['Customer Name', 'IP', 'Revenue Type', 'Order form status', 'Customer Status',
                  'Live', 'Invoiced Revenue (YTD)', 'Total Order Form Value', 'Estimated TCV', 'Expected Oct to Mar'];
const owners = {
  Salman: [ownerHdr,
    ['A', 'Logistics', 'Recurring', 'Signed', '', '', 5, 20, '', 12.23],         // signed, beyond 2.77
    ['B', 'Logistics', 'Recurring', 'Commercial Sent', '', '', 0, '', 18.51, 18.51], // sent, beyond 0
    ['C', 'Logistics', 'Recurring', 'Signed', 'Churned', '', 0, 50, '', 40]      // dropped
  ],
  Ragini: [ownerHdr,
    ['Cos Retail', 'Storefront', 'One Time', '', '', 'Yes', 0, 21.36, '', 14.64], // live, no OF
    ['D', 'TMS', 'MRR', '', 'Proposal Sent', '', 0, 10.78, '', 3.09]              // sent
  ]
};
const commitment = [['CXO', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
                    ['Salman', 1.10, 1, 0, 0, 1, 0, 0]];

const book = Report.build({ asOf: '2026-10-14', summary, billed: billedRows, owners, commitment }, C);
const g = Object.fromEntries(book.glance.map(r => [r.cxo, r]));

t('billed YTD matches page 3 (Salman 12.89, Ragini 11.66, JCP 95.87)', () => {
  close(g.Salman.billed, 12.89, 'Salman');
  close(g.Ragini.billed, 11.66, 'Ragini');
  close(g.JCP.billed, 95.87, 'JCP');
});

t('inter-company deposit dropped, other income on its own line', () => {
  close(book.billed.Salman.Sep, 2.83, 'Salman Sep');
  close(book.otherIncome.billed.Sep, 0.27, 'Other income Sep');
});

t('received by invoice month (Salman 8.68)', () => {
  close(Object.values(book.received.Salman).reduce((a, b) => a + b), 8.68, 'Salman received');
});

t('projection split and churned line excluded (Salman 30.74 = 12.23 + 18.51)', () => {
  close(book.projection.Salman.signed, 12.23, 'signed');
  close(book.projection.Salman.sent, 18.51, 'sent');
  close(g.Salman.projected, 30.74, 'projected');
  close(g.Salman.total, 43.63, 'FY27 total');
  close(g.Salman.pctOfTarget, 43.63 / 219, '% of target');
});

t('signed lines spread evenly; sent lines follow commitment months', () => {
  close(book.projection.Salman.signedMonths.Oct, 12.23 / 6, 'signed Oct');
  close(book.projection.Salman.sentMonths.Oct, 18.51 / 2, 'sent Oct');
  close(book.projection.Salman.sentMonths.Nov, 0, 'sent Nov');
  close(book.projection.Ragini.sentMonths.Oct, 3.09 / 6, 'Ragini even fallback');
});

t('live-without-OF counted in OF Signed and flagged', () => {
  close(book.projection.Ragini.signed, 14.64, 'Ragini signed');
  assert.strictEqual(book.liveWithoutOf.count, 1);
  close(book.liveWithoutOf.value, 14.64, 'live without OF value');
});

t('beyond FY27 = OF value - invoiced - expected, zero/negative left out', () => {
  close(book.beyond.Salman.signed, 2.77, 'Salman beyond signed');
  close(book.beyond.Salman.sent, 0, 'Salman beyond sent');
  close(book.beyond.Ragini.signed, 6.72, 'Cos Retail 6.72 like page 5');
  close(book.beyond.Ragini.sent, 7.69, 'Ragini beyond sent 7.69 like page 5');
});

t('September projected vs actual', () => {
  const s = book.sepCheck.find(x => x.cxo === 'Salman');
  close(s.diff, 1.73, 'diff');
  assert.strictEqual(Math.round(s.pct * 100), 257);
});

t('unmapped CXO raises a warning', () => {
  assert.ok(book.warnings.some(w => w.includes('Unknown Person')));
});

t('CXO view holds only their own numbers', () => {
  const v = Report.filterFor(book, { role: 'cxo', cxo: 'Ragini' });
  const s = JSON.stringify(v);
  assert.strictEqual(JSON.stringify(v.cxos), '["Ragini"]');
  assert.strictEqual(v.glance.length, 1);
  assert.ok(!s.includes('Salman'), 'no Salman anywhere');
  assert.ok(!s.includes('JCP'), 'no JCP anywhere');
  assert.strictEqual(v.otherIncome, null);
  assert.ok(!('schema' in v));
  assert.ok(v.beyondLines.every(l => l.cxo === 'Ragini'));
});

t('admin view holds everything', () => {
  const v = Report.filterFor(book, { role: 'admin' });
  assert.strictEqual(v.glance.length, C.CXOS.length + 1);
});

t('CXO with no mapping is refused', () => {
  assert.throws(() => Report.filterFor(book, { role: 'cxo', cxo: null }));
  assert.throws(() => Report.filterFor(book, { role: 'cxo', cxo: 'JCP' }));
});

console.log(`\n${pass} checks passed`);
