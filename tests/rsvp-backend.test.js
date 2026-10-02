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
const dietHeader = sheets['Guest List'].rows[0][context.GLCOL.DIET - 1];
sheets['Guest List'].rows[0][context.GLCOL.DIET - 1] = 'Table';
assert.equal(JSON.parse(context.doGet({ parameter: { action: 'features' } }).text).dietaryChoices, false);
assert.equal(context.handleRsvp_({ key: 'A & B', attending: 'yes' }).error, 'setup_required');
sheets['Guest List'].rows[0][context.GLCOL.DIET - 1] = dietHeader;

const first = context.handleRsvp_({
  key: 'A & B', name: 'A & B', attending: 'yes', pax: 2,
  guests: JSON.stringify(['A', 'B']), diets: JSON.stringify(['halal', 'vegetarian']), wishes: ''
});
assert.equal(first.ok, true);
assert.equal(sheets.RSVP.rows[1][context.COL.DIETS - 1], 'Halal\nVegetarian');
assert.deepEqual(sheets['Guest List'].rows.slice(1).map(r => r[context.GLCOL.DIET - 1]), ['Halal', 'Vegetarian']);

assert.equal(context.handleDetails_({
  key: 'A & B', accommodation: 'provided', nights: 2, arrival: ''
}).ok, true);
sheets['Guest List'].rows[1][6] = 'Table 1';
sheets['Guest List'].rows[2][6] = 'Table 2';

assert.equal(context.handleRsvp_({
  key: 'A & B', name: 'A & B', attending: 'yes', pax: 2,
  guests: JSON.stringify(['B', 'A']), diets: JSON.stringify(['none', 'vegetarian']), wishes: ''
}).ok, true);
assert.equal(context.handleDetails_({
  key: 'A & B', accommodation: 'self', arrival: ''
}).ok, true);
assert.equal(sheets.RSVP.rows.length, 2, 'a repeat RSVP updates the same row');
assert.equal(sheets.RSVP.rows[1][context.COL.ACCOM - 1], 'Self-arranged');
assert.equal(sheets.RSVP.rows[1][context.COL.DIETS - 1], 'None\nVegetarian');
assert.deepEqual(sheets['Guest List'].rows.slice(1).map(r =>
  [r[context.GLCOL.GUEST - 1], r[context.GLCOL.DIET - 1], r[6]]),
  [['B', 'None', 'Table 2'], ['A', 'Vegetarian', 'Table 1']]);

const status = context.getStatus_('A & B');
assert.equal(status.accommodation, 'self');
assert.deepEqual(Array.from(status.diets), ['none', 'vegetarian']);

context.handleRsvp_({
  key: 'A & B', name: 'A & B', attending: 'yes', pax: 2,
  guests: JSON.stringify(['B', 'A']), wishes: ''
});
assert.equal(sheets.RSVP.rows[1][context.COL.DIETS - 1], 'None\nVegetarian',
  'an older page does not erase dietary choices');
assert.deepEqual(sheets['Guest List'].rows.slice(1).map(r => r[context.GLCOL.DIET - 1]),
  ['None', 'Vegetarian']);
context.handleRsvp_({
  key: 'A & B', name: 'A & B', attending: 'yes', pax: 2,
  guests: JSON.stringify(['A', 'B']), wishes: ''
});
assert.equal(sheets.RSVP.rows[1][context.COL.DIETS - 1], 'Vegetarian\nNone',
  'an older page keeps diets with people after reordering');

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

console.log('RSVP backend repeat edits, diets, accommodation and migration: OK');
