/* ═══════════════════════════════════════════════════════════════
   Johan & Valerie — placeholder invitation
   Motion study: the engagement's intro, cover, first page and menu,
   scroll-snap deck, audio system, gallery + lightbox
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ── config ──────────────────────────────────────────────── */
  var WEDDING_DATE = new Date('2027-01-09T15:00:00+07:00');   // 3 PM, Bangkok (ICT)
  var EVENTS = {
    ceremony:  { title: 'Holy Matrimony — Johan & Valerie', start: '20270109T080000Z', end: '20270109T093000Z', loc: 'La Chapelle Bangkok — Jardin de Juliet' },
    cocktail:  { title: 'Cocktail Party — Johan & Valerie', start: '20270109T100000Z', end: '20270109T110000Z', loc: 'La Chapelle Bangkok' },
    reception: { title: 'Wedding Reception — Johan & Valerie', start: '20270109T110000Z', end: '20270109T150000Z', loc: 'La Chapelle Bangkok — Saint Hall' }
  };
  var GALLERY_COUNT = 18;
  var WISHES_PER_PAGE = 4;

  /* RSVP backend — Google Apps Script web app URL (see GOOGLE-SETUP.md).
     While '' the site runs in offline demo mode: RSVPs stay in the
     visitor's browser and the wishes wall shows sample entries. */
  var API_URL = 'https://script.google.com/macros/s/AKfycbyXAc9vQmuxQzcst65aHr1bgUSuWBZX5n6KdgLVlou21kSZV_Rs97zma8hyYqkCPPnIoA/exec';
  var SEED_WISHES = [
    { name: 'Placeholder Guest', text: 'Wishing you a lifetime of love and happiness. Congratulations!' },
    { name: 'Another Friend', text: 'So happy for you both — may your days be full of laughter.' },
    { name: 'Family Member', text: 'God bless your union. We love you!' },
    { name: 'College Crew', text: 'Finally! Can’t wait to celebrate with you two in October.' }
  ];

  /* ── personalization: ?to= & &max= ───────────────────────── */
  var params = new URLSearchParams(window.location.search);
  var guest = params.get('to');
  var guestKey = '';
  if (guest) {
    var decoded;
    try { decoded = decodeURIComponent(guest); } catch (e) { decoded = guest; }
    guestKey = decoded;
    $$('.guest-name-slot').concat([$('#guest-name')]).forEach(function (el) {
      if (el) el.textContent = decoded;
    });
    // ?to= IS the guest's identity — the name field is only for visitors without a link
    var nameField = $('#rsvp-name-field');
    if (nameField) nameField.hidden = true;
  }
  var maxGuests = parseInt(params.get('max'), 10);
  var guestsInput = $('#rsvp-guests');
  if (guestsInput && maxGuests > 0) {
    guestsInput.max = maxGuests;
    var lbl = $('#guest-count-label');
    if (lbl) lbl.textContent = 'No of Guest (Max ' + maxGuests + ')';
  }

  /* holy matrimony is invitation-only: card shows only with &hm=1 */
  if (params.get('hm') !== '1') {
    var holmatCard = $('#event-holmat');
    if (holmatCard) holmatCard.hidden = true;
  }

  /* ── audio system ────────────────────────────────────────── */
  var song = $('#song');
  var soundBtn = $('#sound-toggle');
  var iconPlay = $('#icon-play');
  var iconPause = $('#icon-pause');
  var opened = false;

  /* 0.46, as on the engagement: this track is mastered loud (-9.5 LUFS), so
     full volume would play it noticeably louder than intended. */
  if (song) song.volume = 0.46;
  function playAudio() { if (song) song.play().catch(function () {}); }
  function pauseAudio() { if (song) song.pause(); }
  function syncSoundIcon() {
    var playing = song && !song.paused;
    if (iconPlay) iconPlay.style.display = playing ? 'none' : 'block';
    if (iconPause) iconPause.style.display = playing ? 'block' : 'none';
    if (soundBtn) soundBtn.classList.toggle('playing', !!playing);
  }
  if (song) {
    song.addEventListener('play', syncSoundIcon);
    song.addEventListener('pause', syncSoundIcon);
  }
  if (soundBtn) soundBtn.addEventListener('click', function () {
    if (!song) return;
    if (song.paused) playAudio(); else pauseAudio();
  });
  document.addEventListener('visibilitychange', function () {
    if (!opened) return;
    var video = $('#video-backdrop');
    if (document.hidden) { pauseAudio(); if (video) video.pause(); }
    else { playAudio(); if (video) video.play().catch(function () {}); }
  });

  /* ── scroll lock while cover is up ───────────────────────── */
  window.onbeforeunload = function () { window.scrollTo(0, 0); };
  function disableScrolling() {
    var x = window.scrollX, y = window.scrollY;
    window.onscroll = function () { window.scrollTo(x, y); };
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100vh';
  }
  function enableScrolling() {
    window.onscroll = null;
    document.body.style.overflow = '';
    document.body.style.height = '';
  }
  disableScrolling();

  /* ── intro (the engagement's): four CSS beats, then the cover ── */
  var preloader = $('#preloader');
  function hidePreloader() {
    if (!preloader || !preloader.parentNode) return;
    preloader.style.transition = 'opacity .5s ease';
    preloader.style.opacity = '0';
    setTimeout(function () {
      if (preloader.parentNode) preloader.parentNode.removeChild(preloader);   // cover stays locked until opened
    }, 500);
  }
  var forceHide = setTimeout(hidePreloader, 10000);          // safety net
  /* Dismiss 1s after the last beat lands — anchored to the name's own
     animationend (~5.6s), not window load, so slow media can't stretch it. */
  var introNames = $$('.intro-name');
  if (introNames.length) introNames[introNames.length - 1].addEventListener('animationend', function () {
    setTimeout(function () { clearTimeout(forceHide); hidePreloader(); }, 1000);
  }, { once: true });

  /* The greeting: the Sheet builds a couple's key as "Name & Companion", so
     each name gets its own line with the ampersand between. Long names
     (titles, suffixes) shrink to fit the block, and only wrap if they still
     won't fit. */
  function autoFit(node, container, maxPx, minPx) {
    maxPx = maxPx || 14; minPx = minPx || 8.5;
    node.style.whiteSpace = 'nowrap';
    var size = maxPx;
    node.style.fontSize = size + 'px';
    node.style.letterSpacing = '3px';
    var avail = container.clientWidth;
    while (size > minPx && node.scrollWidth > avail) {
      size -= 0.5;
      node.style.fontSize = size + 'px';
      node.style.letterSpacing = (3 * size / maxPx).toFixed(2) + 'px';
    }
    if (node.scrollWidth > avail) node.style.whiteSpace = 'normal';   // last resort
  }
  (function renderIntroGuest() {
    var el = $('#intro-guest');
    if (!el) return;
    el.textContent = '';
    (guestKey || 'Our Beloved Guest').split(/\s+&\s+/).filter(Boolean).forEach(function (part, i) {
      if (i) {
        var amp = document.createElement('span');
        amp.className = 'gamp';
        amp.textContent = '&';
        el.appendChild(amp);
      }
      var n = document.createElement('span');
      n.className = 'gname';
      n.textContent = part;                 // textContent, so no escaping needed
      el.appendChild(n);
    });
    var fit = function () {
      if (!document.body.contains(el)) return;             // intro already gone
      $$('.gname', el).forEach(function (n) { autoFit(n, el); });
    };
    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    window.addEventListener('resize', fit);
  })();

  /* ── scroll reveals (the engagement's) ───────────────────── */
  /* Elements carry .reanimate + .fade + a .delayNms stagger. Adding .in-view
     plays the fade and removing it rewinds, so a page replays its stagger
     every time you come back to it. Measured from element rects on each
     scroll frame, so it always matches what is really on screen. */
  var reveals = [];
  function syncReveals() {
    var top = 10, bottom = window.innerHeight - 10;
    reveals.forEach(function (el) {
      var r = el.getBoundingClientRect();
      el.classList.toggle('in-view', r.top < bottom && r.bottom > top);
    });
  }
  var revealTick = false;
  function queueReveals() {
    if (revealTick) return;
    revealTick = true;
    requestAnimationFrame(function () { revealTick = false; syncReveals(); });
  }
  /* Armed on open, not at load: the hero sits behind the cover, and marking
     it visible early would burn its fade where nobody can see it. */
  function armReveals() {
    reveals = $$('.reanimate');
    syncReveals();
    window.addEventListener('scroll', queueReveals, { passive: true });
    window.addEventListener('resize', queueReveals);
  }

  /* ── open invitation ─────────────────────────────────────── */
  var cover = $('#cover-section');
  var openBtn = $('#open-invitation');
  if (openBtn) openBtn.addEventListener('click', function () {
    if (opened) return;
    opened = true;

    document.documentElement.style.scrollSnapType = 'none';
    if (cover) {                              // the engagement's exit: fade + a slight zoom
      cover.classList.add('hidden');
      setTimeout(function () { if (cover.parentNode) cover.parentNode.removeChild(cover); }, 1000);
    }
    enableScrolling();
    playAudio();
    armReveals();
    var video = $('#video-backdrop');
    if (video) video.play().catch(function () {});

    ['#sound-toggle', '#nav-toggle'].forEach(function (s) {
      var el = $(s); if (el) el.hidden = false;
    });

    var hero = $('#hero');
    if (hero) hero.scrollIntoView({ behavior: 'smooth' });
    setTimeout(function () {
      document.documentElement.style.scrollSnapType = 'y mandatory';
    }, 600);
  });

  /* ── AOS + replay-on-every-pass observer ─────────────────── */
  if (typeof AOS !== 'undefined') {
    AOS.init({ duration: 800, easing: 'ease', once: false, offset: 60 });
    var aosObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.intersectionRatio > 0) entry.target.classList.add('aos-animate');
        else entry.target.classList.remove('aos-animate');
      });
    });
    $$('[data-aos]').forEach(function (el) { aosObserver.observe(el); });
  }

  /* ── menu (the engagement's): monogram button + full-screen list ── */
  var navBtn = $('#nav-toggle');
  var navMenu = $('#nav-menu');
  function setNavOpen(open) {
    if (!navBtn || !navMenu) return;
    navBtn.classList.toggle('open', open);
    navMenu.classList.toggle('open', open);
    navBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (navBtn) navBtn.addEventListener('click', function () {
    setNavOpen(!navBtn.classList.contains('open'));
  });

  /* The jump: pause snap, glide, and re-arm snap on ARRIVAL, not on a timer —
     a fixed timer can fire mid-glide on a long jump, and mandatory snap then
     drags the page back. If the glide stalls short (smooth-scroll tails can),
     it is resumed. */
  var navSettleWatch;
  $$('#nav-menu a').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var target = $(a.getAttribute('href'));
      setNavOpen(false);
      if (!target) return;

      var root = document.documentElement;
      root.style.scrollSnapType = 'none';
      target.scrollIntoView({ behavior: 'smooth' });
      clearInterval(navSettleWatch);
      var last = -1, still = 0, t0 = Date.now();
      navSettleWatch = setInterval(function () {
        var goal = Math.round(target.getBoundingClientRect().top + window.scrollY);
        var y = Math.round(window.scrollY);
        var stalled = y === last && ++still >= 3;
        if (y !== last) { still = 0; last = y; }
        if (Math.abs(y - goal) < 2 || Date.now() - t0 > 4000) {
          clearInterval(navSettleWatch);
          window.scrollTo(0, goal);
          root.style.scrollSnapType = 'y mandatory';
        } else if (stalled) {
          still = 0;
          window.scrollTo({ top: goal, behavior: 'smooth' });
        }
      }, 100);
    });
  });

  /* ── light-page contrast for the menu and music buttons ──── */
  /* Pages without a photo or the video behind them are white. */
  function isLight(sec) {
    return !!sec && !sec.classList.contains('photo-section') && !sec.classList.contains('window');
  }
  function sectionAt(sections, y) {
    for (var i = 0; i < sections.length; i++) {
      var r = sections[i].getBoundingClientRect();
      if (r.top <= y && r.bottom > y) return sections[i];
    }
    return null;
  }
  function onScroll() {
    var sections = $$('.child').filter(function (s) { return !s.hidden; });
    /* the page under each button decides its colour: the monogram's centre
       is 43px down, the music button's 41px up from the bottom */
    if (navBtn) navBtn.classList.toggle('on-light', isLight(sectionAt(sections, 43)));
    if (soundBtn) soundBtn.classList.toggle('on-light', isLight(sectionAt(sections, window.innerHeight - 41)));
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ── countdown ───────────────────────────────────────────── */
  var cd = { d: $('#cd-days'), h: $('#cd-hours'), m: $('#cd-mins'), s: $('#cd-secs') };
  function tick() {
    var diff = Math.max(0, WEDDING_DATE - new Date());
    var sec = Math.floor(diff / 1000);
    if (cd.d) cd.d.textContent = Math.floor(sec / 86400);
    if (cd.h) cd.h.textContent = Math.floor(sec % 86400 / 3600);
    if (cd.m) cd.m.textContent = Math.floor(sec % 3600 / 60);
    if (cd.s) cd.s.textContent = sec % 60;
  }
  setInterval(tick, 1000); tick();

  /* ── add-to-calendar (data-URI ICS, like the original) ───── */
  function icsFor(ev) {
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      'UID:' + Math.random().toString(36).slice(2) + '@johanvalerie',
      'SUMMARY:' + ev.title, 'DTSTART:' + ev.start, 'DTEND:' + ev.end,
      'LOCATION:' + ev.loc, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return 'data:text/calendar;charset=utf8;base64,' + btoa(unescape(encodeURIComponent(ics)));
  }
  $$('[data-calendar]').forEach(function (a) {
    var ev = EVENTS[a.getAttribute('data-calendar')];
    if (!ev) return;
    a.setAttribute('href', icsFor(ev));
    a.setAttribute('download', 'johan-valerie-' + a.getAttribute('data-calendar') + '.ics');
  });

  /* ── RSVP stepper ────────────────────────────────────────── */
  var stepMinus = $('#step-minus'), stepPlus = $('#step-plus');
  if (stepMinus) stepMinus.addEventListener('click', function () {
    var v = parseInt(guestsInput.value, 10) || 1;
    if (v > 1) guestsInput.value = v - 1;
  });
  if (stepPlus) stepPlus.addEventListener('click', function () {
    var v = parseInt(guestsInput.value, 10) || 1;
    var max = parseInt(guestsInput.max, 10) || 99;
    if (v < max) guestsInput.value = v + 1;
  });

  /* ── wishes wall (seeded + localStorage, 4 per page) ─────── */
  var wishList = $('#wish-list');
  var wishPrev = $('#wish-prev'), wishNext = $('#wish-next');
  var wishPage = 1;
  function storedWishes() {
    try { return JSON.parse(localStorage.getItem('jv-wishes') || '[]'); }
    catch (e) { return []; }
  }
  function renderWishes(list) {
    if (!wishList) return;
    wishList.innerHTML = '';
    list.forEach(function (w) {
      var div = document.createElement('div');
      div.className = 'wish';
      var strong = document.createElement('strong');
      strong.textContent = w.name;
      var p = document.createElement('p');
      p.textContent = w.text;
      div.appendChild(strong); div.appendChild(p);
      wishList.appendChild(div);
    });
    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'note';
      empty.textContent = 'Be the first to leave your blessing.';
      wishList.appendChild(empty);
    }
    showWishPage(1);
  }
  function loadWishes() {
    if (API_URL) {
      fetch(API_URL + '?action=wishes')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          renderWishes((d && d.wishes ? d.wishes : []).map(function (w) {
            return { name: w.n, text: w.t };
          }));
        })
        .catch(function () { renderWishes([]); });
    } else {
      renderWishes(storedWishes().concat(SEED_WISHES));
    }
  }
  function showWishPage(page) {
    var items = $$('.wish', wishList);
    var pages = Math.max(1, Math.ceil(items.length / WISHES_PER_PAGE));
    wishPage = Math.min(Math.max(1, page), pages);
    items.forEach(function (it, i) {
      it.classList.toggle('show',
        i >= (wishPage - 1) * WISHES_PER_PAGE && i < wishPage * WISHES_PER_PAGE);
    });
    if (wishPrev) wishPrev.hidden = wishPage <= 1;
    if (wishNext) wishNext.hidden = wishPage >= pages;
  }
  if (wishPrev) wishPrev.addEventListener('click', function () { showWishPage(wishPage - 1); });
  if (wishNext) wishNext.addEventListener('click', function () { showWishPage(wishPage + 1); });
  loadWishes();

  /* ── two-stage RSVP ──────────────────────────────────────── */
  /* Posts don't make the guest wait for Apps Script, which takes 3–10s to
     answer even a read: the guest is thanked as soon as the request has left
     the device (~1.2s at most). The reply is still read when it lands — if the
     sheet refused the answer (busy, an error) `on.refused` runs so the page
     can say so and offer to send again; if the reply can't be read at all,
     `on.unsure` runs. keepalive lets the request finish even if the page is
     closed. The body is form fields, not JSON, because every version of the
     backend reads form fields — a JSON body is invisible to the older one,
     which would thank the guest and save nothing. */
  function sendApi(fields, on) {
    on = on || {};
    var body = Object.keys(fields).map(function (k) {
      var v = fields[k];
      return encodeURIComponent(k) + '=' +
             encodeURIComponent(Array.isArray(v) ? JSON.stringify(v) : v);
    }).join('&');
    var sent = fetch(API_URL, {
      method: 'POST', keepalive: true, body: body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }
    });
    return new Promise(function (resolve, reject) {
      var done = false, t;
      function finish(ok, err) {
        if (done) return false;
        done = true;
        clearTimeout(t);
        if (ok) resolve(); else reject(err);
        return true;
      }
      t = setTimeout(function () { finish(true); }, 1200);
      sent.then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok === false) {
            if (!finish(false, new Error(d.error || 'refused')) && on.refused) on.refused(d.error);
          } else {
            finish(true);
          }
        }, function () {
          if (!finish(false, new Error('unreachable')) && on.unsure) on.unsure();
        });
    });
  }

  var infoSection = $('#info');
  var detailsSection = $('#details');
  var detailsForm = $('#details-form');

  // Asawin hosts up to 2 nights; extra nights are paid to the hotel.
  var HOSTED_NIGHTS = 2, ASAWIN_EXTRA = 2200, RITZ_RATE = 14065.15;
  function fmtTHB(n) {
    return 'THB ' + n.toLocaleString('en-US', {
      minimumFractionDigits: (n % 1 ? 2 : 0), maximumFractionDigits: 2
    });
  }

  function scrollToSection(el) {
    if (!el) return;
    document.documentElement.style.scrollSnapType = 'none';
    el.scrollIntoView({ behavior: 'smooth' });
    setTimeout(function () {
      document.documentElement.style.scrollSnapType = 'y mandatory';
    }, 1600);
  }
  function unlockInfo(scroll) {
    if (!infoSection) return;
    if (infoSection.hidden) { infoSection.hidden = false; onScroll(); }
    if (scroll) scrollToSection(infoSection);
  }
  function unlockDetails(scroll) {
    if (!detailsSection) return;
    if (detailsSection.hidden) { detailsSection.hidden = false; onScroll(); }
    if (scroll) scrollToSection(detailsSection);
  }
  var infoContinue = $('#info-continue');
  if (infoContinue) infoContinue.addEventListener('click', function () { unlockDetails(true); });
  function nightsCost(accomCode, nights) {
    var n = parseInt(nights, 10) || 0;
    if (accomCode === 'provided' && n > HOSTED_NIGHTS) return (n - HOSTED_NIGHTS) * ASAWIN_EXTRA;
    if (accomCode === 'upgrade' && n > 0) return n * RITZ_RATE;
    return 0;
  }
  function showDetailsDone(accomCode, arrival, nights) {
    var wrap = $('#details-form-wrap'), done = $('#details-done');
    if (wrap) wrap.hidden = true;
    if (done) done.hidden = false;
    var labels = {
      provided: 'Asawin Grand Convention Hotel — our treat',
      upgrade: 'The Ritz-Carlton, Bangkok — own expense',
      self: 'Self-arranged stay'
    };
    var parts = [];
    var n = parseInt(nights, 10);
    if (labels[accomCode]) parts.push(labels[accomCode] + (n ? ' — ' + n + ' night' + (n > 1 ? 's' : '') : ''));
    var cost = nightsCost(accomCode, nights);
    if (cost) parts.push((accomCode === 'provided' ? 'extra ' : '') + fmtTHB(cost) +
                         ' to ' + (accomCode === 'provided' ? 'Asawin' : 'the Ritz-Carlton'));
    if (arrival) parts.push('arriving ' + arrival);
    var sum = $('#details-summary');
    if (sum) sum.textContent = parts.join('  ·  ');
  }

  /* nights are asked only when we (or the Ritz) host the stay */
  var nightsRow = $('#details-nights-row');
  var nightsSel = $('#details-nights');
  var nightsNote = $('#details-nights-note');
  function updateNightsNote() {
    var chosen = detailsForm && detailsForm.querySelector('input[name=accommodation]:checked');
    var n = parseInt(nightsSel && nightsSel.value, 10) || 0;
    // arrival turns from optional to required once the stay runs past the 2 hosted nights
    var reqSpan = $('#details-arrival-req');
    if (reqSpan) {
      if (n > HOSTED_NIGHTS) {
        reqSpan.textContent = '(required — date & hour)';
        reqSpan.classList.add('req');
      } else {
        reqSpan.innerHTML = '(optional &mdash; date &amp; hour)';
        reqSpan.classList.remove('req');
      }
    }
    if (!nightsNote) return;
    nightsNote.className = 'nights-note';
    if (!chosen || chosen.value === 'self') { nightsNote.textContent = ''; return; }
    if (chosen.value === 'provided') {
      if (!n) {
        nightsNote.textContent = 'We host up to 2 nights (Deluxe). Extra nights are THB 2,200 each, paid to Asawin.';
      } else if (n <= HOSTED_NIGHTS) {
        nightsNote.classList.add('ok');
        nightsNote.textContent = n + ' night' + (n > 1 ? 's' : '') + ' — fully hosted by us' +
          (n < HOSTED_NIGHTS ? ' (up to 2 nights are on us).' : ', our gift to you.');
      } else {
        var extra = n - HOSTED_NIGHTS;
        nightsNote.classList.add('pay');
        nightsNote.innerHTML = 'First 2 nights hosted by us. <strong>' + extra + ' extra night' +
          (extra > 1 ? 's' : '') + ' &times; THB 2,200 = ' + fmtTHB(extra * ASAWIN_EXTRA) +
          '</strong>, paid directly to Asawin.';
      }
    } else if (chosen.value === 'upgrade') {
      if (!n) {
        nightsNote.textContent = 'Charged at THB 14,065.15 / night (Deluxe), paid to the hotel.';
      } else {
        nightsNote.classList.add('pay');
        nightsNote.innerHTML = '<strong>' + n + ' night' + (n > 1 ? 's' : '') +
          ' &times; THB 14,065.15 = ' + fmtTHB(n * RITZ_RATE) + '</strong>, paid directly to The Ritz-Carlton.';
      }
    }
  }
  function syncNightsRow() {
    var chosen = detailsForm && detailsForm.querySelector('input[name=accommodation]:checked');
    var needsNights = !!(chosen && chosen.value !== 'self');
    if (nightsRow) nightsRow.hidden = !needsNights;
    if (!needsNights) { if (nightsSel) nightsSel.value = ''; }
    else if (nightsSel && !nightsSel.value) { nightsSel.value = '2'; }   // default: the 2 nights we host
    updateNightsNote();
  }
  if (detailsForm) {
    $$('input[name=accommodation]', detailsForm).forEach(function (r) {
      r.addEventListener('change', syncNightsRow);
    });
  }
  if (nightsSel) nightsSel.addEventListener('change', updateNightsNote);

  /* stage 1: attendance → (attending) one name per guest → confirm.
     The invitation name from ?to= is the identity and signs the wish, so a
     guest with a link never types their own name; the names asked for on the
     second step go to the Guest List tab (and the hotel booking). */
  var form = $('#rsvp-form');
  var step1 = $('#rsvp-step1'), step2 = $('#rsvp-step2');
  var nextBtn = $('#rsvp-next'), sendBtn = $('#rsvp-send');
  var confirmBtn = $('#rsvp-confirm'), backBtn = $('#rsvp-back');
  var countField = $('#rsvp-count-field'), nameBox = $('#rsvp-guest-names');
  var rsvpTitle = $('#rsvp-title');
  var TITLE_STEP1 = rsvpTitle ? rsvpTitle.innerHTML : '';
  var NOTE_STEP1 = 'Kindly confirm before the celebration';
  var savedNames = [];      // names from an earlier answer, restored on a return visit
  var touched = false;      // a guest already filling in keeps their form over a late restore
  var answered = false;     // an answer went out; editing it re-arms the buttons
  var SEND_LABEL = sendBtn ? sendBtn.textContent : '';
  var CONFIRM_LABEL = confirmBtn ? confirmBtn.textContent : '';

  /* After an answer is sent its button stays disabled, which on its own would
     leave the guest stuck: a disabled default button also swallows Enter, and
     a decline could never be re-sent. Any edit puts the buttons back. */
  function resetButtons() {
    answered = false;
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = SEND_LABEL; }
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = CONFIRM_LABEL; }
    if (backBtn) backBtn.hidden = false;
  }

  function who() {
    return guestKey || (($('#rsvp-name') && $('#rsvp-name').value) || '').trim();
  }
  function attendingYes() {
    var r = form && form.querySelector('input[name=attendance]:checked');
    return !r || r.value === 'yes';
  }
  function rsvpNote(msg) {
    var note = $('#rsvp-note');
    if (note) note.textContent = msg;
  }
  function syncAttendance() {
    var yes = attendingYes();
    if (countField) countField.hidden = !yes;
    if (nextBtn) nextBtn.hidden = !yes;
    if (sendBtn) sendBtn.hidden = yes;
  }
  function showStep(n) {
    if (step1) step1.hidden = n !== 1;
    if (step2) step2.hidden = n !== 2;
    if (rsvpTitle) rsvpTitle.innerHTML = n === 1 ? TITLE_STEP1 : 'Who Is<br>Joining?';
    var content = form && form.parentNode;
    if (content) {
      content.scrollTop = 0;
      content.classList.toggle('on-step2', n === 2);   // clears the fixed music button
    }
  }
  /* Rebuilt whenever the count changes. A field already on screen keeps what
     is in it; new positions fall back to an earlier answer, then to the
     invitation name ("Mr. A & Mrs. B" seeds two). */
  function buildGuestFields(n) {
    var typed = $$('.rsvp-guest', nameBox).map(function (el) { return el.value; });
    var seed = who().split(/\s+&\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
    nameBox.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var label = document.createElement('label');
      label.className = 'field-label';
      label.htmlFor = 'rsvp-guest-' + i;
      label.textContent = 'Guest ' + (i + 1);
      var input = document.createElement('input');
      input.type = 'text';
      input.id = 'rsvp-guest-' + i;
      input.className = 'rsvp-guest';
      input.placeholder = 'Full name';
      input.maxLength = 80;
      input.value = typed[i] !== undefined ? typed[i] : (savedNames[i] || seed[i] || '');
      nameBox.appendChild(label);
      nameBox.appendChild(input);
    }
  }
  function goNext() {
    if (!who()) {
      rsvpNote('Please fill in your name');
      if ($('#rsvp-name')) $('#rsvp-name').focus();
      return;
    }
    buildGuestFields(parseInt(guestsInput && guestsInput.value, 10) || 1);
    showStep(2);
    rsvpNote('Please enter each guest’s full name');
  }

  if (form) {
    $$('input[name=attendance]', form).forEach(function (r) {
      r.addEventListener('change', syncAttendance);
    });
    var edited = function () { touched = true; if (answered) resetButtons(); };
    form.addEventListener('input', edited);
    form.addEventListener('change', edited);
    syncAttendance();
  }
  if (nextBtn) nextBtn.addEventListener('click', goNext);
  if (backBtn) backBtn.addEventListener('click', function () { showStep(1); rsvpNote(NOTE_STEP1); });

  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    if ($('#rsvp-hp') && $('#rsvp-hp').value) return;
    var yes = attendingYes();
    // Enter pressed in a step-1 field while attending means "next", not "send"
    if (yes && step2 && step2.hidden) { goNext(); return; }

    var name = who();
    if (!name) { rsvpNote('Please fill in your name'); return; }
    var names = [];
    if (yes) {
      names = $$('.rsvp-guest', nameBox).map(function (el) { return el.value.trim(); });
      if (!names.length) { rsvpNote('Please tell us who is joining'); return; }
      if (names.some(function (n) { return !n; })) { rsvpNote('Please fill in every guest name'); return; }
    }
    var text = ($('#rsvp-wishes').value || '').trim();
    var btn = yes ? confirmBtn : sendBtn;

    function afterOk() {
      answered = true;
      savedNames = names;
      if (yes) {
        if (btn) { btn.textContent = 'Confirmed ✓ — a few notes below'; btn.disabled = true; }
        if (backBtn) backBtn.hidden = true;
        rsvpNote(text
          ? 'Your wish will appear on the wall once approved'
          : 'Please read the notes below, then complete your details');
        unlockInfo(true);
      } else {
        if (btn) { btn.textContent = 'Thank you — we’ll miss you!'; btn.disabled = true; }
        rsvpNote(text ? 'Your wish will appear on the wall once approved' : '');
      }
    }

    if (API_URL) {
      if (btn) { btn.textContent = 'Sending…'; btn.disabled = true; }
      sendApi({ action: 'rsvp', key: name, name: name, attending: yes ? 'yes' : 'no',
                pax: yes ? names.length : 0, guests: names, wishes: text }, {
        refused: function () {
          resetButtons();
          rsvpNote('Sorry — that didn’t save. Please send it again.');
        },
        unsure: function () {
          rsvpNote('We couldn’t confirm this was saved — if it’s missing next time you open your link, please send it again.');
        }
      })
        .then(function () { afterOk(); setTimeout(loadWishes, 1200); })
        .catch(function () {
          if (btn) { btn.textContent = 'Couldn’t send — tap to retry'; btn.disabled = false; }
        });
    } else {
      if (text) {
        var list = storedWishes();
        list.unshift({ name: name, text: text });
        try { localStorage.setItem('jv-wishes', JSON.stringify(list.slice(0, 40))); } catch (err) {}
        loadWishes();
      }
      afterOk();
    }
  });

  /* A details save the sheet refused puts the form back, ready to resend. */
  var detailsBtn = detailsForm && $('button[type=submit]', detailsForm);
  var DETAILS_LABEL = detailsBtn ? detailsBtn.textContent : '';
  function reopenDetails(msg) {
    var wrap = $('#details-form-wrap'), done = $('#details-done');
    if (wrap) wrap.hidden = false;
    if (done) done.hidden = true;
    if (detailsBtn) { detailsBtn.disabled = false; detailsBtn.textContent = DETAILS_LABEL; }
    var note = $('#details-note');
    if (note) note.textContent = msg;
  }

  /* stage 2: guest details (accommodation + nights + arrival) */
  if (detailsForm) detailsForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var chosen = detailsForm.querySelector('input[name=accommodation]:checked');
    var note = $('#details-note');
    if (!chosen) {
      if (note) note.textContent = 'Please choose an accommodation option first';
      return;
    }
    var nights = (nightsSel && nightsSel.value) || '';
    if (chosen.value !== 'self' && !nights) {
      if (note) note.textContent = 'Please select your number of nights';
      if (nightsSel) nightsSel.focus();
      return;
    }
    var arrival = ($('#details-arrival') && $('#details-arrival').value) || '';
    var hourSel = $('#details-arrival-hour');
    var hour = (hourSel && hourSel.value) || '';
    var arrivalRequired = (parseInt(nights, 10) || 0) > HOSTED_NIGHTS;   // >2 nights → exact arrival needed
    if (arrivalRequired && !arrival) {
      if (note) note.textContent = 'Staying more than 2 nights — please add your arrival date';
      if ($('#details-arrival')) $('#details-arrival').focus();
      return;
    }
    if (arrivalRequired && hour === '') {
      if (note) note.textContent = 'Staying more than 2 nights — please add your arrival hour';
      if (hourSel) hourSel.focus();
      return;
    }
    if (arrival && hour === '') {
      if (note) note.textContent = 'Please pick your arrival hour too';
      if (hourSel) hourSel.focus();
      return;
    }
    if (!arrival && hour !== '') {
      if (note) note.textContent = 'Please pick your arrival date too';
      return;
    }
    var arrivalFull = arrival ? arrival + (hour !== '' ? ' ' + ('0' + hour).slice(-2) + ':00' : '') : '';
    var btn = $('button[type=submit]', detailsForm);

    if (API_URL) {
      if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }
      sendApi({ action: 'details', key: who(), name: who(),
                /* The attendance answer rides along, so if the RSVP post before
                   this one was lost the sheet still gets a complete row. */
                attending: 'yes',
                pax: savedNames.length || parseInt(guestsInput && guestsInput.value, 10) || 1,
                guests: savedNames, wishes: ($('#rsvp-wishes').value || '').trim(),
                accommodation: chosen.value, nights: nights,
                arrival: arrival, arrivalHour: hour }, {
        refused: function () {
          reopenDetails('Sorry — your details didn’t save. Please tap Complete RSVP again.');
        },
        unsure: function () {
          var sum = $('#details-summary');
          if (sum) sum.textContent += ' — we couldn’t confirm this was saved; if it’s missing next time you open your link, please send it again.';
        }
      })
        .then(function () { showDetailsDone(chosen.value, arrivalFull, nights); })
        .catch(function () {
          if (btn) { btn.textContent = 'Couldn’t save — tap to retry'; btn.disabled = false; }
        });
    } else {
      showDetailsDone(chosen.value, arrivalFull, nights);
    }
  });

  /* count this open (per personalized link) — fire and forget. The whole link
     goes along: seats and Holy Matrimony live only in the link, and a link
     sent before a change keeps showing the old page, so the Sheet logs which
     one was opened. Older backends ignore the extra field. */
  if (API_URL && guestKey) {
    try {
      sendApi({ action: 'open', key: guestKey, link: location.href.split('#')[0] }).catch(function () {});
    } catch (e) {}
  }

  /* returning guest: restore their state from the sheet */
  if (API_URL && guestKey) {
    fetch(API_URL + '?action=status&key=' + encodeURIComponent(guestKey))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.found) return;
        savedNames = Array.isArray(d.guests) ? d.guests
          : String(d.guests || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        var isYes = String(d.attending).toLowerCase() === 'yes';
        /* A guest who started changing their answer before this reply landed
           keeps what they typed; the rest — unlocked pages, hotel choice — is
           restored either way. */
        if (!touched) {
          if (d.name && $('#rsvp-name')) $('#rsvp-name').value = d.name;
          if (d.pax && guestsInput) {
            var cap = parseInt(guestsInput.max, 10) || 99;
            guestsInput.value = Math.min(d.pax, cap);
          }
          var radio = form && form.querySelector('input[name=attendance][value="' + (isYes ? 'yes' : 'no') + '"]');
          if (radio) radio.checked = true;
          syncAttendance();
          if (d.wishes && $('#rsvp-wishes')) $('#rsvp-wishes').value = d.wishes;
        }
        if (isYes) {
          unlockInfo(false);
          unlockDetails(false);
          if (d.accommodation && detailsForm) {
            var acc = detailsForm.querySelector('input[name=accommodation][value="' + d.accommodation + '"]');
            if (acc) acc.checked = true;
          }
          syncNightsRow();
          if (d.nights && nightsSel) nightsSel.value = String(parseInt(d.nights, 10) || '');
          updateNightsNote();
          if (d.arrival && $('#details-arrival')) {
            var am = /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}):\d{2})?/.exec(String(d.arrival));
            if (am) {
              $('#details-arrival').value = am[1];
              var hs = $('#details-arrival-hour');
              if (hs && am[2] !== undefined) hs.value = String(parseInt(am[2], 10));
            }
          }
          if (d.detailsDone) showDetailsDone(d.accommodation, d.arrival, d.nights);
        }
      })
      .catch(function () {});
  }

  /* ── gallery: swiper + custom lightbox ───────────────────── */
  var galleryImages = [];
  var wrapper = $('#gallery-swiper .swiper-wrapper');
  if (wrapper) {
    for (var i = 1; i <= GALLERY_COUNT; i++) {
      var src = 'assets/img/gallery-' + (i < 10 ? '0' + i : i) + '.jpg';
      galleryImages.push(src);
      var slide = document.createElement('div');
      slide.className = 'swiper-slide';
      var frame = document.createElement('div');
      frame.className = 'frame';
      var img = document.createElement('img');
      img.src = src; img.alt = 'Johan & Valerie — moment ' + i; img.loading = 'lazy';
      img.setAttribute('data-index', i - 1);
      frame.appendChild(img); slide.appendChild(frame); wrapper.appendChild(slide);
    }
  }
  if (typeof Swiper !== 'undefined' && $('#gallery-swiper')) {
    new Swiper('#gallery-swiper', {
      slidesPerView: 'auto',
      centeredSlides: true,
      spaceBetween: 14,
      loop: true,
      speed: 1000,
      autoplay: { delay: 1500, disableOnInteraction: false },
      pagination: { el: '#gallery-swiper .swiper-pagination', type: 'fraction' }
    });
  }

  /* lightbox */
  var lb = $('#lightbox'), lbImg = $('#lightbox-img'), lbCounter = $('#lightbox-counter');
  var lbIndex = 0;
  function lbShow(i) {
    lbIndex = (i + galleryImages.length) % galleryImages.length;
    if (lbImg) lbImg.src = galleryImages[lbIndex];
    if (lbCounter) lbCounter.textContent = (lbIndex + 1) + ' / ' + galleryImages.length;
  }
  function lbOpen(i) {
    if (!lb) return;
    lbShow(i);
    lb.hidden = false;
    requestAnimationFrame(function () { lb.classList.add('open'); });
  }
  function lbClose() {
    if (!lb) return;
    lb.classList.remove('open');
    setTimeout(function () { lb.hidden = true; }, 300);
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches('#gallery-swiper img')) {
      lbOpen(parseInt(t.getAttribute('data-index'), 10) || 0);
    }
  });
  if (lb) {
    $('#lightbox-close').addEventListener('click', lbClose);
    $('#lightbox-prev').addEventListener('click', function () { lbShow(lbIndex - 1); });
    $('#lightbox-next').addEventListener('click', function () { lbShow(lbIndex + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lbClose(); });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') lbClose();
      if (e.key === 'ArrowLeft') lbShow(lbIndex - 1);
      if (e.key === 'ArrowRight') lbShow(lbIndex + 1);
    });
    var touchX = 0;
    lb.addEventListener('touchstart', function (e) { touchX = e.changedTouches[0].screenX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].screenX - touchX;
      if (dx < -50) lbShow(lbIndex + 1);
      else if (dx > 50) lbShow(lbIndex - 1);
    }, { passive: true });
  }

})();
