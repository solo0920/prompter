'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Model = require('../../assets/js/model.js');
const Settings = require('../../assets/js/settings.js');
const Storage = require('../../assets/js/storage.js');

function fakeLocalStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key(index) {
      return Array.from(values.keys())[index] || null;
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

test('preferences provide documented defaults and schema version', function () {
  const preferences = Model.createPreferences();
  assert.deepEqual(preferences, {
    schemaVersion: Model.SCHEMA_VERSION,
    style: 'paper',
    theme: 'system',
    defaultMarker: 'none',
    showGrid: false,
    lastDocumentId: null
  });
  assert.equal(Settings.SCHEMA_VERSION, Model.SCHEMA_VERSION);
});

test('preferences preserve valid values and normalize invalid ones', function () {
  const valid = Model.normalizePreferences({
    schemaVersion: 99,
    style: 'graphite',
    theme: 'dark',
    defaultMarker: '##',
    showGrid: true,
    lastDocumentId: 'doc-1'
  });
  assert.deepEqual(valid, {
    schemaVersion: Model.SCHEMA_VERSION,
    style: 'graphite',
    theme: 'dark',
    defaultMarker: '##',
    showGrid: true,
    lastDocumentId: 'doc-1'
  });

  const invalid = Model.normalizePreferences({
    style: 'neon',
    theme: 'dim',
    defaultMarker: '####',
    showGrid: 'yes',
    lastDocumentId: 42
  });
  assert.equal(invalid.style, 'paper');
  assert.equal(invalid.theme, 'system');
  assert.equal(invalid.defaultMarker, 'none');
  assert.equal(invalid.showGrid, false);
  assert.equal(invalid.lastDocumentId, null);
});

test('system theme follows the media preference while explicit choices win', function () {
  assert.equal(Settings.effectiveTheme({ theme: 'system' }, { dark: true }), 'dark');
  assert.equal(Settings.effectiveTheme({ theme: 'system' }, { dark: false }), 'light');
  assert.equal(Settings.effectiveTheme({ theme: 'light' }, { dark: true }), 'light');
  assert.equal(Settings.effectiveTheme({ theme: 'dark' }, { dark: false }), 'dark');
  assert.equal(Settings.effectiveTheme({ theme: 'dim' }, { dark: true }), 'dark');
});

test('style and theme remain independent in preflight output', function () {
  assert.deepEqual(Settings.preflightAppearance({
    style: 'graphite',
    theme: 'system'
  }, { dark: true }), { theme: 'dark', style: 'graphite' });
  assert.deepEqual(Settings.preflightAppearance({
    style: 'neon',
    theme: 'light'
  }, { dark: true }), { theme: 'light', style: 'paper' });
  assert.equal(Settings.isSupportedTheme('system'), true);
  assert.equal(Settings.isSupportedTheme('dim'), false);
  assert.equal(Settings.isSupportedStyle('graphite'), true);
  assert.equal(Settings.isSupportedStyle('neon'), false);
});

test('preference serialization survives a reload and clear-library keeps preferences', async function () {
  const originalLocalStorage = global.localStorage;
  const originalIndexedDb = global.indexedDB;
  global.localStorage = fakeLocalStorage();
  global.indexedDB = undefined;
  try {
    const storage = Storage.createStorage();
    await storage.init();
    assert.equal(storage.mode, 'local');

    storage.savePreferences({
      style: 'graphite',
      theme: 'light',
      defaultMarker: '-',
      showGrid: true,
      lastDocumentId: 'doc-1'
    });
    const raw = global.localStorage.getItem('prompter.prefs.v1');
    assert.ok(raw, 'Preferences must be serialized into localStorage.');
    assert.equal(JSON.parse(raw).style, 'graphite');

    const reloaded = Storage.createStorage();
    await reloaded.init();
    assert.deepEqual(reloaded.getPreferences(), {
      schemaVersion: Model.SCHEMA_VERSION,
      style: 'graphite',
      theme: 'light',
      defaultMarker: '-',
      showGrid: true,
      lastDocumentId: 'doc-1'
    });

    await reloaded.saveDocument(Model.createPromptDocument({
      id: 'preference-document',
      blocks: [Model.createTextBlock({ id: 'preference-block', text: '內容' })]
    }), []);
    await reloaded.clearLibrary();
    assert.equal((await reloaded.getDocuments()).length, 0);
    assert.equal(reloaded.getPreferences().style, 'graphite');
    assert.equal(reloaded.getPreferences().defaultMarker, '-');
  } finally {
    if (originalLocalStorage === undefined) {
      delete global.localStorage;
    } else {
      global.localStorage = originalLocalStorage;
    }
    if (originalIndexedDb === undefined) {
      delete global.indexedDB;
    } else {
      global.indexedDB = originalIndexedDb;
    }
  }
});
