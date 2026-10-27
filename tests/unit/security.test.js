'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Preview = require('../../assets/js/preview.js');
const Utils = require('../../assets/js/utils.js');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT_DIR = path.join(ROOT, 'assets', 'js');

function runtimeScripts() {
  return fs.readdirSync(SCRIPT_DIR)
    .filter(function (name) {
      return /\.js$/.test(name);
    })
    .map(function (name) {
      return {
        name: name,
        source: fs.readFileSync(path.join(SCRIPT_DIR, name), 'utf8')
      };
    });
}

test('runtime scripts contain no network, dynamic-code, or module-loading primitives', function () {
  const forbidden = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bsendBeacon\s*\(/,
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /\bimport\s*\(/,
    /\bimportScripts\s*\(/
  ];
  runtimeScripts().forEach(function (script) {
    forbidden.forEach(function (pattern) {
      assert.equal(pattern.test(script.source), false,
        script.name + ' must not contain ' + pattern);
    });
    assert.equal(/src\s*=\s*["']https?:\/\//i.test(script.source), false,
      script.name + ' must not load remote scripts.');
  });
});

test('the entry page references only bundled local assets', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const attributes = html.match(/\b(?:src|href)\s*=\s*("[^"]*"|'[^']*')/gi) || [];
  attributes.forEach(function (attribute) {
    const value = attribute.replace(/^[^=]*=\s*/, '').replace(/^["']|["']$/g, '');
    assert.equal(/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value), false,
      'Entry page must not reference a remote or absolute URL: ' + value);
  });
  assert.equal(/<(?:script|link)[^>]+(?:src|href)\s*=\s*["']https?:/i.test(html), false);
});

test('the renderer escapes HTML-looking text and never emits remote image sources', function () {
  const source = [
    '<script>alert(1)</script>',
    '<img src="https://example.com/remote.png">',
    '![remote](https://example.com/remote.png)',
    '![embedded](data:image/svg+xml;base64,PHN2Zy8+)',
    ''
  ].join('\n');
  const rendered = Preview.renderMarkdown(source, { assets: [], imageUrls: {} });
  assert.equal(rendered.html.indexOf('<script>'), -1);
  assert.equal(rendered.html.indexOf('<img src="https://example.com/remote.png">'), -1);
  assert.equal(rendered.html.indexOf('src="https://example.com/remote.png"'), -1);
  assert.equal(rendered.html.indexOf('src="data:image/svg+xml'), -1);
  assert.ok(rendered.html.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;') !== -1);
  assert.ok(rendered.missingImages.length >= 2);
});

test('remote, absolute, protocol-relative and traversing image names are rejected', function () {
  ['https://example.com/pixel.png',
    'http://example.com/pixel.png',
    '//example.com/pixel.png',
    '/absolute/pixel.png',
    'file:///tmp/pixel.png',
    'javascript:alert(1)',
    '../pixel.png',
    'images/../../pixel.png'
  ].forEach(function (reference) {
    assert.equal(Utils.isExternalReference(reference) ||
      !Utils.isSafeRelativeImageName(reference), true,
    reference + ' must not be treated as a local image path.');
  });
  assert.equal(Utils.isSafeRelativeImageName('pixel.png'), true);
});
