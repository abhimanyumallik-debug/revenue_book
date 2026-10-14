/**
 * Fynd Revenue Portal — report logic.
 *
 * Pure functions only: no SpreadsheetApp, no network. They take raw sheet
 * values (2-D arrays) and return the revenue book as plain JSON, so the same
 * code is unit-tested in Node (see /test).
 *
 * Rules follow the FY27 revenue book v0.7 footnotes.
 */

var Report = (function () {

  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function inList(value, list) {
    var v = norm(value);
    for (var i = 0; i < list.length; i++) if (norm(list[i]) === v) return true;
    return false;
  }

  /** "1,23,456.7" -> 123456.7 ; "(500)" -> -500 ; "-" / "" -> 0 */
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

  /** Date, "Apr-26", "April 2026", "2026-04-01", "04/2026" -> "Apr" */
  function monthOf(v) {
    if (v == null || v === '') return null;
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) {
      return MONTH_LABEL[v.getMonth()];
    }
    var s = String(v).trim().toLowerCase();
    for (var i = 0; i < MONTHS.length; i++) {
      if (s.indexOf(MONTHS[i]) === 0 || new RegExp('[^a-z]' + MONTHS[i]).test(' ' + s)) {
        return MONTH_LABEL[i];
      }
    }
    var m = s.match(/^(\d{4})[-\/](\d{1,2})/) || s.match(/^(\d{1,2})[-\/](\d{4})/);
    if (m) {
      var mm = parseInt(m[1].length === 4 ? m[2] : m[1], 10);
      if (mm >= 1 && mm <= 12) return MONTH_LABEL[mm - 1];
    }
    return null;
  }

  function truthy(v, liveValues) {
    if (v === true) return true;
    if (v === false || v == null) return false;
    return inList(v, liveValues);
  }

  /**
   * Locate the header row in the first 15 rows and map each field to a column.
   * Returns { headerRow, cols: {field: index}, missing: [field] }.
   */
  function mapHeaders(values, fields) {
    var best = { headerRow: -1, cols: {}, missing: Object.keys(fields), score: 0 };
    var limit = Math.min(values.length, 15);
    for (var r = 0; r < limit; r++) {
      var row = values[r] || [];
      var normRow = row.map(norm);
      var cols = {}, score = 0, missing = [];
      Object.keys(fields).forEach(function (f) {
        var aliases = fields[f], hit = -1;
        for (var a = 0; a < aliases.length && hit < 0; a++) {
          hit = normRow.indexOf(norm(aliases[a]));
        }
        if (hit >= 0) { cols[f] = hit; score++; } else { missing.push(f); }
      });
      if (score > best.score) best = { headerRow: r, cols: cols, missing: missing, score: score };
    }
    return best;
  }

  function records(values, fields) {
    var h = mapHeaders(values, fields);
    var out = [];
    if (h.headerRow < 0) return { rows: out, header: h };
    for (var r = h.headerRow + 1; r < values.length; r++) {
      var row = values[r] || [];
      var rec = {}, any = false;
      Object.keys(h.cols).forEach(function (f) {
        rec[f] = row[h.cols[f]];
        if (rec[f] !== '' && rec[f] != null) any = true;
      });
      if (any) out.push(rec);
    }
    return { rows: out, header: h };
  }

  function canonicalCxo(name, cxos, extra) {
    var all = cxos.concat(extra ? [extra] : []);
    var n = norm(name);
    if (!n) return null;
    for (var i = 0; i < all.length; i++) if (norm(all[i]) === n) return all[i];
    // "Dharam" style shorthand: prefix match
    for (var j = 0; j < all.length; j++) {
      var c = norm(all[j]);
      if (c.indexOf(n) === 0 || n.indexOf(c) === 0) return all[j];
    }
    return null;
  }

  function zeros(keys) { var o = {}; keys.forEach(function (k) { o[k] = 0; }); return o; }
  function sum(obj) { return Object.keys(obj).reduce(function (a, k) { return a + obj[k]; }, 0); }

  /** Classify one owner-tab line. Returns 'dropped' | 'signed' | 'sent' | null */
  function classify(rec, S) {
    if (inList(rec.ofStatus, S.dropped) || inList(rec.customerStatus, S.dropped)) return 'dropped';
    if (inList(rec.ofStatus, S.signedOf) || truthy(rec.live, S.liveValues) || num(rec.invoicedYtd) > 0) {
      return 'signed';
    }
    if (inList(rec.ofStatus, S.sentOf)) return 'sent';
    if (inList(rec.customerStatus, S.proposalCustomer) &&
        inList(rec.ofStatus == null ? '' : rec.ofStatus, S.proposalOfAllowed)) return 'sent';
    return null;
  }

  /**
   * Build the full book.
   * input = {
   *   asOf: ISO string,
   *   summary: 2-D values, billed: 2-D values,
   *   owners: { CXO: 2-D values }, commitment: 2-D values | null
   * }
   */
  function build(input, C) {
    var D = C.UNIT_DIVISOR || 1;
    var cxos = C.CXOS.slice();
    var sep = C.SEPARATE_LINE;
    var everyone = cxos.concat([sep]);
    var AM = C.ACTUAL_MONTHS, PM = C.PROJECTED_MONTHS;
    var warnings = [];
    var schema = {};

    // ---- Targets
    var targets = {};
    var sum1 = records(input.summary || [], C.TABS.SUMMARY.fields);
    schema.summary = sum1.header;
    sum1.rows.forEach(function (r) {
      var c = canonicalCxo(r.cxo, cxos, sep);
      if (c) targets[c] = (targets[c] || 0) + num(r.target) / D;
    });

    // ---- Billed and received by month
    var billed = {}, received = {};
    everyone.forEach(function (c) { billed[c] = zeros(AM); received[c] = zeros(AM); });
    var other = { billed: zeros(AM), received: zeros(AM) };
    var B = C.TABS.BILLED;
    var bl = records(input.billed || [], B.fields);
    schema.billed = bl.header;
    var unmapped = {};
    bl.rows.forEach(function (r) {
      if (B.excludeTypes && inList(r.type, B.excludeTypes)) return;
      var m = monthOf(r.month);
      if (!m || AM.indexOf(m) < 0) return;
      var b = num(r.billed) / D, rc = num(r.received) / D;
      if (B.otherIncomeTypes && inList(r.type, B.otherIncomeTypes)) {
        other.billed[m] += b; other.received[m] += rc; return;
      }
      var c = canonicalCxo(r.cxo, cxos, sep);
      if (!c) { unmapped[r.cxo || '(blank)'] = (unmapped[r.cxo || '(blank)'] || 0) + b; return; }
      billed[c][m] += b; received[c][m] += rc;
    });
    Object.keys(unmapped).forEach(function (k) {
      warnings.push('Billed rows with CXO "' + k + '" do not match any CXO: Rs ' + unmapped[k].toFixed(2) + ' Cr left out.');
    });

    // ---- Commitment weights (optional)
    var commit = {}, sepCommit = {};
    if (input.commitment && input.commitment.length) {
      var cf = { cxo: C.TABS.COMMITMENT.fields.cxo };
      PM.concat(['Sep']).forEach(function (m) { cf[m] = [m]; });
      var cm = records(input.commitment, cf);
      schema.commitment = cm.header;
      cm.rows.forEach(function (r) {
        var c = canonicalCxo(r.cxo, cxos, sep);
        if (!c) return;
        commit[c] = {};
        PM.forEach(function (m) { commit[c][m] = num(r[m]); });
        if (r.Sep != null && r.Sep !== '') sepCommit[c] = num(r.Sep) / D;
      });
    }

    // ---- Owner tabs: projections and beyond FY27
    var proj = {}, beyond = {}, lines = [], liveNoOf = { count: 0, value: 0 };
    cxos.forEach(function (c) {
      proj[c] = { signed: 0, sent: 0, signedMonths: zeros(PM), sentMonths: zeros(PM), hasTab: false };
      beyond[c] = { signed: 0, sent: 0 };
    });
    var O = C.TABS.OWNER;
    cxos.forEach(function (c) {
      var vals = input.owners && input.owners[c];
      if (!vals) return;
      proj[c].hasTab = true;
      var rr = records(vals, O.fields);
      schema['owner:' + c] = rr.header;
      rr.rows.forEach(function (r) {
        var k = classify(r, C.STATUS);
        if (k !== 'signed' && k !== 'sent') return;
        var exp = num(r.expected) / D;
        var inv = num(r.invoicedYtd) / D;
        var tcv = num(r.ofValue) || num(r.estTcv);
        tcv = tcv / D;
        var rest = tcv > 0 ? tcv - inv - exp : 0;
        if (k === 'signed') {
          proj[c].signed += exp;
          if (!inList(r.ofStatus, C.STATUS.signedOf)) { liveNoOf.count++; liveNoOf.value += exp; }
        } else {
          proj[c].sent += exp;
        }
        if (rest > 0.00001) {
          beyond[c][k] += rest;
          lines.push({ customer: String(r.customer || ''), cxo: c, ip: String(r.ip || ''),
                       revenueType: String(r.revenueType || ''), status: k, beyond: rest });
        }
      });
    });

    // Phase projections across months
    cxos.forEach(function (c) {
      var p = proj[c];
      PM.forEach(function (m) { p.signedMonths[m] = p.signed / PM.length; });
      var w = commit[c], wt = w ? sum(w) : 0;
      PM.forEach(function (m) {
        p.sentMonths[m] = wt > 0 ? p.sent * (w[m] / wt) : p.sent / PM.length;
      });
    });

    // ---- At a glance
    var glance = everyone.map(function (c) {
      var b = sum(billed[c]);
      var hasProj = c !== sep && proj[c] && proj[c].hasTab && (proj[c].signed + proj[c].sent) > 0;
      var p = hasProj ? proj[c].signed + proj[c].sent : null;
      var t = targets.hasOwnProperty(c) ? targets[c] : null;
      var total = b + (p || 0);
      return {
        cxo: c, billed: b, projected: p, total: total, target: t,
        pctOfTarget: t ? total / t : null, separate: c === sep
      };
    });

    // ---- September check
    var sepCheck = null;
    if (Object.keys(sepCommit).length) {
      sepCheck = cxos.filter(function (c) { return sepCommit.hasOwnProperty(c); }).map(function (c) {
        var a = billed[c].Sep || 0;
        return { cxo: c, projected: sepCommit[c], billed: a, diff: a - sepCommit[c],
                 pct: sepCommit[c] ? a / sepCommit[c] : null };
      });
    }

    lines.sort(function (a, b) { return b.beyond - a.beyond; });

    return {
      fy: C.FY_LABEL,
      asOf: input.asOf || null,
      months: { actual: AM, projected: PM },
      cxos: cxos, separateLine: sep,
      glance: glance,
      billed: billed, received: received, otherIncome: other,
      sepCheck: sepCheck,
      projection: proj,
      beyond: beyond, beyondLines: lines,
      liveWithoutOf: liveNoOf,
      warnings: warnings,
      schema: schema
    };
  }

  /**
   * Cut the book down to what this viewer may see.
   * access = { role: 'admin' } or { role: 'cxo', cxo: 'Ragini' }
   * Non-admins get only their own CXO; totals, JCP, other income and
   * schema diagnostics are removed.
   */
  function filterFor(book, access) {
    if (access && access.role === 'admin') {
      var a = JSON.parse(JSON.stringify(book));
      a.viewer = { role: 'admin', cxos: book.cxos };
      return a;
    }
    var me = access && access.cxo;
    if (!me || book.cxos.indexOf(me) < 0) throw new Error('No CXO mapped to this account.');
    function only(obj) { var o = {}; if (obj && obj.hasOwnProperty(me)) o[me] = obj[me]; return o; }
    return {
      fy: book.fy, asOf: book.asOf, months: book.months,
      cxos: [me], separateLine: null,
      glance: book.glance.filter(function (g) { return g.cxo === me; }),
      billed: only(book.billed), received: only(book.received), otherIncome: null,
      sepCheck: book.sepCheck ? book.sepCheck.filter(function (s) { return s.cxo === me; }) : null,
      projection: only(book.projection),
      beyond: only(book.beyond),
      beyondLines: book.beyondLines.filter(function (l) { return l.cxo === me; }),
      liveWithoutOf: null,
      warnings: [],
      viewer: { role: 'cxo', cxos: [me] }
    };
  }

  return {
    build: build, filterFor: filterFor,
    // exported for tests
    _num: num, _monthOf: monthOf, _classify: classify, _mapHeaders: mapHeaders, _canonicalCxo: canonicalCxo
  };
})();

if (typeof module !== 'undefined') module.exports = Report;
