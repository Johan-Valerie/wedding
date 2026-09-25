/**
 * Johan & Valerie — WEDDING RSVP backend (Google Apps Script)
 * ──────────────────────────────────────────────────────────
 * Lives inside the "Johan & Vali RSVP" Google Sheet. Separate from the
 * engagement sheet — do not point this at that one.
 *
 * SETUP (once, and again after pasting a new version of this file):
 *   1. Extensions → Apps Script, paste this file, Save.
 *   2. Run setup() and grant permissions.
 *   3. Deploy → Manage deployments → ✏ → Version: New version → Deploy.
 *      (First time only: Deploy → New deployment → Web app,
 *       Execute as: Me, Who has access: Anyone, and put the /exec URL in
 *       assets/js/main.js as API_URL.)
 *   Do 2 and 3 back to back. Saving alone does NOT update the live web app.
 *
 * THE FOUR TABS
 *   Invitation — one row per invitation (what used to be "Guests"). Column A
 *                is the invitation number: the row's position, by formula.
 *                Type a Guest name (and a Companion for a couple) and the
 *                personalized link appears.
 *
 *                The Holy Matrimony tickbox adds &hm=1 to that row's link,
 *                which is what shows the 3 PM ceremony card. It is read from
 *                the link alone, so tick it BEFORE the link goes out — a link
 *                already sent does not pick up a later tick.
 *
 *                Status, Pax confirmed, Accommodation and Nights are written
 *                by this script, not by formulas (see syncInvitationStatus_).
 *                Phone (WhatsApp) is kept for sending invitations later.
 *
 *                LINK NAMES (after the other columns). Every name this row's
 *                link has carried, one per line; an answer under ANY of them
 *                counts for this row. A sent link cannot change, so shorten a
 *                companion's name or add a surname after it went out and the
 *                guest still answers under the OLD name — without this column
 *                that answer belonged to no row. It fills itself: refreshLinks()
 *                adds each row's current name, editing a Guest name / Companion
 *                cell keeps the name it had (onEdit), and opening or answering
 *                adds the name the guest used. Type a name in by hand to claim
 *                a stray answer. If you REUSE a row for a different person,
 *                clear this cell, or the first person's answer counts for them.
 *   Guest List — one row per confirmed person, written by the site. Each
 *                invitation's rows are replaced whenever it re-submits.
 *   RSVP       — the raw submissions, one row per invitation, plus the
 *                Approved checkbox that gates a wish onto the site.
 *   Opens log  — one row per page load from a personal link: when, which
 *                invitation, the exact link, what that link shows, and whether
 *                it still matches the Sheet. "No" = that guest holds a link
 *                from before a change (Holy Matrimony ticked, seats changed,
 *                renamed); re-send them the link in column F. Created by
 *                setup()/refreshLinks(), never cleared by anything.
 *   Dashboard  — counts only; holds no data of its own.
 *
 * Rows are matched to invitations by NAME everywhere — the current name or
 * any of its Link names — never by number. The number is only the row's
 * position, so inserting a row changes it; the copies in RSVP and Guest List
 * are refreshed by refreshLinks().
 *
 * setup() is safe to re-run. It re-reads every tab by HEADER NAME, so data
 * follows its column when columns move, and it keeps any column it does not
 * know (moved to the right of the standard ones, as plain values) instead of
 * erasing it.
 *
 * RSVP columns are APPEND-ONLY on purpose. Between running setup() and
 * deploying the new version, the OLD deployment is still live and writes RSVP
 * rows by column position; as long as no existing RSVP column moves, a guest
 * answering in that minute still lands in the right cells.
 */

var RSVP_SHEET  = 'RSVP';
var INV_SHEET   = 'Invitation';
var GLIST_SHEET = 'Guest List';
var DASH_SHEET  = 'Dashboard';
var LEGACY_INV  = 'Guests';          // pre-rename name, migrated on setup()
var OPENS_SHEET = 'Opens';           // pre-July open log, folded in on setup()

var SITE_URL = 'https://johan-valerie.github.io/wedding/';
var TZ       = 'Asia/Jakarta';

/* Invitation rows get their number, link and tickbox at least this far down,
   so a name typed into any row gets its link without running anything. */
var FILL_ROWS = 1000;

/* RSVP columns (1-based) — append-only, see above */
var COL = { TIME:1, KEY:2, NAME:3, ATTENDING:4, PAX:5, WISHES:6, APPROVED:7,
            ACCOM:8, NIGHTS:9, ARRIVAL:10, DETAILS_AT:11, INVNO:12, GUESTS:13 };
var HEADERS = ['Timestamp','Guest link (key)','Invitation name','Attending','Pax',
               'Wishes','Approved','Accommodation','Nights','Arrival','Details completed',
               'Invitation no.','Guest names'];

/* Invitation columns (1-based) */
var ICOL = { NO:1, NAME:2, COMPANION:3, SEATS:4, HOLMAT:5, LINK:6, STATUS:7, PAX:8,
             ACCOM:9, NIGHTS:10, FIRST:11, LAST:12, OPENS:13, PHONE:14 };
var IHEADERS = ['Invitation no.','Guest name','Companion name','Max seats','Holy Matrimony',
                'Personalized link','Status','Pax confirmed','Accommodation','Nights',
                'First opened (WIB)','Last opened (WIB)','Opens','Phone (WhatsApp)'];
/* Link names is always FOUND BY ITS HEADER, never assumed to be column O: on a
   sheet laid out by an earlier version it is appended after whatever is there,
   and a column you added yourself must not be written over. setup() carries it
   like any column of yours. */
var LINKNAMES_HEADER = 'Link names';

/* Guest List columns (1-based) */
var GLCOL = { NO:1, GUEST:2, INVNO:3, INVNAME:4, WHEN:5 };
var GLHEADERS = ['No.','Guest name','Invitation no.','Invitation name','Confirmed (WIB)'];

/* Opens log — one row per page load, with the exact link used. Seats and Holy
   Matrimony live only in the link, so the link is the only record of what the
   guest saw. "Matches the Sheet?" compares it with the row as it is NOW.
   (Not the pre-July "Opens" tab above, which setup() folds in and deletes.) */
var OLOG_SHEET = 'Opens log';
var OLHEADERS  = ['Time (WIB)','Invitation no.','Name on link','Page shown',
                  'Matches the Sheet?','Link opened'];

var ACCOM_LABELS = {
  provided: 'Arranged hotel (hosted)',
  upgrade:  'Upgrade hotel (own expense)',
  self:     'Self-arranged'
};

/* Asawin nights we host per room; any beyond are paid by the guest. The site
   prices the same rule in main.js (HOSTED_NIGHTS) — keep the two in step. */
var HOSTED_NIGHTS = 2;

var STATUS = {
  ATTENDING: '✅ Attending',
  PENDING:   '✅ Attending · details pending',
  DECLINED:  '❌ Declined',
  OPENED:    '👀 Opened',
  UNOPENED:  '⏳ Not opened'
};

/* ═══════════════ SETUP ═══════════════ */

function setup() {
  var msg = withLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.setSpreadsheetTimeZone(TZ);
    setupRsvp_(ss);
    var report = setupInvitation_(ss);
    setupGuestList_(ss);
    restampNumbers_();
    setupOpensLog_(ss);
    setupDashboard_(ss);
    return 'Setup complete.\n\n' +
      'Tabs: Invitation (was "Guests", now numbered in column A), Guest List ' +
      '(filled in by the site), RSVP, Opens log, Dashboard.\n\n' +
      'Now Deploy → Manage deployments → edit → New version, so the live web ' +
      'app picks this up. Until you do, the old version is still answering.' +
      reportText_(report);
  });
  // Outside the lock: the dialog waits for a click, and guests must not.
  try { SpreadsheetApp.getUi().alert(msg); } catch (err) { Logger.log(msg); }
  return msg;
}

/** RSVP keeps its rows: they are re-read by header name and re-laid-out. */
function setupRsvp_(ss) {
  var s = ss.getSheetByName(RSVP_SHEET);
  var t = readTable_(s, HEADERS, { 'Invitation name': ['Name'] });
  var rows = t.rows.filter(function (r) {
    return String(r[COL.KEY - 1]).trim() !== '' || r.slice(HEADERS.length).some(hasData_);
  });
  var head = HEADERS.concat(t.extraHeaders);

  if (!s) s = ss.insertSheet(RSVP_SHEET);
  s.clear();
  s.getRange(1, 1, s.getMaxRows(), s.getMaxColumns()).clearDataValidations();
  ensureSize_(s, rows.length + 1, head.length);
  s.getRange(1, 1, 1, head.length).setValues([head])
   .setFontWeight('bold').setBackground('#292929').setFontColor('#ffffff');
  s.setFrozenRows(1);
  s.setColumnWidth(COL.KEY, 200);
  s.setColumnWidth(COL.WISHES, 320);
  s.setColumnWidth(COL.GUESTS, 220);
  // Arrival stays plain text ("2027-01-08 14:00"), or Sheets turns it into a date.
  // Format BEFORE the values go back, since clear() dropped the old format.
  s.getRange(2, COL.ARRIVAL, s.getMaxRows() - 1, 1).setNumberFormat('@');

  if (rows.length) {
    s.getRange(2, 1, rows.length, head.length).setValues(rows);
    ensureTickboxColumn_(s, COL.APPROVED, rows.length);
  }
}

/** "Guests" becomes "Invitation", gaining a formula-filled number in column A. */
function setupInvitation_(ss) {
  var s = ss.getSheetByName(INV_SHEET);
  var legacy = ss.getSheetByName(LEGACY_INV);

  // An old "Guests" tab is the same data under old headers.
  if (!s && legacy) { legacy.setName(INV_SHEET); s = legacy; legacy = null; }

  // 'Title' is read alongside so a pre-July Title column folds into the name.
  var READ = IHEADERS.concat(['Title']);
  var ALIASES = { 'Invitation no.': ['No.'], 'Guest name': ['Name'] };
  var t = readTable_(s, READ, ALIASES);
  if (legacy) {
    var old = readTable_(legacy, READ, ALIASES);
    var named = function (tab) {
      return tab.rows.some(function (r) { return String(r[ICOL.NAME - 1]).trim() !== ''; });
    };
    if (named(old) && named(t)) {
      throw new Error('Both an "' + INV_SHEET + '" and a "' + LEGACY_INV + '" tab hold guests. ' +
                      'setup() has changed nothing — merge them into one tab, delete the other, ' +
                      'and run setup() again.');
    }
    if (named(old)) t = old;
    ss.deleteSheet(legacy);
  }

  var TITLE = IHEADERS.length;          // where the Title column was read into
  var X = READ.length;                  // columns this script does not know start here
  var head = IHEADERS.concat(t.extraHeaders);

  if (!s) s = ss.insertSheet(INV_SHEET);
  s.clear();
  /* clear() keeps data validation. The Holy Matrimony tickboxes used to sit in
     column D, which is now Max seats — left in place they would turn every
     seat count into a broken checkbox. */
  s.getRange(1, 1, s.getMaxRows(), s.getMaxColumns()).clearDataValidations();
  ensureSize_(s, Math.max(FILL_ROWS, t.rows.length + 1), head.length);
  s.getRange(1, 1, 1, head.length).setValues([head])
   .setFontWeight('bold').setBackground('#292929').setFontColor('#ffffff');
  s.setFrozenRows(1);
  s.setColumnWidth(ICOL.NO, 110);
  s.setColumnWidth(ICOL.NAME, 200);
  s.setColumnWidth(ICOL.COMPANION, 180);
  s.setColumnWidth(ICOL.HOLMAT, 120);
  s.setColumnWidth(ICOL.LINK, 420);
  s.setColumnWidth(ICOL.STATUS, 220);
  s.setColumnWidth(ICOL.ACCOM, 200);
  s.setColumnWidth(ICOL.FIRST, 150);
  s.setColumnWidth(ICOL.LAST, 150);
  s.setColumnWidth(ICOL.PHONE, 150);
  // Phone stays text, so a leading 0 or + survives. Format before values.
  s.getRange(2, ICOL.PHONE, s.getMaxRows() - 1, 1).setNumberFormat('@');

  /* Rows go back exactly where they were, blank ones included. A blank row
     can be a deliberate gap between groups, and closing it up would renumber
     every invitation below it. */
  var out = t.rows.map(function (r) {
    var name  = String(r[ICOL.NAME - 1] || '').trim();
    var title = String(r[TITLE] || '').trim();
    if (title) name = (title + ' ' + name).trim();     // fold old Title into the name
    return ['', name, String(r[ICOL.COMPANION - 1] || '').trim(), r[ICOL.SEATS - 1],
            r[ICOL.HOLMAT - 1] === true, '', '', '', '', '',
            stamp_(r[ICOL.FIRST - 1]), stamp_(r[ICOL.LAST - 1]),
            parseInt(r[ICOL.OPENS - 1], 10) || '',
            String(r[ICOL.PHONE - 1] || '').trim()].concat(r.slice(X));
  });
  if (out.length) s.getRange(2, 1, out.length, head.length).setValues(out);

  foldOpensTab_(ss, s);
  SpreadsheetApp.flush();
  return writeInvitationFormulas_(s);
}

/** Written by the site. Setup only creates it and keeps whatever is there. */
function setupGuestList_(ss) {
  var s = ss.getSheetByName(GLIST_SHEET);
  var t = readTable_(s, GLHEADERS);
  var rows = t.rows.filter(function (r) {
    return String(r[GLCOL.GUEST - 1]).trim() !== '' || r.slice(GLHEADERS.length).some(hasData_);
  });
  var head = GLHEADERS.concat(t.extraHeaders);

  if (!s) s = ss.insertSheet(GLIST_SHEET);
  s.clear();
  ensureSize_(s, rows.length + 1, head.length);
  s.getRange(1, 1, 1, head.length).setValues([head])
   .setFontWeight('bold').setBackground('#292929').setFontColor('#ffffff');
  s.setFrozenRows(1);
  s.setColumnWidth(GLCOL.NO, 60);
  s.setColumnWidth(GLCOL.GUEST, 230);
  s.setColumnWidth(GLCOL.INVNO, 110);
  s.setColumnWidth(GLCOL.INVNAME, 230);
  s.setColumnWidth(GLCOL.WHEN, 160);

  numberGuestList_(rows);
  if (rows.length) s.getRange(2, 1, rows.length, head.length).setValues(rows);
}

/**
 * Creates the Opens log if it is missing. NEVER clears it — unlike the other
 * tabs it is history, and nothing else holds it. Only setup()/refreshLinks()
 * create it; a guest's visit never changes the shape of the spreadsheet.
 */
function setupOpensLog_(ss) {
  var s = ss.getSheetByName(OLOG_SHEET);
  if (!s) s = ss.insertSheet(OLOG_SHEET);
  if (String(s.getRange(1, 1).getValue()).trim() === '') {
    s.getRange(1, 1, 1, OLHEADERS.length).setValues([OLHEADERS])
     .setFontWeight('bold').setBackground('#292929').setFontColor('#ffffff');
    s.setFrozenRows(1);
    s.setColumnWidth(1, 140);
    s.setColumnWidth(3, 200);
    s.setColumnWidth(4, 220);
    s.setColumnWidth(5, 300);
    s.setColumnWidth(6, 460);
  }
}

function setupDashboard_(ss) {
  var d = ss.getSheetByName(DASH_SHEET) || ss.insertSheet(DASH_SHEET);
  d.clear();
  d.getRange(1, 1).setValue('JOHAN & VALERIE — WEDDING RSVP DASHBOARD')
   .setFontWeight('bold').setFontSize(14);
  /* Every range goes through INDIRECT, and that is the whole point of this
     block rather than a stylistic choice.

     A plain reference like Invitation!B2:B is a LIVE reference: insert rows at
     the top of the Invitation tab and Sheets rewrites it to Invitation!B6:B so
     it keeps pointing at the same cells. For a count that is exactly wrong —
     it should follow the header, not the rows that happened to be under it.
     This bit the engagement sheet: four inserted rows silently turned every
     total into "everything except the first four invitations".

     INDIRECT takes a STRING, which Sheets cannot rewrite, so these stay pinned
     to row 2 through any insert, delete or drag. */
  var I = function (range) { return 'INDIRECT("' + range + '")'; };
  var hosted = '"' + ACCOM_LABELS.provided + '"';
  /* Hotel rows count ATTENDING guests only. A guest who picks a hotel and
     later declines keeps that choice in the RSVP tab, and without this filter
     their room would still be counted — and booked. */
  var yes = I('RSVP!D2:D') + ',"Yes"';
  var hostedYes = '(' + I('RSVP!D2:D') + '="Yes")*(' + I('RSVP!H2:H') + '=' + hosted + ')';
  var nightsCol = I('RSVP!I2:I');
  var rows = [
    ['INVITATIONS', ''],
    ['Invitations on the list',     '=COUNTA(' + I('Invitation!B2:B') + ')'],
    ['  … invited to Holy Matrimony', '=COUNTIF(' + I('Invitation!E2:E') + ',TRUE)'],
    ['Seats allocated',             '=ARRAYFORMULA(SUM(IF(' + I('Invitation!B2:B') + '="",0,' +
                                    'IF(' + I('Invitation!D2:D') + '="",2,' + I('Invitation!D2:D') + '))))'],
    ['Links opened',                '=COUNTIF(' + I('Invitation!K2:K') + ',"<>")'],
    ['Total link opens',            '=SUM(' + I('Invitation!M2:M') + ')'],
    ['Opens with an outdated link', "=IFERROR(COUNTIF(INDIRECT(\"'" + OLOG_SHEET + "'!E2:E\"),\"No*\"),0)"],
    ['', ''],
    ['RESPONSES', ''],
    ['Responses received',          '=COUNTA(' + I('RSVP!B2:B') + ')'],
    ['Attending',                   '=COUNTIF(' + I('RSVP!D2:D') + ',"Yes")'],
    ['Declined',                    '=COUNTIF(' + I('RSVP!D2:D') + ',"No")'],
    ['Total seats needed',          '=SUMIF(' + I('RSVP!D2:D') + ',"Yes",' + I('RSVP!E2:E') + ')'],
    ['Names on guest list',         "=COUNTA(INDIRECT(\"'Guest List'!B2:B\"))"],
    ['Wishes awaiting approval',    '=COUNTIFS(' + I('RSVP!F2:F') + ',"<>",' + I('RSVP!G2:G') + ',FALSE)'],
    ['', ''],
    ['ACCOMMODATION', ''],
    ['Arranged hotel (hosted) — rooms', '=COUNTIFS(' + yes + ',' + I('RSVP!H2:H') + ',' + hosted + ')'],
    ['  … seats in hosted rooms',   '=SUMIFS(' + I('RSVP!E2:E') + ',' + yes + ',' + I('RSVP!H2:H') + ',' + hosted + ')'],
    ['  … hosted room-nights',      '=SUMIFS(' + nightsCol + ',' + yes + ',' + I('RSVP!H2:H') + ',' + hosted + ')'],
    ['      of which on us (first ' + HOSTED_NIGHTS + ' per room)',
                                    '=ARRAYFORMULA(SUM(IF(' + hostedYes + ',IF(' + nightsCol + '>' + HOSTED_NIGHTS +
                                    ',' + HOSTED_NIGHTS + ',' + nightsCol + '),0)))'],
    ['      of which extra, guests pay Asawin',
                                    '=ARRAYFORMULA(SUM(IF(' + hostedYes + ',IF(' + nightsCol + '>' + HOSTED_NIGHTS +
                                    ',' + nightsCol + '-' + HOSTED_NIGHTS + ',0),0)))'],
    ['Upgrade hotel (own cost)',    '=COUNTIFS(' + yes + ',' + I('RSVP!H2:H') + ',"' + ACCOM_LABELS.upgrade + '")'],
    ['Self-arranged stay',          '=COUNTIFS(' + yes + ',' + I('RSVP!H2:H') + ',"' + ACCOM_LABELS.self + '")'],
    ['Details still pending',       '=COUNTIFS(' + I('RSVP!D2:D') + ',"Yes",' + I('RSVP!K2:K') + ',"")']
  ];
  d.getRange(3, 1, rows.length, 2).setValues(rows);
  d.getRange(3, 1, rows.length, 1).setFontWeight('bold');
  d.setColumnWidth(1, 260);
}

/**
 * Number, personalized link and Holy Matrimony tickbox down the tab, then the
 * status mirrors. The number is =ROW()-1, so every invitation's number is
 * always its current row.
 */
function writeInvitationFormulas_(s) {
  var n = Math.max(FILL_ROWS, s.getLastRow()) - 1;
  ensureSize_(s, n + 1, IHEADERS.length);
  var key  = 'TRIM(B{r}) & IF(TRIM(C{r})="", "", " & " & TRIM(C{r}))';
  var no   = '=IF(B{r}="","",ROW()-1)';
  var link = '=IF(B{r}="","", "' + SITE_URL + '?to=" & ENCODEURL(' + key + ')' +
             ' & "&max=" & IF(D{r}="",2,D{r}) & IF(E{r}=TRUE, "&hm=1", ""))';
  var N = [], L = [];
  for (var i = 0; i < n; i++) {
    var r = i + 2;
    N.push([no.replace(/\{r\}/g, r)]);
    L.push([link.replace(/\{r\}/g, r)]);
  }
  s.getRange(2, ICOL.NO,   n, 1).setFormulas(N);
  s.getRange(2, ICOL.LINK, n, 1).setFormulas(L);
  ensureTickboxColumn_(s, ICOL.HOLMAT, n);
  return syncInvitationStatus_(s);
}

/**
 * Put tickboxes down a column without disturbing what is already ticked.
 * insertCheckboxes() is documented as configuring cells rather than preserving
 * their contents, so a re-run of setup() could otherwise clear every Holy
 * Matrimony tick and every Approved wish with nothing to say it happened.
 * Reading first and writing back after is correct whichever way it behaves.
 */
function ensureTickboxColumn_(s, col, n) {
  if (n < 1) return;
  var range = s.getRange(2, col, n, 1);
  var was   = range.getValues();
  range.insertCheckboxes();
  range.setValues(was.map(function (r) { return [r[0] === true]; }));
}

/**
 * Mirrors each invitation's answer into Status, Pax confirmed, Accommodation
 * and Nights, as plain values.
 *
 * These used to be INDEX/MATCH formulas looking the invitation name up in the
 * RSVP tab, which made two independent things agree on a piece of text: the
 * name the sheet rebuilds from "Guest name & Companion name", and the key the
 * web app stored. They did not always agree — the web app cut keys at 80
 * characters and the formula did not, so a long couple's name read
 * "No reply" forever. Matching here puts both sides through keyOf_, so they
 * cannot disagree, and re-reading every RSVP means this repairs itself.
 *
 * An answer is matched through ALL of a row's names — the current
 * "Name & Companion" and everything in Link names — so renaming a row after
 * its link went out cannot detach the answer. Creates the Link names column
 * when it is missing (only setup() and refreshLinks() come through here).
 *
 * Returns what it did about answers that belonged to no row, for the report.
 */
function syncInvitationStatus_(s) {
  s = s || sheet_(INV_SHEET);
  var n = s.getLastRow() - 1;
  if (n < 1) return null;

  var inv = invitationContext_(true, s);
  recordCurrentNames_(inv, n);

  var rsvp = sheet_(RSVP_SHEET);
  var rows = rsvp.getLastRow() > 1
    ? rsvp.getRange(2, 1, rsvp.getLastRow() - 1, HEADERS.length).getValues()
    : [];
  var report = adoptStrayAnswers_(inv, rows, n);

  /* One answer per invitation row. Two RSVP rows can land on the same
     invitation (answered under an old name, then again under the new one,
     before Link names knew both); the most recent one is the answer. */
  var answers = {};
  rows.forEach(function (r) {
    var row = rowOf_(inv, r[COL.KEY - 1]);
    if (!row) return;
    var t = timeOf_(r[COL.TIME - 1]);
    if (!answers[row] || t >= answers[row].t) answers[row] = { r: r, t: t };
  });

  var who    = s.getRange(2, ICOL.NAME,  n, 1).getValues();
  var opened = s.getRange(2, ICOL.FIRST, n, 1).getValues();
  var out = [];
  for (var i = 0; i < n; i++) {
    if (!String(who[i][0]).trim()) { out.push(['', '', '', '']); continue; }
    var a = answers[i + 2];
    out.push(a ? mirrorOf_(a.r) : [String(opened[i][0]).trim() ? STATUS.OPENED : STATUS.UNOPENED, '', '', '']);
  }
  s.getRange(2, ICOL.STATUS, n, 4).setValues(out);
  return report;
}

/** Every row's current "Name & Companion" goes into its Link names, once. */
function recordCurrentNames_(inv, n) {
  if (!inv.col) return;
  var who  = inv.s.getRange(2, ICOL.NAME, n, 2).getValues();
  var cell = inv.s.getRange(2, inv.col, n, 1);
  var was  = cell.getValues();
  var out  = [], changed = false;

  for (var i = 0; i < n; i++) {
    var list = splitNames_(was[i][0]);
    var cur  = currentName_(who[i][0], who[i][1]);
    if (cur && !hasName_(list, cur)) { list.push(cur); changed = true; }
    if (cur) inv.lists[i + 2] = list;
    out.push([list.join('\n')]);
  }
  if (changed) cell.setValues(out);
}

/**
 * An RSVP whose name matches no row at all — answered under a name the row no
 * longer has, from before Link names existed. It is given to a row ONLY when
 * that is unambiguous: exactly one row has the same Guest name as the answer's
 * first person, that row has no answer of its own yet, and no other stray
 * answer points at it. Anything short of that is left alone and listed.
 */
function adoptStrayAnswers_(inv, rows, n) {
  var answered = {}, strays = [], seen = Object.create(null);
  rows.forEach(function (r) {
    var k = keyOf_(r[COL.KEY - 1]);
    if (!k) return;
    var row = rowOf_(inv, k);
    if (row) { answered[row] = true; return; }
    /* "Invitation name" is the same name uncut; the key column stops at 80. */
    var raw = keyOf_(r[COL.NAME - 1]) === k
      ? String(r[COL.NAME - 1]).replace(/\s+/g, ' ').trim()
      : normKey_(r[COL.KEY - 1]);
    if (!seen[k]) { seen[k] = true; strays.push(raw); }
  });

  var byGuest = Object.create(null);
  var names = inv.s.getRange(2, ICOL.NAME, n, 1).getValues();
  for (var i = 0; i < n; i++) {
    var g = keyOf_(names[i][0]);
    if (g) (byGuest[g] = byGuest[g] || []).push(i + 2);
  }

  var claims = {}, report = { linked: [], unlinked: [] };
  strays.forEach(function (raw) {
    var first = keyOf_(raw.split(/\s+&\s+/)[0]);
    var open  = (byGuest[first] || []).filter(function (r) { return !answered[r]; });
    if (open.length === 1) (claims[open[0]] = claims[open[0]] || []).push(raw);
    else report.unlinked.push(raw);
  });

  Object.keys(claims).forEach(function (row) {
    var list = claims[row];
    if (list.length !== 1) { report.unlinked = report.unlinked.concat(list); return; }
    rememberName_(inv, Number(row), list[0]);
    report.linked.push({ name: list[0], row: Number(row) });
  });
  return report;
}

/** Status..Nights for one RSVP row. */
function mirrorOf_(r) {
  /* A guest who declines keeps their hotel choice in the RSVP tab, so saying
     yes again brings it straight back — but it is not shown here, where the
     hotel list gets read, because nobody should book a room for someone who
     is not coming. */
  if (r[COL.ATTENDING - 1] !== 'Yes') return [STATUS.DECLINED, 0, '', ''];
  return [r[COL.DETAILS_AT - 1] === '' ? STATUS.PENDING : STATUS.ATTENDING,
          r[COL.PAX - 1], r[COL.ACCOM - 1], r[COL.NIGHTS - 1]];
}

/**
 * Invitation numbers are row positions, so inserting or deleting a row in the
 * Invitation tab changes them. The copies kept in RSVP and Guest List are
 * brought back in line here, looked up by invitation name. Nothing ever
 * MATCHES on these numbers — they are only there for reading.
 */
function restampNumbers_() {
  var inv = invitationContext_(false);
  var num = function (k) {
    var row = rowOf_(inv, k);
    return row ? row - 1 : '';
  };
  var r = sheet_(RSVP_SHEET), n = r.getLastRow() - 1;
  if (n > 0) {
    r.getRange(2, COL.INVNO, n, 1).setValues(
      r.getRange(2, COL.KEY, n, 1).getValues().map(function (x) { return [num(x[0])]; }));
  }
  var g = sheet_(GLIST_SHEET), m = g.getLastRow() - 1;
  if (m > 0) {
    g.getRange(2, GLCOL.INVNO, m, 1).setValues(
      g.getRange(2, GLCOL.INVNAME, m, 1).getValues().map(function (x) { return [num(x[0])]; }));
  }
}

/**
 * Re-run after INSERTING invitation rows, or any time something looks wrong.
 * Re-lays the number and link formulas, extends the tickboxes, records each
 * row's current name in Link names, re-reads every RSVP to repair
 * Status..Nights (linking answers that came in under an older name when that
 * is certain), refreshes the invitation numbers copied into RSVP and Guest
 * List, creates the Opens log if missing, and rebuilds the Dashboard.
 */
function refreshLinks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = withLock_(function () {
    SpreadsheetApp.flush();
    setupOpensLog_(ss);
    var r = writeInvitationFormulas_(sheet_(INV_SHEET));
    restampNumbers_();
    setupDashboard_(ss);
    return r;
  });
  var more = reportText_(report);
  // Outside the lock: the dialog waits for a click, and guests must not.
  if (more) {
    Logger.log(more);
    try { SpreadsheetApp.getUi().alert(more.trim()); } catch (err) { /* not run from the sheet */ }
  }
  return 'Links, numbers and statuses refreshed.' + more;
}

/** Answers that belong to no row, in words — '' when there are none. */
function reportText_(report) {
  if (!report || (!report.linked.length && !report.unlinked.length)) return '';
  var msg = '';
  if (report.linked.length) {
    msg += '\n\nLinked ' + report.linked.length + ' answer(s) that came in under an older name:\n' +
      report.linked.map(function (x) {
        return '  • "' + x.name + '" → invitation no. ' + (x.row - 1);
      }).join('\n') +
      '\n(Their name was added to that row\'s Link names. Wrong? Delete it there and run refreshLinks() again.)';
  }
  if (report.unlinked.length) {
    msg += '\n\nAnswers not linked to any invitation (someone without a personal ' +
      'link, a test, or a name no row has any more):\n' +
      report.unlinked.map(function (x) { return '  • "' + x + '"'; }).join('\n') +
      '\n(To link one, type that exact name into the right row\'s Link names cell, then run refreshLinks() again. Test answers can simply be deleted from the RSVP tab.)';
  }
  return msg;
}

/** Rebuild the Dashboard alone — it holds no data, only counts. */
function refreshDashboard() {
  return withLock_(function () {
    setupDashboard_(SpreadsheetApp.getActiveSpreadsheet());
    return 'Dashboard rebuilt.';
  });
}

/**
 * ONE-TIME REPAIR — run if RSVPs ever land at row 1001+. Compacts real
 * responses up to row 2. Approved states are preserved.
 */
function fixRows() {
  return withLock_(function () {
    var s = sheet_(RSVP_SHEET);
    var last = s.getLastRow();
    if (last < 2) return 'Nothing to fix — no responses yet.';
    var width = Math.max(s.getLastColumn(), HEADERS.length);
    var data = s.getRange(2, 1, last - 1, width).getValues()
                .filter(function (r) { return String(r[COL.KEY - 1]).trim() !== ''; });
    var below = s.getRange(2, 1, s.getMaxRows() - 1, width);
    below.clearContent();
    below.clearDataValidations();
    if (data.length) {
      s.getRange(2, 1, data.length, width).setValues(data);
      ensureTickboxColumn_(s, COL.APPROVED, data.length);
    }
    CacheService.getScriptCache().remove('wishes');
    return 'Fixed — ' + data.length + ' response(s) now start at row 2.';
  });
}

/* ═══════════════ WEB APP: receive from the website ═══════════════ */

function doPost(e) {
  /* The site posts form fields; a JSON body is accepted too. Both reach here
     as the same object, so any copy of the page — old or new — is heard. */
  var p;
  try { p = JSON.parse(e.postData.contents); } catch (err) { p = null; }
  if (!p || typeof p !== 'object') p = (e && e.parameter) || {};
  if (p.hp) return json_({ ok: true });                 // honeypot → silently ignore bots

  /* Apps Script runs concurrent posts in parallel, and the writers below are
     read-modify-write: syncGuestList_ rewrites a whole block, writeAnswer_
     chooses between updating a row and appending one. Two guests submitting in
     the same second could drop each other's names or double-append — and
     every link goes out at once, which is exactly when that happens. */
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); }
  catch (err) { return json_({ ok: false, error: 'busy' }); }

  try {
    if (p.action === 'rsvp')    return json_(handleRsvp_(p));
    if (p.action === 'details') return json_(handleDetails_(p));
    if (p.action === 'open')    return json_(handleOpen_(p));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: String(err).slice(0, 140) });
  } finally {
    lock.releaseLock();
  }
}

function handleRsvp_(p) {
  var key = normKey_(p.key || p.name);
  if (!key) return { ok: false, error: 'key_required' };

  var a = answerFrom_(p, key, false);
  /* One read of the Invitation tab gives every name each invitation answers
     to, so an answer under a name the row no longer has still finds it. */
  var inv = invitationContext_(false);
  var invRow = rowOf_(inv, key);
  a.invNo = invRow ? invRow - 1 : '';

  var sheet = sheet_(RSVP_SHEET);
  var w = writeAnswer_(sheet, findRsvpRow_(sheet, key, inv), a);

  if (invRow) {
    writeMirror_(invRow, w.values);
    rememberName_(inv, invRow, p.key || p.name);
  }
  // An old copy of the page sends no names; keep what an earlier answer gave.
  if (a.guests.length || !a.yes) syncGuestList_(a.invNo, key, a.guests, inv);
  CacheService.getScriptCache().remove('wishes');
  return { ok: true, stage2: a.yes };
}

function handleDetails_(p) {
  var key = normKey_(p.key || p.name);
  if (!key) return { ok: false, error: 'key_required' };

  var accom = ACCOM_LABELS[String(p.accommodation)] || '';
  if (!accom) return { ok: false, error: 'accommodation_required' };

  var nights = '';
  if (String(p.accommodation) !== 'self') {           // self-arranged stays track no nights
    nights = parseInt(p.nights, 10);
    if (!(nights >= 1 && nights <= 30)) return { ok: false, error: 'nights_required' };
  }

  var arrival = /^\d{4}-\d{2}-\d{2}$/.test(String(p.arrival)) ? String(p.arrival) : '';
  var hour = String(p.arrivalHour == null ? '' : p.arrivalHour);
  if (arrival && /^([01]?\d|2[0-3])$/.test(hour)) {
    arrival += ' ' + ('0' + hour).slice(-2) + ':00';   // 24h, minutes always :00
  }

  var inv = invitationContext_(false);
  var invRow = rowOf_(inv, key);
  var sheet = sheet_(RSVP_SHEET);
  var row = findRsvpRow_(sheet, key, inv);
  if (!row || sheet.getRange(row, COL.ATTENDING).getValue() !== 'Yes') {
    /* Guest Details only appears after a guest has said yes on the site, so
       a details post that finds no "Yes" means that yes never landed — lost,
       or still queued behind the lock. The site sends the same answer along
       with the details, so record it now rather than leave a half row. */
    var a = answerFrom_(p, key, true);
    a.invNo = invRow ? invRow - 1 : '';
    row = writeAnswer_(sheet, row, a).row;
    if (a.guests.length) syncGuestList_(a.invNo, key, a.guests, inv);
    CacheService.getScriptCache().remove('wishes');
  }

  sheet.getRange(row, COL.ACCOM, 1, 4).setValues([[accom, nights, arrival, new Date()]]);
  if (invRow) {
    writeMirror_(invRow, sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
    rememberName_(inv, invRow, p.key || p.name);
  }
  return { ok: true };
}

/** The answer a post carries, cleaned. `forceYes` for a details post. */
function answerFrom_(p, key, forceYes) {
  var yes = forceYes || /^(yes|attend|true)$/i.test(String(p.attending));
  var guests = yes ? guestsFrom_(p.guests) : [];
  return {
    key: key,
    name: clean_(p.name, 120) || key,
    yes: yes,
    guests: guests,
    pax: yes ? Math.max(1, Math.min(20, parseInt(p.pax, 10) || guests.length || 1)) : 0,
    wishes: clean_(p.wishes, 500)
  };
}

/** Guest names from a post: an array (JSON body) or a JSON string (form field). */
function guestsFrom_(g) {
  if (typeof g === 'string') {
    var s = g.trim();
    if (s.charAt(0) === '[') { try { g = JSON.parse(s); } catch (err) { g = []; } }
    else g = s ? s.split('\n') : [];
  }
  if (!Array.isArray(g)) return [];
  return g.map(function (n) { return clean_(n, 120).replace(/\s+/g, ' '); })
          .filter(String).slice(0, 20);
}

/**
 * Writes an answer into the invitation's RSVP row — one read and one write
 * for an existing row, an append for a new one. Details (hotel, nights,
 * arrival) are carried through untouched. An edited wish goes back to
 * unapproved, so new text never reaches the wall unreviewed; an empty wishes
 * box keeps the earlier wish. Guest names are stored one per line, so a name
 * with a comma in it ("John Doe, Jr.") comes back whole. The key becomes the
 * name just used, for a row first answered under an older name.
 */
function writeAnswer_(sheet, row, a) {
  var v;
  if (row) {
    v = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];
    v[COL.TIME - 1] = new Date();
    v[COL.KEY - 1] = a.key;
    v[COL.NAME - 1] = a.name;
    v[COL.ATTENDING - 1] = a.yes ? 'Yes' : 'No';
    v[COL.PAX - 1] = a.pax;
    if (a.wishes && a.wishes !== String(v[COL.WISHES - 1])) {
      v[COL.WISHES - 1] = a.wishes;
      v[COL.APPROVED - 1] = false;
    }
    v[COL.APPROVED - 1] = v[COL.APPROVED - 1] === true;
    v[COL.INVNO - 1] = a.invNo;
    if (a.guests.length || !a.yes) v[COL.GUESTS - 1] = a.guests.join('\n');
    sheet.getRange(row, 1, 1, HEADERS.length).setValues([v]);
  } else {
    v = [new Date(), a.key, a.name, a.yes ? 'Yes' : 'No', a.pax, a.wishes, false,
         '', '', '', '', a.invNo, a.guests.join('\n')];
    row = appendRsvpRow_(sheet, v);
  }
  return { row: row, values: v };
}

function appendRsvpRow_(sheet, v) {
  sheet.appendRow(v);
  var row = sheet.getLastRow();
  // checkbox added per row: pre-filling the column pushes new rows to 1001
  sheet.getRange(row, COL.APPROVED).insertCheckboxes().setValue(false);
  return row;
}

/**
 * Replaces this invitation's rows in the Guest List with the names just
 * submitted — matched by invitation NAME, never by number: this name, or any
 * other name of the same Invitation row (Link names), so rows written under
 * an older name are replaced too. The block stays where it was, and every
 * column beyond the standard five (a Table, Room or Diet column you add)
 * travels with its person: same name first, else the same position, so a
 * corrected spelling keeps its table. Someone who switches from yes to no
 * drops off the list.
 */
function syncGuestList_(invNo, invKey, names, inv) {
  var s = sheet_(GLIST_SHEET);
  var last = s.getLastRow();
  var width = Math.max(s.getLastColumn(), GLHEADERS.length);
  var rows = last > 1 ? s.getRange(2, 1, last - 1, width).getValues() : [];
  var want = keyOf_(invKey);
  var myRow = rowOf_(inv, invKey);

  var before = [], mine = [], after = [];
  rows.forEach(function (r) {
    if (!r.some(hasData_)) return;                               // drop blank rows
    var theirs = r[GLCOL.INVNAME - 1];
    if (keyOf_(theirs) === want || (myRow && rowOf_(inv, theirs) === myRow)) mine.push(r);
    else (mine.length ? after : before).push(r);
  });

  var now = wib_(new Date());
  var used = [];
  var fresh = names.map(function (n, i) {
    var from = -1, j;
    for (j = 0; j < mine.length; j++) {
      if (!used[j] && keyOf_(mine[j][GLCOL.GUEST - 1]) === keyOf_(n)) { from = j; break; }
    }
    if (from < 0 && i < mine.length && !used[i]) from = i;
    if (from >= 0) used[from] = true;
    var row = ['', n, invNo, invKey, now];
    for (j = GLHEADERS.length; j < width; j++) row.push(from >= 0 ? mine[from][j] : '');
    return row;
  });

  var out = before.concat(fresh, after);
  numberGuestList_(out);
  // One clearContent plus one setValues, not a deleteRow per moved name.
  if (rows.length) s.getRange(2, 1, rows.length, width).clearContent();
  if (out.length) s.getRange(2, 1, out.length, width).setValues(out);
}

/** Numbers the people on the list 1, 2, 3 … (rows without a name get none). */
function numberGuestList_(rows) {
  var n = 0;
  rows.forEach(function (r) { r[GLCOL.NO - 1] = String(r[GLCOL.GUEST - 1]).trim() ? ++n : ''; });
}

function handleOpen_(p) {
  var key = normKey_(p.key);
  if (!key) return { ok: false, error: 'key_required' };

  var inv = invitationContext_(false);
  var row = rowOf_(inv, key);

  /* Logged BEFORE the no-match return: a visit under a name that matches no
     invitation is exactly the one worth seeing. */
  logOpen_(inv.s, row, clean_(p.key, 120), clean_(p.link, 500));
  if (!row) return { ok: true, tracked: false };      // not on the list — ignored

  /* Status..Opens is one contiguous block, so the whole update is a single
     read and a single write. */
  var s = inv.s;
  var span = ICOL.OPENS - ICOL.STATUS + 1;
  var v = s.getRange(row, ICOL.STATUS, 1, span).getValues()[0];
  var at = function (col) { return col - ICOL.STATUS; };

  var now = wib_(new Date());
  if (!stamp_(v[at(ICOL.FIRST)])) v[at(ICOL.FIRST)] = now;
  v[at(ICOL.LAST)]  = now;
  v[at(ICOL.OPENS)] = (parseInt(v[at(ICOL.OPENS)], 10) || 0) + 1;
  // Only a row that has not answered moves to "Opened".
  var state = String(v[at(ICOL.STATUS)]).trim();
  if (!state || state === STATUS.UNOPENED) v[at(ICOL.STATUS)] = STATUS.OPENED;

  s.getRange(row, ICOL.STATUS, 1, span).setValues([v]);
  /* The link this guest actually holds, proven by their opening it. Kept so
     that renaming the row afterwards cannot detach their answer. */
  rememberName_(inv, row, p.key);
  return { ok: true, tracked: true };
}

/**
 * One row in the Opens log for this visit. Silent on any failure, and does
 * nothing until setup()/refreshLinks() has created the tab — so deploying
 * this before that step changes nothing at all.
 */
function logOpen_(s, row, name, link) {
  try {
    var log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(OLOG_SHEET);
    if (!log) return;
    var f = linkFlags_(link);
    log.appendRow([
      wib_(new Date()),
      row ? row - 1 : '',
      safeText_(name),
      f ? pageShown_(f) : '(link not sent)',
      f ? linkCheck_(s, row, f) : '?',
      safeText_(link)
    ]);
  } catch (err) { /* bookkeeping only — never fail a visit over it */ }
}

/**
 * Reads the link exactly the way the site does: URLSearchParams (first value
 * wins, "+" is a space), then `to` decoded once more; max that is not a
 * positive number leaves the page's default of 2. null when the page did not
 * send one (an older copy of the site).
 */
function linkFlags_(link) {
  link = String(link == null ? '' : link).split('#')[0];
  if (!link) return null;
  var params = Object.create(null);
  var q = link.indexOf('?') < 0 ? '' : link.slice(link.indexOf('?') + 1);
  q.split('&').forEach(function (kv) {
    if (!kv) return;
    var j = kv.indexOf('=');
    var k = decode_(j < 0 ? kv : kv.slice(0, j));
    var v = decode_(j < 0 ? '' : kv.slice(j + 1));
    if (!(k in params)) params[k] = v;
  });
  var to = String(params.to || '');
  try { to = decodeURIComponent(to); } catch (err) { /* the site keeps it as is */ }
  var max = parseInt(params.max, 10);
  return { to: to.trim(), max: max > 0 ? max : 2, hm: params.hm === '1' };
}

function decode_(s) {
  s = String(s).replace(/\+/g, ' ');
  try { return decodeURIComponent(s); } catch (err) { return s; }
}

/** What that link puts on screen, in the couple's words. */
function pageShown_(f) {
  return 'RSVP, up to ' + f.max + (f.hm ? ' + Holy Matrimony' : '');
}

/**
 * "Yes" when the link opened would still be the link in column F today;
 * otherwise what the row says NOW that the guest's page does not.
 */
function linkCheck_(s, row, f) {
  if (!row || !s) return 'No — no invitation has this name';
  var v = s.getRange(row, ICOL.NAME, 1, 4).getValues()[0];   // name, companion, seats, Holy Matrimony
  var diffs = [];
  var hm = v[3] === true;
  var seats = parseInt(v[2], 10);
  if (!(seats > 0)) seats = 2;
  if (hm !== f.hm)       diffs.push(hm ? 'Holy Matrimony on' : 'Holy Matrimony off');
  if (seats !== f.max)   diffs.push('up to ' + seats);
  var cur = currentName_(v[0], v[1]);
  if (keyOf_(cur) !== keyOf_(f.to)) diffs.push('name "' + cur + '"');
  return diffs.length ? 'No — Sheet now: ' + diffs.join(', ') : 'Yes';
}

/** Guest-supplied text written as text, never run as a formula. */
function safeText_(v) {
  v = String(v == null ? '' : v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
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

/** The name on a wish is the invitation name — guests never type one. */
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
  var row = findRsvpRow_(sheet, key, null);
  if (!row) {
    /* Not under this exact name — it may have been answered under another
       name of the same invitation (a link re-sent after a rename). Only looked
       for on a miss, so an ordinary lookup costs no extra reads. */
    try { row = findRsvpRow_(sheet, key, invitationContext_(false)); }
    catch (err) { row = 0; }
  }
  if (!row) return { ok: true, found: false };

  var v = sheet.getRange(row, 1, 1, HEADERS.length).getDisplayValues()[0];
  var accomCode = '';
  for (var c in ACCOM_LABELS) if (ACCOM_LABELS[c] === v[COL.ACCOM - 1]) accomCode = c;
  return {
    ok: true, found: true,
    name: v[COL.NAME - 1],
    invitation: v[COL.INVNO - 1],
    attending: v[COL.ATTENDING - 1],
    pax: parseInt(v[COL.PAX - 1], 10) || 0,
    guests: String(v[COL.GUESTS - 1]).split('\n')
      .map(function (n) { return n.trim(); }).filter(String),
    wishes: v[COL.WISHES - 1],
    accommodation: accomCode,
    nights: v[COL.NIGHTS - 1],
    arrival: v[COL.ARRIVAL - 1],
    detailsDone: v[COL.DETAILS_AT - 1] !== ''
  };
}

/* ═══════════════ HELPERS ═══════════════ */

function sheet_(name) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!s) throw new Error('Missing sheet: ' + name + ' — run setup() first.');
  return s;
}

/**
 * Runs fn holding the same lock the web app takes, so setup() and the repair
 * functions never clear a tab while a guest's answer is being written to it.
 * A guest who submits meanwhile waits, or is asked to try again.
 */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/**
 * Reads a tab into the given header order, finding each column by its NAME,
 * and carries along every column it does not recognise.
 *
 * Returns { rows, extraHeaders }: each row is the values for `headers` (blank
 * where that column did not exist) followed by the unrecognised columns.
 * Callers clear the tab and write it back, so a column that matched nothing
 * and was dropped would be ERASED — keeping it is what makes setup() safe on
 * a sheet someone has added a column to.
 *
 * Matching ignores case and spacing: an exact header wins; failing that, a
 * header that starts with the name ("Holy Matrimony?") or that the name starts
 * with ("First opened" for "First opened (WIB)"). `aliases` maps a header to
 * older spellings.
 */
function readTable_(sheet, headers, aliases) {
  var out = { rows: [], extraHeaders: [] };
  if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return out;
  var width = sheet.getLastColumn();
  var raw   = sheet.getRange(1, 1, 1, width).getValues()[0];
  var head  = raw.map(keyOf_);
  var body  = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues() : [];

  var names = headers.map(function (h) {
    return [h].concat((aliases && aliases[h]) || []).map(keyOf_);
  });
  var at = headers.map(function () { return -1; });
  var claimed = {};
  var claim = function (k, test) {
    for (var i = 0; i < width && at[k] < 0; i++) {
      if (!claimed[i] && head[i] && test(head[i])) { at[k] = i; claimed[i] = true; }
    }
  };
  names.forEach(function (list, k) {
    claim(k, function (h) { return list.indexOf(h) >= 0; });
  });
  names.forEach(function (list, k) {
    if (at[k] >= 0) return;
    claim(k, function (h) {
      return list.some(function (n) {
        return n.length >= 4 && h.length >= 4 && (h.indexOf(n) === 0 || n.indexOf(h) === 0);
      });
    });
  });

  var extra = [];
  for (var i = 0; i < width; i++) {
    if (claimed[i]) continue;
    var used = String(raw[i]).trim() !== '' || body.some(function (r) { return hasData_(r[i]); });
    if (used) extra.push(i);
  }
  out.extraHeaders = extra.map(function (i) { return raw[i]; });
  out.rows = body.map(function (r) {
    return at.map(function (i) { return i >= 0 ? r[i] : ''; })
             .concat(extra.map(function (i) { return r[i]; }));
  });
  return out;
}

/** A cell that holds something (an unticked checkbox does not count). */
function hasData_(v) {
  return v !== '' && v !== null && v !== undefined && v !== false;
}

/** Grow a tab so rows × cols fit. */
function ensureSize_(s, rows, cols) {
  if (s.getMaxRows() < rows) s.insertRowsAfter(s.getMaxRows(), rows - s.getMaxRows());
  if (s.getMaxColumns() < cols) s.insertColumnsAfter(s.getMaxColumns(), cols - s.getMaxColumns());
}

/* ─── Invitation identity: every name a row answers to ─── */

/**
 * The Invitation tab plus an index of every name each of its rows answers to:
 * its current "Name & Companion" and everything in its Link names cell.
 * `create` adds the Link names column when it is missing — only setup() and
 * refreshLinks() pass it; a guest's request never changes the sheet's shape.
 */
function invitationContext_(create, s) {
  s = s || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INV_SHEET);
  var inv = { s: s, col: 0, cur: Object.create(null), alias: Object.create(null), lists: {} };
  if (!s) return inv;
  inv.col = linkNamesCol_(s, create);
  var n = s.getLastRow() - 1;
  if (n < 1) return inv;
  var who = s.getRange(2, ICOL.NAME, n, 2).getValues();
  var ali = inv.col ? s.getRange(2, inv.col, n, 1).getValues() : null;

  for (var i = 0; i < n; i++) {
    /* A row with no Guest name is skipped: a cleared row must not keep
       collecting answers through its old names. */
    var cur = currentName_(who[i][0], who[i][1]);
    if (!cur) continue;
    var row = i + 2, k = keyOf_(cur);
    if (!(k in inv.cur)) inv.cur[k] = row;
    inv.lists[row] = ali ? splitNames_(ali[i][0]) : [];
    inv.lists[row].forEach(function (a) {
      var ak = keyOf_(a);
      if (ak && !(ak in inv.alias)) inv.alias[ak] = row;
    });
  }
  return inv;
}

/**
 * The Invitation row this name belongs to, or 0. A row's CURRENT name wins
 * over any row's older name, and between two rows claiming the same name the
 * upper one wins — the first-match rule the lookup always had.
 */
function rowOf_(inv, name) {
  var k = keyOf_(name);
  if (!k || !inv) return 0;
  if (k in inv.cur) return inv.cur[k];
  if (k in inv.alias) return inv.alias[k];
  return 0;
}

/**
 * Column of Link names, found by its header. With `create`, adds it after the
 * last used column when it is missing.
 */
function linkNamesCol_(s, create) {
  var width = s.getLastColumn();
  if (width > 0) {
    var head = s.getRange(1, 1, 1, width).getValues()[0];
    for (var i = 0; i < head.length; i++) {
      if (String(head[i]).trim() === LINKNAMES_HEADER) return i + 1;
    }
  }
  if (!create) return 0;
  var col = Math.max(width, IHEADERS.length) + 1;
  ensureSize_(s, 1, col);
  s.getRange(1, col).setValue(LINKNAMES_HEADER)
   .setFontWeight('bold').setBackground('#292929').setFontColor('#ffffff');
  s.setColumnWidth(col, 260);
  return col;
}

/** Adds a name to one row's Link names (and to the index) unless it is there. */
function rememberName_(inv, row, name) {
  try {
    if (!inv || !inv.col || !row) return;
    var list = inv.lists[row] || [];
    var clean = clean_(name, 120).replace(/\s+/g, ' ');
    if (!clean || hasName_(list, clean)) return;
    list = list.concat([clean]);
    inv.lists[row] = list;
    var k = keyOf_(clean);
    if (!(k in inv.alias)) inv.alias[k] = row;
    inv.s.getRange(row, inv.col).setValue(list.join('\n'));
  } catch (err) { /* bookkeeping only — never fail a guest's request over it */ }
}

/** "Name & Companion" as the link formula builds it, or '' for an empty row. */
function currentName_(name, comp) {
  name = String(name == null ? '' : name).trim();
  comp = String(comp == null ? '' : comp).trim();
  if (!name) return '';
  return comp ? name + ' & ' + comp : name;
}

function splitNames_(v) {
  return String(v == null ? '' : v).split(/\r?\n/)
    .map(function (x) { return x.trim(); }).filter(String);
}

function hasName_(list, name) {
  var k = keyOf_(name);
  for (var i = 0; i < list.length; i++) if (keyOf_(list[i]) === k) return true;
  return false;
}

function timeOf_(v) {
  var t = (v instanceof Date ? v : new Date(v)).getTime();
  return isNaN(t) ? 0 : t;
}

/**
 * Simple trigger — runs by itself whenever someone edits the sheet by hand.
 * When a Guest name or Companion cell on the Invitation tab changes, the name
 * the row had JUST BEFORE is kept in Link names: a link may already have gone
 * out under it. Covers the gap between two refreshLinks() runs, e.g. a name
 * corrected, that link sent, then corrected again.
 *
 * Deliberately narrow and silent: one-cell edits only (a paste over many cells
 * carries no old values), only a row that had a name, and any error is
 * swallowed — it must never get in the way of someone typing. (Every row to
 * 1000 already holds the link formula, so "had a name" is the only test.)
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var r = e.range;
    if (r.getNumRows() !== 1 || r.getNumColumns() !== 1) return;
    var row = r.getRow(), col = r.getColumn();
    if (row < 2 || (col !== ICOL.NAME && col !== ICOL.COMPANION)) return;
    var s = r.getSheet();
    if (s.getName() !== INV_SHEET) return;
    var lc = linkNamesCol_(s, false);
    if (!lc) return;

    var old = e.oldValue === undefined ? '' : e.oldValue;    // undefined = cell was empty
    var now = s.getRange(row, ICOL.NAME, 1, 2).getValues()[0];
    var before = col === ICOL.NAME ? currentName_(old, now[1]) : currentName_(now[0], old);
    if (!before) return;

    var list = splitNames_(s.getRange(row, lc).getValue());
    if (hasName_(list, before)) return;
    list.push(before);
    s.getRange(row, lc).setValue(list.join('\n'));
  } catch (err) { /* never block an edit */ }
}

/** Writes one invitation's Status..Nights from its RSVP row. Never fatal. */
function writeMirror_(invRow, rsvpRow) {
  try {
    sheet_(INV_SHEET).getRange(invRow, ICOL.STATUS, 1, 4).setValues([mirrorOf_(rsvpRow)]);
  } catch (err) { /* never lose a response over a bookkeeping write */ }
}

/**
 * The RSVP row for this key: its own row if it has one. Failing that, and only
 * when `inv` is given, a row that answered for the SAME invitation under
 * another of its names — so a guest re-sent a link after a rename finds their
 * answer and edits it, instead of adding a second response that the Dashboard
 * would count twice. If several did, the most recent.
 */
function findRsvpRow_(sheet, key, inv) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var n = last - 1;
  var keys = sheet.getRange(2, COL.KEY, n, 1).getValues();
  var want = keyOf_(key);
  for (var i = 0; i < n; i++) {
    if (keyOf_(keys[i][0]) === want) return i + 2;
  }
  var mine = inv ? rowOf_(inv, key) : 0;
  if (!mine) return 0;

  var times = sheet.getRange(2, COL.TIME, n, 1).getValues();
  var best = 0, bestT = -1;
  for (var j = 0; j < n; j++) {
    if (rowOf_(inv, keys[j][0]) !== mine) continue;
    var t = timeOf_(times[j][0]);
    if (t >= bestT) { best = j + 2; bestT = t; }
  }
  return best;
}

/** Pre-July "Opens" tab (key | first | last | count), folded into Invitation. */
function foldOpensTab_(ss, s) {
  var old = ss.getSheetByName(OPENS_SHEET);
  if (!old) return;
  if (old.getLastRow() > 1) {
    SpreadsheetApp.flush();
    var inv = invitationContext_(false, s);
    old.getRange(2, 1, old.getLastRow() - 1, 4).getValues().forEach(function (r) {
      var row = rowOf_(inv, r[0]);
      if (!row) return;
      s.getRange(row, ICOL.FIRST, 1, 3)
       .setValues([[stamp_(r[1]), stamp_(r[2]), parseInt(r[3], 10) || '']]);
    });
  }
  ss.deleteSheet(old);
}

/**
 * The stored form of a key: whitespace collapsed, cut at 80 characters.
 * Existing RSVP rows were written with exactly this, so it must not change —
 * compare through keyOf_, which cuts both sides the same way.
 */
function normKey_(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** The comparison form of a key. */
function keyOf_(s) {
  return normKey_(s).toLowerCase();
}

/** Format a Date as an Indonesian-time (WIB, UTC+7) stamp: "17 Jul 2026, 15:04". */
function wib_(d) {
  return Utilities.formatDate(d, TZ, 'd MMM yyyy, HH:mm');
}

/** Open-tracking cell → WIB string. Dates get formatted; "--" placeholders vanish. */
function stamp_(v) {
  if (!v) return '';
  if (v instanceof Date) return wib_(v);
  var s = String(v).trim();
  return /^[-—–\s]*$/.test(s) ? '' : s;
}

function clean_(s, max) {
  return String(s == null ? '' : s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, max);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
