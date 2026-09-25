/* LAB — see-through Safari bars (test copy). Runs after main.js.
   ?bleed=0  plain: just the page scrolling under the bars
   ?debug=1  a panel of screen measurements, for tuning */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var BLEED = params.get('bleed') !== '0';
  var DEBUG = params.get('debug') === '1';
  var E = 140;                                   // px each page reaches past its own edges

  var inv = document.getElementById('invitation');
  var video = document.getElementById('video-backdrop');
  var pages = [].slice.call(document.querySelectorAll('#invitation > .child'));
  if (!inv || !pages.length) return;

  /* the page nearest the top of the screen */
  function currentPage() {
    var best = null, bestD = Infinity;
    pages.forEach(function (p) {
      if (p.hidden) return;
      var d = Math.abs(p.getBoundingClientRect().top);
      if (d < bestD) { bestD = d; best = p; }
    });
    return best;
  }

  /* ── the video follows the video page on screen ── */
  function carryVideo(page) {
    if (!video || !page || !page.classList.contains('window') || video.parentNode === page) return;
    page.insertBefore(video, page.firstChild);   // same task: playback carries on
    video.play().catch(function () {});
  }

  /* ── bleed layers ── */
  if (BLEED) {
    pages.forEach(function (p) {
      var layer = document.createElement('div');
      layer.className = 'bleed';
      var fill = document.createElement('div');
      fill.className = 'bleed-fill';
      if (p.style.backgroundImage) fill.style.backgroundImage = p.style.backgroundImage;
      else if (p.classList.contains('window')) fill.style.backgroundImage = 'url("assets/img/guest.jpg")';
      else fill.style.background = getComputedStyle(p).backgroundColor;
      layer.appendChild(fill);
      var scrim = p.querySelector(':scope > .section-scrim, :scope > .scrim-person, :scope > .bg-scrim');
      if (scrim) {
        var cs = getComputedStyle(scrim);
        var s = document.createElement('div');
        s.className = 'bleed-scrim';
        s.style.backgroundColor = cs.backgroundColor;
        s.style.backgroundImage = cs.backgroundImage;
        layer.appendChild(s);
      }
      inv.appendChild(layer);
      p._bleed = layer;
    });
  }
  function placeBleeds() {
    pages.forEach(function (p) {
      if (!p._bleed) return;
      p._bleed.hidden = p.hidden;
      p._bleed.style.top = (p.offsetTop - E) + 'px';
      p._bleed.style.height = (p.offsetHeight + 2 * E) + 'px';
    });
  }

  /* ── rest / scroll ── */
  var restTimer, shown = null;
  function onRest() {
    var page = currentPage();
    carryVideo(page);
    pages.forEach(function (p) { p.classList.toggle('lab-current', p === page); });
    if (BLEED) {
      placeBleeds();
      if (shown && shown !== page && shown._bleed) shown._bleed.classList.remove('on');
      if (page && page._bleed) page._bleed.classList.add('on');
      shown = page;
    }
    renderDebug(page);
  }
  function onScroll() {
    if (shown && shown._bleed) shown._bleed.classList.remove('on');
    clearTimeout(restTimer);
    restTimer = setTimeout(onRest, 180);
    if (DEBUG) renderDebug(currentPage());
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { clearTimeout(restTimer); restTimer = setTimeout(onRest, 180); });
  onRest();

  /* ── ?debug=1 ── */
  var panel = null;
  function probe(css) {
    var d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:0;top:0;width:1px;visibility:hidden;' + css;
    document.body.appendChild(d);
    var h = d.getBoundingClientRect().height;
    d.parentNode.removeChild(d);
    return Math.round(h);
  }
  function renderDebug(page) {
    if (!DEBUG) return;
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'lab-debug';
      document.body.appendChild(panel);
    }
    var vv = window.visualViewport;
    panel.textContent =
      'LAB ' + (BLEED ? 'bleed' : 'plain') + '\n' +
      'screen ' + screen.width + 'x' + screen.height + '  dpr ' + devicePixelRatio + '\n' +
      'inner ' + innerWidth + 'x' + innerHeight + '  outerH ' + outerHeight + '\n' +
      'vv ' + (vv ? Math.round(vv.height) + ' @' + Math.round(vv.offsetTop) : '-') + '\n' +
      'vh ' + probe('height:100vh') + '  svh ' + probe('height:100svh') +
      '  lvh ' + probe('height:100lvh') + '  dvh ' + probe('height:100dvh') + '\n' +
      'safe top ' + probe('height:env(safe-area-inset-top,0px)') +
      '  bottom ' + probe('height:env(safe-area-inset-bottom,0px)') + '\n' +
      'scrollY ' + Math.round(scrollY) + '  page ' + (page ? page.id : '-');
  }
})();
