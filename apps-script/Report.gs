/**
 * Fynd Finance Portal — report logic.
 *
 * Pure functions: raw sheet values (2-D arrays) in, the finance book as
 * plain JSON out. No SpreadsheetApp or network calls, so the same code
 * runs under Node for tests (see /test).
 */

var Report = (function () {

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var FY_ORDER = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

  /* ---------- parsing helpers ---------- */

  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function isDate(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v); }

  /** "1,23,456.7" -> 123456.7 ; "(500)" -> -500 ; "-" / "" / "#N/A" -> 0 */
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v == null) return 0;
    var s = String(v).trim();
    if (!s || s === '-') return 0;
    var neg = /^\(.*\)$/.test(s);
    s = s.replace(/[^0-9.\-]/g, '');
    var n = parseFloat(s);
    if (!isFinite(n)) return 0;
    return neg ? -Math.abs(n) : n;
  }

  /** Date | "Apr-26" | "Sep-26" | "2026-04-01" | "April 2026" -> {m:'Apr', y:2026} or null */
  function monthYear(v) {
    if (v == null || v === '') return null;
    if (isDate(v)) return { m: MON[v.getMonth()], y: v.getFullYear() };
    var s = String(v).trim();
    var iso = s.match(/^(\d{4})-(\d{1,2})/);
    if (iso) return { m: MON[parseInt(iso[2], 10) - 1], y: parseInt(iso[1], 10) };
    var t = s.match(/^([A-Za-z]{3})[A-Za-z]*[\s\-\/']*(\d{2,4})?/);
    if (t) {
      var i = MON.map(function (x) { return x.toLowerCase(); }).indexOf(t[1].toLowerCase());
      if (i < 0) return null;
      var y = t[2] ? parseInt(t[2], 10) : null;
      if (y != null && y < 100) y += 2000;
      return { m: MON[i], y: y };
    }
    return null;
  }

  function monthKey(my) { return my.m + '-' + String(my.y).slice(-2); }
  function monthSort(a, b) {
    var pa = monthYear(a), pb = monthYear(b);
    return (pa.y * 12 + MON.indexOf(pa.m)) - (pb.y * 12 + MON.indexOf(pb.m));
  }

  function mapHeaders(values, fields) {
    var best = { headerRow: -1, cols: {}, missing: Object.keys(fields), score: 0 };
    var limit = Math.min(values.length, 15);
    for (var r = 0; r < limit; r++) {
      var normRow = (values[r] || []).map(norm);
      var cols = {}, score = 0, missing = [];
      Object.keys(fields).forEach(function (f) {
        var hit = -1, al = fields[f];
        for (var a = 0; a < al.length && hit < 0; a++) hit = normRow.indexOf(norm(al[a]));
        if (hit >= 0) { cols[f] = hit; score++; } else missing.push(f);
      });
      if (score > best.score) best = { headerRow: r, cols: cols, missing: missing, score: score };
    }
    return best;
  }

  function records(values, fields) {
    var h = mapHeaders(values, fields), out = [];
    if (h.headerRow < 0) return { rows: out, header: h };
    var keys = Object.keys(h.cols);
    for (var r = h.headerRow + 1; r < values.length; r++) {
      var row = values[r] || [], rec = {}, any = false;
      for (var k = 0; k < keys.length; k++) {
        var v = row[h.cols[keys[k]]];
        rec[keys[k]] = v;
        if (v !== '' && v != null) any = true;
      }
      if (any) out.push(rec);
    }
    return { rows: out, header: h };
  }

  function makeCxoResolver(C) {
    var map = {};
    C.CXOS.forEach(function (c) { map[norm(c)] = c; });
    Object.keys(C.CXO_ALIASES || {}).forEach(function (a) { map[norm(a)] = C.CXO_ALIASES[a]; });
    return function (name) { return map[norm(name)] || null; };
  }

  function add(obj, k, v) { obj[k] = (obj[k] || 0) + v; }
  function add2(obj, a, b, v) { if (!obj[a]) obj[a] = {}; add(obj[a], b, v); }
  function total(o) { var s = 0; for (var k in o) if (o.hasOwnProperty(k)) s += o[k]; return s; }

  /* ---------- revenue ---------- */

  function buildRevenue(values, C, asOf, warnings, schema) {
    var D = C.UNIT_DIVISOR, R = C.TABS.REVENUE;
    var cxoOf = makeCxoResolver(C);
    var excl = R.excludePattern ? new RegExp(R.excludePattern, 'i') : null;
    var oth = R.otherIncomePattern ? new RegExp(R.otherIncomePattern, 'i') : null;
    var cy = norm(C.CY.key), ly = norm(C.LY.key);

    var rec = records(values || [], R.fields);
    schema.revenue = rec.header;

    var by = {}, lyBy = {}, other = {}, excluded = {}, unknown = {};
    var mix = { frequency: {}, bu: {}, ip: {}, region: {}, businessType: {}, revenueType: {}, entity: {} };
    var cust = {}, outstanding = {}, openCount = {};
    var lastInvoice = null;

    C.CXOS.forEach(function (c) { by[c] = { billed: {}, collected: {} }; lyBy[c] = {}; outstanding[c] = 0; openCount[c] = 0; });

    rec.rows.forEach(function (r) {
      var f = norm(r.fy);
      var isCy = f === cy, isLy = f === ly;
      if (!isCy && !isLy) return;
      var my = monthYear(r.month);
      if (!my) return;
      var m = my.m;
      var amt = num(r.amount) / D, rc = num(r.receipt) / D, os = num(r.outstanding) / D;
      var rt = String(r.revenueType || '');
      var c = cxoOf(r.cxo);

      if (excl && excl.test(rt)) { if (isCy) add(excluded, m, amt); return; }
      if (oth && oth.test(rt)) { if (isCy) { if (!other[m]) other[m] = { billed: 0, collected: 0 }; other[m].billed += amt; other[m].collected += rc; } return; }
      if (!c) { var u = String(r.cxo || '(blank)'); if (isCy) add(unknown, u, amt); return; }

      if (os > 0.0000001) { outstanding[c] += os; openCount[c]++; }

      if (isLy) { add(lyBy[c], m, amt); return; }

      add(by[c].billed, m, amt);
      add(by[c].collected, m, rc);
      add2(mix.frequency, c, String(r.frequency || 'Unspecified').trim() || 'Unspecified', amt);
      add2(mix.bu, c, String(r.bu || 'Unspecified').trim() || 'Unspecified', amt);
      add2(mix.ip, c, String(r.ip || 'Unspecified').trim() || 'Unspecified', amt);
      add2(mix.region, c, String(r.region || 'Unspecified').trim() || 'Unspecified', amt);
      add2(mix.businessType, c, String(r.businessType || 'Unspecified').trim() || 'Unspecified', amt);
      add2(mix.revenueType, c, rt.trim() || 'Unspecified', amt);
      add2(mix.entity, c, String(r.entity || 'Unspecified').trim() || 'Unspecified', amt);

      var name = String(r.customer || '(blank)').trim();
      var key = c + '|' + name;
      if (!cust[key]) cust[key] = { customer: name, cxo: c, billed: 0, collected: 0, invoices: 0 };
      cust[key].billed += amt; cust[key].collected += rc; cust[key].invoices++;

      var d = r.invoiceDate;
      var dd = isDate(d) ? d : (d ? new Date(String(d)) : null);
      if (dd && !isNaN(dd) && (!lastInvoice || dd > lastInvoice)) lastInvoice = dd;
    });

    // Months with billing this year, in FY order
    var seen = {};
    C.CXOS.forEach(function (c) { Object.keys(by[c].billed).forEach(function (m) { seen[m] = 1; }); });
    var months = FY_ORDER.filter(function (m) { return seen[m]; });
    var last = months[months.length - 1] || null;
    var ref = asOf ? new Date(asOf) : null;
    var partial = (last && ref && MON[ref.getMonth()] === last) ? last : null;

    // Same period last year: the same months, excluding a partial current month
    var compMonths = months.filter(function (m) { return m !== partial; });

    Object.keys(unknown).forEach(function (k) {
      warnings.push('Revenue Data rows with CXO "' + k + '" match no CXO: Rs ' + unknown[k].toFixed(2) + ' Cr this year left out.');
    });
    if (total(excluded) > 0) warnings.push('Inter-company / deposit rows left out this year: Rs ' + total(excluded).toFixed(2) + ' Cr.');

    // Top 50 customers per CXO keeps the payload small; the rest roll into one line
    var perCxo = {}, customers = [], rest = {};
    Object.keys(cust).map(function (k) { return cust[k]; })
      .sort(function (a, b) { return b.billed - a.billed; })
      .forEach(function (x) {
        perCxo[x.cxo] = (perCxo[x.cxo] || 0) + 1;
        if (perCxo[x.cxo] <= 50) { customers.push(x); return; }
        if (!rest[x.cxo]) rest[x.cxo] = { customer: '', cxo: x.cxo, billed: 0, collected: 0, invoices: 0, others: 0 };
        rest[x.cxo].billed += x.billed; rest[x.cxo].collected += x.collected; rest[x.cxo].invoices += x.invoices; rest[x.cxo].others++;
      });
    Object.keys(rest).forEach(function (c) { rest[c].customer = rest[c].others + ' other customers'; customers.push(rest[c]); });

    return {
      months: months, partialMonth: partial, compareMonths: compMonths,
      lastInvoiceDate: lastInvoice ? lastInvoice.toISOString().slice(0, 10) : null,
      byCxo: by, lyByCxo: lyBy,
      outstanding: outstanding, openInvoices: openCount,
      otherIncome: other, excluded: excluded,
      mix: mix, customers: customers
    };
  }

  /* ---------- CXO P/L ---------- */

  function buildPnl(values, C, warnings, schema) {
    var cxoOf = makeCxoResolver(C);
    var P = C.TABS.PNL;
    var childOf = {};
    Object.keys(P.children || {}).forEach(function (p) { P.children[p].forEach(function (k) { childOf[norm(k)] = p; }); });

    var blocks = {}, order = [], current = null, cols = null;
    (values || []).forEach(function (row) {
      row = row || [];
      var first = row[0];
      var my = monthYear(first);
      // Header row: a month in col A and at least three CXO names across
      if (my && my.y) {
        var hits = {}, n = 0;
        for (var i = 1; i < row.length; i++) { var c = cxoOf(row[i]); if (c && hits[c] == null) { hits[c] = i; n++; } }
        if (n >= 3) {
          current = monthKey(my);
          cols = hits;
          if (!blocks[current]) { blocks[current] = { lines: [], values: {} }; order.push(current); }
          return;
        }
      }
      if (!current) return;
      var label = String(first == null ? '' : first).replace(/:\s*$/, '').trim();
      if (!label || /^expenses$/i.test(label)) return;
      var b = blocks[current];
      if (b.values[label]) return; // first occurrence wins
      var vals = {}, any = false;
      Object.keys(cols).forEach(function (c) {
        var v = row[cols[c]];
        if (v !== '' && v != null) any = true;
        vals[c] = num(v) / C.UNIT_DIVISOR;
      });
      if (!any) return;
      b.lines.push(label);
      b.values[label] = vals;
      // EBITDA closes the block; rows after it are ignored until the next header
      if (/^ebitda$/i.test(label)) current = null;
    });

    order.sort(monthSort);
    // Union of lines in first-seen order
    var lines = [];
    order.forEach(function (m) { blocks[m].lines.forEach(function (l) { if (lines.indexOf(l) < 0) lines.push(l); }); });
    // Keep EBITDA last
    lines.sort(function (a, b) { return (/^ebitda$/i.test(a) ? 1 : 0) - (/^ebitda$/i.test(b) ? 1 : 0); });

    schema.pnl = { months: order, lines: lines };
    if (!order.length) warnings.push('No monthly blocks found on the CXO P/L tab.');

    var parent = {};
    lines.forEach(function (l) { if (childOf[norm(l)]) parent[l] = childOf[norm(l)]; });

    var data = {};
    order.forEach(function (m) { data[m] = blocks[m].values; });

    return { months: order, lines: lines, parent: parent, keyLines: P.keyLines, data: data };
  }

  /* ---------- order forms ---------- */

  function buildOrderForms(values, C, warnings, schema) {
    var cxoOf = makeCxoResolver(C), D = C.UNIT_DIVISOR;
    var rec = records(values || [], C.TABS.ORDER_FORM.fields);
    schema.orderForms = rec.header;
    var by = {}, list = [], unknown = 0;
    rec.rows.forEach(function (r) {
      if (!r.ofNo && !r.customer) return;
      if (/grand total/i.test(String(r.ofNo || ''))) return;
      var q = String(r.qtr || '');
      if (q && q.indexOf(C.CY.label) < 0) return;
      var c = cxoOf(r.cxo);
      if (!c) { unknown++; return; }
      var v = num(r.value) / D, a = num(r.annualised) / D;
      if (!by[c]) by[c] = { count: 0, value: 0, annualised: 0, byQtr: {} };
      by[c].count++; by[c].value += v; by[c].annualised += a;
      add(by[c].byQtr, q.split(' ')[0] || 'Q?', v);
      var d = r.signed, iso = isDate(d) ? d.toISOString().slice(0, 10) : String(d || '');
      list.push({ ofNo: String(r.ofNo || ''), customer: String(r.customer || ''), services: String(r.services || ''),
                  cxo: c, salesRep: String(r.salesRep || ''), qtr: q, signed: iso, term: num(r.term), value: v, annualised: a });
    });
    if (unknown) warnings.push(unknown + ' Order Form rows have a CXO that matches no CXO.');
    list.sort(function (a, b) { return a.signed < b.signed ? 1 : a.signed > b.signed ? -1 : 0; });
    return { byCxo: by, list: list };
  }

  /* ---------- reconciliation ---------- */

  function reconcile(values, rev, C, warnings) {
    if (!values || !values.length) return null;
    var cxoOf = makeCxoResolver(C);
    var rec = records(values, C.TABS.RECON.fields), out = [], seen = {};
    rec.rows.forEach(function (r) {
      var c = cxoOf(r.cxo);
      if (!c || seen[c]) return;   // first table on the tab only
      seen[c] = 1;
      var sheet = num(r.billed);   // already Rs Cr on this tab
      var mine = total(rev.byCxo[c] ? rev.byCxo[c].billed : {});
      out.push({ cxo: c, sheet: sheet, portal: mine, diff: mine - sheet });
      if (Math.abs(mine - sheet) > 0.05) {
        warnings.push(c + ': portal billed YTD ' + mine.toFixed(2) + ' vs Billed Collected summary ' + sheet.toFixed(2) + ' Cr.');
      }
    });
    return out;
  }

  /* ---------- build + filter ---------- */

  function build(input, C) {
    var warnings = [], schema = {};
    var revenue = buildRevenue(input.revenue, C, input.asOf, warnings, schema);
    var pnl = buildPnl(input.pnl, C, warnings, schema);
    var orderForms = buildOrderForms(input.orderForms, C, warnings, schema);
    var recon = reconcile(input.recon, revenue, C, warnings);
    if (schema.revenue && schema.revenue.missing.length) warnings.push('Revenue Data columns not found: ' + schema.revenue.missing.join(', '));
    if (schema.orderForms && schema.orderForms.missing.length) warnings.push('Order Form columns not found: ' + schema.orderForms.missing.join(', '));
    return {
      fy: { cy: C.CY.label, ly: C.LY.label },
      asOf: input.asOf || null,
      cxos: C.CXOS.slice(), separateLine: C.SEPARATE_LINE,
      revenue: revenue, pnl: pnl, orderForms: orderForms,
      recon: recon, warnings: warnings, schema: schema
    };
  }

  function pick(obj, keep) {
    var o = {};
    if (!obj) return o;
    keep.forEach(function (k) { if (obj.hasOwnProperty(k)) o[k] = obj[k]; });
    return o;
  }

  /**
   * access = { role: 'admin' } | { role: 'cxo', cxos: ['Ragini', 'Ronak'] }
   * A CXO view keeps only their own keys everywhere. Other income, excluded
   * rows, reconciliation, warnings and schema are admin only.
   */
  function filterFor(book, access) {
    if (access && access.role === 'admin') {
      var a = JSON.parse(JSON.stringify(book));
      a.viewer = { role: 'admin', cxos: book.cxos.slice() };
      return a;
    }
    var keep = (access && access.cxos || []).filter(function (c) { return book.cxos.indexOf(c) >= 0; });
    if (!keep.length) throw new Error('No CXO mapped to this account.');
    var r = book.revenue, p = book.pnl, o = book.orderForms;
    var mix = {};
    Object.keys(r.mix).forEach(function (k) { if (k !== 'revenueType') mix[k] = pick(r.mix[k], keep); });
    var pdata = {};
    p.months.forEach(function (m) {
      pdata[m] = {};
      Object.keys(p.data[m]).forEach(function (line) { pdata[m][line] = pick(p.data[m][line], keep); });
    });
    return {
      fy: book.fy, asOf: book.asOf,
      cxos: book.cxos.filter(function (c) { return keep.indexOf(c) >= 0; }),
      separateLine: null,
      revenue: {
        months: r.months, partialMonth: r.partialMonth, compareMonths: r.compareMonths,
        lastInvoiceDate: r.lastInvoiceDate,
        byCxo: pick(r.byCxo, keep), lyByCxo: pick(r.lyByCxo, keep),
        outstanding: pick(r.outstanding, keep), openInvoices: pick(r.openInvoices, keep),
        otherIncome: null, excluded: null, mix: mix,
        customers: r.customers.filter(function (x) { return keep.indexOf(x.cxo) >= 0; })
      },
      pnl: { months: p.months, lines: p.lines, parent: p.parent, keyLines: p.keyLines, data: pdata },
      orderForms: { byCxo: pick(o.byCxo, keep), list: o.list.filter(function (x) { return keep.indexOf(x.cxo) >= 0; }) },
      recon: null, warnings: [],
      viewer: { role: 'cxo', cxos: keep }
    };
  }

  return {
    build: build, filterFor: filterFor,
    _num: num, _monthYear: monthYear, _mapHeaders: mapHeaders, _cxoResolver: makeCxoResolver
  };
})();

if (typeof module !== 'undefined') module.exports = Report;
