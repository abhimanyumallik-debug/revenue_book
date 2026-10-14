/**
 * Fynd Finance Portal — Apps Script web app (the data layer).
 *
 * Deploy as a web app:  Execute as = Me (an account that can read the MIS sheet)
 *                       Who has access = Anyone
 * "Anyone" lets the GitHub Pages site call it. The gate is the Google ID token
 * each request carries: verified here, domain checked, email looked up on the
 * "Portal Access" tab. Accounts not on that tab get nothing.
 *
 * Request:  POST body (text/plain) = {"idToken": "...", "action": "book" | "whoami" | "schema", "refresh": bool}
 * Response: JSON {"ok": true, ...} or {"ok": false, "error": "..."}
 */

function doGet() {
  return json_({ ok: true, service: 'fynd-finance-portal' });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var who = verifyIdToken_(body.idToken);
    var access = lookupAccess_(who.email);
    if (!access) {
      log_(who.email, 'denied');
      return json_({ ok: false, error: 'Your account (' + who.email + ') is not on the access list. Ask S&C to add you.' });
    }
    var action = body.action || 'book';

    if (action === 'whoami') return json_({ ok: true, email: who.email, role: access.role, cxos: access.cxos || null });

    if (action === 'schema') {
      if (access.role !== 'admin') return json_({ ok: false, error: 'Admins only.' });
      var full = getBook_(true);
      return json_({ ok: true, schema: full.schema, warnings: full.warnings, recon: full.recon, tabs: listTabs_() });
    }

    var book = getBook_(body.refresh === true && access.role === 'admin');
    var view = Report.filterFor(book, access);
    view.viewer.email = who.email;
    log_(who.email, 'book:' + (access.role === 'admin' ? 'all' : access.cxos.join('+')));
    return json_({ ok: true, book: view });

  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ---------- identity ---------- */

function verifyIdToken_(token) {
  if (!token) throw new Error('Sign in required.');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
                              { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Sign-in expired. Sign in again.');
  var t = JSON.parse(res.getContentText());
  if (t.aud !== CONFIG.OAUTH_CLIENT_ID) throw new Error('Token was not issued for this portal.');
  if (String(t.email_verified) !== 'true') throw new Error('Email not verified.');
  if (CONFIG.ALLOWED_DOMAIN && t.hd !== CONFIG.ALLOWED_DOMAIN) throw new Error('Use your @' + CONFIG.ALLOWED_DOMAIN + ' account.');
  if (Number(t.exp) * 1000 < Date.now()) throw new Error('Sign-in expired. Sign in again.');
  return { email: String(t.email).toLowerCase() };
}

/**
 * "Portal Access" tab: Email | Role | CXO
 *   Role admin -> all CXOs.  Role cxo -> the CXOs listed (comma-separated, e.g. "Ronak, Dharmendra").
 * Script property ADMINS (comma-separated emails) lets the first admin in before the tab exists.
 */
function lookupAccess_(email) {
  var admins = (PropertiesService.getScriptProperties().getProperty('ADMINS') || '')
    .toLowerCase().split(',').map(function (s) { return s.trim(); }).filter(String);
  if (admins.indexOf(email) >= 0) return { role: 'admin' };

  var cache = CacheService.getScriptCache();
  var raw = cache.get('access'), map;
  if (raw) {
    map = JSON.parse(raw);
  } else {
    map = {};
    var sh = ss_().getSheetByName(CONFIG.TABS.ACCESS.name);
    if (sh) {
      var vals = sh.getDataRange().getValues();
      var h = Report._mapHeaders(vals, CONFIG.TABS.ACCESS.fields);
      var cxoOf = Report._cxoResolver(CONFIG);
      for (var r = h.headerRow + 1; h.headerRow >= 0 && r < vals.length; r++) {
        var em = String(vals[r][h.cols.email] || '').trim().toLowerCase();
        if (!em) continue;
        var role = String(vals[r][h.cols.role] || '').trim().toLowerCase() === 'admin' ? 'admin' : 'cxo';
        var cxos = h.cols.cxo == null ? [] : String(vals[r][h.cols.cxo] || '').split(/[,+;\/]/)
          .map(function (s) { return cxoOf(s.trim()); }).filter(Boolean);
        map[em] = { role: role, cxos: cxos };
      }
    }
    cache.put('access', JSON.stringify(map), 60);
  }
  var a = map[email];
  if (!a) return null;
  if (a.role === 'cxo' && !a.cxos.length) return null;
  return a;
}

/* ---------- data ---------- */

function ss_() { return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }

function values_(name) {
  var sh = ss_().getSheetByName(name);
  return sh ? sh.getDataRange().getValues() : null;
}

function listTabs_() { return ss_().getSheets().map(function (s) { return s.getName(); }); }

function getBook_(force) {
  if (!force) {
    var cached = cacheGet_('book');
    if (cached) return cached;
  }
  var T = CONFIG.TABS;
  var input = {
    asOf: new Date().toISOString(),
    revenue: values_(T.REVENUE.name),
    pnl: values_(T.PNL.name),
    orderForms: values_(T.ORDER_FORM.name),
    recon: values_(T.RECON.name)
  };
  var book = Report.build(input, CONFIG);
  ['REVENUE', 'PNL', 'ORDER_FORM'].forEach(function (k) {
    if (!input[{ REVENUE: 'revenue', PNL: 'pnl', ORDER_FORM: 'orderForms' }[k]]) book.warnings.push('Tab "' + T[k].name + '" not found.');
  });
  cachePut_('book', book, CONFIG.CACHE_SECONDS);
  return book;
}

/* CacheService caps each value at 100 KB, so store in chunks. */
function cachePut_(key, obj, secs) {
  var s = JSON.stringify(obj), size = 90000, parts = {};
  var n = Math.ceil(s.length / size);
  if (n > 50) return; // too large to cache; compute each time
  for (var i = 0; i < n; i++) parts[key + ':' + i] = s.substr(i * size, size);
  parts[key + ':n'] = String(n);
  CacheService.getScriptCache().putAll(parts, secs);
}

function cacheGet_(key) {
  var c = CacheService.getScriptCache();
  var n = Number(c.get(key + ':n') || 0);
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < n; i++) keys.push(key + ':' + i);
  var got = c.getAll(keys), s = '';
  for (var j = 0; j < n; j++) { if (got[keys[j]] == null) return null; s += got[keys[j]]; }
  return JSON.parse(s);
}

/* ---------- audit ---------- */

/** Appends to a "Portal Log" tab if it exists. Create the tab to switch logging on. */
function log_(email, what) {
  try {
    var sh = ss_().getSheetByName('Portal Log');
    if (sh) sh.appendRow([new Date(), email, what]);
  } catch (e) { /* logging never blocks a read */ }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor: authorises scopes and prints what matched. */
function setupCheck() {
  var book = getBook_(true);
  Logger.log('Months: ' + book.revenue.months.join(', ') + (book.revenue.partialMonth ? ' (' + book.revenue.partialMonth + ' partial)' : ''));
  Logger.log('P&L months: ' + book.pnl.months.join(', '));
  Logger.log('Reconciliation: ' + JSON.stringify(book.recon));
  Logger.log('Warnings: ' + JSON.stringify(book.warnings, null, 2));
  Logger.log('Book size: ' + Math.round(JSON.stringify(book).length / 1024) + ' KB');
}
