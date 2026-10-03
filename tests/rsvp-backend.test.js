const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script', 'Code.gs'), 'utf8');
const sheets = {};

class Sheet {
  constructor(headers) { this.rows = [headers.slice()]; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(...this.rows.map(row => row.length)); }
  appendRow(values) { this.rows.push(values.slice()); }
  getRange(row, col, height = 1, width = 1) {
    const sheet = this;
    return {
      getValues() {
        return Array.from({ length: height }, (_, y) =>
          Array.from({ length: width }, (_, x) => sheet.rows[row + y - 1]?.[col + x - 1] ?? ''));
      },
      getDisplayValues() { return this.getValues().map(r => r.map(v => String(v ?? ''))); },
      getValue() { return this.getValues()[0][0]; },
      setValues(values) {
        values.forEach((line, y) => {
          const target = sheet.rows[row + y - 1] ||= [];
          line.forEach((v, x) => { target[col + x - 1] = v; });
        });
        return this;
      },
      setValue(value) { return this.setValues([[value]]); },
      clearContent() {
        for (let y = 0; y < height; y++) {
          const target = sheet.rows[row + y - 1];
          if (target) for (let x = 0; x < width; x++) target[col + x - 1] = '';
        }
        return this;
      },
      insertCheckboxes() { return this; }
    };
  }
}

const context = vm.createContext({
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: name => sheets[name] }) },
  CacheService: { getScriptCache: () => ({ remove() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({
    text, setMimeType() { return this; }
  }) },
  Utilities: { formatDate: () => '2 Oct 2026, 10:00' }
});
vm.runInContext(code, context);

sheets.RSVP = new Sheet(Array.from(context.HEADERS));
sheets['Guest List'] = new Sheet([...Array.from(context.GLHEADERS), 'Table']);
assert.equal(JSON.parse(context.doGet({ parameter: { action: 'features' } }).text).dietaryChoices, true);
assert.equal(JSON.parse(context.doGet({ parameter: { action: 'features' } }).text).customArrangements, true);
assert.equal(JSON.parse(context.doGet({ parameter: { action: 'features' } }).text).welcomeDinnerRsvp, true);
assert.equal(JSON.parse(context.doGet({ parameter: { action: 'features' } }).text).partialRsvp, true);
const dietHeader = sheets['Guest List'].rows[0][context.GLCOL.DIET - 1];
sheets['Guest List'].rows[0][context.GLCOL.DIET - 1] = 'Table';
assert.equal(JSON.parse(context.doGet({ parameter: { action: 'features' } }).text).dietaryChoices, false);
assert.equal(context.handleRsvp_({ key: 'A & B', attending: 'yes' }).error, 'setup_required');
sheets['Guest List'].rows[0][context.GLCOL.DIET - 1] = dietHeader;
const welcomeHeader = sheets['Guest List'].rows[0][context.GLCOL.WELCOME - 1];
sheets['Guest List'].rows[0][context.GLCOL.WELCOME - 1] = 'Table';
assert.equal(JSON.parse(context.doGet({ parameter: { action: 'features' } }).text).welcomeDinnerRsvp, false);
assert.equal(context.handleRsvp_({ key: 'A & B', attending: 'yes' }).error, 'setup_required',
  'the new schema must not write over a pre-existing custom column');
sheets['Guest List'].rows[0][context.GLCOL.WELCOME - 1] = welcomeHeader;

const first = context.handleRsvp_({
  key: 'A & B', name: 'A & B', attending: 'yes', pax: 2,
  guests: JSON.stringify(['A', 'B']), diets: JSON.stringify(['halal', 'vegetarian']),
  welcomeDinner: JSON.stringify(['yes', 'no']), wishes: ''
});
assert.equal(first.ok, true);
assert.equal(sheets.RSVP.rows[1][context.COL.DIETS - 1], 'Halal\nVegetarian');
assert.deepEqual(sheets['Guest List'].rows.slice(1).map(r => r[context.GLCOL.DIET - 1]), ['Halal', 'Vegetarian']);
assert.equal(sheets.RSVP.rows[1][context.COL.WELCOME - 1], 'Yes\nNo');
assert.deepEqual(sheets['Guest List'].rows.slice(1).map(r => r[context.GLCOL.WELCOME - 1]), ['Yes', 'No']);

assert.equal(context.handleDetails_({
  key: 'A & B', accommodation: 'provided', nights: 2, arrival: ''
}).ok, true);
const tableIndex = context.GLHEADERS.length;
sheets['Guest List'].rows[1][tableIndex] = 'Table 1';
sheets['Guest List'].rows[2][tableIndex] = 'Table 2';

assert.equal(context.handleRsvp_({
  key: 'A & B', name: 'A & B', attending: 'yes', pax: 2,
  guests: JSON.stringify(['B', 'A']), diets: JSON.stringify(['none', 'vegetarian']),
  welcomeDinner: JSON.stringify(['yes', 'no']), wishes: ''
}).ok, true);
assert.equal(context.handleDetails_({
  key: 'A & B', accommodation: 'self', arrival: ''
}).ok, true);
assert.equal(sheets.RSVP.rows.length, 2, 'a repeat RSVP updates the same row');
assert.equal(sheets.RSVP.rows[1][context.COL.ACCOM - 1], 'Self-arranged');
assert.equal(sheets.RSVP.rows[1][context.COL.DIETS - 1], 'None\nVegetarian');
assert.equal(sheets.RSVP.rows[1][context.COL.WELCOME - 1], 'Yes\nNo');
assert.deepEqual(sheets['Guest List'].rows.slice(1).map(r =>
  [r[context.GLCOL.GUEST - 1], r[context.GLCOL.DIET - 1], r[context.GLCOL.WELCOME - 1], r[tableIndex]]),
  [['B', 'None', 'Yes', 'Table 2'], ['A', 'Vegetarian', 'No', 'Table 1']]);

const status = context.getStatus_('A & B');
assert.equal(status.accommodation, 'self');
assert.deepEqual(Array.from(status.diets), ['none', 'vegetarian']);
assert.deepEqual(Array.from(status.welcomeDinner), ['yes', 'no']);

context.handleRsvp_({
  key: 'A & B', name: 'A & B', attending: 'yes', pax: 2,
  guests: JSON.stringify(['B', 'A']), wishes: ''
});
assert.equal(sheets.RSVP.rows[1][context.COL.DIETS - 1], 'None\nVegetarian',
  'an older page does not erase dietary choices');
assert.deepEqual(sheets['Guest List'].rows.slice(1).map(r => r[context.GLCOL.DIET - 1]),
  ['None', 'Vegetarian']);
assert.equal(sheets.RSVP.rows[1][context.COL.WELCOME - 1], 'Yes\nNo',
  'an older page does not erase welcome-dinner choices');
context.handleRsvp_({
  key: 'A & B', name: 'A & B', attending: 'yes', pax: 2,
  guests: JSON.stringify(['A', 'B']), wishes: ''
});
assert.equal(sheets.RSVP.rows[1][context.COL.DIETS - 1], 'Vegetarian\nNone',
  'an older page keeps diets with people after reordering');
assert.equal(sheets.RSVP.rows[1][context.COL.WELCOME - 1], 'No\nYes',
  'an older page keeps welcome-dinner attendance with each person after reordering');

const beforeInvalid = sheets.RSVP.rows[1].slice();
assert.equal(context.handleRsvp_({
  key: 'A & B', attending: 'yes', guests: ['A', 'B'], welcomeDinner: ['yes', '']
}).error, 'welcome_dinner_required');
assert.deepEqual(sheets.RSVP.rows[1], beforeInvalid,
  'an incomplete welcome-dinner answer is refused before any changes are saved');

// A returning guest's first post might be lost; the final form still saves their edited choices.
assert.equal(context.handleDetails_({
  key: 'A & B', name: 'A & B', accommodation: 'provided', nights: 2,
  guests: ['A', 'B'], diets: ['halal', 'none'], welcomeDinner: ['yes', 'no'], pax: 2
}).ok, true);
assert.deepEqual(Array.from(context.getStatus_('A & B').welcomeDinner), ['yes', 'no']);
assert.deepEqual(sheets['Guest List'].rows.slice(1).map(r =>
  [r[context.GLCOL.GUEST - 1], r[context.GLCOL.WELCOME - 1], r[tableIndex]]),
  [['A', 'Yes', 'Table 1'], ['B', 'No', 'Table 2']]);

assert.equal(context.handleDetails_({
  key: 'A & B', accommodation: 'provided', nights: 3
}).error, 'nights_required', 'the standard stay is limited to two nights');
assert.equal(context.handleDetails_({
  key: 'A & B', accommodation: 'custom', nights: ''
}).ok, true);
assert.equal(context.getStatus_('A & B').accommodation, 'custom');
assert.equal(sheets.RSVP.rows[1][context.COL.NIGHTS - 1], '');

const oldList = new Sheet(['No.', 'Guest name', 'Invitation no.', 'Invitation name', 'Confirmed (WIB)', 'Table', 'Diet']);
oldList.appendRow([1, 'A', 1, 'A & B', 'yesterday', 'Table 1', 'Halal']);
const migrated = context.readTable_(oldList, context.GLHEADERS);
assert.equal(migrated.rows[0][context.GLCOL.DIET - 1], 'Halal');
assert.equal(migrated.extraHeaders[0], 'Table');
assert.equal(migrated.rows[0][context.GLHEADERS.length], 'Table 1');
assert.equal(migrated.rows[0][context.GLCOL.WELCOME - 1], '',
  'existing guests have unanswered dinner attendance, rather than an invented decline');

const oldRsvp = new Sheet(Array.from(context.HEADERS).slice(0, -1).concat('Notes'));
oldRsvp.appendRow(sheets.RSVP.rows[1].slice(0, -1).concat('Keep this note'));
const migratedRsvp = context.readTable_(oldRsvp, context.HEADERS);
assert.equal(migratedRsvp.rows[0][context.COL.WELCOME - 1], '');
assert.equal(migratedRsvp.extraHeaders[0], 'Notes');
assert.equal(migratedRsvp.rows[0][context.HEADERS.length], 'Keep this note');

assert.equal(context.handleRsvp_({ key: 'A & B', attending: 'no', guests: [] }).ok, true);
assert.equal(sheets.RSVP.rows[1][context.COL.WELCOME - 1], '');
assert.deepEqual(sheets['Guest List'].rows.slice(1).map(r => r[context.GLCOL.GUEST - 1]).filter(Boolean), [],
  'declining the wedding removes this invitation from the guest and dinner counts');

// Editing saves each screen before final confirmation, including an unanswered
// second dinner choice. The full RSVP still requires every dinner answer.
assert.equal(context.handleRsvp_({
  key: 'C & D', name: 'C & D', attending: 'yes', pax: 2, partial: true,
  guests: ['C', 'D'], diets: ['none', 'halal'], welcomeDinner: ['yes', ''],
  wishes: 'Our first wish'
}).ok, true);
assert.deepEqual(Array.from(context.getStatus_('C & D').welcomeDinner), ['yes', '']);
assert.equal(context.handleRsvp_({
  key: 'C & D', attending: 'yes', guests: ['C', 'D'], welcomeDinner: ['yes', '']
}).error, 'welcome_dinner_required');
assert.equal(context.handleRsvp_({
  key: 'C & D', name: 'C & D', attending: 'yes', pax: 2, wishes: '', replaceWishes: true
}).ok, true);
assert.equal(context.getStatus_('C & D').wishes, '', 'an edit can clear an old wish');
assert.deepEqual(Array.from(context.getStatus_('C & D').guests), ['C', 'D'],
  'saving attendance or wishes alone preserves guest details');
assert.deepEqual(Array.from(context.getStatus_('C & D').diets), ['none', 'halal']);
assert.deepEqual(Array.from(context.getStatus_('C & D').welcomeDinner), ['yes', '']);
context.handleRsvp_({ key: 'C & D', attending: 'yes', pax: 2, wishes: 'Keep this wish' });
context.handleRsvp_({ key: 'C & D', attending: 'yes', pax: 2, wishes: '' });
assert.equal(context.getStatus_('C & D').wishes, 'Keep this wish',
  'an older page keeps its existing blank-wish behavior');

console.log('RSVP backend edits, step saves, diets, dinner, accommodation and migration: OK');
