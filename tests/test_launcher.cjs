const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function load(file, window) {
    const context = vm.createContext({ window, console, alert() {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../launcher/js', file), 'utf8'), context);
    return window;
}

test('every curated icon contains an intact, attribute-safe SVG payload', () => {
    const { APP_ICONS } = load('mock-apps.js', {});
    for (const icon of Object.values(APP_ICONS)) {
        assert.ok(icon.startsWith('data:image/svg+xml;charset=utf-8,'));
        assert.ok(!icon.includes('"'));
        const svg = decodeURIComponent(icon.slice(icon.indexOf(',') + 1));
        assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
        assert.ok(svg.endsWith('</svg>'));
        assert.ok(svg.includes('fill="#'));
    }
});

test('catalog recognizes app IDs observed on the QN95B', () => {
    const { DEFAULT_CATALOG } = load('mock-apps.js', {});
    const expected = {
        youtube: '9Ur5IzDKqV.TizenYouTube',
        '3201910019365': 'org.tizen.primevideo',
        disneyplus: 'MCmYXNxgcu.DisneyPlus',
        appletv: 'com.samsung.tv.aria-video',
        samsung_browser: 'com.samsung.tv.knox-browser',
    };
    for (const [alias, id] of Object.entries(expected)) {
        assert.ok(DEFAULT_CATALOG.find(app => app.aliasId === alias).installedIds.includes(id));
    }
});

test('website launch passes its URL to the Tizen view operation', () => {
    let request;
    const window = load('tizen-api.js', {
        tizen: {
            ApplicationControl: function(operation, uri) { this.operation = operation; this.uri = uri; },
            application: { launchAppControl(control, id, success) { request = control; success(); } },
        },
    });
    window.TizenAPI.openUrl('https://example.com/video');
    assert.equal(request.uri, 'https://example.com/video');
    assert.equal(request.operation, 'http://tizen.org/appcontrol/operation/view');
});

function buildList(installedApps, isTizen) {
    const window = load('mock-apps.js', {});
    const context = vm.createContext({window, document: {addEventListener() {}}});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../launcher/js/app.js'), 'utf8'), context);
    return {apps: context.buildAppList(installedApps, isTizen), catalog: window.DEFAULT_CATALOG};
}

test('TV lists only installed visible apps and preserves their real launch IDs', () => {
    const installed = [
        {id: '9Ur5IzDKqV.TizenYouTube', name: 'YouTube', show: true},
        {id: 'custom.app', name: 'Custom', iconPath: 'file:///custom.png'},
        {id: 'org.tizen.primevideo', name: 'Hidden Prime', show: false},
    ];
    const {apps, catalog} = buildList(installed, true);
    assert.deepEqual(Array.from(apps, app => app.id), ['9Ur5IzDKqV.TizenYouTube', 'custom.app']);
    assert.equal(apps[0].name, 'YouTube');
    assert.equal(apps[0].aliasId, 'youtube');
    const youtube = catalog.find(app => app.aliasId === 'youtube');
    assert.equal(apps[0].icon, youtube.icon);
    assert.notEqual(youtube.id, apps[0].id); // Discovery must not mutate the preview catalog.
    assert.equal(apps[1].icon, 'file:///custom.png');
});

test('empty or failed TV discovery never inserts sample apps', () => {
    assert.equal(buildList([], true).apps.length, 0);
    assert.equal(buildList(null, true).apps.length, 0);
});

test('browser preview retains its sample apps', () => {
    const {apps, catalog} = buildList(null, false);
    assert.equal(apps.length, catalog.length);
    assert.ok(apps.length > 0);
    assert.notEqual(apps[0], catalog[0]);
});
