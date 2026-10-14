/* Fynd revenue book — front end.
 * Signs the viewer in with Google, sends the ID token to the Apps Script
 * data layer, and renders whatever book comes back. The server decides what
 * this viewer may see; this file never holds numbers of its own.
 *
 * Preview without the backend: add ?demo=admin or ?demo=cxo to the URL.
 * Demo numbers are random and labelled as sample data.
 */
(function () {
  'use strict';
  var CFG = window.PORTAL_CONFIG || {};
  var state = { token: null, book: null, filter: '' };
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- formatting ---------- */
  function f2(v) {
    if (v == null) return '';
    var r = Math.round(v * 100) / 100;
    if (Math.abs(r) < 0.005) return '0';
    return r.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function f0(v) { return v == null ? '' : Math.round(v).toLocaleString('en-IN'); }
  function pct(v, d) { return v == null ? '' : (v * 100).toFixed(d == null ? 1 : d) + '%'; }
  function sumObj(o) { return Object.keys(o || {}).reduce(function (a, k) { return a + (o[k] || 0); }, 0); }

  /* ---------- DOM helpers (text only, never innerHTML for data) ---------- */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'cls') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function cell(v, kind) {
    // kind: 'l' text, 'n' number, '0' integer, 'p' percent, 'd' signed diff, 'na' note
    if (kind === 'l') return el('td', { cls: 'l', text: v == null ? '' : String(v) });
    if (kind === 'na') return el('td', { cls: 'na', text: v });
    if (kind === 'p') return el('td', { text: v == null ? '' : v });
    if (kind === '0') return el('td', { text: f0(v) });
    if (kind === 'd') {
      var s = (v > 0 ? '+' : '') + f2(v);
      return el('td', { cls: v > 0 ? 'pos' : v < 0 ? 'neg' : '', text: s });
    }
    var t = el('td', { text: f2(v) });
    if (v != null && Math.abs(v) < 0.005) t.className = 'z';
    return t;
  }
  function table(headers, rows) {
    var thead = el('thead', null, [el('tr', null, headers.map(function (h) { return el('th', { text: h }); }))]);
    var tbody = el('tbody', null, rows.map(function (r) {
      var tr = el('tr', r.cls ? { cls: r.cls } : null, r.cells);
      return tr;
    }));
    return el('div', { cls: 'tw' }, [el('table', null, [thead, tbody])]);
  }
  function head(sec, title, sub) {
    sec.textContent = '';
    sec.appendChild(el('h2', { text: title }));
    if (sub) sec.appendChild(el('p', { cls: 'sub', text: sub }));
  }
  function note(boldLead, text) {
    var p = el('p', { cls: 'note' });
    if (boldLead) p.appendChild(el('b', { text: boldLead + ' ' }));
    p.appendChild(document.createTextNode(text));
    return p;
  }

  /* ---------- views ---------- */
  function visibleCxos(b) {
    return state.filter ? b.cxos.filter(function (c) { return c === state.filter; }) : b.cxos;
  }
  function isAll(b) { return b.viewer.role === 'admin' && !state.filter; }

  function renderGlance(b) {
    var sec = $('s-glance');
    head(sec, b.fy + ' at a glance', 'Billed so far and projected to March, by CXO. Rs Cr.');
    var show = visibleCxos(b);
    var rows = [], tot = { b: 0, p: 0, t: 0, tg: 0 };
    b.glance.filter(function (g) { return !g.separate && show.indexOf(g.cxo) >= 0; }).forEach(function (g) {
      tot.b += g.billed; tot.p += g.projected || 0; tot.t += g.total; tot.tg += g.target || 0;
      rows.push({ cells: [
        cell(g.cxo, 'l'), cell(g.billed),
        g.projected == null ? cell('not projected', 'na') : cell(g.projected),
        cell(g.total), cell(g.target, '0'), cell(g.target ? pct(g.pctOfTarget) : '', 'p')
      ] });
    });
    if (isAll(b)) {
      rows.push({ cls: 'total', cells: [cell('Total excluding ' + b.separateLine, 'l'), cell(tot.b), cell(tot.p),
        cell(tot.t), cell(tot.tg, '0'), cell(tot.tg ? pct(tot.t / tot.tg) : '', 'p')] });
      var j = b.glance.filter(function (g) { return g.separate; })[0];
      if (j) {
        rows.push({ cells: [cell(j.cxo, 'l'), cell(j.billed), cell('not projected', 'na'), cell(j.total),
          j.target == null ? cell('none on sheet', 'na') : cell(j.target, '0'), cell('', 'p')] });
        var all = tot.t + j.total;
        rows.push({ cls: 'total', cells: [cell('Total including ' + j.cxo, 'l'), cell(tot.b + j.billed), cell(tot.p),
          cell(all), cell(tot.tg, '0'), cell(tot.tg ? pct(all / tot.tg) : '', 'p')] });
      }
      if (b.otherIncome) rows.push({ cls: 'aside', cells: [cell('Other income (non-operating), not in totals', 'l'),
        cell(sumObj(b.otherIncome.billed)), cell('', 'p'), cell('', 'p'), cell('', 'p'), cell('', 'p')] });
    }
    sec.appendChild(table(['CXO', 'Billed YTD (Apr to Sep)', 'Projected (Oct to Mar)', b.fy + ' total', 'AOP/ Target', b.fy + ' total as % of target'], rows));
    sec.appendChild(note(null, 'AOP/ Target is from the Summary tab. Billed YTD leaves out inter-company deposit rows. Projected is the expected October to March figure across OF Signed and Commercials Sent; Churned, Expired and Dropped lines are left out. Where a CXO has no projection, the total is billed only.'));
    if (isAll(b)) sec.appendChild(note('Other income (non-operating).', 'Interest income, proceeds from selling old assets and similar rows tagged Other Income. Not revenue, so shown on its own line and left out of totals and the target comparison.'));
  }

  function monthTable(b, key, label) {
    var M = b.months.actual, show = visibleCxos(b), rows = [], colT = {};
    M.forEach(function (m) { colT[m] = 0; });
    show.forEach(function (c) {
      var v = b[key][c]; if (!v) return;
      M.forEach(function (m) { colT[m] += v[m] || 0; });
      rows.push({ cells: [cell(c, 'l')].concat(M.map(function (m) { return cell(v[m] || 0); }), [cell(sumObj(v))]) });
    });
    if (isAll(b)) {
      rows.push({ cls: 'total', cells: [cell('Total excluding ' + b.separateLine, 'l')].concat(M.map(function (m) { return cell(colT[m]); }), [cell(sumObj(colT))]) });
      var j = b[key][b.separateLine];
      if (j) {
        rows.push({ cells: [cell(b.separateLine, 'l')].concat(M.map(function (m) { return cell(j[m] || 0); }), [cell(sumObj(j))]) });
        rows.push({ cls: 'total', cells: [cell('Total including ' + b.separateLine, 'l')].concat(M.map(function (m) { return cell(colT[m] + (j[m] || 0)); }), [cell(sumObj(colT) + sumObj(j))]) });
      }
      if (b.otherIncome) {
        var o = b.otherIncome[key];
        rows.push({ cls: 'aside', cells: [cell('Other income, not in totals', 'l')].concat(M.map(function (m) { return cell(o[m] || 0); }), [cell(sumObj(o))]) });
      }
    }
    return el('div', null, [el('h3', { text: label }), table(['CXO'].concat(M, ['Total']), rows)]);
  }

  function renderActuals(b) {
    var sec = $('s-actuals');
    head(sec, b.fy + ' actuals, April to September', 'By CXO and invoice month. Rs Cr.');
    sec.appendChild(el('div', { cls: 'grid2' }, [monthTable(b, 'billed', 'Billed'), monthTable(b, 'received', 'Received')]));
    sec.appendChild(note(null, 'Received is receipts recorded against invoices raised in that month, whenever the money arrived.'));
  }

  function renderSep(b) {
    var sec = $('s-sep'); sec.textContent = '';
    if (!b.sepCheck || !b.sepCheck.length) return;
    var show = visibleCxos(b);
    var list = b.sepCheck.filter(function (s) { return show.indexOf(s.cxo) >= 0; });
    if (!list.length) return;
    head(sec, 'September, projected against actual', 'Commitment entered by each owner against what was billed. Rs Cr.');
    var t = { p: 0, a: 0 };
    var rows = list.map(function (s) {
      t.p += s.projected; t.a += s.billed;
      return { cells: [cell(s.cxo, 'l'), cell(s.projected), cell(s.billed), cell(s.diff, 'd'), cell(s.pct == null ? '' : pct(s.pct, 0), 'p')] };
    });
    if (isAll(b)) rows.push({ cls: 'total', cells: [cell('Total', 'l'), cell(t.p), cell(t.a), cell(t.a - t.p, 'd'), cell(t.p ? pct(t.a / t.p, 0) : '', 'p')] });
    sec.appendChild(table(['CXO', 'Projected for Sep', 'Billed in Sep', 'Difference', 'Billed as % of projected'], rows));
    sec.appendChild(note(null, 'Several owners entered less for September than their recurring billing alone, so a large positive difference means the projection was low, not that sales beat it.'));
  }

  function renderProj(b) {
    var sec = $('s-proj');
    head(sec, b.fy + ' projections, October to March', 'Expected revenue by CXO and reporting status. Rs Cr.');
    var show = visibleCxos(b), P = b.months.projected;
    var list = show.filter(function (c) { var p = b.projection[c]; return p && (p.signed + p.sent) > 0; });
    var grand = list.reduce(function (a, c) { return a + b.projection[c].signed + b.projection[c].sent; }, 0);
    var t = { s: 0, c: 0 };
    var rows = list.map(function (c) {
      var p = b.projection[c]; t.s += p.signed; t.c += p.sent;
      return { cells: [cell(c, 'l'), cell(p.signed), cell(p.sent), cell(p.signed + p.sent), cell(grand ? pct((p.signed + p.sent) / grand, 0) : '', 'p')] };
    });
    if (list.length > 1) rows.push({ cls: 'total', cells: [cell('Total', 'l'), cell(t.s), cell(t.c), cell(t.s + t.c), cell('100%', 'p')] });
    if (!list.length) { sec.appendChild(el('p', { cls: 'muted', text: 'No projection lines on the owner tab.' })); return; }
    sec.appendChild(table(['CXO', 'OF Signed', 'Commercials Sent', 'Total', 'Share'], rows));

    function monthly(key, label) {
      var colT = {}; P.forEach(function (m) { colT[m] = 0; });
      var rs = list.map(function (c) {
        var v = b.projection[c][key];
        P.forEach(function (m) { colT[m] += v[m]; });
        return { cells: [cell(c, 'l')].concat(P.map(function (m) { return cell(v[m]); }), [cell(sumObj(v))]) };
      });
      if (list.length > 1) rs.push({ cls: 'total', cells: [cell('Total', 'l')].concat(P.map(function (m) { return cell(colT[m]); }), [cell(sumObj(colT))]) });
      return el('div', null, [el('h3', { text: label }), table(['CXO'].concat(P, ['Total']), rs)]);
    }
    sec.appendChild(el('div', { cls: 'grid2' }, [monthly('signedMonths', 'OF Signed'), monthly('sentMonths', 'Commercials Sent')]));
    var lw = b.liveWithoutOf && b.liveWithoutOf.count && isAll(b)
      ? ' OF Signed includes ' + b.liveWithoutOf.count + ' lines that are live or billing without a signed order form, worth Rs ' + f2(b.liveWithoutOf.value) + ' Cr of the expected figure.' : '';
    sec.appendChild(note('How status is set.', 'OF Signed: order form Signed, or the line is Live, or Invoiced Revenue (YTD) above zero. Commercials Sent: order form sent for signing or Commercial Sent, or Customer Status Proposal Sent with order form blank.' + lw + ' Months are an estimate: signed lines spread evenly, unsigned lines follow the owner commitment months where given.'));
  }

  function renderBeyond(b) {
    var sec = $('s-beyond');
    head(sec, 'Revenue beyond ' + b.fy, 'Contract value still to bill after March, by CXO. Rs Cr.');
    var show = visibleCxos(b), t = { s: 0, c: 0 };
    var rows = show.filter(function (c) { return b.beyond[c]; }).map(function (c) {
      var x = b.beyond[c]; t.s += x.signed; t.c += x.sent;
      return { cells: [cell(c, 'l'), cell(x.signed), cell(x.sent), cell(x.signed + x.sent)] };
    });
    if (rows.length > 1) rows.push({ cls: 'total', cells: [cell('Total', 'l'), cell(t.s), cell(t.c), cell(t.s + t.c)] });
    sec.appendChild(table(['CXO', 'OF Signed', 'Commercials Sent', 'Total beyond ' + b.fy], rows));

    function top(status, label) {
      var all = b.beyondLines.filter(function (l) { return l.status === status && show.indexOf(l.cxo) >= 0; });
      var head7 = all.slice(0, 7), rest = all.slice(7);
      var rs = head7.map(function (l) {
        return { cells: [cell(l.customer, 'l'), cell(l.cxo, 'l'), cell(l.ip, 'l'), cell(l.revenueType, 'l'), cell(l.beyond)] };
      });
      if (rest.length) rs.push({ cls: 'aside', cells: [cell(rest.length + ' other lines', 'l'), cell('', 'l'), cell('', 'l'), cell('', 'l'),
        cell(rest.reduce(function (a, l) { return a + l.beyond; }, 0))] });
      if (!rs.length) rs.push({ cells: [cell('None', 'l'), cell('', 'l'), cell('', 'l'), cell('', 'l'), cell('', 'p')] });
      return el('div', null, [el('h3', { text: label }), table(['Customer name', 'CXO', 'IP', 'Revenue type', 'Beyond ' + b.fy], rs)]);
    }
    sec.appendChild(el('div', { cls: 'grid2' }, [top('signed', 'Largest OF Signed lines'), top('sent', 'Largest Commercials Sent lines')]));
    sec.appendChild(note('How this is worked out.', 'For each line: Total Order Form Value (Estimated TCV where blank), less Invoiced Revenue (YTD), less expected October to March. Zero or negative lines and lines with no contract value are left out. Billing before April is not on the sheet, so order forms signed before this year are overstated. Commercials Sent is unsigned and is not a forecast.'));
  }

  function render() {
    var b = state.book;
    $('asof').textContent = b.asOf ? new Date(b.asOf).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) + ' IST' : '';
    $('viewlabel').textContent = b.viewer.role === 'admin' ? 'All CXOs (admin)' : b.cxos[0] + ' only';
    var fw = $('filter-wrap');
    if (b.viewer.role === 'admin') {
      fw.hidden = false;
      var sel = $('filter');
      if (sel.options.length === 1) b.cxos.forEach(function (c) { sel.appendChild(el('option', { value: c, text: c })); });
    }
    var w = $('warnings'); w.textContent = '';
    if (b.warnings && b.warnings.length) {
      w.hidden = false;
      w.appendChild(el('b', { text: 'Sheet checks (admins only)' }));
      w.appendChild(el('ul', null, b.warnings.map(function (x) { return el('li', { text: x }); })));
    } else { w.hidden = true; }
    renderGlance(b); renderActuals(b); renderSep(b); renderProj(b); renderBeyond(b);
    $('gate').hidden = true; $('report').hidden = false;
  }

  /* ---------- data ---------- */
  function call(payload) {
    return fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(payload) })
      .then(function (r) { if (!r.ok) throw new Error('Server error ' + r.status); return r.json(); });
  }

  function load(refresh) {
    $('loading').hidden = false; $('refresh').disabled = true;
    call({ idToken: state.token, action: 'book', refresh: !!refresh }).then(function (res) {
      if (!res.ok) throw new Error(res.error);
      state.book = res.book;
      $('who').textContent = res.book.viewer.email || '';
      $('signout').hidden = false;
      render();
    }).catch(function (e) {
      showGate(e.message || String(e));
    }).then(function () { $('loading').hidden = true; $('refresh').disabled = false; });
  }

  function showGate(msg) {
    $('report').hidden = true; $('gate').hidden = false;
    var g = $('gate-error');
    g.hidden = !msg; g.textContent = msg || '';
  }

  function onCredential(resp) {
    state.token = resp.credential;
    $('gate-error').hidden = true;
    load(false);
  }

  function initGoogle() {
    if (!window.google || !google.accounts || !google.accounts.id) { setTimeout(initGoogle, 150); return; }
    google.accounts.id.initialize({
      client_id: CFG.CLIENT_ID, callback: onCredential, hd: CFG.DOMAIN,
      auto_select: true, cancel_on_tap_outside: false
    });
    google.accounts.id.renderButton($('signin'), { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'rectangular' });
    google.accounts.id.prompt();
  }

  /* ---------- demo (random sample numbers, not company data) ---------- */
  function demoBook(role) {
    var cx = ['CXO A', 'CXO B', 'CXO C', 'CXO D'], AM = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'], PM = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    var seed = 7; function r(n) { seed = (seed * 9301 + 49297) % 233280; return Math.round(seed / 233280 * n * 100) / 100; }
    var b = { fy: 'FY27', asOf: new Date().toISOString(), months: { actual: AM, projected: PM }, cxos: cx, separateLine: 'Central line',
      glance: [], billed: {}, received: {}, otherIncome: { billed: {}, received: {} }, projection: {}, beyond: {}, beyondLines: [],
      sepCheck: [], liveWithoutOf: { count: 3, value: 1.5 }, warnings: ['Sample data. Not company numbers.'], viewer: { role: 'admin', email: 'demo' } };
    cx.concat(['Central line']).forEach(function (c) {
      b.billed[c] = {}; b.received[c] = {};
      AM.forEach(function (m) { var v = r(3); b.billed[c][m] = v; b.received[c][m] = v * 0.8; });
    });
    AM.forEach(function (m) { b.otherIncome.billed[m] = r(0.1); b.otherIncome.received[m] = b.otherIncome.billed[m]; });
    cx.forEach(function (c) {
      var s = r(15), t = r(15), p = { signed: s, sent: t, signedMonths: {}, sentMonths: {} };
      PM.forEach(function (m) { p.signedMonths[m] = s / 6; p.sentMonths[m] = t / 6; });
      b.projection[c] = p; b.beyond[c] = { signed: r(20), sent: r(30) };
      var bt = sumObj(b.billed[c]), tg = 50 + r(200);
      b.glance.push({ cxo: c, billed: bt, projected: s + t, total: bt + s + t, target: tg, pctOfTarget: (bt + s + t) / tg });
      b.sepCheck.push({ cxo: c, projected: 1, billed: b.billed[c].Sep, diff: b.billed[c].Sep - 1, pct: b.billed[c].Sep });
      for (var i = 0; i < 3; i++) b.beyondLines.push({ customer: 'Customer ' + c.slice(-1) + (i + 1), cxo: c, ip: 'Storefront', revenueType: 'MRR', status: i ? 'sent' : 'signed', beyond: r(8) });
    });
    var jb = sumObj(b.billed['Central line']);
    b.glance.push({ cxo: 'Central line', billed: jb, projected: null, total: jb, target: null, separate: true });
    b.beyondLines.sort(function (a, c) { return c.beyond - a.beyond; });
    if (role === 'cxo') {
      var me = 'CXO B', o = function (x) { var y = {}; y[me] = x[me]; return y; };
      return { fy: b.fy, asOf: b.asOf, months: b.months, cxos: [me], separateLine: null,
        glance: b.glance.filter(function (g) { return g.cxo === me; }), billed: o(b.billed), received: o(b.received), otherIncome: null,
        sepCheck: b.sepCheck.filter(function (s) { return s.cxo === me; }), projection: o(b.projection), beyond: o(b.beyond),
        beyondLines: b.beyondLines.filter(function (l) { return l.cxo === me; }), liveWithoutOf: null, warnings: [],
        viewer: { role: 'cxo', email: 'demo' } };
    }
    return b;
  }

  /* ---------- wire up ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    if (CFG.TITLE) $('title').textContent = CFG.TITLE;
    $('filter').addEventListener('change', function (e) { state.filter = e.target.value; render(); });
    $('refresh').addEventListener('click', function () { if (state.token) load(true); });
    $('print').addEventListener('click', function () { window.print(); });
    $('signout').addEventListener('click', function () {
      state.token = null; state.book = null;
      if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
      $('who').textContent = ''; $('signout').hidden = true; showGate('');
    });

    var demo = new URLSearchParams(location.search).get('demo');
    if (demo) { state.book = demoBook(demo); $('who').textContent = 'Sample data'; render(); return; }
    if (!CFG.API_URL || CFG.API_URL.indexOf('REPLACE_ME') >= 0) {
      showGate('Portal not configured yet: set API_URL and CLIENT_ID in config.js. Add ?demo=admin to preview the layout.');
      return;
    }
    initGoogle();
  });
})();
