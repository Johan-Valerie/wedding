const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets/js/main.js'), 'utf8');
const viewportCode = source.slice(source.indexOf('  var snapRequested ='),
  source.indexOf('  /* scroll lock while cover is up */'));

function fixture(withVisualViewport = true) {
  const properties = new Map(), classes = new Set(), listeners = {};
  let now = 0, nextId = 1;
  const tasks = new Map();
  const style = {
    setProperty: (name, value) => properties.set(name, value),
    removeProperty: name => properties.delete(name)
  };
  const context = {
    shell: true,
    navSettleWatch: null,
    document: {documentElement: {style, classList: {
      add: name => classes.add(name), remove: name => classes.delete(name)
    }}, activeElement: {}},
    window: {innerWidth: 320, innerHeight: 568, addEventListener() {}},
    queueReveals() {},
    Date: {now: () => now},
    clearInterval() {},
    setTimeout(fn, ms) { const id = nextId++; tasks.set(id, {fn, at: now + ms}); return id; },
    clearTimeout(id) { tasks.delete(id); },
    requestAnimationFrame(fn) { return context.setTimeout(fn, 16); }
  };
  if (withVisualViewport) context.window.visualViewport = {
    height: 568, offsetTop: 0, addEventListener() {}
  };
  const root = {
    style: {}, scrollTop: 9 * 568,
    get clientHeight() { return Number.parseFloat(properties.get('--form-height')) || context.window.innerHeight; },
    getBoundingClientRect() {
      const top = Number.parseFloat(properties.get('--form-top')) || 0;
      return {top, bottom: top + this.clientHeight, height: this.clientHeight};
    },
    scrollTo({top}) { this.scrollTop = top; },
    addEventListener(name, fn) { listeners[name] = fn; }
  };
  context.scrollRoot = context.scroller = root;
  function section(index, contentHeight = 550) {
    return {
      hidden: false,
      get offsetHeight() { return Math.max(contentHeight, Number.parseFloat(properties.get('--page-height')) || context.window.innerHeight); },
      getBoundingClientRect() {
        const pageHeight = Number.parseFloat(properties.get('--page-height')) || context.window.innerHeight;
        return {top: index * pageHeight - root.scrollTop + root.getBoundingClientRect().top};
      }
    };
  }
  const rsvp = section(9);
  function field(relativeTop, type = 'text', owner = rsvp) {
    return {
      type, disabled: false, readOnly: false,
      matches: () => true,
      getAttribute: () => null,
      closest: selector => selector === '.child' ? owner : {},
      getBoundingClientRect() {
        const top = owner.getBoundingClientRect().top + relativeTop;
        return {top, bottom: top + 42};
      },
      focus() { context.document.activeElement = this; listeners.focusin({target: this}); }
    };
  }
  vm.createContext(context);
  vm.runInContext(viewportCode, context);
  function advance(ms) {
    const end = now + ms;
    while (true) {
      const task = [...tasks].filter(([,t]) => t.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!task) break;
      tasks.delete(task[0]); now = task[1].at; task[1].fn();
    }
    now = end;
  }
  function blur() { context.document.activeElement = {}; listeners.focusout(); }
  return {context, root, properties, classes, rsvp, field, section, advance, blur};
}

// Android browsers that resize the layout viewport, including the fallback
// when the VisualViewport API is absent, must keep the focused RSVP visible.
for (const visual of [true, false]) {
  const f = fixture(visual), guest = f.field(330);
  f.context.setSnap(true);
  guest.focus();
  f.context.window.innerHeight = 280;
  if (visual) f.context.window.visualViewport.height = 280;
  f.context.syncFormViewport();
  assert.equal(f.properties.get('--page-height'), '568px');
  assert.equal(f.root.style.scrollSnapType, 'none');
  assert.ok(guest.getBoundingClientRect().bottom <= 262);
  assert.ok(f.rsvp.getBoundingClientRect().top <= 0);
  f.context.setSnap(true); // a navigation timer cannot re-enable snapping
  assert.equal(f.root.style.scrollSnapType, 'none');
  f.blur(); f.advance(500);
  assert.ok(f.classes.has('form-editing'), 'wait for the keyboard to close');
  f.context.window.innerHeight = 568;
  if (visual) f.context.window.visualViewport.height = 568;
  f.advance(200);
  assert.equal(f.root.scrollTop, 9 * 568, 'stay on RSVP after the keyboard closes');
  assert.equal(f.root.style.scrollSnapType, 'y mandatory');
  assert.equal(f.properties.has('--page-height'), false);
}

// Safari can shrink the visual viewport without changing window.innerHeight.
{
  const f = fixture(), guest = f.field(330);
  guest.focus();
  f.context.window.visualViewport.height = 270;
  f.context.window.visualViewport.offsetTop = 12;
  f.context.syncFormViewport();
  assert.equal(f.context.window.innerHeight, 568);
  assert.equal(f.root.clientHeight, 270);
  assert.ok(guest.getBoundingClientRect().bottom <= 264);
  // Switching guests keeps editing active. A destination from an earlier
  // navigation must not pull the newly focused guest onto another page.
  f.context.formViewport.destination = f.section(13);
  f.blur();
  const other = f.field(180);
  other.focus(); f.advance(400);
  assert.ok(f.classes.has('form-editing'));
  assert.equal(f.context.formViewport.destination, undefined);
}

// A deliberate navigation during keyboard dismissal keeps its destination.
{
  const f = fixture(), guest = f.field(330);
  guest.focus();
  f.context.formViewport.destination = f.section(11);
  f.blur(); f.advance(400);
  assert.equal(f.root.scrollTop, 11 * 568);
}

// If display enlargement leaves less room than the control's own height,
// repeated viewport notifications must not scroll it back and forth.
{
  const f = fixture(), guest = f.field(330);
  guest.focus();
  f.context.window.visualViewport.height = 50;
  f.context.syncFormViewport();
  const position = f.root.scrollTop;
  for (let n = 0; n < 5; n++) f.context.syncFormViewport();
  assert.equal(f.root.scrollTop, position);
}

// A stalled RSVP request rejects and aborts, so the save queue and disabled
// form can recover. A refused server response must never report success.
async function checkRequests() {
  const postCode = source.slice(source.indexOf('  function postResponse('), source.indexOf('  function saveResponse('));
  let timeout, signal, clearCount = 0;
  const context = vm.createContext({API_URL: 'http://test.invalid', SAVE_TIMEOUT: 30000,
    AbortController, encodeURIComponent,
    setTimeout(fn, ms) { assert.equal(ms, 30000); timeout = fn; return 1; },
    clearTimeout() { clearCount++; },
    fetch(url, options) { signal = options.signal; return new Promise(() => {}); }
  });
  vm.runInContext(postCode, context);
  const pending = context.postResponse({key:'Preview', guests:['A','B']});
  timeout();
  await assert.rejects(pending, /save_timeout/);
  assert.equal(signal.aborted, true);
  context.fetch = async () => ({json: async () => ({ok:false,error:'busy'})});
  await assert.rejects(context.postResponse({key:'Preview'}), /busy/);
  context.fetch = async () => ({json: async () => ({ok:true})});
  await context.postResponse({key:'Preview'});
  await Promise.resolve();
  assert.ok(clearCount >= 2);
}
checkRequests().then(() => console.log('Mobile keyboard resize, focus, dismissal, navigation and save recovery: OK'));
