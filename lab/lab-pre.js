/* LAB (test copy) — loaded before main.js.
   The test copy must never write to the real RSVP sheet: every request to
   the Apps Script web app is answered here with an empty success, so
   opening, RSVPs and wishes all stay on the phone. */
(function () {
  'use strict';
  var realFetch = window.fetch;
  window.fetch = function (input) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('script.google.com') !== -1) {
      return Promise.resolve(new Response(JSON.stringify({ ok: true, wishes: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      }));
    }
    return realFetch.apply(this, arguments);
  };
})();
