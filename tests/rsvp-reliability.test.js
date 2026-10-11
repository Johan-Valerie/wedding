const assert = require('node:assert/strict');
const {createBackendFixture} = require('./helpers/rsvp-fixture');

// Missing/malformed attendance must never be interpreted as a decline.
{
  const f = createBackendFixture();
  assert.equal(f.post({action:'rsvp',id:'preview00001'}).error,'attendance_required');
  assert.equal(f.post({action:'rsvp',id:'preview00001',attending:'unknown'}).error,'attendance_required');
  assert.equal(f.sheets.RSVP.rows.length,1);
}

// A busy RSVP does not write an answer; it gives a retryable reply and a
// useful error record. Opening logs never spend 30s ahead of answer writes.
{
  const f = createBackendFixture();
  f.lock.available = false;
  assert.deepEqual(f.post({action:'rsvp',key:'Preview Family & Partner',attending:'no'}),
    {ok:false,error:'busy',retryable:true});
  assert.equal(f.lock.waits[0],5000);
  assert.equal(f.sheets.RSVP.rows.length,1);
  assert.equal(f.sheets['RSVP errors'].rows[1][5],'no','failed attempts retain the requested attendance');
  assert.equal(f.sheets['RSVP errors'].rows[1][7],'busy');
  f.post({action:'open',key:'Preview Family & Partner'});
  assert.equal(f.lock.waits[1],1);
  assert.equal(f.sheets['RSVP errors'].rows.length,2);
}

// A sufficiently long, unique truncated name is linked during the actual
// save, before any mirror/Guest List write, with no manual refresh needed.
{
  const f = createBackendFixture([['Preview Surname','', 'preview00001']]);
  assert.equal(f.post({action:'rsvp',key:'Preview Surna',attending:'no',requestId:'save_cut_1'}).ok,true);
  const r = f.sheets.RSVP.rows[1];
  assert.equal(r[f.context.COL.INVNO - 1],1);
  assert.equal(r[f.context.COL.NAME - 1],'Preview Surname');
  assert.equal(f.sheets.Invitation.rows[1][6],f.context.STATUS.DECLINED);
  assert.equal(f.sheets['Guest List'].writes,0,'no need to rewrite unrelated guests for a new decline');
  assert.equal(f.get({action:'status',key:'Preview Surname'}).attending,'No');
}

// Bare names, unknown IDs and ambiguous prefixes cannot create or claim an
// RSVP for the wrong invitation.
{
  const f = createBackendFixture([['Preview Surname','', 'preview00001'],['Preview Surnames','', 'preview00002']]);
  assert.equal(f.post({action:'rsvp',key:'Preview Surna',attending:'no'}).error,'invitation_ambiguous');
  assert.equal(f.post({action:'rsvp',key:'Preview',attending:'no'}).error,'invitation_not_found');
  assert.equal(f.post({action:'rsvp',id:'invalid',key:'Preview Surname',attending:'no'}).error,'invitation_not_found');
  assert.equal(f.get({action:'status',id:'invalid',key:'Preview Surname'}).found,false);
  assert.equal(f.sheets.RSVP.rows.length,1);
}

// IDs are retained through a bulk rename and row movement, and address the
// same response even if the name part of the URL is missing altogether.
{
  const f = createBackendFixture();
  assert.equal(f.post({action:'rsvp',id:'preview00001',attending:'no',requestId:'save_identity_1'}).ok,true);
  const first = f.sheets.Invitation.rows[1];
  first[1] = 'Changed Name'; first[2] = 'Changed Companion'; first[14] = '';
  f.sheets.Invitation.rows.splice(1,1);
  f.sheets.Invitation.rows.push(first);
  const d = f.get({action:'status',id:'preview00001'});
  assert.equal(d.found,true); assert.equal(d.attending,'No');
  assert.equal(d.invite.name,'Changed Name & Changed Companion');
  f.context.restampNumbers_();
  assert.equal(f.sheets.RSVP.rows[1][f.context.COL.INVNO - 1],2);
  f.context.syncInvitationStatus_(f.sheets.Invitation);
  assert.equal(first[6],f.context.STATUS.DECLINED);
  assert.equal(f.post({action:'rsvp',id:'preview00001',key:'Changed Name & Changed Companion',
    attending:'no',requestId:'save_identity_2'}).ok,true);
  assert.equal(f.sheets.RSVP.rows.length,2,'rename still updates one response');
}

// Duplicated invitation IDs refuse a save instead of choosing a person.
{
  const f = createBackendFixture([['Preview One','', 'duplicate_id'],['Preview Two','', 'duplicate_id']]);
  assert.equal(f.post({action:'rsvp',id:'duplicate_id',attending:'no'}).ok,false);
  assert.equal(f.sheets.RSVP.rows.length,1);
}

// An old name claimed by two invitations must not select the first row.
{
  const f = createBackendFixture();
  f.sheets.Invitation.rows[1][14] += '\nShared Old Name';
  f.sheets.Invitation.rows[2][14] += '\nShared Old Name';
  assert.equal(f.post({action:'rsvp',key:'Shared Old Name',attending:'no'}).error,'invitation_ambiguous');
  assert.equal(f.sheets.RSVP.rows.length,1);
}

// Equal displayed names still represent different invitations when their
// IDs differ; an edit or decline must leave the other Guest List intact.
{
  const f = createBackendFixture([['Shared Name','','preview00001'],['Shared Name','','preview00002']]);
  const answer = (id, name, save) => ({action:'rsvp',id,key:'Shared Name',attending:'yes',pax:1,
    guests:JSON.stringify([name]),welcomeDinner:'["yes"]',requestId:save});
  assert.equal(f.post(answer('preview00001','First Guest','save_first_1')).ok,true);
  assert.equal(f.post(answer('preview00002','Second Guest','save_second_1')).ok,true);
  assert.equal(f.sheets['Guest List'].rows.length,3);
  assert.equal(f.post({action:'rsvp',id:'preview00001',key:'Shared Name',attending:'no',requestId:'save_first_no'}).ok,true);
  const remaining = f.sheets['Guest List'].rows.slice(1).filter(r => r[1]);
  assert.equal(remaining.length,1);
  assert.equal(remaining[0][1],'Second Guest');
  assert.equal(remaining[0][f.context.GLCOL.INV_ID-1],'preview00002');
  assert.equal(f.get({action:'status',id:'preview00002'}).attending,'Yes');
}

// An ambiguous legacy record with no ID is not claimed by either new link.
{
  const f = createBackendFixture([['Shared Name','','preview00001'],['Shared Name','','preview00002']]);
  const old = Array(f.context.HEADERS.length).fill('');
  old[0] = new Date(); old[1] = old[2] = 'Shared Name'; old[3] = 'No'; old[4] = 0;
  f.sheets.RSVP.appendRow(old);
  f.sheets['Guest List'].appendRow([1,'Unidentified Guest',1,'Shared Name','','','','']);
  assert.equal(f.post({action:'rsvp',id:'preview00001',key:'Shared Name',attending:'no',requestId:'save_id_only_1'}).ok,true);
  assert.equal(f.sheets.RSVP.rows.length,3,'ambiguous historical response remains separate');
  assert.equal(f.sheets.RSVP.rows[1][f.context.COL.INV_ID-1],'');
  assert.equal(f.sheets['Guest List'].rows[1][1],'Unidentified Guest');
}

// Exact save acknowledgement only follows a successful mirror write.
// A partial failure is logged, and retrying completes the same RSVP row.
{
  const f = createBackendFixture();
  const original = f.sheets.Invitation.getRange.bind(f.sheets.Invitation);
  let fail = true;
  f.sheets.Invitation.getRange = (...args) => {
    const range = original(...args);
    if (args[1] === f.context.ICOL.STATUS && fail) {
      range.setValues = () => { fail = false; throw Error('temporary Sheet failure'); };
    }
    return range;
  };
  const p = {action:'rsvp',id:'preview00001',attending:'no',requestId:'save_partial_1'};
  assert.equal(f.post(p).retryable,true);
  assert.equal(f.get({action:'status',id:p.id}).requestId,'');
  assert.equal(f.post(p).ok,true);
  assert.equal(f.get({action:'status',id:p.id}).requestId,p.requestId);
  assert.equal(f.sheets.RSVP.rows.length,2);
  assert.match(f.sheets['RSVP errors'].rows[1][7],/temporary Sheet failure/);
}

// A delayed retry of a decline cannot overwrite a later attending answer,
// even if Google's optional cache evicts the request.
{
  const f = createBackendFixture();
  const declined = {action:'rsvp',id:'preview00001',attending:'no',requestId:'save_decline_1'};
  assert.equal(f.post(declined).ok,true);
  assert.equal(f.post({action:'rsvp',id:'preview00001',attending:'yes',pax:2,
    guests:'["Guest One","Guest Two"]',diets:'["none","halal"]',welcomeDinner:'["yes","no"]',
    requestId:'save_attending_2'}).ok,true);
  f.cache.clear();
  assert.equal(f.post(declined).duplicate,true);
  assert.equal(f.get({action:'status',id:'preview00001'}).attending,'Yes');
  assert.equal(f.get({action:'status',id:'preview00001'}).requestId,'save_attending_2');
  assert.equal(f.sheets['Guest List'].rows[1][f.context.GLCOL.INV_ID - 1],'preview00001');
}

// Changing a completed attendance response to No and then back to Yes
// requires guest/stay confirmation again, while keeping the stay as a default.
{
  const f = createBackendFixture();
  assert.equal(f.post({action:'details',id:'preview00001',attending:'yes',pax:2,
    guests:'["Guest One","Guest Two"]',welcomeDinner:'["yes","no"]',accommodation:'provided',nights:2,
    requestId:'save_stay_1'}).ok,true);
  assert.equal(f.get({action:'status',id:'preview00001'}).detailsDone,true);
  f.post({action:'rsvp',id:'preview00001',attending:'no',requestId:'save_decline_2'});
  f.post({action:'rsvp',id:'preview00001',attending:'yes',pax:2,requestId:'save_attendance_3'});
  const d = f.get({action:'status',id:'preview00001'});
  assert.equal(d.detailsDone,false,'an attendance-only edit must not claim the whole RSVP is complete');
  assert.equal(d.accommodation,'provided','previous stay remains a default');
  assert.equal(d.guests.length,0);
}

// Retries of one open are one open and do not change an answered status.
{
  const f = createBackendFixture();
  const p = {action:'open',id:'preview00001',key:'Preview Family & Partner',requestId:'open_request_1',
    link:'https://example.test/?id=preview00001&to=Preview%20Family%20%26%20Partner&max=2'};
  assert.equal(f.post(p).ok,true);
  assert.equal(f.post(p).duplicate,true);
  assert.equal(f.sheets.Invitation.rows[1][12],1);
  f.post({action:'rsvp',id:'preview00001',attending:'no',requestId:'save_decline_2'});
  f.post(p);
  assert.equal(f.sheets.Invitation.rows[1][6],f.context.STATUS.DECLINED);
}

// ID generation and link formulas are idempotent. The ID is placed before
// the much longer guest name and survives a cut in that part of the URL.
{
  const f = createBackendFixture([['Preview Surname','',''],['Second Preview','','']]);
  f.context.FILL_ROWS = 3;
  f.context.ensureInvitationIds_(f.sheets.Invitation,2);
  const ids = f.sheets.Invitation.rows.slice(1).map(r => r[15]);
  assert.notEqual(ids[0],ids[1]); assert.match(ids[0],/^[0-9a-f]{12}$/);
  f.context.ensureInvitationIds_(f.sheets.Invitation,2);
  assert.deepEqual(f.sheets.Invitation.rows.slice(1).map(r => r[15]),ids);
  f.context.writeInvitationFormulas_(f.sheets.Invitation);
  assert.match(f.sheets.Invitation.rows[1][5],/\?id=/);
  assert.ok(f.sheets.Invitation.rows[1][5].indexOf('?id=') < f.sheets.Invitation.rows[1][5].indexOf('&to='));
}
console.log('RSVP busy handling, identity, exact acknowledgement, failed-write recovery and idempotent retries: OK');
