/* Fynd finance portal — front end.
 * Signs the viewer in with Google, sends the ID token to the Apps Script data
 * layer, and renders the book it returns. The server decides what this viewer
 * may see; this file holds no numbers of its own.
 *
 * Preview without the backend: ?demo=admin or ?demo=cxo (random sample data).
 */
(function () {
  'use strict';
  var CFG = window.PORTAL_CONFIG || {};
  var S = { token: null, book: null, filter: '', tab: 'overview', pnlMonth: null, custQuery: '', custAll: false, demo: false };
  var $ = function (id) { return document.getElementById(id); };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* ---------- numbers ---------- */
  function sumObj(o, keys) {
    if (!o) return 0;
    return (keys || Object.keys(o)).reduce(function (a, k) { return a + (o[k] || 0); }, 0);
  }
  function f2(v) {
    if (v == null || isNaN(v)) return '';
    var r = Math.round(v * 100) / 100;
    if (Math.abs(r) < 0.005) return '0';
    return r.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function f2s(v) { return v == null ? '' : v < 0 ? '(' + f2(-v) + ')' : f2(v); }
  function pct(v, d) { return v == null || !isFinite(v) ? '' : (v * 100).toFixed(d == null ? 1 : d) + '%'; }
  function growth(cy, ly) { return ly > 0.0001 ? cy / ly - 1 : null; }

  /* ---------- DOM (textContent only for data) ---------- */
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
  function svgEl(tag, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  // kinds: l text | n number | s signed (brackets) | p percent | g growth (coloured) | na note
  function td(v, kind, extra) {
    var c = extra || '';
    if (kind === 'l') return el('td', { cls: ('l ' + c).trim(), text: v == null ? '' : String(v) });
    if (kind === 'na') return el('td', { cls: 'na', text: v });
    if (kind === 'p') return el('td', { text: v == null ? '' : pct(v) });
    if (kind === 'g') return el('td', { cls: v == null ? 'na' : v >= 0 ? 'pos' : 'neg', text: v == null ? 'n/a' : (v >= 0 ? '+' : '') + pct(v) });
    if (kind === 's') return el('td', { cls: v < -0.004 ? 'neg' : '', text: f2s(v) });
    var t = el('td', { text: f2(v) });
    if (v != null && Math.abs(v) < 0.005) t.className = 'z';
    return t;
  }
  function table(headers, rows) {
    var thead = el('thead', null, [el('tr', null, headers.map(function (h) { return el('th', { text: h }); }))]);
    var tbody = el('tbody', null, rows.map(function (r) { return el('tr', r.cls ? { cls: r.cls } : null, r.cells); }));
    return el('div', { cls: 'tw' }, [el('table', null, [thead, tbody])]);
  }
  function section(title, sub) {
    var s = el('section');
    s.appendChild(el('h2', { text: title }));
    if (sub) s.appendChild(el('p', { cls: 'sub', text: sub }));
    return s;
  }
  function note(lead, text) {
    var p = el('p', { cls: 'note' });
    if (lead) p.appendChild(el('b', { text: lead + ' ' }));
    p.appendChild(document.createTextNode(text));
    return p;
  }

  /* ---------- view helpers ---------- */
  function B() { return S.book; }
  function isAdmin() { return B().viewer.role === 'admin'; }
  function allView() { return isAdmin() && !S.filter; }
  function visible() { return S.filter ? [S.filter] : B().cxos; }
  function mainCxos() { var sep = B().separateLine; return visible().filter(function (c) { return c !== sep; }); }
  function exclLabel() { return allView() && B().separateLine ? ' excluding ' + B().separateLine : ''; }
  function rv() { return B().revenue; }
  function billedOf(c, months) { var x = rv().byCxo[c]; return x ? sumObj(x.billed, months) : 0; }
  function collectedOf(c, months) { var x = rv().byCxo[c]; return x ? sumObj(x.collected, months) : 0; }
  function lyOf(c, months) { return sumObj(rv().lyByCxo[c], months); }
  function latestPnl() { var m = B().pnl.months; return m[m.length - 1] || null; }
  function ebitdaOf(c, month) {
    if (!month) return null;
    var d = B().pnl.data[month]; if (!d) return null;
    var key = Object.keys(d).filter(function (k) { return /^ebitda$/i.test(k); })[0];
    return key && d[key][c] != null ? d[key][c] : null;
  }
  function hasActivity(c) {
    return Math.abs(billedOf(c)) > 0.004 || Math.abs(lyOf(c)) > 0.004 || (rv().outstanding[c] || 0) > 0.004 || Math.abs(ebitdaOf(c, latestPnl()) || 0) > 0.004;
  }

  /* ---------- Overview ---------- */
  function renderOverview() {
    var p = $('p-overview'); p.textContent = '';
    var b = B(), r = rv(), cm = r.compareMonths, pm = latestPnl();
    var list = mainCxos().filter(hasActivity);

    var tot = { billed: 0, comp: 0, ly: 0, coll: 0, os: 0, eb: 0, ebAny: false };
    list.forEach(function (c) {
      tot.billed += billedOf(c); tot.comp += billedOf(c, cm); tot.ly += lyOf(c, cm);
      tot.coll += collectedOf(c); tot.os += r.outstanding[c] || 0;
      var e = ebitdaOf(c, pm); if (e != null) { tot.eb += e; tot.ebAny = true; }
    });

    var range = r.months.length ? 'Apr to ' + r.months[r.months.length - 1] + (r.partialMonth ? ' (' + r.partialMonth + ' to date)' : '') : 'no billing yet';
    var head = section(b.fy.cy + ' at a glance', 'Billed ' + range + '. Rs Cr' + exclLabel() + '.');
    var g = growth(tot.comp, tot.ly);
    var kpis = el('div', { cls: 'kpis' }, [
      kpi('Billed ' + b.fy.cy + ' YTD', f2(tot.billed), r.months.length + ' months'),
      kpi('vs ' + b.fy.ly + ' same months', g == null ? 'n/a' : (g >= 0 ? '+' : '') + pct(g), f2(tot.comp) + ' vs ' + f2(tot.ly) + ' (' + (cm.length ? 'Apr–' + cm[cm.length - 1] : '') + ')'),
      kpi('Collected', f2(tot.coll), pct(tot.billed ? tot.coll / tot.billed : null, 0) + ' of billed'),
      kpi('Outstanding', f2(tot.os), 'open invoices, ' + b.fy.ly + ' and ' + b.fy.cy),
      kpi('EBITDA ' + (pm || ''), tot.ebAny ? f2s(tot.eb) : 'n/a', 'CXO P/L, latest month')
    ]);
    head.appendChild(kpis);
    p.appendChild(head);

    // Chart: monthly billed, this year vs last year
    var cs = section('Billed by month', b.fy.cy + ' against the same month in ' + b.fy.ly + '. Rs Cr' + exclLabel() + '.');
    var months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    var lastIdx = r.months.length ? months.indexOf(r.months[r.months.length - 1]) : -1;
    var showM = months.slice(0, Math.max(lastIdx + 1, 1));
    var series = showM.map(function (m) {
      var cy = 0, ly = 0;
      list.forEach(function (c) { cy += billedOf(c, [m]); ly += lyOf(c, [m]); });
      return { m: m, cy: cy, ly: ly, partial: m === r.partialMonth };
    });
    cs.appendChild(barChart(series, b.fy.cy, b.fy.ly));
    if (r.partialMonth) cs.appendChild(note(null, r.partialMonth + ' is month to date and is left out of the year-on-year comparison.'));
    p.appendChild(cs);

    // Table by CXO
    var ts = section('By CXO', 'Rs Cr. Growth compares the same completed months in both years.');
    var rows = list.map(function (c) {
      var bl = billedOf(c), comp = billedOf(c, cm), ly = lyOf(c, cm), col = collectedOf(c);
      return { cells: [td(c, 'l'), td(bl), td(ly), td(growth(comp, ly), 'g'), td(col), td(bl ? col / bl : null, 'p'), td(r.outstanding[c] || 0), td(ebitdaOf(c, pm), 's')] };
    });
    if (list.length > 1) rows.push({ cls: 'total', cells: [td('Total' + exclLabel(), 'l'), td(tot.billed), td(tot.ly), td(g, 'g'), td(tot.coll), td(tot.billed ? tot.coll / tot.billed : null, 'p'), td(tot.os), td(tot.ebAny ? tot.eb : null, 's')] });
    if (allView() && b.separateLine && r.byCxo[b.separateLine]) {
      var j = b.separateLine, jb = billedOf(j), jl = lyOf(j, cm), jc = collectedOf(j);
      rows.push({ cells: [td(j, 'l'), td(jb), td(jl), td(growth(billedOf(j, cm), jl), 'g'), td(jc), td(jb ? jc / jb : null, 'p'), td(r.outstanding[j] || 0), td(ebitdaOf(j, pm), 's')] });
      rows.push({ cls: 'total', cells: [td('Total including ' + j, 'l'), td(tot.billed + jb), td(tot.ly + jl), td(growth(tot.comp + billedOf(j, cm), tot.ly + jl), 'g'), td(tot.coll + jc), td((tot.billed + jb) ? (tot.coll + jc) / (tot.billed + jb) : null, 'p'), td(tot.os + (r.outstanding[j] || 0)), td(tot.ebAny ? tot.eb + (ebitdaOf(j, pm) || 0) : null, 's')] });
    }
    var cmLabel = cm.length ? cm[0] + '–' + cm[cm.length - 1] : 'same months';
    ts.appendChild(table(['CXO', 'Billed ' + b.fy.cy + ' YTD', b.fy.ly + ' ' + cmLabel, 'Growth on ' + cmLabel, 'Collected', 'Collected %', 'Outstanding', 'EBITDA ' + (pm || '')], rows));
    ts.appendChild(note(null, 'Billed is Revenue_Netof_Tax on the Revenue Data tab, credit notes netted, inter-company deposit rows left out. Collected is receipts against invoices raised this year. Outstanding is all open invoices from both years. EBITDA is the latest month on the CXO P/L tab.'));
    p.appendChild(ts);
  }

  function kpi(label, value, detail) {
    return el('div', { cls: 'kpi' }, [el('span', { cls: 'label', text: label }), el('span', { cls: 'v', text: value }), el('span', { cls: 'd', text: detail })]);
  }

  function barChart(series, cyLabel, lyLabel) {
    var wrap = el('div', { cls: 'chart' });
    var lg = el('div', { cls: 'legend' });
    var a = el('span', { text: cyLabel }); a.style.setProperty('--c', 'var(--s1)');
    var bb = el('span', { text: lyLabel }); bb.style.setProperty('--c', 'var(--s2)');
    lg.appendChild(a); lg.appendChild(bb); wrap.appendChild(lg);

    var W = 900, H = 260, L = 48, R = 8, T = 10, Bm = 26;
    var max = Math.max.apply(null, series.map(function (s) { return Math.max(s.cy, s.ly); }).concat([0.01]));
    var step = niceStep(max / 4), top = Math.ceil(max / step) * step;
    var y = function (v) { return T + (H - T - Bm) * (1 - Math.max(v, 0) / top); };
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Billed by month, ' + cyLabel + ' against ' + lyLabel });
    var grid = svgEl('g', { 'class': 'grid' }), axis = svgEl('g', { 'class': 'axis' });
    for (var v = 0; v <= top + 1e-9; v += step) {
      grid.appendChild(svgEl('line', { x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      var t = svgEl('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end' }); t.textContent = f2(v).replace(/\.00$/, ''); axis.appendChild(t);
    }
    svg.appendChild(grid);
    var band = (W - L - R) / series.length, bw = Math.min(26, band * 0.32), gap = 2;
    series.forEach(function (s, i) {
      var cx = L + band * i + band / 2;
      [[s.cy, 'var(--s1)', cyLabel, cx - bw - gap / 2], [s.ly, 'var(--s2)', lyLabel, cx + gap / 2]].forEach(function (d) {
        var h = Math.max(0, (H - Bm) - y(d[0]));
        var rect = svgEl('path', { d: roundTop(d[3], y(d[0]), bw, h, 3), fill: d[1] });
        if (s.partial && d[2] === cyLabel) rect.setAttribute('fill-opacity', '0.55');
        hover(rect, s.m + ' · ' + d[2] + ': ' + f2(d[0]) + ' Cr' + (s.partial && d[2] === cyLabel ? ' (to date)' : ''));
        svg.appendChild(rect);
        // hit target larger than the mark
        var hit = svgEl('rect', { x: d[3] - 2, y: T, width: bw + 4, height: H - T - Bm, fill: 'transparent' });
        hover(hit, s.m + ' · ' + d[2] + ': ' + f2(d[0]) + ' Cr' + (s.partial && d[2] === cyLabel ? ' (to date)' : ''));
        svg.appendChild(hit);
      });
      var lab = svgEl('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }); lab.textContent = s.m + (s.partial ? '*' : ''); axis.appendChild(lab);
    });
    svg.appendChild(svgEl('line', { 'class': 'base', x1: L, x2: W - R, y1: H - Bm, y2: H - Bm }));
    svg.appendChild(axis);
    wrap.appendChild(el('div', { cls: 'tw' }, [svg]));
    return wrap;
  }
  function roundTop(x, yTop, w, h, r) {
    if (h <= 0) return 'M' + x + ' ' + yTop;
    r = Math.min(r, h, w / 2);
    var yb = yTop + h;
    return 'M' + x + ' ' + yb + 'V' + (yTop + r) + 'Q' + x + ' ' + yTop + ' ' + (x + r) + ' ' + yTop +
      'H' + (x + w - r) + 'Q' + (x + w) + ' ' + yTop + ' ' + (x + w) + ' ' + (yTop + r) + 'V' + yb + 'Z';
  }
  function niceStep(raw) {
    if (raw <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  function hover(node, text) {
    var tip = $('tip');
    node.addEventListener('mousemove', function (e) {
      tip.textContent = text; tip.hidden = false;
      tip.style.left = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8) + 'px';
      tip.style.top = (e.clientY - 34) + 'px';
    });
    node.addEventListener('mouseleave', function () { tip.hidden = true; });
  }

  /* ---------- Revenue ---------- */
  function renderRevenue() {
    var p = $('p-revenue'); p.textContent = '';
    var b = B(), r = rv(), M = r.months;
    var list = mainCxos().filter(function (c) { return hasActivity(c); });
    if (!M.length) { p.appendChild(section('No billing this year yet')); return; }

    function monthTable(getter, label) {
      var colT = {}; M.forEach(function (m) { colT[m] = 0; });
      var rows = list.map(function (c) {
        var v = getter(c) || {};
        M.forEach(function (m) { colT[m] += v[m] || 0; });
        return { cells: [td(c, 'l')].concat(M.map(function (m) { return td(v[m] || 0); }), [td(sumObj(v, M))]) };
      });
      if (list.length > 1) rows.push({ cls: 'total', cells: [td('Total' + exclLabel(), 'l')].concat(M.map(function (m) { return td(colT[m]); }), [td(sumObj(colT))]) });
      var j = b.separateLine;
      if (allView() && j && getter(j)) {
        var jv = getter(j);
        rows.push({ cells: [td(j, 'l')].concat(M.map(function (m) { return td(jv[m] || 0); }), [td(sumObj(jv, M))]) });
        rows.push({ cls: 'total', cells: [td('Total including ' + j, 'l')].concat(M.map(function (m) { return td(colT[m] + (jv[m] || 0)); }), [td(sumObj(colT) + sumObj(jv, M))]) });
      }
      var s = section(label, 'By CXO and invoice month. Rs Cr.');
      s.appendChild(table(['CXO'].concat(M.map(function (m) { return m === r.partialMonth ? m + ' (MTD)' : m; }), ['Total']), rows));
      return s;
    }

    p.appendChild(monthTable(function (c) { return r.byCxo[c] && r.byCxo[c].billed; }, 'Billed, ' + b.fy.cy));
    var cs = monthTable(function (c) { return r.byCxo[c] && r.byCxo[c].collected; }, 'Collected, ' + b.fy.cy);
    cs.appendChild(note(null, 'Collected is receipts recorded against invoices raised in that month, whenever the money arrived.'));
    p.appendChild(cs);
    var ls = monthTable(function (c) { return r.lyByCxo[c]; }, 'Billed, ' + b.fy.ly + ' same months');
    p.appendChild(ls);

    if (allView() && (r.otherIncome || r.excluded)) {
      var xs = section('Left out of revenue', 'Rows on Revenue Data that are not customer revenue. Rs Cr.');
      var rows = [];
      if (r.otherIncome) rows.push({ cls: 'aside', cells: [td('Other income (non-operating)', 'l')].concat(M.map(function (m) { return td(r.otherIncome[m] ? r.otherIncome[m].billed : 0); }), [td(M.reduce(function (a, m) { return a + (r.otherIncome[m] ? r.otherIncome[m].billed : 0); }, 0))]) });
      if (r.excluded) rows.push({ cls: 'aside', cells: [td('Inter-company and deposit rows', 'l')].concat(M.map(function (m) { return td(r.excluded[m] || 0); }), [td(sumObj(r.excluded, M))]) });
      xs.appendChild(table([''].concat(M, ['Total']), rows));
      xs.appendChild(note(null, 'Other income covers interest, sale of old assets and similar rows. Inter-company deposits are left out the same way as in the v0.7 revenue book.'));
      p.appendChild(xs);
    }
  }

  /* ---------- Mix ---------- */
  function renderMix() {
    var p = $('p-mix'); p.textContent = '';
    var b = B(), mix = rv().mix, list = mainCxos();
    var dims = [['frequency', 'Billing frequency'], ['bu', 'Business unit'], ['ip', 'IP'], ['region', 'Region'], ['businessType', 'New vs existing business'], ['entity', 'Billing entity']];
    if (isAdmin() && mix.revenueType) dims.push(['revenueType', 'Revenue type']);
    var s = section('Revenue mix, ' + b.fy.cy + ' YTD', 'Billed by dimension. Rs Cr' + exclLabel() + '.');
    var grid = el('div', { cls: 'grid3' });
    dims.forEach(function (d) {
      var agg = {};
      list.forEach(function (c) { var m = mix[d[0]] && mix[d[0]][c]; if (m) Object.keys(m).forEach(function (k) { agg[k] = (agg[k] || 0) + m[k]; }); });
      var keys = Object.keys(agg).filter(function (k) { return Math.abs(agg[k]) > 0.004; }).sort(function (x, y) { return agg[y] - agg[x]; });
      var tot = sumObj(agg), max = Math.max.apply(null, keys.map(function (k) { return agg[k]; }).concat([0.0001]));
      var top = keys.slice(0, 8), rest = keys.slice(8);
      var rows = top.map(function (k) {
        var cell = el('td'); var bc = el('div', { cls: 'bar-cell' });
        var bar = el('i'); bar.style.width = Math.max(2, 60 * Math.max(agg[k], 0) / max) + 'px';
        bc.appendChild(el('span', { text: f2(agg[k]) })); bc.appendChild(bar); cell.appendChild(bc);
        return { cells: [td(k, 'l'), cell, td(tot ? agg[k] / tot : null, 'p')] };
      });
      if (rest.length) { var rv2 = rest.reduce(function (a, k) { return a + agg[k]; }, 0); rows.push({ cls: 'aside', cells: [td(rest.length + ' others', 'l'), td(rv2), td(tot ? rv2 / tot : null, 'p')] }); }
      if (!rows.length) rows.push({ cells: [td('No billing', 'l'), td(null), td(null, 'p')] });
      grid.appendChild(el('div', null, [el('h3', { text: d[1] }), table(['', 'Rs Cr', 'Share'], rows)]));
    });
    s.appendChild(grid);
    if (allView() && b.separateLine) s.appendChild(note(null, b.separateLine + ' is left out of the mix so it does not swamp the other CXOs. Pick ' + b.separateLine + ' in the CXO filter to see its own mix.'));
    p.appendChild(s);
  }

  /* ---------- Customers ---------- */
  function renderCustomers() {
    var p = $('p-customers'); p.textContent = '';
    var b = B(), vis = visible(), q = S.custQuery.trim().toLowerCase();
    var list = rv().customers.filter(function (x) { return vis.indexOf(x.cxo) >= 0 && (!q || x.customer.toLowerCase().indexOf(q) >= 0); });
    var s = section('Customers, ' + b.fy.cy + ' YTD', 'Ranked by billed. Top 50 per CXO; the rest roll into one line. Rs Cr.');
    var bar = el('div', { cls: 'toolbar' });
    var inp = el('input', { type: 'search', id: 'cust-q', placeholder: 'Search customer', 'aria-label': 'Search customer' });
    inp.value = S.custQuery;
    inp.addEventListener('input', function () { S.custQuery = inp.value; renderCustomers(); var n = $('cust-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
    bar.appendChild(inp);
    bar.appendChild(el('span', { cls: 'muted small', text: list.length + ' rows' }));
    s.appendChild(bar);
    var shown = S.custAll ? list : list.slice(0, 30);
    var rows = shown.map(function (x) {
      return { cls: x.others ? 'aside' : '', cells: [td(x.customer, 'l'), td(x.cxo, 'l'), td(x.billed), td(x.collected), td(x.billed ? x.collected / x.billed : null, 'p'), td(String(x.invoices), 'na')] };
    });
    s.appendChild(table(['Customer', 'CXO', 'Billed', 'Collected', 'Collected %', 'Invoices'], rows));
    if (list.length > 30) {
      var more = el('button', { cls: 'btn ghost', text: S.custAll ? 'Show top 30' : 'Show all ' + list.length });
      more.style.marginTop = '12px';
      more.addEventListener('click', function () { S.custAll = !S.custAll; renderCustomers(); });
      s.appendChild(more);
    }
    p.appendChild(s);
  }

  /* ---------- P&L ---------- */
  function fyMonths(months) {
    var end = parseInt(String(B().fy.cy).replace(/\D/g, ''), 10); // FY27 -> 27
    return months.filter(function (k) {
      var parts = k.split('-'), mi = MON.indexOf(parts[0]), yy = parseInt(parts[1], 10);
      return (yy === end - 1 && mi >= 3) || (yy === end && mi <= 2);
    });
  }
  function renderPnl() {
    var p = $('p-pnl'); p.textContent = '';
    var b = B(), P = b.pnl;
    if (!P.months.length) { p.appendChild(section('No P&L months found on the sheet')); return; }
    var vis = visible();
    var isKey = function (l) { return (P.keyLines || []).some(function (k) { return k.toLowerCase() === l.toLowerCase(); }); };
    var lineCell = function (l) { return td(l, 'l', P.parent[l] ? 'sub-line' : ''); };

    if (vis.length === 1) {
      var c = vis[0], M = P.months, ytdM = fyMonths(M);
      var s = section('P&L, ' + c, 'Monthly, from the CXO P/L tab. Rs Cr. Brackets are negative.');
      var rows = P.lines.map(function (l) {
        var vals = M.map(function (m) { return P.data[m][l] ? P.data[m][l][c] : null; });
        var ytd = ytdM.reduce(function (a, m) { return a + ((P.data[m][l] && P.data[m][l][c]) || 0); }, 0);
        return { cls: isKey(l) ? 'key' : '', cells: [lineCell(l)].concat(vals.map(function (v) { return td(v, 's'); }), [td(ytd, 's')]) };
      });
      s.appendChild(table(['Line'].concat(M, [b.fy.cy + ' YTD']), rows));
      s.appendChild(note(null, 'YTD adds the ' + b.fy.cy + ' months present on the tab (' + ytdM.join(', ') + '). Months missing from the tab are not in the YTD.'));
      p.appendChild(s);
      return;
    }

    if (!S.pnlMonth || P.months.indexOf(S.pnlMonth) < 0) S.pnlMonth = P.months[P.months.length - 1];
    var m = S.pnlMonth, d = P.data[m];
    var sep = b.separateLine, main = vis.filter(function (c) { return c !== sep; });
    var cols = main.slice(), hasSep = allView() && sep;
    var s2 = section('CXO P&L, ' + m, 'From the CXO P/L tab. Rs Cr. Brackets are negative.');
    var bar = el('div', { cls: 'toolbar' });
    var sel = el('select', { id: 'pnl-month', 'aria-label': 'Month' });
    P.months.slice().reverse().forEach(function (x) { var o = el('option', { value: x, text: x }); if (x === m) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', function () { S.pnlMonth = sel.value; renderPnl(); });
    bar.appendChild(el('span', { cls: 'label', text: 'Month' })); bar.appendChild(sel);
    s2.appendChild(bar);
    var heads = ['Line'].concat(cols, ['Total' + (hasSep ? ' excl. ' + sep : '')], hasSep ? [sep, 'Total'] : []);
    var rows = P.lines.map(function (l) {
      var v = d[l] || {}, t = cols.reduce(function (a, c) { return a + (v[c] || 0); }, 0);
      var cells = [lineCell(l)].concat(cols.map(function (c) { return td(v[c] != null ? v[c] : null, 's'); }), [td(t, 's')]);
      if (hasSep) cells.push(td(v[sep] != null ? v[sep] : null, 's'), td(t + (v[sep] || 0), 's'));
      return { cls: isKey(l) ? 'key' : '', cells: cells };
    });
    s2.appendChild(table(heads, rows));
    s2.appendChild(note(null, 'Pick one CXO in the filter to see every month side by side with a YTD column.'));
    p.appendChild(s2);
  }

  /* ---------- Order forms ---------- */
  function renderOrders() {
    var p = $('p-orders'); p.textContent = '';
    var b = B(), O = b.orderForms, vis = visible();
    var list = vis.filter(function (c) { return O.byCxo[c]; });
    var qs = ['Q1', 'Q2', 'Q3', 'Q4'];
    var s = section('Order forms signed, ' + b.fy.cy, 'From the Order Form tab. Value is the order form total; annualised is the tab\'s Annualised Value. Rs Cr.');
    var t = { n: 0, v: 0, a: 0, q: {} };
    var rows = list.map(function (c) {
      var x = O.byCxo[c]; t.n += x.count; t.v += x.value; t.a += x.annualised;
      qs.forEach(function (q) { t.q[q] = (t.q[q] || 0) + (x.byQtr[q] || 0); });
      return { cells: [td(c, 'l'), td(String(x.count), 'na'), td(x.value), td(x.annualised)].concat(qs.map(function (q) { return td(x.byQtr[q] || 0); })) };
    });
    if (list.length > 1) rows.push({ cls: 'total', cells: [td('Total', 'l'), td(String(t.n), 'na'), td(t.v), td(t.a)].concat(qs.map(function (q) { return td(t.q[q] || 0); })) });
    if (!rows.length) rows.push({ cells: [td('No order forms this year', 'l')] });
    s.appendChild(table(['CXO', 'Count', 'Value', 'Annualised'].concat(qs), rows));
    p.appendChild(s);

    var rs = section('Latest order forms', 'Most recent signing first.');
    var items = O.list.filter(function (x) { return vis.indexOf(x.cxo) >= 0; }).slice(0, 25);
    rs.appendChild(table(['Signed', 'Customer', 'Services', 'CXO', 'Sales rep', 'Term (yrs)', 'Value'],
      items.map(function (x) { return { cells: [td(x.signed, 'l'), td(x.customer, 'l'), td(x.services, 'l'), td(x.cxo, 'l'), td(x.salesRep, 'l'), td(x.term ? String(x.term) : '', 'na'), td(x.value)] }; })));
    p.appendChild(rs);
  }

  /* ---------- Checks (admin) ---------- */
  function renderChecks() {
    var p = $('p-checks'); p.textContent = '';
    var b = B();
    if (!isAdmin()) return;
    var s = section('Reconciliation', 'Portal billed YTD against the Billed Collected summary tab. Rs Cr.');
    var rows = (b.recon || []).map(function (x) {
      return { cells: [td(x.cxo, 'l'), td(x.sheet), td(x.portal), td(x.diff, 's')] };
    });
    if (!rows.length) rows.push({ cells: [td('Billed Collected summary tab not found', 'l')] });
    s.appendChild(table(['CXO', 'Summary tab', 'Portal', 'Difference'], rows));
    p.appendChild(s);
    var w = section('Sheet checks', 'Anything the portal could not match on the MIS. Only admins see this page.');
    if (b.warnings && b.warnings.length) {
      w.appendChild(el('div', { cls: 'warn' }, [el('ul', null, b.warnings.map(function (x) { return el('li', { text: x }); }))]));
    } else {
      w.appendChild(el('p', { cls: 'muted', text: 'No issues found.' }));
    }
    p.appendChild(w);
  }

  /* ---------- shell ---------- */
  var renderers = { overview: renderOverview, revenue: renderRevenue, mix: renderMix, customers: renderCustomers, pnl: renderPnl, orders: renderOrders, checks: renderChecks };

  function renderAll() {
    var b = B();
    $('asof').textContent = b.asOf ? new Date(b.asOf).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '';
    $('lastinv').textContent = rv().lastInvoiceDate || 'n/a';
    $('viewlabel').textContent = isAdmin() ? 'All CXOs (admin)' : b.cxos.join(' + ');
    if (isAdmin() || b.cxos.length > 1) {
      $('filter-wrap').hidden = false;
      var sel = $('filter');
      if (sel.options.length === 1) b.cxos.forEach(function (c) { sel.appendChild(el('option', { value: c, text: c })); });
    }
    $('tab-checks').hidden = !isAdmin();
    $('tabs').hidden = false; $('gate').hidden = true; $('report').hidden = false;
    Object.keys(renderers).forEach(function (k) { renderers[k](); });
    showTab(S.tab);
  }

  function showTab(name) {
    if (!renderers[name] || (name === 'checks' && !isAdmin())) name = 'overview';
    S.tab = name;
    Object.keys(renderers).forEach(function (k) { $('p-' + k).hidden = k !== name; });
    Array.prototype.forEach.call(document.querySelectorAll('#tabs a'), function (a) {
      if (a.getAttribute('data-tab') === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function call(payload) {
    return fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(payload) })
      .then(function (r) { if (!r.ok) throw new Error('Server error ' + r.status); return r.json(); });
  }
  function load(refresh) {
    $('loading').hidden = false; $('refresh').disabled = true;
    call({ idToken: S.token, action: 'book', refresh: !!refresh }).then(function (res) {
      if (!res.ok) throw new Error(res.error);
      S.book = res.book;
      $('who').textContent = res.book.viewer.email || '';
      $('signout').hidden = false;
      renderAll();
    }).catch(function (e) { showGate(e.message || String(e)); })
      .then(function () { $('loading').hidden = true; $('refresh').disabled = false; });
  }
  function showGate(msg) {
    $('report').hidden = true; $('tabs').hidden = true; $('gate').hidden = false;
    var g = $('gate-error'); g.hidden = !msg; g.textContent = msg || '';
  }
  function initGoogle() {
    if (!window.google || !google.accounts || !google.accounts.id) { setTimeout(initGoogle, 150); return; }
    google.accounts.id.initialize({
      client_id: CFG.CLIENT_ID, hd: CFG.DOMAIN, auto_select: true, cancel_on_tap_outside: false,
      callback: function (resp) { S.token = resp.credential; $('gate-error').hidden = true; load(false); }
    });
    google.accounts.id.renderButton($('signin'), { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'rectangular' });
    google.accounts.id.prompt();
  }

  /* ---------- demo book: random sample numbers, not company data ---------- */
  function demoBook(role) {
    var seed = 11; function rnd(n) { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 * n; }
    var cx = ['CXO A', 'CXO B', 'CXO C', 'CXO D', 'CXO E', 'Central line'];
    var M = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
    var r = { months: M, partialMonth: 'Oct', compareMonths: M.slice(0, 6), lastInvoiceDate: '2026-10-09', byCxo: {}, lyByCxo: {}, outstanding: {}, openInvoices: {},
      otherIncome: {}, excluded: {}, mix: { frequency: {}, bu: {}, ip: {}, region: {}, businessType: {}, entity: {}, revenueType: {} }, customers: [] };
    cx.forEach(function (c, i) {
      var scale = c === 'Central line' ? 15 : 1 + i * 0.6;
      r.byCxo[c] = { billed: {}, collected: {} }; r.lyByCxo[c] = {};
      M.forEach(function (m) {
        var v = scale * (1 + rnd(1.5)) * (m === 'Oct' ? 0.35 : 1);
        r.byCxo[c].billed[m] = v; r.byCxo[c].collected[m] = v * (0.5 + rnd(0.5)); r.lyByCxo[c][m] = v * (0.6 + rnd(0.6));
      });
      var tot = sumObj(r.byCxo[c].billed);
      r.outstanding[c] = tot * 0.25; r.openInvoices[c] = 10 + Math.round(rnd(40));
      r.mix.frequency[c] = { MRR: tot * 0.4, Variable: tot * 0.35, Onetime: tot * 0.15, 'Resource billing': tot * 0.1 };
      r.mix.bu[c] = { Commerce: tot * 0.7, 'AI_SaaS Others': tot * 0.2, Manufacturing: tot * 0.1 };
      r.mix.ip[c] = { Storefront: tot * 0.45, 'Konnect (OMS)': tot * 0.25, StoreOS: tot * 0.2, TMS: tot * 0.1 };
      r.mix.region[c] = { India: tot * 0.8, MEA: tot * 0.2 };
      r.mix.businessType[c] = { 'Existing Business': tot * 0.75, 'New Business': tot * 0.15, 'Growth in Business': tot * 0.1 };
      r.mix.entity[c] = { FYND: tot };
      r.mix.revenueType[c] = { Subscription: tot * 0.5, 'Transaction Fees': tot * 0.5 };
      for (var k = 1; k <= 6; k++) r.customers.push({ customer: 'Sample customer ' + c.slice(-1) + k, cxo: c, billed: tot / (k + 1), collected: tot / (k + 1.6), invoices: 5 + k });
    });
    M.forEach(function (m) { r.otherIncome[m] = { billed: rnd(0.2), collected: 0 }; r.excluded[m] = rnd(15); });
    r.customers.sort(function (a, b) { return b.billed - a.billed; });
    var pm = ['Jun-26', 'Jul-26', 'Aug-26', 'Sep-26'], lines = ['Revenue', 'Ops Cost', 'People Cost', 'Build', 'Sell', 'Support', 'Sales and Marketing', 'Tools & Infra', 'Total Expenses', 'EBITDA'];
    var data = {};
    pm.forEach(function (m) {
      data[m] = {}; lines.forEach(function (l) { data[m][l] = {}; });
      cx.forEach(function (c) {
        var rev = r.byCxo[c].billed[m.slice(0, 3)] || 1, ppl = 0.6 + rnd(1.2), ops = rev * 0.2, sm = rnd(0.2), tl = rnd(0.15);
        var vals = { Revenue: rev, 'Ops Cost': ops, 'People Cost': ppl, Build: ppl * 0.5, Sell: ppl * 0.4, Support: ppl * 0.1, 'Sales and Marketing': sm, 'Tools & Infra': tl };
        vals['Total Expenses'] = ops + ppl + sm + tl; vals.EBITDA = rev - vals['Total Expenses'];
        lines.forEach(function (l) { data[m][l][c] = vals[l]; });
      });
    });
    var of = { byCxo: {}, list: [] };
    cx.slice(0, 5).forEach(function (c, i) {
      of.byCxo[c] = { count: 3 + i, value: 2 + rnd(6), annualised: 1 + rnd(4), byQtr: { Q1: rnd(3), Q2: rnd(3), Q3: rnd(1) } };
      of.list.push({ ofNo: String(1000 + i), customer: 'Sample customer ' + c.slice(-1) + '1', services: 'Storefront', cxo: c, salesRep: 'Sample rep', qtr: 'Q2 FY27', signed: '2026-09-' + (10 + i), term: 1, value: rnd(2), annualised: rnd(2) });
    });
    var book = { fy: { cy: 'FY27', ly: 'FY26' }, asOf: new Date().toISOString(), cxos: cx, separateLine: 'Central line',
      revenue: r, pnl: { months: pm, lines: lines, parent: { Build: 'People Cost', Sell: 'People Cost', Support: 'People Cost' }, keyLines: ['Revenue', 'Total Expenses', 'EBITDA'], data: data },
      orderForms: of, recon: cx.slice(0, 5).map(function (c) { var v = sumObj(r.byCxo[c].billed); return { cxo: c, sheet: v, portal: v, diff: 0 }; }),
      warnings: ['Sample data. These are random numbers, not company figures.'], viewer: { role: 'admin', email: 'Sample data' } };
    if (role !== 'cxo') return book;
    // CXO view: same cut the server makes
    var keep = ['CXO B'], pick = function (o) { var x = {}; keep.forEach(function (k) { if (o && o[k] != null) x[k] = o[k]; }); return x; };
    var mix = {}; Object.keys(r.mix).forEach(function (k) { if (k !== 'revenueType') mix[k] = pick(r.mix[k]); });
    var pd = {}; pm.forEach(function (m) { pd[m] = {}; lines.forEach(function (l) { pd[m][l] = pick(data[m][l]); }); });
    return { fy: book.fy, asOf: book.asOf, cxos: keep, separateLine: null,
      revenue: { months: M, partialMonth: 'Oct', compareMonths: r.compareMonths, lastInvoiceDate: r.lastInvoiceDate, byCxo: pick(r.byCxo), lyByCxo: pick(r.lyByCxo),
        outstanding: pick(r.outstanding), openInvoices: pick(r.openInvoices), otherIncome: null, excluded: null, mix: mix,
        customers: r.customers.filter(function (x) { return keep.indexOf(x.cxo) >= 0; }) },
      pnl: { months: pm, lines: lines, parent: book.pnl.parent, keyLines: book.pnl.keyLines, data: pd },
      orderForms: { byCxo: pick(of.byCxo), list: of.list.filter(function (x) { return keep.indexOf(x.cxo) >= 0; }) },
      recon: null, warnings: [], viewer: { role: 'cxo', email: 'Sample data' } };
  }

  /* ---------- wire up ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    if (CFG.TITLE) $('title').textContent = CFG.TITLE;
    $('filter').addEventListener('change', function (e) { S.filter = e.target.value; S.custAll = false; renderAll(); });
    $('refresh').addEventListener('click', function () { if (S.demo) return; if (S.token) load(true); });
    $('print').addEventListener('click', function () { window.print(); });
    $('signout').addEventListener('click', function () {
      S.token = null; S.book = null;
      if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
      $('who').textContent = ''; $('signout').hidden = true; showGate('');
    });
    window.addEventListener('hashchange', function () { if (S.book) showTab(location.hash.slice(1)); });
    S.tab = location.hash.slice(1) || 'overview';

    var demo = new URLSearchParams(location.search).get('demo');
    if (demo) { S.demo = true; S.book = demoBook(demo); $('who').textContent = 'Sample data'; renderAll(); return; }
    if (!CFG.API_URL || CFG.API_URL.indexOf('REPLACE_ME') >= 0) {
      showGate('Portal not configured yet: set API_URL and CLIENT_ID in config.js. Add ?demo=admin to preview the layout.');
      return;
    }
    initGoogle();
  });
})();
