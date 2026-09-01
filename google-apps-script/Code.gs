/**
 * Johan & Valerie — Wedding RSVP backend (Google Apps Script)
 * ────────────────────────────────────────────────────────
 * Lives inside your Google Sheet. Receives RSVPs from the website,
 * stores them as rows, serves approved wishes back to the site.
 *
 * ONE-TIME USE: run setup() once (see GOOGLE-SETUP.md), then
 * Deploy → New deployment → Web app → Execute as: Me → Access: Anyone.
 */

var RSVP_SHEET = 'RSVP';
var GUESTS_SHEET = 'Guests';
var DASH_SHEET = 'Dashboard';
var OPENS_SHEET = 'Opens';

var SITE_URL = 'https://johan-valerie.github.io/wedding/';

// RSVP sheet columns (1-based)
var COL = {
  TIME: 1, KEY: 2, NAME: 3, ATTENDING: 4, PAX: 5,
  WISHES: 6, APPROVED: 7, ACCOM: 8, NIGHTS: 9, ARRIVAL: 10, DETAILS_AT: 11
};
var HEADERS = ['Timestamp', 'Guest link (key)', 'Name', 'Attending', 'Pax',
               'Wishes', 'Approved', 'Accommodation', 'Nights', 'Arrival', 'Details completed'];

// Guests sheet columns (1-based)
var GCOL = { NAME: 1, COMPANION: 2, SEATS: 3, HOLMAT: 4, LINK: 5, STATUS: 6,
             ACCOM: 7, NIGHTS: 8, FIRST: 9, LAST: 10, OPENS: 11 };
var GHEADERS = ['Guest name', 'Companion name', 'Max seats', 'Holy Matrimony', 'Personalized link',
                'Status', 'Accommodation', 'Nights', 'First opened (WIB)', 'Last opened (WIB)', 'Opens'];

var ACCOM_LABELS = {
  provided: 'Arranged hotel (hosted)',
  upgrade:  'Upgrade hotel (own expense)',
  self:     'Self-arranged'
};

/* ═══════════════ ONE-TIME SETUP — run me once ═══════════════ */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── RSVP tab ──
  var rsvp = ss.getSheetByName(RSVP_SHEET) || ss.insertSheet(RSVP_SHEET);
  // Migrate older layout (Arrival directly after Accommodation, no Nights).
  if (String(rsvp.getRange('I1').getValue()) === 'Arrival') {
    rsvp.insertColumnAfter(8);
  }
  rsvp.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
      .setFontWeight('bold').setBackground('#292929').setFontColor('#ffffff');
  rsvp.setFrozenRows(1);
  // NOTE: checkboxes are inserted per-row on submit (pre-filling 1000 of
  // them counts as "content" and pushes new RSVPs down to row 1001).
  rsvp.getRange(2, COL.ARRIVAL, 999, 1).setNumberFormat('@');  // Arrival stays plain text
  rsvp.setColumnWidth(COL.WISHES, 320);

  // ── Guests tab (your link factory) ──
  // Rebuilt from scratch on every setup run: your typed data (name, companion,
  // seats, Holy Matrimony ticks, open tracking) is captured by HEADER NAME
  // from whatever layout the sheet currently has, then written back into the
  // current layout. Stray "--" placeholders become empty cells. If an older
  // "Title" column is found, it is folded into the Guest name (so links that
  // were "Title Name" keep resolving to the same key).
  var g = ss.getSheetByName(GUESTS_SHEET) || ss.insertSheet(GUESTS_SHEET);
  var keep = [];
  var gLastRow = g.getLastRow();
  if (gLastRow > 1) {
    var gCols = Math.max(g.getLastColumn(), 1);
    var oldHead = g.getRange(1, 1, 1, gCols).getValues()[0].map(function (h) {
      return String(h).toLowerCase();
    });
    var col_ = function (label) {
      for (var i = 0; i < oldHead.length; i++) {
        if (oldHead[i].indexOf(label) === 0) return i;
      }
      return -1;
    };
    var ix = { title: col_('title'), name: col_('guest name'), companion: col_('companion'),
               seats: col_('max seats'), hm: col_('holy matrimony'), first: col_('first opened'),
               last: col_('last opened'), opens: col_('opens') };
    var pick = function (r, i) { return i >= 0 ? r[i] : ''; };
    keep = g.getRange(2, 1, gLastRow - 1, gCols).getValues().map(function (r) {
      var title = String(pick(r, ix.title) || '').trim();
      var name = String(pick(r, ix.name) || '').trim();
      if (title) name = (title + ' ' + name).trim();     // fold old Title into the name
      return {
        name: name,
        companion: String(pick(r, ix.companion) || '').trim(),
        seats: pick(r, ix.seats),
        hm: pick(r, ix.hm) === true,
        first: stamp_(pick(r, ix.first)),
        last: stamp_(pick(r, ix.last)),
        opens: parseInt(pick(r, ix.opens), 10) || ''
      };
    }).filter(function (r) { return r.name !== ''; });
  }
  g.clear();
  g.getRange(1, 1, g.getMaxRows(), g.getMaxColumns()).clearDataValidations();
  g.getRange(1, 1, 1, GHEADERS.length).setValues([GHEADERS])
   .setFontWeight('bold').setBackground('#292929').setFontColor('#ffffff');
  g.setFrozenRows(1);
  g.getRange('D2:D1000').insertCheckboxes();
  if (keep.length) {
    g.getRange(2, 1, keep.length, GHEADERS.length).setValues(keep.map(function (r) {
      return [r.name, r.companion, r.seats, r.hm, '', '', '', '', r.first, r.last, r.opens];
    }));
  }
  // Per-row formulas, filled down to row 1000. (ENCODEURL refuses to work
  // inside ARRAYFORMULA — the earlier array version generated no links.)
  // Guest key everywhere = "Guest name", or "Guest name & Companion" when a
  // companion is filled in. gkey_(gn) builds that from the Guest-name column
  // at relative offset gn (companion sits at gn+1).
  var gkey_ = function (gn) {
    return 'TRIM(RC[' + gn + ']) & IF(RC[' + (gn + 1) + ']="",""," & "&TRIM(RC[' + (gn + 1) + ']))';
  };
  g.getRange('E2:E1000').setFormulaR1C1(
    '=IF(RC[-4]="","","' + SITE_URL + '?to=" & ENCODEURL(' + gkey_(-4) + ')' +
    ' & "&max=" & IF(RC[-2]="",2,RC[-2]) & IF(RC[-1]=TRUE,"&hm=1",""))'
  );
  g.getRange('F2:F1000').setFormulaR1C1(
    '=IF(RC[-5]="","",IFERROR(' +
      'LET(k, LOWER(' + gkey_(-5) + '),' +
      '    m, MATCH(k, ARRAYFORMULA(LOWER(TRIM(RSVP!R2C2:R1000C2))), 0),' +
      '    att, INDEX(RSVP!R2C4:R1000C4, m),' +
      '    pax, INDEX(RSVP!R2C5:R1000C5, m),' +
      '    det, INDEX(RSVP!R2C11:R1000C11, m),' +
      '    IF(att="Yes",' +
      '       "✅ Attending ("&pax&")" & IF(det="", " · details pending", " · complete"),' +
      '       "❌ Declined")),' +
    '"⏳ No reply"))'
  );
  g.getRange('G2:G1000').setFormulaR1C1(
    '=IF(RC[-6]="","",IFERROR(' +
      'LET(k, LOWER(' + gkey_(-6) + '),' +
      '    m, MATCH(k, ARRAYFORMULA(LOWER(TRIM(RSVP!R2C2:R1000C2))), 0),' +
      '    INDEX(RSVP!R2C8:R1000C8, m)&""),""))'
  );
  g.getRange('H2:H1000').setFormulaR1C1(
    '=IF(RC[-7]="","",IFERROR(' +
      'LET(k, LOWER(' + gkey_(-7) + '),' +
      '    m, MATCH(k, ARRAYFORMULA(LOWER(TRIM(RSVP!R2C2:R1000C2))), 0),' +
      '    INDEX(RSVP!R2C9:R1000C9, m)&""),""))'
  );
  g.setColumnWidth(GCOL.NAME, 180);
  g.setColumnWidth(GCOL.COMPANION, 180);
  g.setColumnWidth(GCOL.HOLMAT, 120);
  g.setColumnWidth(GCOL.LINK, 420);
  g.setColumnWidth(GCOL.STATUS, 220);
  g.setColumnWidth(GCOL.ACCOM, 200);
  g.setColumnWidth(GCOL.NIGHTS, 70);
  g.setColumnWidth(GCOL.FIRST, 150);
  g.setColumnWidth(GCOL.LAST, 150);
  g.setColumnWidth(GCOL.OPENS, 70);

  // Migrate data from the old Opens tab (if it exists), then delete it.
  var oldOpens = ss.getSheetByName(OPENS_SHEET);
  if (oldOpens) {
    var oLast = oldOpens.getLastRow();
    if (oLast > 1) {
      var oData = oldOpens.getRange(2, 1, oLast - 1, 4).getValues();
      for (var i = 0; i < oData.length; i++) {
        var gRow = guestRow_(g, oData[i][0]);
        if (gRow) {
          g.getRange(gRow, GCOL.FIRST).setValue(stamp_(oData[i][1]));
          g.getRange(gRow, GCOL.LAST).setValue(stamp_(oData[i][2]));
          g.getRange(gRow, GCOL.OPENS).setValue(parseInt(oData[i][3], 10) || '');
        }
      }
    }
    ss.deleteSheet(oldOpens);
  }

  // ── Dashboard tab ──
  var d = ss.getSheetByName(DASH_SHEET) || ss.insertSheet(DASH_SHEET);
  d.clear();
  var rows = [
    ['JOHAN & VALI — RSVP DASHBOARD', ''],
    ['', ''],
    ['Guests invited (list)',    '=COUNTA(Guests!A2:A)'],
    ['  … invited to Holy Matrimony', '=COUNTIF(Guests!D2:D,TRUE)'],
    ['Responses received',       '=COUNTA(RSVP!B2:B)'],
    ['Attending',                '=COUNTIF(RSVP!D2:D,"Yes")'],
    ['Declined',                 '=COUNTIF(RSVP!D2:D,"No")'],
    ['Total seats needed',       '=SUMIF(RSVP!D2:D,"Yes",RSVP!E2:E)'],
    ['', ''],
    ['Arranged hotel (hosted)',  '=COUNTIF(RSVP!H2:H,"' + ACCOM_LABELS.provided + '")'],
    ['  … seats in hosted rooms','=SUMIFS(RSVP!E2:E,RSVP!H2:H,"' + ACCOM_LABELS.provided + '")'],
    ['  … hosted room-nights',   '=SUMIF(RSVP!H2:H,"' + ACCOM_LABELS.provided + '",RSVP!I2:I)'],
    ['Upgrade hotel (own cost)', '=COUNTIF(RSVP!H2:H,"' + ACCOM_LABELS.upgrade + '")'],
    ['Self-arranged stay',       '=COUNTIF(RSVP!H2:H,"' + ACCOM_LABELS.self + '")'],
    ['Details still pending',    '=COUNTIFS(RSVP!D2:D,"Yes",RSVP!K2:K,"")'],
    ['', ''],
    ['Wishes awaiting approval', '=COUNTIFS(RSVP!F2:F,"<>",RSVP!G2:G,FALSE)'],
    ['', ''],
    ['Guests who opened link',   '=COUNTA(Guests!K2:K)'],
    ['Total link opens',         '=SUM(Guests!K2:K)']
  ];
  d.getRange(1, 1, rows.length, 2).setValues(rows);
  d.getRange('A1').setFontWeight('bold').setFontSize(14);
  d.getRange('A3:A' + rows.length).setFontWeight('bold');
  d.setColumnWidth(1, 260);

  ss.setActiveSheet(rsvp);
  return 'Setup complete — 3 tabs ready.';
}

/**
 * ONE-TIME REPAIR — run me once if RSVPs landed at row 1001+.
 * Compacts real responses up to row 2 and removes the 999 empty
 * checkboxes that caused the gap. Approved states are preserved.
 */
function fixRows() {
  var s = sheet_(RSVP_SHEET);
  var last = s.getLastRow();
  if (last < 2) return 'Nothing to fix — no responses yet.';

  var data = s.getRange(2, 1, last - 1, HEADERS.length).getValues()
              .filter(function (r) { return String(r[COL.KEY - 1]).trim() !== ''; });

  var below = s.getRange(2, 1, s.getMaxRows() - 1, HEADERS.length);
  below.clearContent();
  below.clearDataValidations();

  if (data.length) {
    s.getRange(2, COL.APPROVED, data.length, 1).insertCheckboxes();
    s.getRange(2, 1, data.length, HEADERS.length).setValues(data);
  }
  s.getRange(2, COL.ARRIVAL, 999, 1).setNumberFormat('@');
  CacheService.getScriptCache().remove('wishes');
  return 'Fixed — ' + data.length + ' response(s) now start at row 2.';
}

/* ═══════════════ WEB APP: receive from the website ═══════════════ */

function doPost(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.hp) return json_({ ok: true });                 // honeypot → silently ignore bots

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (p.action === 'rsvp')    return json_(handleRsvp_(p));
      if (p.action === 'details') return json_(handleDetails_(p));
      if (p.action === 'open')    return json_(handleOpen_(p));
      return json_({ ok: false, error: 'unknown_action' });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err).slice(0, 140) });
  }
}

function handleRsvp_(p) {
  var name = clean_(p.name, 80);
  if (!name) return { ok: false, error: 'name_required' };
  var attending = (String(p.attending).toLowerCase() === 'yes') ? 'Yes' : 'No';
  var pax = Math.max(1, Math.min(20, parseInt(p.pax, 10) || 1));
  var wishes = clean_(p.wishes, 500);
  var key = normKey_(p.key || name);

  var sheet = sheet_(RSVP_SHEET);
  var row = findRow_(sheet, key);

  if (row) {
    var oldWish = String(sheet.getRange(row, COL.WISHES).getValue());
    sheet.getRange(row, COL.TIME).setValue(new Date());
    sheet.getRange(row, COL.NAME).setValue(name);
    sheet.getRange(row, COL.ATTENDING).setValue(attending);
    sheet.getRange(row, COL.PAX).setValue(pax);
    if (wishes && wishes !== oldWish) {
      sheet.getRange(row, COL.WISHES).setValue(wishes);
      sheet.getRange(row, COL.APPROVED).setValue(false);  // re-moderate edited wishes
    }
  } else {
    sheet.appendRow([new Date(), key, name, attending, pax, wishes, false, '', '', '', '']);
    sheet.getRange(sheet.getLastRow(), COL.APPROVED).insertCheckboxes();
  }
  CacheService.getScriptCache().remove('wishes');
  return { ok: true, stage2: attending === 'Yes' };
}

function handleDetails_(p) {
  var key = normKey_(p.key || p.name);
  if (!key) return { ok: false, error: 'key_required' };

  var sheet = sheet_(RSVP_SHEET);
  var row = findRow_(sheet, key);
  if (!row) return { ok: false, error: 'rsvp_not_found' };

  var accom = ACCOM_LABELS[String(p.accommodation)] || '';
  if (!accom) return { ok: false, error: 'accommodation_required' };

  var nights = '';
  if (String(p.accommodation) !== 'self') {          // self-arranged stays track no nights
    nights = parseInt(p.nights, 10);
    if (!(nights >= 1 && nights <= 30)) return { ok: false, error: 'nights_required' };
  }

  var arrival = /^\d{4}-\d{2}-\d{2}$/.test(String(p.arrival)) ? String(p.arrival) : '';
  var hour = String(p.arrivalHour == null ? '' : p.arrivalHour);
  if (arrival && /^([01]?\d|2[0-3])$/.test(hour)) {
    arrival += ' ' + ('0' + hour).slice(-2) + ':00';   // 24h, minutes always :00
  }

  sheet.getRange(row, COL.ACCOM).setValue(accom);
  sheet.getRange(row, COL.NIGHTS).setValue(nights);
  sheet.getRange(row, COL.ARRIVAL).setValue(arrival);
  sheet.getRange(row, COL.DETAILS_AT).setValue(new Date());
  return { ok: true };
}

function handleOpen_(p) {
  var key = normKey_(p.key);
  if (!key) return { ok: false, error: 'key_required' };

  var g = sheet_(GUESTS_SHEET);
  var row = guestRow_(g, key);
  if (!row) return { ok: true, tracked: false };   // not on the guest list — ignored

  var now = wib_(new Date());
  // "--" placeholders (migrated from the old Opens tab) count as empty,
  // otherwise First opened would stay a dash forever.
  var first = String(g.getRange(row, GCOL.FIRST).getValue()).replace(/[-—–\s]/g, '');
  if (!first) g.getRange(row, GCOL.FIRST).setValue(now);
  g.getRange(row, GCOL.LAST).setValue(now);
  g.getRange(row, GCOL.OPENS).setValue((parseInt(g.getRange(row, GCOL.OPENS).getValue(), 10) || 0) + 1);
  return { ok: true, tracked: true };
}

function guestRow_(sheet, key) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var rows = sheet.getRange(2, GCOL.NAME, last - 1, 2).getValues();   // Guest name | Companion
  var want = normKey_(key).toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    var name = String(rows[i][0] || '').trim();
    if (name === '') continue;
    var comp = String(rows[i][1] || '').trim();
    var full = normKey_(comp ? name + ' & ' + comp : name).toLowerCase();
    if (full && full === want) return i + 2;
  }
  return 0;
}

/* ═══════════════ WEB APP: data back to the website ═══════════════ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'wishes') return json_(getWishes_());
    if (p.action === 'status') return json_(getStatus_(p.key));
    return json_({ ok: true, service: 'jv-rsvp' });
  } catch (err) {
    return json_({ ok: false, error: String(err).slice(0, 140) });
  }
}

function getWishes_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('wishes');
  if (hit) return JSON.parse(hit);

  var sheet = sheet_(RSVP_SHEET);
  var last = sheet.getLastRow();
  var out = [];
  if (last > 1) {
    var vals = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {          // newest first
      var r = vals[i];
      if (r[COL.APPROVED - 1] === true && String(r[COL.WISHES - 1]).trim()) {
        out.push({ n: String(r[COL.NAME - 1]).slice(0, 80),
                   t: String(r[COL.WISHES - 1]).slice(0, 500) });
        if (out.length >= 100) break;
      }
    }
  }
  var payload = { ok: true, wishes: out };
  cache.put('wishes', JSON.stringify(payload), 60);       // 1-minute cache
  return payload;
}

function getStatus_(rawKey) {
  var key = normKey_(rawKey);
  if (!key) return { ok: true, found: false };
  var sheet = sheet_(RSVP_SHEET);
  var row = findRow_(sheet, key);
  if (!row) return { ok: true, found: false };

  var v = sheet.getRange(row, 1, 1, HEADERS.length).getDisplayValues()[0];
  var accomCode = '';
  for (var c in ACCOM_LABELS) if (ACCOM_LABELS[c] === v[COL.ACCOM - 1]) accomCode = c;
  return {
    ok: true, found: true,
    name: v[COL.NAME - 1],
    attending: v[COL.ATTENDING - 1],
    pax: parseInt(v[COL.PAX - 1], 10) || 1,
    wishes: v[COL.WISHES - 1],
    accommodation: accomCode,
    nights: v[COL.NIGHTS - 1],
    arrival: v[COL.ARRIVAL - 1],
    detailsDone: v[COL.DETAILS_AT - 1] !== ''
  };
}

/* ═══════════════ helpers ═══════════════ */

function sheet_(name) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!s) throw new Error('Sheet "' + name + '" missing — run setup() first.');
  return s;
}

function findRow_(sheet, key) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var keys = sheet.getRange(2, COL.KEY, last - 1, 1).getValues();
  var want = key.toLowerCase();
  for (var i = 0; i < keys.length; i++) {
    if (normKey_(keys[i][0]).toLowerCase() === want) return i + 2;
  }
  return 0;
}

function normKey_(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** Format a Date as an Indonesian-time (WIB, UTC+7) stamp: "17 Jul 2026, 15:04". */
function wib_(d) {
  return Utilities.formatDate(d, 'Asia/Jakarta', 'd MMM yyyy, HH:mm');
}

/** Legacy open-tracking cell → WIB string. Dates get formatted; "--" placeholders vanish. */
function stamp_(v) {
  if (!v) return '';
  if (v instanceof Date) return wib_(v);
  var s = String(v).trim();
  return /^[-—–\s]*$/.test(s) ? '' : s;
}

function clean_(s, max) {
  return String(s || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, max);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}
