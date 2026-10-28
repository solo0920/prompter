'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Model = require('../../assets/js/model.js');

const themePath = path.join(__dirname, '../../assets/css/themes.css');
const indexPath = path.join(__dirname, '../../index.html');
const css = fs.readFileSync(themePath, 'utf8');
const html = fs.readFileSync(indexPath, 'utf8');

function parseThemeBlocks(source) {
  const blocks = {};
  const blockPattern = /html\[data-style="([^"]+)"\]\[data-theme="([^"]+)"\]\s*\{([^}]*)\}/g;
  let match;
  while ((match = blockPattern.exec(source))) {
    const tokens = {};
    match[3].split(';').forEach(function (entry) {
      const token = entry.match(/--([\w-]+):\s*([^;]+)/);
      if (token) {
        tokens[token[1]] = token[2].trim();
      }
    });
    blocks[match[1] + '/' + match[2]] = tokens;
  }
  return blocks;
}

function parseHex(value) {
  const input = String(value || '').trim();
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(input)) {
    return null;
  }
  let hex = input.slice(1);
  if (hex.length === 3) {
    hex = hex.split('').map(function (part) { return part + part; }).join('');
  }
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16)
  ];
}

function luminance(value) {
  const channels = parseHex(value).map(function (channel) {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const blocks = parseThemeBlocks(css);

test('themes define every supported style in light and dark mode', function () {
  const requiredTokens = [
    'bg', 'surface', 'surface-2', 'surface-3', 'text', 'muted', 'border',
    'border-strong', 'accent', 'accent-strong', 'accent-soft', 'focus',
    'danger', 'danger-soft', 'canvas-bg', 'grid-line', 'block-bg',
    'block-border', 'image-bg', 'menu-bg', 'overlay', 'shadow',
    'shadow-small', 'toast-bg', 'toast-text'
  ];
  assert.deepEqual(Model.SUPPORTED_STYLES, [
    'apple', 'nvidia', 'meta', 'ibm', 'stripe', 'vercel',
    'notion', 'figma', 'spacex', 'spotify', 'paper', 'graphite'
  ]);
  assert.equal(Model.DEFAULT_STYLE, 'apple');
  assert.equal(Object.keys(blocks).length, 24);
  Model.SUPPORTED_STYLES.forEach(function (style) {
    ['light', 'dark'].forEach(function (theme) {
      const name = style + '/' + theme;
      assert.ok(blocks[name], style + ' must define a ' + theme + ' variant');
      requiredTokens.forEach(function (token) {
        assert.ok(blocks[name][token], name + ' must define --' + token);
      });
    });
  });
});

test('every style and theme meets WCAG 2.1 AA contrast for text and controls', function () {
  const checks = [
    ['text', 'bg', 4.5],
    ['text', 'surface', 4.5],
    ['text', 'block-bg', 4.5],
    ['text', 'canvas-bg', 4.5],
    ['text', 'menu-bg', 4.5],
    ['text', 'surface-2', 4.5],
    ['text', 'accent-soft', 4.5],
    ['muted', 'bg', 4.5],
    ['muted', 'surface', 4.5],
    ['muted', 'block-bg', 4.5],
    ['muted', 'canvas-bg', 4.5],
    ['accent', 'surface', 3],
    ['accent', 'bg', 3],
    ['accent-strong', 'surface-2', 4.5],
    ['accent-strong', 'accent-soft', 4.5],
    ['on-accent', 'accent', 4.5],
    ['on-accent', 'accent-strong', 4.5],
    ['toast-text', 'toast-bg', 4.5],
    ['danger', 'bg', 4.5],
    ['danger', 'surface', 4.5],
    ['danger', 'danger-soft', 4.5],
    ['focus', 'bg', 3],
    ['focus', 'surface', 3],
    ['focus', 'block-bg', 3],
    ['focus', 'accent-soft', 3]
  ];

  Object.keys(blocks).forEach(function (name) {
    const tokens = blocks[name];
    checks.forEach(function (check) {
      const foreground = check[0] === 'on-accent' && !tokens['on-accent']
        ? '#ffffff'
        : tokens[check[0]];
      const background = tokens[check[1]];
      const foregroundHex = parseHex(foreground);
      const backgroundHex = parseHex(background);
      assert.ok(foregroundHex, name + ' must define a hex ' + check[0]);
      assert.ok(backgroundHex, name + ' must define a hex ' + check[1]);
      const ratio = contrast(foreground, background);
      assert.ok(
        ratio + 1e-6 >= check[2],
        name + ' ' + check[0] + '/' + check[1] + ' is ' + ratio.toFixed(2) +
          ':1, below the required ' + check[2] + ':1'
      );
    });
  });
});

test('the style selector lists all twelve styles with Apple first', function () {
  const select = html.match(/<select id="style-select"[\s\S]*?<\/select>/);
  assert.ok(select, 'The style selector must exist.');
  const values = [];
  const optionPattern = /<option value="([^"]+)"/g;
  let match;
  while ((match = optionPattern.exec(select[0]))) {
    values.push(match[1]);
  }
  assert.deepEqual(values, Model.SUPPORTED_STYLES);
  assert.match(html, /<html[^>]*data-style="apple"/);
});

test('the theme pack is self-contained and does not load remote assets', function () {
  assert.doesNotMatch(css, /@import\b/i);
  assert.doesNotMatch(css, /url\(\s*['"]?https?:/i);
  assert.doesNotMatch(css, /https?:\/\//i);
  assert.doesNotMatch(css, /@font-face\b/i);
});
