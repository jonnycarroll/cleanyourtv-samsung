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
