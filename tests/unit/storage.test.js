'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Model = require('../../assets/js/model.js');
const Storage = require('../../assets/js/storage.js');

function quotaError() {
  const error = new Error('The quota has been exceeded.');
  error.name = 'QuotaExceededError';
  error.code = 22;
  return error;
}

function fakeLocalStorage(options) {
  const settings = options || {};
  const values = new Map();
  let failKey = settings.failKey || null;
  let alwaysFail = settings.alwaysFail === true;
  const local = {
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
      if (alwaysFail || key === failKey) {
        throw quotaError();
      }
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    failOn(key) {
      failKey = key;
    },
    recover() {
      failKey = null;
      alwaysFail = false;
    },
    raw(key) {
      return values.has(key) ? values.get(key) : null;
    },
    keys() {
      return Array.from(values.keys());
    }
  };
  return local;
}

function withBrowserStorage(localStorageValue, run) {
  const originalLocalStorage = global.localStorage;
  const originalIndexedDb = global.indexedDB;
  global.localStorage = localStorageValue === undefined ? undefined : localStorageValue;
  global.indexedDB = undefined;
  return Promise.resolve().then(run).then(function (value) {
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
    return value;
  }, function (error) {
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
    throw error;
  });
}

function sampleDocument(id, text) {
  return Model.createPromptDocument({
    id: id,
    title: '文件 ' + id,
    fileName: id + '.md',
    blocks: [
      Model.createTextBlock({
        id: id + '-text',
        text: text || '內容',
        y: 0,
        seq: 1
      })
    ]
  });
}

test('storage falls back to localStorage when IndexedDB is unavailable', async function () {
  const local = fakeLocalStorage();
  await withBrowserStorage(local, async function () {
    const storage = Storage.createStorage();
    const info = await storage.init();
    assert.equal(info.mode, 'local');
    assert.equal(info.reason, 'indexeddb-unavailable');
    assert.ok(info.detail.indexOf('IndexedDB') !== -1);
    assert.ok(info.modeLabel.indexOf('localStorage') !== -1);

    const document = sampleDocument('fallback-document');
    await storage.saveDocument(document, []);
    const stored = await storage.getDocuments();
    assert.equal(stored.length, 1);
    assert.equal(stored[0].id, document.id);

    const reloaded = Storage.createStorage();
    await reloaded.init();
    assert.equal(reloaded.mode, 'local');
    const afterReload = await reloaded.getDocuments();
    assert.equal(afterReload.length, 1);
    assert.equal(afterReload[0].id, document.id);
  });
});

test('storage degrades to session memory when both IndexedDB and localStorage fail', async function () {
  const local = fakeLocalStorage({ alwaysFail: true });
  await withBrowserStorage(local, async function () {
    const storage = Storage.createStorage();
    const info = await storage.init();
    assert.equal(info.mode, 'memory');
    assert.equal(info.reason, 'localstorage-unavailable');
    assert.ok(info.detail.indexOf('重新載入') !== -1);
    assert.ok(info.modeLabel.indexOf('記憶體') !== -1);

    await storage.saveDocument(sampleDocument('memory-document'), []);
    assert.equal((await storage.getDocuments()).length, 1);

    const reloaded = Storage.createStorage();
    await reloaded.init();
    assert.equal(reloaded.mode, 'memory');
    assert.equal((await reloaded.getDocuments()).length, 0,
      'Memory-mode documents must not survive a reload.');
  });
});

test('a quota failure rolls back the local library and keeps the previous document', async function () {
  const local = fakeLocalStorage();
  await withBrowserStorage(local, async function () {
    const storage = Storage.createStorage();
    await storage.init();
    assert.equal(storage.mode, 'local');

    const first = sampleDocument('kept-document', '保留內容');
    const second = sampleDocument('rejected-document', '不應寫入');
    await storage.saveDocument(first, []);

    local.failOn(Storage.LIBRARY_KEY);
    await assert.rejects(
      storage.saveDocument(second, []),
      function (error) {
        assert.equal(error.code, 'STORAGE_FULL');
        return true;
      }
    );
    local.recover();

    const stored = await storage.getDocuments();
    assert.equal(stored.length, 1);
    assert.equal(stored[0].id, first.id);
    assert.equal(stored[0].blocks[0].text, '保留內容');
    assert.equal(await storage.getDocument(second.id), null);
    const raw = JSON.parse(local.raw(Storage.LIBRARY_KEY));
    assert.equal(raw.documents.length, 1);
    assert.equal(raw.documents[0].id, first.id);
  });
});

test('a corrupt local payload shows an empty library, keeps an isolated copy, and recovers', async function () {
  const local = fakeLocalStorage();
  const corruptPayload = '{"schemaVersion":1,"documents":[';
  local.setItem(Storage.LIBRARY_KEY, corruptPayload);
  await withBrowserStorage(local, async function () {
    const storage = Storage.createStorage();
    await storage.init();
    assert.equal(storage.mode, 'local');

    const stored = await storage.getDocuments();
    assert.equal(stored.length, 0);
    assert.ok(storage.lastReadWarning.indexOf('無法讀取') !== -1,
      'A corrupt payload must produce a visible read warning.');
    assert.equal(local.raw(Storage.LIBRARY_KEY), null,
      'The corrupt payload must not be read again on every load.');
    const isolatedKeys = local.keys().filter(function (key) {
      return key.indexOf('prompter.corrupt.') === 0;
    });
    assert.equal(isolatedKeys.length, 1, 'The corrupt payload must be isolated.');
    assert.equal(local.raw(isolatedKeys[0]), corruptPayload);

    const document = sampleDocument('recovered-document');
    await storage.saveDocument(document, []);
    const recovered = await storage.getDocuments();
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].id, document.id);
  });
});

test('a mismatched library schema is isolated instead of being trusted', async function () {
  const local = fakeLocalStorage();
  local.setItem(Storage.LIBRARY_KEY, JSON.stringify({
    schemaVersion: 99,
    documents: [],
    assets: []
  }));
  await withBrowserStorage(local, async function () {
    const storage = Storage.createStorage();
    await storage.init();
    const stored = await storage.getDocuments();
    assert.equal(stored.length, 0);
    assert.ok(storage.lastReadWarning.length > 0);
    assert.equal(local.raw(Storage.LIBRARY_KEY), null);
    assert.ok(local.keys().some(function (key) {
      return key.indexOf('prompter.corrupt.') === 0;
    }));
  });
});
