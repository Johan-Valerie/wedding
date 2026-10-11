const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Sheet {
  constructor(headers = []) { this.rows = headers.length ? [headers.slice()] : []; this.writes = 0; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(1, ...this.rows.map(r => r.length)); }
  appendRow(row) { this.rows.push(row.slice()); this.writes++; }
  getRange(row, col, height = 1, width = 1) {
    const sheet = this;
    const range = {
      getValues: () => Array.from({length:height}, (_, y) =>
        Array.from({length:width}, (_, x) => sheet.rows[row + y - 1]?.[col + x - 1] ?? '')),
      getDisplayValues() { return this.getValues().map(r => r.map(v => String(v ?? ''))); },
      getValue() { return this.getValues()[0][0]; },
      setValues(values) {
        for (let y = 0; y < values.length; y++) {
          const target = sheet.rows[row + y - 1] ||= [];
          values[y].forEach((value, x) => { target[col + x - 1] = value; });
        }
        sheet.writes++; return this;
      },
      setValue(value) { return this.setValues([[value]]); },
      setFormulas(values) { return this.setValues(values); },
      clearContent() { return this.setValues(Array.from({length:height}, () => Array(width).fill(''))); },
      insertCheckboxes() { return this; }
    };
    for (const name of ['setFontWeight','setFontColor','setBackground','setNote','setWrapStrategy'])
      range[name] = () => range;
    return range;
  }
  setFrozenRows() {}
  setColumnWidth() {}
  getMaxRows() { return 1000; }
  getMaxColumns() { return 30; }
  insertRowsAfter() {}
  insertColumnsAfter() {}
}

function createBackendFixture(people = [
  ['Preview Family', 'Partner', 'preview00001'],
  ['Second Preview', '', 'preview00002']
]) {
  const sheets = {}, cache = new Map();
  const lock = {available:true, waits:[], releases:0,
    tryLock(ms) { this.waits.push(ms); return this.available; },
    waitLock(ms) { this.waits.push(ms); if (!this.available) throw Error('busy'); },
    releaseLock() { this.releases++; }
  };
  let nextId = 1;
  const spreadsheet = {
    getSheetByName: name => sheets[name],
    insertSheet: name => (sheets[name] = new Sheet())
  };
  const context = vm.createContext({
    SpreadsheetApp: {getActiveSpreadsheet: () => spreadsheet, flush() {}, WrapStrategy:{CLIP:'CLIP'}},
    LockService: {getScriptLock: () => lock},
    CacheService: {getScriptCache: () => ({
      get: key => cache.get(key) || null, put: (key, value) => cache.set(key, value),
      remove: key => cache.delete(key)
    })},
    ContentService: {MimeType:{JSON:'json'}, createTextOutput: text => ({
      text, setMimeType() { return this; }
    })},
    Utilities: {
      formatDate: () => '12 Oct 2026, 03:00',
      getUuid: () => (nextId++).toString(16).padStart(12,'0') + '-0000-0000-0000-000000000000'
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../../google-apps-script/Code.gs'),'utf8'), context);
  sheets.RSVP = new Sheet(Array.from(context.HEADERS));
  sheets['Guest List'] = new Sheet([...Array.from(context.GLHEADERS), 'Table']);
  sheets.Invitation = new Sheet([...Array.from(context.IHEADERS), 'Link names', 'Invitation ID']);
  sheets['Opens log'] = new Sheet(Array.from(context.OLHEADERS));
  sheets['RSVP errors'] = new Sheet(Array.from(context.SAVE_LOG_HEADERS));
  people.forEach(([first, second, id], i) => {
    const row = Array(context.IHEADERS.length).fill('');
    row[0] = i + 1; row[1] = first; row[2] = second; row[3] = second ? 2 : 1;
    row[6] = context.STATUS.UNOPENED;
    row.push(first + (second ? ' & ' + second : ''), id || '');
    sheets.Invitation.appendRow(row);
  });
  const post = fields => JSON.parse(context.doPost({
    parameter:fields, postData:{contents:new URLSearchParams(fields).toString()}
  }).text);
  const get = fields => JSON.parse(context.doGet({parameter:fields}).text);
  return {context, sheets, cache, lock, post, get};
}
module.exports = {Sheet, createBackendFixture};
