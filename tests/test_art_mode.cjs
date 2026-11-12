const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function gallery() {
    const images = [];
    const timers = new Map();
    const elements = new Map();
    const window = {};
    let nextTimer = 0;
    const context = {
        window, console,
        Image: class { constructor() { images.push(this); } },
        setInterval() { return 1; }, clearInterval() {},
        setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
        clearTimeout(id) { timers.delete(id); },
        document: {getElementById(id) {
            if (!elements.has(id)) elements.set(id, {style: {}, textContent: '', focus() {}});
            return elements.get(id);
        }},
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../launcher/js/art-mode.js'), 'utf8'), context);
    window.ArtMode.init();
    window.ArtMode.open();
    return {art: window.ArtMode, catalog: window.ART_CATALOG, images, timers};
}

test('image success clears loading status and displays the selected artwork', () => {
    const {art, catalog, images, timers} = gallery();
    assert.match(art.statusPillEl.textContent, /LOADING IMAGE/);
    images[0].onload();
    assert.equal(art.bgImageEl.style.backgroundImage, `url('${catalog[0].imageUrl}')`);
    assert.doesNotMatch(art.statusPillEl.textContent, /LOADING|UNAVAILABLE/);
    assert.equal(timers.size, 0);
});

test('image error and timeout display a backdrop and explicit failure status', () => {
    const {art, images, timers} = gallery();
    images[0].onerror();
    assert.match(art.statusPillEl.textContent, /IMAGE UNAVAILABLE/);
    assert.match(art.bgImageEl.style.backgroundImage, /^radial-gradient/);
    art.next();
    Array.from(timers.values())[0]();
    assert.match(art.statusPillEl.textContent, /IMAGE UNAVAILABLE/);
    assert.equal(art.pendingImage, null);
    art.next();
    images[2].onload();
    assert.equal(art.imageLoadState, 'ready');
});

test('late callbacks cannot overwrite a newer slide or update a closed gallery', () => {
    const {art, catalog, images} = gallery();
    const lateSuccess = images[0].onload;
    const lateFailure = images[0].onerror;
    art.next();
    images[1].onload();
    lateSuccess();
    lateFailure();
    assert.equal(art.bgImageEl.style.backgroundImage, `url('${catalog[1].imageUrl}')`);
    assert.equal(art.imageLoadState, 'ready');
    art.next();
    const afterClose = images[2].onload;
    art.close();
    const backdrop = art.bgImageEl.style.backgroundImage;
    afterClose();
    assert.equal(art.bgImageEl.style.backgroundImage, backdrop);
    assert.equal(art.pendingImage, null);
});
