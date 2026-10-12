const assert = require('node:assert/strict');
const {Sheet, createBackendFixture} = require('./helpers/rsvp-fixture');

function oldSheetFixture() {
  const f = createBackendFixture([['Preview Family','Partner',''],['Second Preview','','']]);
  const c = f.context;
  f.sheets.RSVP = new Sheet([...Array.from(c.HEADERS).slice(0,15),'Room']);
  f.sheets.RSVP.appendRow([new Date('2026-10-11T01:00:00Z'),'Preview Family & Partner',
    'Preview Family & Partner','Yes',2,'An approved wish',true,'Arranged hotel (hosted)',
    2,'2027-01-08 14:00',new Date('2026-10-11T01:00:00Z'),1,'Guest One\nGuest Two',
    'Halal\nNone','Yes\nNo','Room 10']);
  f.sheets.RSVP.appendRow([new Date('2026-10-11T02:00:00Z'),'Second Preview','Second Preview',
    'No',0,'A decline wish',false,'','','','',2,'','','','Room 11']);
  f.sheets['Guest List'] = new Sheet([...Array.from(c.GLHEADERS).slice(0,7),'Table']);
  f.sheets['Guest List'].appendRow([1,'Guest One',1,'Preview Family & Partner','yesterday','Halal','Yes','Table 1']);
  f.sheets['Guest List'].appendRow([2,'Guest Two',1,'Preview Family & Partner','yesterday','None','No','=1+1']);
  for (const row of f.sheets.Invitation.rows) row.pop(); // legacy sheet has no ID column
  delete f.sheets['RSVP errors'];
  const events = [];
  c.SpreadsheetApp.flush = () => events.push('flush');
  f.lock.releaseLock = () => {f.lock.releases++; events.push('release');};
  return {...f,events};
}

// Real existing answers stay in their rows: timestamps, approved wishes,
// attendance, names, diet/dinner, accommodation and custom values survive.
{
  const f = oldSheetFixture();
  const originalAnswers = f.sheets.RSVP.rows.slice(1).map(r => r.slice(0,15));
  const originalGuests = f.sheets['Guest List'].rows.slice(1).map(r => r.slice(0,7));
  const invitationValues = f.sheets.Invitation.rows.slice(1).map(r => r.slice(0,14));
  assert.match(f.context.upgradeRsvpReliability(),/upgrade complete/);
  assert.deepEqual(f.sheets.RSVP.rows.slice(1).map(r => r.slice(0,15)),originalAnswers);
  assert.deepEqual(f.sheets['Guest List'].rows.slice(1).map(r => r.slice(0,7)),originalGuests);
  assert.equal(f.sheets.RSVP.rows[0][18],'Room');
  assert.equal(f.sheets.RSVP.rows[1][18],'Room 10');
  assert.equal(f.sheets.RSVP.rows[2][18],'Room 11');
  assert.equal(f.sheets['Guest List'].rows[0][8],'Table');
  assert.equal(f.sheets['Guest List'].rows[2][8],'=1+1');
  f.sheets.Invitation.rows.slice(1).forEach((r,i) => {
    assert.deepEqual(r.slice(0,5),invitationValues[i].slice(0,5));
    assert.deepEqual(r.slice(6,14),invitationValues[i].slice(6,14));
    assert.match(r[5],/\?id=/);
  });
  assert.equal(f.sheets.RSVP.rows[1][15],f.sheets.Invitation.rows[1][15]);
  assert.equal(f.sheets['Guest List'].rows[1][7],f.sheets.Invitation.rows[1][15]);
  assert.deepEqual(f.events.slice(-2),['flush','release']);
  assert.equal(f.get({action:'features'}).saveAcknowledgements,true);
  const after = JSON.stringify(Object.fromEntries(Object.entries(f.sheets).map(([k,s])=>[k,s.rows])));
  f.context.upgradeRsvpReliability();
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(f.sheets).map(([k,s])=>[k,s.rows]))),after,
    'a second successful run does not add columns or change IDs/answers');
}

// A changed core layout aborts before writes to ANY tab, including ones that
// would otherwise have been upgraded first.
{
  const f = oldSheetFixture();
  f.sheets['Guest List'].rows[0][5] = 'Table';
  const before = JSON.stringify(Object.fromEntries(Object.entries(f.sheets).map(([k,s])=>[k,s.rows])));
  assert.throws(()=>f.context.upgradeRsvpReliability(),/Upgrade stopped before changes/);
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(f.sheets).map(([k,s])=>[k,s.rows]))),before);
  assert.deepEqual(f.events.slice(-2),['flush','release']);
}

// A failure partway through adding metadata never clears an answer; a retry
// can complete the upgrade and retains the original custom column.
{
  const f = oldSheetFixture(), s = f.sheets.RSVP;
  const answers = s.rows.slice(1).map(r=>r.slice(0,15));
  const original = s.getRange.bind(s);
  let fail = true;
  s.getRange = (...args) => {
    const range = original(...args);
    if (args[0] === 1 && args[1] === 17 && fail) {
      range.setValue = () => {fail=false;throw Error('temporary write failure');};
    }
    return range;
  };
  assert.throws(()=>f.context.upgradeRsvpReliability(),/temporary write failure/);
  assert.deepEqual(s.rows.slice(1).map(r=>r.slice(0,15)),answers);
  assert.deepEqual(f.events.slice(-2),['flush','release']);
  assert.match(f.context.upgradeRsvpReliability(),/upgrade complete/);
  assert.deepEqual(s.rows.slice(1).map(r=>r.slice(0,15)),answers);
  assert.equal(s.rows[1][s.rows[0].indexOf('Room')],'Room 10');
}

// Waiting for an existing submission holds off all upgrade changes.
{
  const f = oldSheetFixture();
  f.lock.available = false;
  const writes = Object.values(f.sheets).reduce((n,s)=>n+s.writes,0);
  assert.throws(()=>f.context.upgradeRsvpReliability(),/busy/);
  assert.equal(Object.values(f.sheets).reduce((n,s)=>n+s.writes,0),writes);
}

console.log('Live RSVP upgrade preserves answers/custom columns, retries partial upgrades, validates before writes and flushes before unlocking: OK');
