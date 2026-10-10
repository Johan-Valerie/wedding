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
    welcome:   { title: 'Welcome Dinner — Johan & Valerie', start: '20270108T103000Z' },   // the time only: no place, no set end
    ceremony:  { title: 'Holy Matrimony — Johan & Valerie', start: '20270109T080000Z', end: '20270109T093000Z', loc: 'La Chapelle Bangkok — Jardin de Juliet' },
    cocktail:  { title: 'Cocktail Party — Johan & Valerie', start: '20270109T090000Z', end: '20270109T110000Z', loc: 'La Chapelle Bangkok — La Fontaine' },
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
  }
  var invitationNames = guestKey.split(/\s+&\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
  var maxGuests = parseInt(params.get('max'), 10);
  var guestsInput = $('#rsvp-guests');
  if (guestsInput && maxGuests > 0) {
    guestsInput.max = maxGuests;
    var lbl = $('#guest-count-label');
    if (lbl) lbl.textContent = 'No of Guest (Max ' + maxGuests + ')';
  }
  if (guestsInput && invitationNames.length > 1) {
    guestsInput.value = Math.min(invitationNames.length, parseInt(guestsInput.max, 10) || 2);
  }

  /* holy matrimony is invitation-only: card (and the line after it) shows
     only with &hm=1; with all three events the page sets them tighter */
  if (params.get('hm') !== '1') {
    ['#event-holmat', '#holmat-divider'].forEach(function (sel) {
      var el = $(sel);
      if (el) el.hidden = true;
    });
  } else {
    var eventsSec = $('#events');
    if (eventsSec) eventsSec.classList.add('three');
  }

  /* ── audio system ────────────────────────────────────────── */
  var song = $('#song');
  var soundBtn = $('#sound-toggle');
  var iconPlay = $('#icon-play');
  var iconPause = $('#icon-pause');
  var opened = false;

  /* Keep the soundtrack below full volume when the invitation opens. */
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

  /* ── a phone held sideways ───────────────────────────────── */
  /* Each page is one upright screen, so a phone on its side is asked to turn
     upright (#rotate-note). Judged by the device's own orientation, never the
     page's shape: a keyboard that shrinks the page while a guest types must
     not bring it up (isFormField is below). A tablet (shorter side over
     500px) keeps the page. */
  var coarsePointer = window.matchMedia ? matchMedia('(pointer: coarse)') : null;
  function deviceSideways() {
    var type = screen.orientation && screen.orientation.type;
    if (type) return type.indexOf('landscape') === 0;
    if (typeof window.orientation === 'number') return Math.abs(window.orientation) === 90;
    return window.innerWidth > window.innerHeight;
  }
  function syncTurnUpright() {
    var phone = !!coarsePointer && coarsePointer.matches && Math.min(screen.width, screen.height) <= 500;
    document.documentElement.classList.toggle('turn-upright',
      phone && deviceSideways() && !isFormField(document.activeElement));
  }
  syncTurnUpright();
  window.addEventListener('resize', syncTurnUpright);
  window.addEventListener('orientationchange', syncTurnUpright);
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', syncTurnUpright);
  document.addEventListener('focusin', syncTurnUpright);
  document.addEventListener('focusout', function () { setTimeout(syncTurnUpright, 0); });

  /* ── the scroller (app shell, as on the engagement) ───────── */
  /* The pages scroll inside #invitation, a fixed full-screen box, and the
     document stays still on its black canvas, so Safari's bars sit on black
     (see style.css). The CSS only switches that on under html.shell, set
     here; with an older stylesheet (cached separately from this file) the
     computed position is not fixed and everything below drives the
     document instead, exactly as before. */
  var scroller = $('#invitation');
  document.documentElement.classList.add('shell');
  var shell = !!scroller && getComputedStyle(scroller).position === 'fixed';
  var scrollRoot = shell ? scroller : (document.scrollingElement || document.documentElement);
  var scrollSource = shell ? scroller : window;
  var snapRequested = false;
  var formViewport = null;
  var formBlurTimer, formViewportTick;
  function applySnap() {
    scrollRoot.style.scrollSnapType = snapRequested && !formViewport ? 'y mandatory' : 'none';
  }
  function setSnap(on) { snapRequested = on; applySnap(); }

  /* Mobile keyboards can resize either the layout viewport (Android) or just
     the visual viewport (Safari). Keep the deck's page heights stable while
     editing, and move only enough to show the focused field above the keys.
     Mandatory page snapping must never fight the browser's focus scrolling. */
  function isFormField(el) {
    return el && el.matches && el.matches('input, textarea, select') &&
      !el.disabled && !el.readOnly && el.type !== 'hidden' && el.type !== 'radio' &&
      el.type !== 'checkbox' && el.getAttribute('aria-hidden') !== 'true' &&
      el.closest('#rsvp-form, #details-form');
  }
  function keepFieldVisible() {
    var field = document.activeElement;
    if (!formViewport || !isFormField(field)) return;
    var box = scrollRoot.getBoundingClientRect();
    var rect = field.getBoundingClientRect();
    var top = box.top + Math.min(72, box.height / 4);
    var bottom = box.bottom - 18;
    var delta = rect.top < top || rect.bottom - rect.top > bottom - top
      ? rect.top - top : rect.bottom > bottom ? rect.bottom - bottom : 0;
    if (!delta) return;
    var section = field.closest('.child');
    var start = section.getBoundingClientRect().top - box.top + scrollRoot.scrollTop;
    var end = Math.max(start, start + section.offsetHeight - scrollRoot.clientHeight);
    scrollRoot.scrollTo({ top: Math.max(start, Math.min(end, scrollRoot.scrollTop + delta)), behavior: 'auto' });
  }
  function syncFormViewport() {
    formViewportTick = null;
    if (!formViewport || !shell) return;
    var viewport = window.visualViewport;
    var height = viewport ? viewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--form-height', height + 'px');
    document.documentElement.style.setProperty('--form-top', (viewport ? viewport.offsetTop : 0) + 'px');
    keepFieldVisible();
  }
  function queueFormViewport() {
    if (formViewport && !formViewportTick) formViewportTick = requestAnimationFrame(syncFormViewport);
  }
  function beginFormEditing(field) {
    if (!shell || !isFormField(field)) return;
    clearTimeout(formBlurTimer);
    if (!formViewport) {
      formViewport = { section: field.closest('.child'), height: scroller.clientHeight, width: window.innerWidth };
      document.documentElement.style.setProperty('--page-height', formViewport.height + 'px');
      document.documentElement.classList.add('form-editing');
      scrollRoot.scrollTo({ top: scrollRoot.scrollTop, behavior: 'auto' });
    }
    formViewport.section = field.closest('.child');
    delete formViewport.destination;
    clearInterval(navSettleWatch);
    navSettleWatch = null;
    setSnap(true);   // remembered, but paused until editing and keyboard dismissal finish
    syncFormViewport();
    queueFormViewport();
  }
  function finishFormEditing() {
    if (!formViewport || isFormField(document.activeElement)) return;
    var viewport = window.visualViewport;
    var height = viewport ? viewport.height : window.innerHeight;
    // Wait for the keyboard's closing animation before allowing page reflow.
    if (window.innerWidth === formViewport.width && height < formViewport.height - 80 &&
        Date.now() - formViewport.blurredAt < 1500) {
      formBlurTimer = setTimeout(finishFormEditing, 100);
      return;
    }
    var target = formViewport.destination || formViewport.section;
    document.documentElement.style.removeProperty('--page-height');
    document.documentElement.style.removeProperty('--form-height');
    document.documentElement.style.removeProperty('--form-top');
    document.documentElement.classList.remove('form-editing');
    // Recalculate the destination after heights return to normal, rather than
    // keeping a pixel offset that can now point at the last page of the deck.
    if (target && !target.hidden) {
      var goal = target.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top + scrollRoot.scrollTop;
      scrollRoot.scrollTo({ top: goal, behavior: 'instant' });
    }
    formViewport = null;
    applySnap();
    queueReveals();
  }
  if (shell) {
    scrollRoot.addEventListener('pointerdown', function (event) {
      beginFormEditing(event.target);
    }, true);
    scrollRoot.addEventListener('focusin', function (event) {
      beginFormEditing(event.target);
    });
    scrollRoot.addEventListener('focusout', function () {
      if (!formViewport) return;
      formViewport.blurredAt = Date.now();
      clearTimeout(formBlurTimer);
      formBlurTimer = setTimeout(finishFormEditing, 350);
    });
    window.addEventListener('resize', queueFormViewport);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', queueFormViewport);
      window.visualViewport.addEventListener('scroll', queueFormViewport);
    }
  }
  function focusFormField(field) {
    beginFormEditing(field);
    field.focus({ preventScroll: true });
    queueFormViewport();
  }

  /* scroll lock while cover is up */
  window.onbeforeunload = function () { scrollRoot.scrollTop = 0; };
  function lockScroll(on) {
    if (shell) scroller.style.overflowY = on ? 'hidden' : '';
    else document.body.style.overflow = on ? 'hidden' : '';
  }
  scrollRoot.scrollTop = 0;
  lockScroll(true);

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

  (function fitDearGuestName() {
    var name = $('#dear .guest-name-slot');
    if (!name) return;
    var parts = name.textContent.split('&');
    name.textContent = '';
    parts.forEach(function (part, i) {
      if (i) {
        var amp = document.createElement('span');
        amp.className = 'guest-amp';
        amp.textContent = '&';
        name.appendChild(amp);
      }
      name.appendChild(document.createTextNode(part));
    });
    var textRange = document.createRange();
    textRange.selectNodeContents(name);
    function fit() {
      name.style.fontSize = '';
      var size = parseFloat(getComputedStyle(name).fontSize);
      while (textRange.getBoundingClientRect().width > name.clientWidth && size > 8) {
        size -= 0.5;
        name.style.fontSize = size + 'px';
      }
    }
    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    window.addEventListener('resize', fit);
  })();

  /* ── scroll reveals (the engagement's) ───────────────────── */
  /* Elements carry .reanimate + .fade + a .delayNms stagger. Adding .in-view
     plays the fade and removing it rewinds, so a page replays its stagger
     every time you come back to it. Measured from element rects on each
     scroll frame, so it always matches what is really on screen — an
     IntersectionObserver misreports targets inside a fixed scroller on iOS
     Safari. The AOS blocks ([data-aos]) are played the same way. */
  var reveals = [], aosBlocks = [];
  function syncReveals() {
    var top = 10, bottom = window.innerHeight - 10;
    function onScreen(el) {
      var r = el.getBoundingClientRect();
      return r.top < bottom && r.bottom > top;
    }
    reveals.forEach(function (el) { el.classList.toggle('in-view', onScreen(el)); });
    aosBlocks.forEach(function (el) { el.classList.toggle('aos-animate', onScreen(el)); });
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
    aosBlocks = $$('[data-aos]');
    syncReveals();
    scrollSource.addEventListener('scroll', queueReveals, { passive: true });
    window.addEventListener('resize', queueReveals);
  }

  /* ── open invitation ─────────────────────────────────────── */
  var cover = $('#cover-section');
  var openBtn = $('#open-invitation');
  if (openBtn) openBtn.addEventListener('click', function () {
    if (opened) return;
    opened = true;

    setSnap(false);
    if (cover) {                              // the engagement's exit: fade + a slight zoom
      cover.classList.add('hidden');
      setTimeout(function () { if (cover.parentNode) cover.parentNode.removeChild(cover); }, 1000);
    }
    lockScroll(false);
    if (shell) scroller.focus({ preventScroll: true });   // arrow keys / space scroll the pages
    playAudio();
    armReveals();
    var video = $('#video-backdrop');
    if (video) video.play().catch(function () {});

    ['#sound-toggle', '#nav-toggle'].forEach(function (s) {
      var el = $(s); if (el) el.hidden = false;
    });

    var hero = $('#hero');
    if (hero) hero.scrollIntoView({ behavior: 'smooth' });
    setTimeout(function () { setSnap(true); }, 600);
  });

  /* ── AOS: its fade styles; syncReveals decides what is on screen ── */
  if (typeof AOS !== 'undefined') {
    AOS.init({ duration: 800, easing: 'ease', once: false, offset: 60 });
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
  function jumpToSection(target) {
    if (!target || target.hidden) return;
    if (formViewport) formViewport.destination = target;
    if (isFormField(document.activeElement)) document.activeElement.blur();
    setSnap(false);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    clearInterval(navSettleWatch);
    var last = -1, still = 0, t0 = Date.now();
    navSettleWatch = setInterval(function () {
      var y = Math.round(scrollRoot.scrollTop);
      var goal = Math.round(target.getBoundingClientRect().top -
        (shell ? scrollRoot.getBoundingClientRect().top : 0) + scrollRoot.scrollTop);
      var stalled = y === last && ++still >= 3;
      if (y !== last) { still = 0; last = y; }
      if (Math.abs(y - goal) < 2 || Date.now() - t0 > 4000) {
        clearInterval(navSettleWatch);
        navSettleWatch = null;
        scrollRoot.scrollTo({ top: goal, behavior: 'instant' });
        setSnap(true);
      } else if (stalled) {
        still = 0;
        scrollRoot.scrollTo({ top: goal, behavior: 'smooth' });
      }
    }, 100);
  }
  $$('#nav-menu a').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var target = $(a.getAttribute('href'));
      setNavOpen(false);
      jumpToSection(target);
    });
  });

  /* ── light-page contrast for the menu and music buttons ──── */
  /* A page is white unless it has a photo or is a window onto the video.
     The window test reads the page's own background, so the stylesheet
     decides: the RSVP steps are windows there, and a cached older copy that
     still paints them white gets the ink buttons it needs. */
  function isLight(sec) {
    if (!sec || sec.classList.contains('photo-section')) return false;
    var bg = getComputedStyle(sec).backgroundColor;
    return bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
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
  scrollSource.addEventListener('scroll', onScroll, { passive: true });
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
  /* One button for the page: data-calendar="all" is a single file holding
     every event this guest is invited to (Holy Matrimony only with &hm=1),
     which the phone offers to add in one go. A single key still works. */
  function icsFor(list) {
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Johan & Valerie//Wedding//EN'];
    list.forEach(function (ev) {
      lines.push('BEGIN:VEVENT',
        'UID:' + Math.random().toString(36).slice(2) + '@johanvalerie', 'DTSTAMP:' + stamp,
        'SUMMARY:' + ev.title, 'DTSTART:' + ev.start);
      if (ev.loc) lines.push('LOCATION:' + ev.loc);   // the welcome dinner has no place
      if (ev.end) lines.push('DTEND:' + ev.end);     // nor a set end
      if (ev.desc) lines.push('DESCRIPTION:' + ev.desc);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return 'data:text/calendar;charset=utf8;base64,' + btoa(unescape(encodeURIComponent(lines.join('\r\n'))));
  }
  $$('[data-calendar]').forEach(function (a) {
    var key = a.getAttribute('data-calendar');
    var keys = key !== 'all' ? [key]
      : (params.get('hm') === '1' ? ['ceremony', 'cocktail', 'reception'] : ['cocktail', 'reception']);
    var list = keys.map(function (k) { return EVENTS[k]; }).filter(Boolean);
    if (!list.length) return;
    a.setAttribute('href', icsFor(list));
    a.setAttribute('download', 'johan-valerie-' + (key === 'all' ? 'wedding' : key) + '.ics');
  });

  /* ── WhatsApp: the chat opens with the request already written ── */
  /* Every WhatsApp link (the number stays in its href) carries the couple's
     template, with the guest's name from the invitation link (?to=); a link
     without one leaves the name for the guest to write. */
  var WHATSAPP_TEXT = [
    'Hello, I would like to request assistance regarding the wedding.',
    '',
    'Couple’s Name : Johan & Valerie',
    'Event’s Details : Bangkok, January 9th 2027',
    'Guest’s Name : ' + guestKey,
    'Inquiry / Assistance Needed:'
  ].join('\n');
  $$('a[href*="wa.me/"]').forEach(function (a) {
    var number = /wa\.me\/(\d+)/.exec(a.getAttribute('href'));
    if (number) a.setAttribute('href', 'https://wa.me/' + number[1] + '?text=' + encodeURIComponent(WHATSAPP_TEXT));
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

  /* Open tracking can finish in the background. RSVP answers use the
     confirmed, ordered saveResponse queue below. All posts use form fields
     so older copies of the Apps Script backend can still read them. */
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
  var detailsTouched = false;
  if (detailsForm) {
    detailsForm.addEventListener('input', function () { detailsTouched = true; });
    detailsForm.addEventListener('change', function () { detailsTouched = true; });
  }

  /* A consistent calendar for the arrival dates, including mobile browsers
     that do not open a native date picker when the input text is tapped. */
  var arrivalInput = $('#details-arrival');
  var arrivalTrigger = $('#details-arrival-trigger');
  var arrivalText = $('#details-arrival-text');
  var arrivalCalendar = $('#arrival-calendar');
  var arrivalDays = $('#arrival-days');
  function setArrivalDate(value, notify) {
    if (!arrivalInput || !arrivalText) return;
    var match = /^2027-01-(0[1-9])$/.exec(value || '');
    arrivalInput.value = match ? value : '';
    arrivalText.textContent = match ? '01/' + match[1] + '/2027' : 'mm/dd/yyyy';
    if (arrivalDays) $$('button[data-date]', arrivalDays).forEach(function (day) {
      var selected = day.getAttribute('data-date') === arrivalInput.value;
      day.classList.toggle('selected', selected);
      day.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    if (notify) arrivalInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function showArrivalCalendar(open) {
    if (!arrivalCalendar || !arrivalTrigger) return;
    arrivalCalendar.hidden = !open;
    arrivalTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) arrivalCalendar.scrollIntoView({ block: 'nearest' });
  }
  if (arrivalDays && arrivalTrigger && arrivalCalendar) {
    for (var blank = 0; blank < 5; blank++) {
      arrivalDays.appendChild(document.createElement('span'));
    }
    for (var date = 1; date <= 31; date++) {
      var dayButton = document.createElement('button');
      dayButton.type = 'button';
      dayButton.textContent = String(date);
      dayButton.setAttribute('aria-label', 'Select ' + date + ' January 2027');
      if (date > 9) {
        dayButton.disabled = true;
      } else {
        dayButton.setAttribute('data-date', '2027-01-' + ('0' + date).slice(-2));
        dayButton.setAttribute('aria-pressed', 'false');
      }
      arrivalDays.appendChild(dayButton);
    }
    arrivalTrigger.addEventListener('click', function () {
      showArrivalCalendar(arrivalCalendar.hidden);
    });
    arrivalDays.addEventListener('click', function (event) {
      var day = event.target.closest('button[data-date]');
      if (!day) return;
      setArrivalDate(day.getAttribute('data-date'), true);
      showArrivalCalendar(false);
      arrivalTrigger.focus();
    });
    var arrivalClear = $('#arrival-clear');
    if (arrivalClear) arrivalClear.addEventListener('click', function () {
      setArrivalDate('', true);
      var hour = $('#details-arrival-hour');
      if (hour) hour.value = '';
      showArrivalCalendar(false);
      arrivalTrigger.focus();
    });
    document.addEventListener('click', function (event) {
      if (!arrivalCalendar.hidden && !arrivalCalendar.contains(event.target) &&
          !arrivalTrigger.contains(event.target)) showArrivalCalendar(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !arrivalCalendar.hidden) {
        showArrivalCalendar(false);
        arrivalTrigger.focus();
      }
    });
  }

  var HOSTED_NIGHTS = 2;

  function scrollToSection(el) {
    jumpToSection(el);
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
  function showDetailsDone(accomCode, arrival, nights) {
    editingResponse = false;
    if (rsvpSection) rsvpSection.hidden = true;
    unlockInfo(false);
    unlockDetails(false);
    if (infoContinue) infoContinue.hidden = true;
    var progressNote = $('#info-progress-note');
    if (progressNote) progressNote.hidden = true;
    var navRsvp = $('#nav-menu a[href="#rsvp"]') || $('#nav-menu a[data-rsvp-link]');
    if (navRsvp) { navRsvp.setAttribute('data-rsvp-link', ''); navRsvp.setAttribute('href', '#details'); }
    var wrap = $('#details-form-wrap'), done = $('#details-done');
    if (wrap) wrap.hidden = true;
    if (done) done.hidden = false;
    var doneLine = $('#details-done-line');
    var yes = attendingYes();
    if (doneLine) doneLine.innerHTML = yes
      ? 'Your RSVP is complete.<br>We can\u2019t wait to celebrate with you.'
      : 'Your response is saved.<br>Thank you for letting us know. We\u2019ll miss you!';
    var parts = [];
    var n = parseInt(nights, 10);
    if (accomCode === 'upgrade' || (accomCode === 'provided' && n > HOSTED_NIGHTS)) accomCode = 'custom';
    if (yes && accomCode === 'provided') {
      parts.push('Century Park Hotel Bangkok');
      parts.push(n === 1 ? 'Your one-night stay is with our compliments.'
        : n === 2 ? 'Your two-night stay is with our compliments.'
        : 'Your stay is with our compliments.');
    } else if (yes && accomCode === 'self') {
      parts.push('Self-arranged stay');
    } else if (yes && accomCode === 'custom') {
      parts.push('Custom arrangements selected. Please contact us, and we\u2019ll be happy to help with your stay.');
    }
    if (yes && arrival) parts.push('arriving ' + arrival);
    var sum = $('#details-summary');
    if (sum) sum.textContent = parts.join('  ·  ');
    var contact = $('#details-contact');
    if (contact) contact.hidden = !yes || accomCode !== 'custom';
    onScroll();
  }

  /* the hosted Century Park stay is limited to two nights */
  var nightsRow = $('#details-nights-row');
  var nightsSel = $('#details-nights');
  var nightsNote = $('#details-nights-note');
  function updateNightsNote() {
    var chosen = detailsForm && detailsForm.querySelector('input[name=accommodation]:checked');
    var n = parseInt(nightsSel && nightsSel.value, 10) || 0;
    if (!nightsNote) return;
    nightsNote.className = 'nights-note';
    if (!chosen || chosen.value !== 'provided') { nightsNote.textContent = ''; return; }
    nightsNote.classList.add('ok');
    nightsNote.textContent = n ? (n === 1 ? 'Your one-night stay is with our compliments.'
      : 'Your two-night stay is with our compliments.')
      : 'Up to two nights are with our compliments.';
  }
  function syncNightsRow() {
    var chosen = detailsForm && detailsForm.querySelector('input[name=accommodation]:checked');
    var needsNights = !!(chosen && chosen.value === 'provided');
    if (nightsRow) nightsRow.hidden = !needsNights;
    var customContact = $('#custom-contact');
    if (customContact) customContact.hidden = !(chosen && chosen.value === 'custom');
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

  /* stage 1: attendance → name, diet and welcome dinner per guest → information.
     The invitation name from ?to= is the identity and signs the wish, so a
     guest with a link never types a separate identity; the names and diets on
     the second step go to the Guest List tab (and the hotel booking). */
  var form = $('#rsvp-form');
  var rsvpSection = $('#rsvp');
  var step1 = $('#rsvp-step1'), step2 = $('#rsvp-step2');
  var nextBtn = $('#rsvp-next'), sendBtn = $('#rsvp-send');
  var confirmBtn = $('#rsvp-confirm'), backBtn = $('#rsvp-back');
  var countField = $('#rsvp-count-field'), nameBox = $('#rsvp-guest-names');
  var rsvpTitle = $('#rsvp-title');
  var TITLE_STEP1 = rsvpTitle ? rsvpTitle.innerHTML : '';
  var savedNames = [];      // names from an earlier answer, restored on a return visit
  var savedDiets = [];      // matching dietary choices (none, halal, vegetarian)
  var savedWelcomeDinner = []; // matching welcome-dinner choices (yes, no)
  /* The deployed backend saves all of these (its ?action=features answer), so
     the choices show from the start. Waiting for that check left the diet and
     welcome-dinner choices off the form whenever it failed, or came back
     after a quick guest had already moved on; now only a backend that
     answers without them takes them away. */
  var dietaryReady = true;
  var welcomeDinnerReady = true;
  var customReady = true;   // the backend recognizes custom stays
  var partialReady = true;  // accepts unfinished dinner choices while editing
  var touched = false;      // a guest already filling in keeps their form over a late restore
  var SEND_LABEL = sendBtn ? sendBtn.textContent : '';
  var CONFIRM_LABEL = confirmBtn ? confirmBtn.textContent : '';
  var guestPage = 0;
  var GUESTS_PER_PAGE = 2;
  var editingResponse = false;
  var responseData = null;
  var confirmedAnswer = null; // the names, diets and dinner choices Apps Script last confirmed
  var editSaveTimer;
  var saveQueue = Promise.resolve();
  var saveVersion = 0;
  var SAVE_TIMEOUT = 30000;
  var cacheKey = guestKey ? 'jv-wedding-response:' + guestKey : '';

  function saveNote(id, msg) {
    var note = $(id);
    if (note) { note.textContent = msg; note.hidden = !msg; }
  }
  function setFormBusy(target, busy) {
    $$('input, select, textarea, button', target).forEach(function (el) {
      if (busy) {
        el.setAttribute('data-saving-disabled', String(el.disabled));
        el.disabled = true;
      } else if (el.hasAttribute('data-saving-disabled')) {
        el.disabled = el.getAttribute('data-saving-disabled') === 'true';
        el.removeAttribute('data-saving-disabled');
      }
    });
  }
  function rememberResponse(fields) {
    responseData = responseData || { ok: true, found: true, detailsDone: false };
    responseData.attending = fields.attending;
    responseData.pax = Number(fields.pax) || 0;
    responseData.wishes = fields.wishes;
    if (fields.guests) {
      savedNames = fields.guests.slice();
      responseData.guests = savedNames.slice();
    }
    if (fields.diets) {
      savedDiets = fields.diets.slice();
      responseData.diets = savedDiets.slice();
    }
    if (fields.welcomeDinner) {
      savedWelcomeDinner = fields.welcomeDinner.slice();
      responseData.welcomeDinner = savedWelcomeDinner.slice();
    }
    if (fields.attending === 'no') {
      responseData.guests = []; responseData.diets = []; responseData.welcomeDinner = [];
    }
    if (fields.action === 'details') {
      responseData.accommodation = fields.accommodation;
      responseData.nights = fields.nights;
      responseData.arrival = fields.arrival
        ? fields.arrival + ' ' + ('0' + fields.arrivalHour).slice(-2) + ':00' : '';
      responseData.detailsDone = true;
    }
    if (cacheKey) {
      try { localStorage.setItem(cacheKey, JSON.stringify(responseData)); } catch (err) {}
    }
  }
  /* Edits are sent in order and only marked saved after the sheet confirms
     them. A later change cannot be overtaken by an older, slower request. */
  function postResponse(fields) {
    var body = Object.keys(fields).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(
        Array.isArray(fields[k]) ? JSON.stringify(fields[k]) : fields[k]);
    }).join('&');
    return new Promise(function (resolve, reject) {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('save_timeout'));
      }, SAVE_TIMEOUT);
      var options = { method: 'POST', keepalive: true, body: body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } };
      if (controller) options.signal = controller.signal;
      fetch(API_URL, options).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || d.ok !== true) throw new Error(d && d.error || 'save_failed');
        resolve();
      }).catch(reject).finally(function () { clearTimeout(timer); });
    });
  }
  function saveResponse(fields, noteId) {
    clearTimeout(editSaveTimer);
    if (!partialReady && responseData && responseData.wishes && fields.wishes === '') {
      saveNote(noteId, 'Your previous wish could not be removed. Please try again later.');
      return Promise.reject(new Error('wish_clear_unavailable'));
    }
    var version = ++saveVersion;
    saveNote(noteId, 'Saving changes\u2026');
    var save = saveQueue.catch(function () {}).then(function () {
      if (!API_URL) return;
      return postResponse(fields);
    }).then(function () {
      rememberResponse(fields);
      if (fields.guests) confirmedAnswer = { guests: fields.guests, diets: fields.diets, welcomeDinner: fields.welcomeDinner };
      if (version === saveVersion) saveNote(noteId, editingResponse ? 'Changes saved.' : '');
    }).catch(function (err) {
      if (version === saveVersion) saveNote(noteId, 'Couldn\u2019t save your changes. Please try again.');
      throw err;
    });
    saveQueue = save;
    return save;
  }
  function attendancePayload() {
    var yes = attendingYes();
    return { action: 'rsvp', key: who(), name: who(), attending: yes ? 'yes' : 'no',
      pax: yes ? parseInt(guestsInput && guestsInput.value, 10) || 1 : 0,
      wishes: ($('#rsvp-wishes').value || '').trim(), replaceWishes: true };
  }
  function guestPayload(validateAll) {
    var fields = attendancePayload();
    var inputs = $$('.rsvp-guest', nameBox);
    fields.guests = inputs.map(function (el) { return el.value.trim(); });
    var missing = fields.guests.indexOf('');
    if (missing >= 0) {
      if (validateAll) { showGuestPage(missing); rsvpNote('Please fill in every guest name.'); focusFormField(inputs[missing]); }
      // A newly added guest may be on the next screen. Save edits to the
      // existing guests now, keeping the requested party size separately.
      if (validateAll || missing < savedNames.length || missing === 0 ||
          fields.guests.slice(missing).some(Boolean)) return null;
      fields.guests = fields.guests.slice(0, missing);
    }
    if (validateAll) fields.pax = fields.guests.length;
    if (dietaryReady) fields.diets = $$('.rsvp-diet', nameBox).slice(0, fields.guests.length).map(function (el) { return el.value; });
    if (welcomeDinnerReady) {
      var welcomes = $$('.rsvp-welcome-dinner', nameBox).slice(0, fields.guests.length);
      var choices = welcomes.map(function (el) { return el.value; });
      var unanswered = choices.indexOf('');
      if (unanswered >= 0 && validateAll) {
        showGuestPage(unanswered);
        rsvpNote('Please select welcome-dinner attendance for each guest.');
        focusFormField(welcomes[unanswered]);
        return null;
      }
      if (unanswered >= 0 && !partialReady) return null;
      fields.welcomeDinner = choices;
      if (!validateAll && partialReady) fields.partial = true;
    }
    return fields;
  }
  function detailsPayload(reportError) {
    var chosen = detailsForm && $('input[name=accommodation]:checked', detailsForm);
    var nights = (nightsSel && nightsSel.value) || '';
    var date = (arrivalInput && arrivalInput.value) || '';
    var hour = ($('#details-arrival-hour') && $('#details-arrival-hour').value) || '';
    var error = !chosen ? 'Please choose an accommodation option first.'
      : chosen.value === 'custom' && !customReady ? 'Please contact us on WhatsApp to arrange this stay.'
      : chosen.value === 'provided' && (Number(nights) < 1 || Number(nights) > HOSTED_NIGHTS) ? 'Please select one or two nights.'
      : date && hour === '' ? 'Please pick your arrival hour too.'
      : !date && hour !== '' ? 'Please pick your arrival date too.' : '';
    if (error) { if (reportError) saveNote('#details-note', error); return null; }
    var fields = attendancePayload();
    fields.action = 'details'; fields.attending = 'yes';
    fields.guests = savedNames.slice(); fields.pax = savedNames.length;
    if (dietaryReady) fields.diets = savedDiets.slice();
    if (welcomeDinnerReady && savedWelcomeDinner.length === savedNames.length &&
        savedWelcomeDinner.every(function (v) { return v === 'yes' || v === 'no'; })) {
      fields.welcomeDinner = savedWelcomeDinner.slice();
    }
    fields.accommodation = chosen.value;
    fields.nights = chosen.value === 'provided' ? nights : '';
    fields.arrival = date; fields.arrivalHour = hour;
    /* Names, diets and dinner choices Apps Script has already confirmed are
       not written again: the post then carries only the stay, and the sheet
       skips rewriting the RSVP row and the Guest List (each save costs
       seconds there). Anything unconfirmed or changed goes in full. */
    if (confirmedAnswer && sameList(confirmedAnswer.guests, fields.guests) &&
        sameList(confirmedAnswer.diets, fields.diets) && sameList(confirmedAnswer.welcomeDinner, fields.welcomeDinner)) {
      delete fields.guests; delete fields.diets; delete fields.welcomeDinner;
    }
    return fields;
  }
  function sameList(a, b) {
    if (!a || !b) return !a && !b;
    return a.length === b.length && a.join('\n') === b.join('\n');
  }
  function scheduleEditSave(stage, delay) {
    if (!editingResponse) return;
    clearTimeout(editSaveTimer);
    editSaveTimer = setTimeout(function () {
      var fields = stage === 'details' ? detailsPayload(false)
        : stage === 'guests' ? guestPayload(false) : attendancePayload();
      if (!fields) {
        saveNote(stage === 'details' ? '#details-note' : '#rsvp-note',
          stage === 'details' ? 'Please complete your accommodation details to save your changes.'
            : 'Please complete the guest details to save your changes.');
        return;
      }
      if (!fields.key) return;
      saveResponse(fields, stage === 'details' ? '#details-note' : '#rsvp-note').catch(function () {});
    }, delay);
  }

  /* Reopen a saved response with the usual navigation labels. */
  function resetButtons() {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = SEND_LABEL; }
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = CONFIRM_LABEL; }
    if (backBtn) backBtn.hidden = false;
  }

  function who() {
    var firstGuest = nameBox && $('.rsvp-guest', nameBox);
    return guestKey || (firstGuest ? firstGuest.value.trim() : '');
  }
  function attendingYes() {
    var r = form && form.querySelector('input[name=attendance]:checked');
    return !r || r.value === 'yes';
  }
  function rsvpNote(msg) {
    var note = $('#rsvp-note');
    if (note) { note.textContent = msg; note.hidden = !msg; }
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
    if (rsvpTitle) rsvpTitle.innerHTML = n === 1 ? TITLE_STEP1 : 'Guest Details';
    var content = form && form.parentNode;
    if (content) {
      content.scrollTop = 0;
      content.classList.toggle('on-step2', n === 2);   // clears the fixed music button
    }
  }
  function showGuestPage(index) {
    var entries = $$('.guest-entry', nameBox);
    var lastPage = Math.floor(Math.max(0, entries.length - 1) / GUESTS_PER_PAGE) * GUESTS_PER_PAGE;
    guestPage = Math.max(0, Math.min(Math.floor(index / GUESTS_PER_PAGE) * GUESTS_PER_PAGE, lastPage));
    var end = Math.min(guestPage + GUESTS_PER_PAGE, entries.length);
    entries.forEach(function (entry, i) { entry.hidden = i < guestPage || i >= end; });
    var progress = $('#rsvp-guest-progress');
    if (progress) progress.textContent = end - guestPage > 1
      ? 'Guests ' + (guestPage + 1) + '\u2013' + end + ' of ' + entries.length
      : 'Guest ' + end + ' of ' + entries.length;
    if (confirmBtn) { confirmBtn.textContent = CONFIRM_LABEL; confirmBtn.disabled = false; }
  }
  /* Adds the choices the backend can save and drops any it can't, leaving the
     focused name input in place. */
  function addGuestChoices(entry, i, dietValue, welcomeValue) {
    var choices = $('.guest-choices', entry);
    var oldDiet = $('.rsvp-diet', entry), oldWelcome = $('.rsvp-welcome-dinner', entry);
    if (!dietaryReady && oldDiet) choices.removeChild(oldDiet.parentNode);
    if (!welcomeDinnerReady && oldWelcome) choices.removeChild(oldWelcome.parentNode);
    if (dietaryReady && !oldDiet) {
      var dietField = document.createElement('div');
      var dietLabel = document.createElement('label');
      dietLabel.className = 'field-label diet-label';
      dietLabel.htmlFor = 'rsvp-diet-' + i;
      dietLabel.textContent = 'Dietary preference';
      var diet = document.createElement('select');
      diet.id = 'rsvp-diet-' + i;
      diet.className = 'rsvp-diet';
      [['none', 'None'], ['halal', 'Halal'], ['vegetarian', 'Vegetarian']].forEach(function (choice) {
        var option = document.createElement('option');
        option.value = choice[0];
        option.textContent = choice[1];
        diet.appendChild(option);
      });
      diet.value = dietValue || savedDiets[i] || 'none';
      dietField.appendChild(dietLabel);
      dietField.appendChild(diet);
      choices.appendChild(dietField);
    }
    if (welcomeDinnerReady && !oldWelcome) {
      var welcomeField = document.createElement('div');
      var welcomeLabel = document.createElement('label');
      welcomeLabel.className = 'field-label welcome-label';
      welcomeLabel.htmlFor = 'rsvp-welcome-dinner-' + i;
      welcomeLabel.textContent = 'Welcome dinner';
      var welcomeDinner = document.createElement('select');
      welcomeDinner.id = 'rsvp-welcome-dinner-' + i;
      welcomeDinner.className = 'rsvp-welcome-dinner';
      welcomeDinner.setAttribute('aria-label', 'Welcome dinner for Guest ' + (i + 1));
      welcomeDinner.setAttribute('aria-required', 'true');
      [['', 'Please select'], ['yes', 'Joyfully attending'], ['no', 'Regretfully unable']].forEach(function (choice) {
        var option = document.createElement('option');
        option.value = choice[0];
        option.textContent = choice[1];
        welcomeDinner.appendChild(option);
      });
      welcomeDinner.value = welcomeValue !== undefined ? welcomeValue : (savedWelcomeDinner[i] || '');
      welcomeField.appendChild(welcomeLabel);
      welcomeField.appendChild(welcomeDinner);
      choices.appendChild(welcomeField);
    }
  }
  /* Rebuilt whenever the count changes. Fields already on screen keep their
     values; new positions use an earlier answer or the invitation names. */
  function buildGuestFields(n, restoreSaved) {
    var typed = restoreSaved ? [] : $$('.rsvp-guest', nameBox).map(function (el) { return el.value; });
    var typedDiets = restoreSaved ? [] : $$('.rsvp-diet', nameBox).map(function (el) { return el.value; });
    var typedWelcomeDinner = restoreSaved ? [] : $$('.rsvp-welcome-dinner', nameBox).map(function (el) { return el.value; });
    var welcomeNote = $('#rsvp-welcome-note');
    if (welcomeNote) welcomeNote.hidden = !welcomeDinnerReady;
    nameBox.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var entry = document.createElement('div');
      entry.className = 'guest-entry';
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
      input.value = typed[i] !== undefined ? typed[i] : (savedNames[i] || invitationNames[i] || '');
      entry.appendChild(label);
      entry.appendChild(input);
      var choices = document.createElement('div');
      choices.className = 'guest-choices';
      entry.appendChild(choices);
      addGuestChoices(entry, i, typedDiets[i], typedWelcomeDinner[i]);
      nameBox.appendChild(entry);
    }
    showGuestPage(guestPage);
  }
  function goNext() {
    touched = true;
    buildGuestFields(parseInt(guestsInput && guestsInput.value, 10) || 1);
    rsvpNote('');
    function next() { showStep(2); showGuestPage(0); }
    if (editingResponse) {
      setFormBusy(form, true);
      if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = 'Saving\u2026'; }
      saveResponse(attendancePayload(), '#rsvp-note').then(next).catch(function () {}).finally(function () {
        setFormBusy(form, false);
        if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = 'CONTINUE'; }
      });
    } else next();
  }

  if (form) {
    $$('input[name=attendance]', form).forEach(function (r) {
      r.addEventListener('change', syncAttendance);
    });
    var edited = function (event) {
      touched = true;
      scheduleEditSave(step2 && !step2.hidden ? 'guests' : 'attendance', event.type === 'input' ? 700 : 0);
    };
    form.addEventListener('input', edited);
    form.addEventListener('change', edited);
    [stepMinus, stepPlus].forEach(function (btn) {
      if (btn) btn.addEventListener('click', function () {
        touched = true;
        scheduleEditSave('attendance', 0);
      });
    });
    syncAttendance();
  }
  if (API_URL) {
    fetch(API_URL + '?action=features')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.ok !== true) return;   // no answer: keep everything on
        customReady = d.customArrangements === true;
        partialReady = d.partialRsvp === true;
        if (d.dietaryChoices === true && d.welcomeDinnerRsvp === true) return;
        dietaryReady = d.dietaryChoices === true;
        welcomeDinnerReady = d.welcomeDinnerRsvp === true;
        var welcomeNote = $('#rsvp-welcome-note');
        if (welcomeNote) welcomeNote.hidden = !welcomeDinnerReady;
        $$('.guest-entry', nameBox).forEach(function (entry, i) { addGuestChoices(entry, i); });
        queueFormViewport();
      }).catch(function () {});
  }
  if (nextBtn) nextBtn.addEventListener('click', goNext);
  if (backBtn) backBtn.addEventListener('click', function () {
    clearTimeout(editSaveTimer);
    if (editingResponse) {
      var fields = guestPayload(false);
      if (fields) saveResponse(fields, '#rsvp-note').catch(function () {});
    }
    if (guestPage > 0) showGuestPage(guestPage - GUESTS_PER_PAGE);
    else showStep(1);
  });
  var detailsEditBtn = $('#details-edit-response');
  if (detailsEditBtn) detailsEditBtn.addEventListener('click', function () {
    touched = true;
    editingResponse = true;
    if (rsvpSection) rsvpSection.hidden = false;
    if (infoSection) infoSection.hidden = true;
    if (detailsSection) detailsSection.hidden = true;
    if (infoContinue) infoContinue.hidden = false;
    var progressNote = $('#info-progress-note');
    if (progressNote) progressNote.hidden = false;
    var navRsvp = $('#nav-menu a[data-rsvp-link]');
    if (navRsvp) navRsvp.setAttribute('href', '#rsvp');
    reopenDetails('Changes save as you update your details.');
    resetButtons();
    showStep(1);
    rsvpNote('');
    scrollToSection($('#rsvp'));
  });

  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    if ($('#rsvp-hp') && $('#rsvp-hp').value) return;
    var yes = attendingYes();
    if (yes && step2 && step2.hidden) { goNext(); return; }
    if (!who()) { rsvpNote('Please use your personal invitation link to RSVP.'); return; }
    touched = true;
    clearTimeout(editSaveTimer);
    var inputs = $$('.rsvp-guest', nameBox);
    var welcomes = $$('.rsvp-welcome-dinner', nameBox);
    if (yes) {
      var pageEnd = Math.min(guestPage + GUESTS_PER_PAGE, inputs.length);
      for (var i = guestPage; i < pageEnd; i++) {
        if (!inputs[i].value.trim()) {
          rsvpNote('Please enter Guest ' + (i + 1) + '\u2019s full name.');
          focusFormField(inputs[i]);
          return;
        }
        if (welcomeDinnerReady && welcomes[i] && !welcomes[i].value) {
          rsvpNote('Please choose whether Guest ' + (i + 1) + ' will join the welcome dinner.');
          focusFormField(welcomes[i]);
          return;
        }
      }
      if (pageEnd < inputs.length) {
        var partial = editingResponse && guestPayload(false);
        if (partial) {
          setFormBusy(form, true);
          confirmBtn.disabled = true;
          confirmBtn.textContent = 'Saving\u2026';
          saveResponse(partial, '#rsvp-note').then(function () {
            showGuestPage(guestPage + GUESTS_PER_PAGE);
          }).catch(function () {}).finally(function () {
            setFormBusy(form, false);
            confirmBtn.disabled = false; confirmBtn.textContent = CONFIRM_LABEL;
          });
        } else {
          showGuestPage(guestPage + GUESTS_PER_PAGE);
          rsvpNote(editingResponse ? 'Please complete the guest details to save your changes.' : '');
        }
        return;
      }
    }
    var fields = yes ? guestPayload(true) : attendancePayload();
    if (!fields) return;
    /* An attending guest goes straight on while the answer saves: Apps Script
       takes seconds a save, and the accommodation step sends whatever this
       save has not confirmed and waits for it, so the RSVP is still only
       complete once the sheet has it. Declining, or editing an earlier
       answer, waits here as before. */
    if (yes && !editingResponse && API_URL) {
      savedNames = fields.guests.slice();
      if (fields.diets) savedDiets = fields.diets.slice();
      if (fields.welcomeDinner) savedWelcomeDinner = fields.welcomeDinner.slice();
      saveResponse(fields, '#rsvp-note').then(function () { loadWishes(); }).catch(function () {});
      if (infoContinue) infoContinue.hidden = false;
      var progressNote = $('#info-progress-note');
      if (progressNote) progressNote.hidden = false;
      reopenDetails('Required to complete your confirmation');
      unlockInfo(true);
      return;
    }
    var btn = yes ? confirmBtn : sendBtn;
    setFormBusy(form, true);
    if (btn) { btn.textContent = 'Saving\u2026'; btn.disabled = true; }
    saveResponse(fields, '#rsvp-note').then(function () {
      if (yes) {
        if (infoContinue) infoContinue.hidden = false;
        var progress = $('#info-progress-note');
        if (progress) progress.hidden = false;
        reopenDetails(editingResponse ? 'Changes save as you update your details.'
          : 'Required to complete your confirmation');
        unlockInfo(true);
      } else {
        showDetailsDone('', '', '');
        scrollToSection(detailsSection);
      }
      if (!API_URL && fields.wishes) {
        var list = storedWishes().filter(function (wish) { return wish.name !== fields.name; });
        list.unshift({ name: fields.name, text: fields.wishes });
        try { localStorage.setItem('jv-wishes', JSON.stringify(list.slice(0, 40))); } catch (err) {}
      }
      loadWishes();
    }).catch(function () {}).finally(function () {
      setFormBusy(form, false);
      if (btn) { btn.textContent = yes ? CONFIRM_LABEL : SEND_LABEL; btn.disabled = false; }
    });
  });

  /* Reopen a completed details form after a new RSVP or a refused save. */
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

  if (detailsForm) {
    ['input', 'change'].forEach(function (type) {
      detailsForm.addEventListener(type, function (event) {
        scheduleEditSave('details', event.type === 'input' ? 700 : 0);
      });
    });
    detailsForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var fields = detailsPayload(true);
      if (!fields) return;
      clearTimeout(editSaveTimer);
      setFormBusy(detailsForm, true);
      if (detailsBtn) { detailsBtn.textContent = 'Saving\u2026'; detailsBtn.disabled = true; }
      saveResponse(fields, '#details-note').then(function () {
        showDetailsDone(fields.accommodation, responseData.arrival, fields.nights);
        scrollToSection(detailsSection);
      }).catch(function () {
        saveNote('#details-note', 'Couldn\u2019t save your details. Please tap Complete RSVP to retry.');
      }).finally(function () {
        setFormBusy(detailsForm, false);
        if (detailsBtn) { detailsBtn.textContent = DETAILS_LABEL; detailsBtn.disabled = false; }
      });
    });
  }

  /* count this open (per personalized link) — fire and forget. The whole link
     goes along: seats and Holy Matrimony live only in the link, and a link
     sent before a change keeps showing the old page, so the Sheet logs which
     one was opened. Older backends ignore the extra field. */
  if (API_URL && guestKey) {
    try {
      sendApi({ action: 'open', key: guestKey, link: location.href.split('#')[0] }).catch(function () {});
    } catch (e) {}
  }

  /* Returning guests see the information and All Set pages; the deadline
     form is only revealed again by Edit response. Cached answers prevent a
     completed form flashing while Apps Script returns the current answer. */
  function restoreResponse(d) {
    if (!d || !d.found || touched || detailsTouched) return;
    responseData = d;
    savedNames = Array.isArray(d.guests) ? d.guests : String(d.guests || '').split('\n').filter(String);
    savedDiets = Array.isArray(d.diets) ? d.diets : [];
    savedWelcomeDinner = Array.isArray(d.welcomeDinner) ? d.welcomeDinner : [];
    var yes = String(d.attending).toLowerCase() === 'yes';
    var radio = form && $('input[name=attendance][value="' + (yes ? 'yes' : 'no') + '"]', form);
    if (radio) radio.checked = true;
    if (guestsInput && d.pax) guestsInput.value = Math.min(d.pax, Number(guestsInput.max) || 20);
    if ($('#rsvp-wishes')) $('#rsvp-wishes').value = d.wishes || '';
    syncAttendance();
    buildGuestFields(parseInt(guestsInput && guestsInput.value, 10) || 1, true);
    var nights = Number(d.nights) || 0;
    var accom = d.accommodation === 'upgrade' ||
      (d.accommodation === 'provided' && nights > HOSTED_NIGHTS) ? 'custom' : d.accommodation;
    if (detailsForm) $$('input[name=accommodation]', detailsForm).forEach(function (el) {
      el.checked = el.value === accom;
    });
    syncNightsRow();
    if (accom === 'provided' && nights && nightsSel) nightsSel.value = String(nights);
    updateNightsNote();
    var arrival = /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}):\d{2})?/.exec(String(d.arrival || ''));
    setArrivalDate(arrival ? arrival[1] : '', false);
    var hour = $('#details-arrival-hour');
    if (hour) hour.value = arrival && arrival[2] !== undefined ? String(Number(arrival[2])) : '';
    if (!yes || d.detailsDone) showDetailsDone(accom, d.arrival, d.nights);
    else {
      if (rsvpSection) rsvpSection.hidden = false;
      unlockInfo(false);
      unlockDetails(false);
    }
    if (cacheKey) {
      try { localStorage.setItem(cacheKey, JSON.stringify(d)); } catch (err) {}
    }
  }
  var cachedResponse;
  if (cacheKey) {
    try { cachedResponse = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch (err) {}
    restoreResponse(cachedResponse);
  }
  if (API_URL && guestKey) {
    if (!cachedResponse && rsvpSection) rsvpSection.hidden = true;
    fetch(API_URL + '?action=status&key=' + encodeURIComponent(guestKey))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.ok === false) throw new Error('status_failed');
        if (d.found) restoreResponse(d);
        else if (!touched && !detailsTouched) {
          responseData = null;
          if (cacheKey) { try { localStorage.removeItem(cacheKey); } catch (err) {} }
          if (rsvpSection) rsvpSection.hidden = false;
          if (infoSection) infoSection.hidden = true;
          if (detailsSection) detailsSection.hidden = true;
          var navRsvp = $('#nav-menu a[data-rsvp-link]');
          if (navRsvp) navRsvp.setAttribute('href', '#rsvp');
        }
      }).catch(function () {
        if (!cachedResponse && rsvpSection) rsvpSection.hidden = false;
      });
  }

  /* ── gallery: the engagement's two drifting strips + lightbox ── */
  /* The strips show small WebP copies (gallery-NN-sm.webp); the viewer
     opens the full JPEG. Photos 1-9 run in the top strip, 10-18 below. */
  var galleryImages = [];
  for (var gi = 1; gi <= GALLERY_COUNT; gi++) {
    galleryImages.push('assets/img/gallery-' + (gi < 10 ? '0' + gi : gi) + '.jpg');
  }
  var rowA = $('#row-a'), rowB = $('#row-b');
  /* Only with the stylesheet that makes each strip a scroller: an older
     cached copy would lay 36 unstyled photos down the page. */
  var stripsOn = !!rowA && !!rowB && getComputedStyle(rowA.parentNode).overflowX === 'auto';

  /* Each strip is laid down twice so the wrap at the halfway mark is
     invisible. Only the first copy is reachable: the second is the same
     photograph again, hidden from the keyboard and screen readers. */
  function fillRow(track, from, to) {
    var html = '';
    for (var pass = 0; pass < 2; pass++) {
      for (var i = from; i < to; i++) {
        var thumb = galleryImages[i].replace('.jpg', '-sm.webp');
        html += pass === 0
          ? '<img src="' + thumb + '" alt="" loading="lazy" draggable="false" data-index="' + i + '" role="button" tabindex="0"' +
            ' aria-label="Open photo ' + (i + 1) + ' of ' + galleryImages.length + '">'
          : '<img src="' + thumb + '" alt="" loading="lazy" draggable="false" data-index="' + i + '" aria-hidden="true" tabindex="-1">';
      }
    }
    track.innerHTML = html;
  }

  /* Each strip drifts on its own, and a swipe flings it. The strip follows
     the finger, is let go at the speed it was thrown, and glides back down
     to its drifting speed, with no pause in between. It then carries on
     the way it was swiped: a strip never turns round against the guest's
     last swipe. Holding a finger still on it holds it. It is drawn by
     writing scrollLeft (as on the engagement), so a trackpad or wheel still
     scrolls it natively and is taken up the same way. It rests while the
     page is off screen. */
  var FLING_EASE = 0.6;    // seconds for a fling to melt most of the way back into the drift
  var FLING_MAX = 3500;    // px per second, the hardest throw that counts
  function driftRow(row, dir, pxPerSecond) {
    var track = row.firstElementChild;
    var heading = dir === 'left' ? 1 : -1;   // +1: photos travel left (scrollLeft grows)
    var v = heading * pxPerSecond;           // speed now, scrollLeft px per second; eases back to the drift
    var pos = 0;            // its position as a float: scrollLeft rounds, and a slow drift would stall
    var period = 0;         // one copy of the photos wide, the distance it wraps by
    var written = -1;       // the scrollLeft last written here, to spot a wheel's own scrolling
    var last = 0, hovering = false, drag = null, justDragged = false;
    var realMouse = !!window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;

    function clampV(x) { return Math.max(-FLING_MAX, Math.min(FLING_MAX, x)); }
    /* the photos are laid down twice, so a position one copy along looks
       the same: the strip wraps both ways without a visible jump */
    function wrap(x) {
      if (period <= 0) return x;
      x = x % period;
      return x < 0 ? x + period : x;
    }
    function measure() {
      var n = track.children.length / 2;
      period = n ? track.children[n].offsetLeft - track.children[0].offsetLeft : 0;
    }
    measure();
    $$('img', track).forEach(function (img) { img.addEventListener('load', measure); });
    window.addEventListener('resize', measure);
    function draw() { row.scrollLeft = pos; written = row.scrollLeft; }

    /* A horizontal drag moves the strip; a vertical one stays the page's.
       Set here rather than in the stylesheet, so a cached older script
       keeps its native swiping. */
    row.style.touchAction = 'pan-y';
    row.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType === 'mouse') e.preventDefault();   // no image drag, no text selection
      justDragged = false;
      /* timed with performance.now(), not the event's timeStamp, whose clock
         a touch event need not share with the rest of the page */
      drag = { id: e.pointerId, x0: e.clientX, x: e.clientX, moved: false, samples: [[performance.now(), e.clientX]] };
    });
    row.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.x0) <= 8) return;   // still a tap
        drag.moved = true;
        drag.x = e.clientX;
        try { row.setPointerCapture(e.pointerId); } catch (err) {}
      }
      pos = wrap(pos - (e.clientX - drag.x));
      drag.x = e.clientX;
      draw();
      var t = performance.now();
      drag.samples.push([t, e.clientX]);
      while (drag.samples.length > 2 && t - drag.samples[0][0] > 100) drag.samples.shift();
    });
    function release(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var sm = drag.samples, a = sm[0], b = sm[sm.length - 1];
      var span = (b[0] - a[0]) / 1000;
      /* thrown at the speed of its last tenth of a second; a finger that
         came to rest before lifting leaves the strip to start from still */
      v = drag.moved && span > 0 && performance.now() - b[0] < 80 ? clampV(-(b[1] - a[1]) / span) : 0;
      /* and from now on it drifts the way the finger pushed it */
      if (drag.moved && drag.x !== drag.x0) heading = drag.x < drag.x0 ? 1 : -1;
      justDragged = drag.moved;
      drag = null;
    }
    row.addEventListener('pointerup', release);
    row.addEventListener('pointercancel', release);   // the page took a vertical swipe
    /* a drag that ends on a photo must not open it */
    row.addEventListener('click', function (e) {
      if (justDragged) { e.preventDefault(); e.stopPropagation(); }
      justDragged = false;
    }, true);
    /* With a real mouse the strip glides to a halt under the pointer, so a
       photo can be clicked. Not on touch: iOS fires mouseenter on a tap and
       never the mouseleave, which would stop the drift for good. */
    if (realMouse) {
      row.addEventListener('mouseenter', function () { hovering = true; });
      row.addEventListener('mouseleave', function () { hovering = false; });
    }

    function tick(now) {
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;   // cap after a stall
      last = now;
      if (period > 0 && !drag && !document.hidden && row.classList.contains('in-view')) {
        /* A wheel, a trackpad or the keyboard moved it: leave that frame to
           them, and carry on from there at the wheel's speed and heading
           (a jump, like focus scrolling, starts from still). */
        var seen = row.scrollLeft;
        if (written >= 0 && Math.abs(seen - written) > 0.5) {
          var d = seen - written;
          v = Math.abs(d) < 120 && dt ? clampV(d / dt) : 0;
          if (v) heading = v > 0 ? 1 : -1;
          pos = seen;
          written = seen;
        } else {
          v += ((hovering ? 0 : heading * pxPerSecond) - v) * (1 - Math.exp(-dt / FLING_EASE));
          pos = wrap(pos + v * dt);
          draw();
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  if (stripsOn) {
    fillRow(rowA, 0, 9);
    fillRow(rowB, 9, GALLERY_COUNT);
    driftRow(rowA.parentNode, 'left', 26);
    driftRow(rowB.parentNode, 'right', 22);
    /* A tap opens the viewer (a drag is caught in driftRow). The listener
       sits on each photo: iOS delivers taps to the element itself far more
       reliably than to a delegating parent. */
    $$('.marquee img').forEach(function (img) {
      function open() { lbOpen(parseInt(img.getAttribute('data-index'), 10) || 0); }
      img.addEventListener('click', open);
      img.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        e.preventDefault();   // Space would otherwise scroll the page
        open();
      });
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
