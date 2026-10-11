# Wedding RSVP reliability update — 12 October 2026

The website and Apps Script are deployed separately. Publishing this repository
does **not** update the Google Apps Script web app.

## Update the live script

1. Open your wedding Apps Script project and replace its code with **all of
   [Code.gs](Code.gs)**, then save.
2. Select **setup** in the function dropdown and click **Run**. This adds the
   invitation/save IDs and the **RSVP errors** tab, preserving existing responses,
   approved wishes, and guest details by their column headers.
3. Immediately choose **Deploy → Manage deployments → Edit → New version →
   Deploy**. Keep the existing web app deployment and URL. Saving the code alone
   does not update the website's backend.

The website remains compatible with the previous deployed script while this
update is pending. Its retry and draft recovery changes work with that version;
stable invitation IDs, exact save acknowledgements, and failure logging require
the new script deployment.

## Changes

- Busy or lost network replies are retried with the same save ID. The website
  reads back the exact save, and keeps an unconfirmed submission on that device
  for retry after a reload.
- Each named invitation receives a permanent **Invitation ID** during `setup()`
  or `refreshLinks()`. New links put the ID before the long guest name. Existing
  name links still work through current names, aliases, or a unique long prefix.
  Unknown or ambiguous links receive an error instead of creating orphan RSVPs.
- Responses and the Guest List use invitation IDs, including after row movements
  or name corrections. RSVP columns P–R hold the ID, latest save ID, and the last
  40 successful save IDs. These prevent recent delayed retries from overwriting
  a later edit even if Google's optional cache has been evicted.
- Save confirmation follows the RSVP, Guest List, and Invitation status writes.
  A partial failure remains retryable instead of appearing complete.
- Opening logs use a short lock wait so they do not queue for 30 seconds ahead
  of RSVP submissions.
- Failed RSVP/detail requests record their requested attendance, guest count,
  identity, save ID, and reason in **RSVP errors**. A failure log is evidence of
  an attempted answer, not proof that it was saved. Only RSVP confirms the save.
  Historical attempts from before this deployment cannot be reconstructed.

## Managing invitations

Keep an Invitation ID when correcting a person's name or moving their whole
row. After adding named rows, run `refreshLinks()` before sending their links.
When reusing a row for a different person, clear **both Invitation ID and Link
names**, then run `refreshLinks()`. Do not copy another invitation's ID.

## Verification

Run from this repository with Node.js:

```text
node tests/rsvp-backend.test.js
node tests/rsvp-reliability.test.js
node tests/mobile-forms.test.js
```

The tests use in-memory Sheets. Browser checks also used a local simulated
backend, including declines, retries, lost POST replies, draft recovery,
attendance changes, per-guest diet/dinner choices, and accommodation confirmation.
No test answers are submitted to the live Google Sheet.
