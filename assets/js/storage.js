(function (global) {
  'use strict';

  var Utils = (typeof module === 'object' && module.exports)
    ? require('./utils.js')
    : global.Prompter.utils;
  var Model = (typeof module === 'object' && module.exports)
    ? require('./model.js')
    : global.Prompter.model;
  var Files = (typeof module === 'object' && module.exports)
    ? require('./files.js')
    : global.Prompter.files;

  var DB_NAME = 'prompter-v1';
  var DB_VERSION = 1;
  var LIBRARY_KEY = 'prompter.library.v1';
  var PREFS_KEY = 'prompter.prefs.v1';
  var PROBE_KEY = 'prompter.probe.v1';

  function storageError(code, message, cause) {
    var error = new Error(message || code);
    error.code = code;
    if (cause) {
      error.cause = cause;
    }
    return error;
  }

  function requestToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () {
        reject(storageError('STORAGE_READ_FAILED', '本機資料讀取失敗。', request.error));
      };
    });
  }

  function transactionDone(transaction) {
    return new Promise(function (resolve, reject) {
      transaction.oncomplete = function () { resolve(); };
      transaction.onerror = function () {
        reject(storageError('STORAGE_WRITE_FAILED', '本機資料寫入失敗。', transaction.error));
      };
      transaction.onabort = function () {
        reject(storageError('STORAGE_WRITE_FAILED', '本機資料寫入中止。', transaction.error));
      };
    });
  }

  function withTimeout(promise, milliseconds, code) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(storageError(code || 'STORAGE_TIMEOUT', '本機儲存初始化逾時。'));
      }, milliseconds);
      Promise.resolve(promise).then(function (value) {
        clearTimeout(timer);
        resolve(value);
      }, function (error) {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function copyDocument(document) {
    return JSON.parse(JSON.stringify(document));
  }

  function assetMetadata(asset) {
    return {
      id: asset.id,
      documentId: asset.documentId,
      fileName: asset.fileName,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      size: asset.size,
      createdAt: asset.createdAt
    };
  }

  function filesModule() {
    return Files || (global.Prompter && global.Prompter.files);
  }

  function toBlob(asset) {
    if (asset.blob) {
      return asset.blob;
    }
    if (asset.bytes && typeof global.Blob === 'function') {
      return new global.Blob([asset.bytes], { type: asset.mimeType || 'application/octet-stream' });
    }
    if (asset.dataUrl) {
      return filesModule().dataUrlToBlob(asset.dataUrl);
    }
    return null;
  }

  function toDataUrl(asset) {
    if (asset.dataUrl) {
      return Promise.resolve(asset.dataUrl);
    }
    if (asset.bytes) {
      return Promise.resolve('data:' + (asset.mimeType || 'application/octet-stream') +
        ';base64,' + Utils.bytesToBase64(asset.bytes));
    }
    if (asset.blob) {
      return filesModule().blobToDataUrl(asset.blob);
    }
    return Promise.resolve('');
  }

  function createStorage() {
    var storage = {
      mode: 'memory',
      reason: 'not-initialized',
      detail: '',
      modeLabel: 'Memory (this session)',
      lastReadWarning: '',
      _db: null,
      _memory: { documents: {}, assets: {}, fileTargets: {}, preferences: null },
      _localAvailable: false,
      _idbChecked: false
    };

    storage._localStorage = function () {
      try {
        return global.localStorage || null;
      } catch (error) {
        return null;
      }
    };

    storage._isolateCorrupt = function (raw, key) {
      try {
        var local = storage._localStorage();
        if (!local) {
          return false;
        }
        var corruptKey = 'prompter.corrupt.' + Date.now() +
          (key ? '.' + String(key).replace(/[^a-z0-9.-]/gi, '') : '');
        local.setItem(corruptKey, raw);
        return true;
      } catch (error) {
        return false;
      }
    };

    storage._probeLocalStorage = function () {
      try {
        var local = storage._localStorage();
        if (!local) {
          return false;
        }
        local.setItem(PROBE_KEY, '1');
        var value = local.getItem(PROBE_KEY);
        local.removeItem(PROBE_KEY);
        storage._localAvailable = value === '1';
        return storage._localAvailable;
      } catch (error) {
        storage._localAvailable = false;
        return false;
      }
    };

    storage._openIdb = function () {
      return new Promise(function (resolve, reject) {
        if (!global.indexedDB) {
          reject(storageError('IDB_UNAVAILABLE', '此瀏覽器不支援 IndexedDB。'));
          return;
        }
        var request;
        try {
          request = global.indexedDB.open(DB_NAME, DB_VERSION);
        } catch (error) {
          reject(storageError('IDB_UNAVAILABLE', 'IndexedDB 無法開啟。', error));
          return;
        }
        request.onupgradeneeded = function () {
          var db = request.result;
          if (!db.objectStoreNames.contains('documents')) {
            db.createObjectStore('documents', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('assets')) {
            var assets = db.createObjectStore('assets', { keyPath: 'id' });
            assets.createIndex('documentId', 'documentId', { unique: false });
          }
          if (!db.objectStoreNames.contains('meta')) {
            db.createObjectStore('meta', { keyPath: 'key' });
          }
        };
        request.onsuccess = function () {
          var db = request.result;
          db.onversionchange = function () {
            db.close();
          };
          storage._db = db;
          resolve(db);
        };
        request.onerror = function () {
          reject(storageError('IDB_OPEN_FAILED', 'IndexedDB 開啟失敗。', request.error));
        };
        request.onblocked = function () {
          reject(storageError('IDB_BLOCKED', 'IndexedDB 被其他分頁阻擋。'));
        };
      });
    };

    storage._withMeta = function (mode, callback) {
      if (!storage._db) {
        return Promise.reject(storageError('IDB_UNAVAILABLE', 'IndexedDB 不可用。'));
      }
      var transaction = storage._db.transaction(['meta'], mode);
      var store = transaction.objectStore('meta');
      var result;
      callback(store, function (value) { result = value; });
      return transactionDone(transaction).then(function () { return result; });
    };

    storage._getMeta = function (key) {
      return storage._withMeta('readonly', function (store, setResult) {
        var request = store.get(key);
        request.onsuccess = function () { setResult(request.result); };
      }).then(function (record) {
        return record ? record.value : undefined;
      });
    };

    storage._setMeta = function (key, value) {
      return storage._withMeta('readwrite', function (store) {
        store.put({ key: key, value: value });
      });
    };

    storage._deleteMeta = function (key) {
      return storage._withMeta('readwrite', function (store) {
        store.delete(key);
      });
    };

    storage._probeIdb = function () {
      var probeValue = typeof global.Blob === 'function'
        ? new global.Blob(['ok'], { type: 'text/plain' })
        : 'ok';
      return storage._setMeta('__probe__', probeValue).then(function () {
        return storage._getMeta('__probe__');
      }).then(function (value) {
        if (!value) {
          throw storageError('IDB_PROBE_FAILED', 'IndexedDB 無法寫入測試資料。');
        }
        return storage._deleteMeta('__probe__');
      });
    };

    storage.init = function () {
      storage._idbChecked = true;
      storage._localAvailable = storage._probeLocalStorage();
      if (global.indexedDB) {
        return withTimeout(storage._openIdb().then(function () {
          return storage._probeIdb();
        }).then(function () {
          return storage._getMeta('schemaVersion');
        }).then(function (version) {
          if (version !== undefined && version !== Model.SCHEMA_VERSION) {
            if (storage._db) {
              try { storage._db.close(); } catch (closeError) { /* ignore */ }
              storage._db = null;
            }
            storage.mode = 'memory';
            storage.reason = 'schema-version-mismatch';
            storage.detail = '本機資料結構版本不符，請先備份後清除本機資料庫。';
            storage.modeLabel = 'Memory (this session)';
            return storage.info();
          }
          return storage._setMeta('schemaVersion', Model.SCHEMA_VERSION).then(function () {
            storage.mode = 'idb';
            storage.reason = 'ok';
            storage.detail = '';
            storage.modeLabel = 'IndexedDB';
            return storage.info();
          });
        }), 2500, 'IDB_TIMEOUT').catch(function (error) {
          if (storage._db) {
            try { storage._db.close(); } catch (closeError) { /* ignore */ }
            storage._db = null;
          }
          if (storage._localAvailable) {
            storage.mode = 'local';
            storage.reason = 'indexeddb-unavailable';
            storage.detail = 'IndexedDB 無法使用，已改用 localStorage。';
            storage.modeLabel = 'Browser storage (localStorage)';
          } else {
            storage.mode = 'memory';
            storage.reason = error.code === 'IDB_UNAVAILABLE' ? 'indexeddb-unavailable' : 'storage-unavailable';
            storage.detail = '本機持久儲存無法使用，關閉或重新載入頁面後未儲存的內容會遺失。';
            storage.modeLabel = 'Memory (this session)';
          }
          return storage.info();
        });
      }
      if (storage._localAvailable) {
        storage.mode = 'local';
        storage.reason = 'indexeddb-unavailable';
        storage.detail = '此瀏覽器不支援 IndexedDB，已改用 localStorage。';
        storage.modeLabel = 'Browser storage (localStorage)';
      } else {
        storage.mode = 'memory';
        storage.reason = 'localstorage-unavailable';
        storage.detail = '此瀏覽器不允許本機儲存，重新載入後未儲存的內容會遺失。';
        storage.modeLabel = 'Memory (this session)';
      }
      return Promise.resolve(storage.info());
    };

    storage.info = function () {
      return {
        mode: storage.mode,
        reason: storage.reason,
        detail: storage.detail,
        modeLabel: storage.modeLabel
      };
    };

    storage.getDocuments = function () {
      if (storage.mode === 'idb') {
        if (!storage._db) {
          return Promise.reject(storageError('STORAGE_READ_FAILED', '本機資料庫尚未開啟。'));
        }
        var transaction = storage._db.transaction(['documents'], 'readonly');
        var request = transaction.objectStore('documents').getAll();
        return requestToPromise(request).catch(function (error) {
          storage.lastReadWarning = '本機文件讀取失敗，已顯示空白目錄。';
          throw error;
        });
      }
      if (storage.mode === 'local') {
        try {
          return Promise.resolve(storage._readLocalLibrary().documents.slice());
        } catch (error) {
          storage.lastReadWarning = '本機文件讀取失敗，已顯示空白目錄。';
          return Promise.resolve([]);
        }
      }
      return Promise.resolve(Object.keys(storage._memory.documents).map(function (id) {
        return copyDocument(storage._memory.documents[id]);
      }));
    };

    storage.getAllAssets = function () {
      if (storage.mode === 'idb') {
        if (!storage._db) {
          return Promise.reject(storageError('STORAGE_READ_FAILED', '本機資料庫尚未開啟。'));
        }
        var transaction = storage._db.transaction(['assets'], 'readonly');
        return requestToPromise(transaction.objectStore('assets').getAll()).then(function (records) {
          return (records || []).map(assetMetadata);
        });
      }
      if (storage.mode === 'local') {
        try {
          return Promise.resolve(storage._readLocalLibrary().assets.map(assetMetadata));
        } catch (error) {
          storage.lastReadWarning = '本機圖片讀取失敗，已顯示空白目錄。';
          return Promise.resolve([]);
        }
      }
      return Promise.resolve(Object.keys(storage._memory.assets).map(function (id) {
        return assetMetadata(storage._memory.assets[id]);
      }));
    };

    storage._readLocalLibrary = function () {
      var local = storage._localStorage();
      if (!local) {
        throw storageError('STORAGE_READ_FAILED', 'localStorage 不可用。');
      }
      var raw = local.getItem(LIBRARY_KEY);
      if (!raw) {
        return { schemaVersion: Model.SCHEMA_VERSION, updatedAt: Utils.nowIso(), documents: [], assets: [] };
      }
      try {
        var parsed = JSON.parse(raw);
        if (!parsed || parsed.schemaVersion !== Model.SCHEMA_VERSION ||
            Object.prototype.toString.call(parsed.documents) !== '[object Array]' ||
            Object.prototype.toString.call(parsed.assets) !== '[object Array]') {
          throw new Error('Unsupported library payload.');
        }
        return parsed;
      } catch (error) {
        storage._isolateCorrupt(raw, 'library');
        try { local.removeItem(LIBRARY_KEY); } catch (removeError) { /* ignore */ }
        storage.lastReadWarning = '本機文件資料無法讀取，已保留隔離副本並顯示空白目錄。';
        return { schemaVersion: Model.SCHEMA_VERSION, updatedAt: Utils.nowIso(), documents: [], assets: [] };
      }
    };

    storage._writeLocalLibrary = function (library) {
      var local = storage._localStorage();
      if (!local) {
        throw storageError('STORAGE_UNAVAILABLE', 'localStorage 不可用。');
      }
      try {
        local.setItem(LIBRARY_KEY, JSON.stringify(library));
      } catch (error) {
        throw storageError(
          error && (error.name === 'QuotaExceededError' || error.code === 22)
            ? 'STORAGE_FULL'
            : 'STORAGE_WRITE_FAILED',
          '本機儲存空間不足或無法寫入。',
          error
        );
      }
    };

    storage.getDocument = function (documentId) {
      if (!documentId) {
        return Promise.resolve(null);
      }
      if (storage.mode === 'idb') {
        if (!storage._db) {
          return Promise.reject(storageError('STORAGE_READ_FAILED', '本機資料庫尚未開啟。'));
        }
        var transaction = storage._db.transaction(['documents', 'assets'], 'readonly');
        var documentRequest = transaction.objectStore('documents').get(documentId);
        var assetsRequest = transaction.objectStore('assets').index('documentId').getAll(documentId);
        return Promise.all([
          requestToPromise(documentRequest),
          requestToPromise(assetsRequest),
          transactionDone(transaction)
        ]).then(function (values) {
          if (!values[0]) {
            return null;
          }
          return { document: values[0], assets: values[1] };
        });
      }
      if (storage.mode === 'local') {
        try {
          var library = storage._readLocalLibrary();
          var document = null;
          library.documents.forEach(function (entry) {
            if (entry.id === documentId) {
              document = entry;
            }
          });
          if (!document) {
            return Promise.resolve(null);
          }
          var assets = library.assets.filter(function (asset) {
            return asset.documentId === documentId;
          });
          return Promise.resolve({ document: document, assets: assets });
        } catch (error) {
          return Promise.reject(error);
        }
      }
      var memoryDocument = storage._memory.documents[documentId];
      if (!memoryDocument) {
        return Promise.resolve(null);
      }
      var memoryAssets = Object.keys(storage._memory.assets).map(function (id) {
        return storage._memory.assets[id];
      }).filter(function (asset) {
        return asset.documentId === documentId;
      });
      return Promise.resolve({ document: copyDocument(memoryDocument), assets: memoryAssets });
    };

    storage.saveDocument = function (document, assets) {
      if (!document || !document.id) {
        return Promise.reject(storageError('INVALID_DOCUMENT', '文件缺少識別碼。'));
      }
      var documentCopy = copyDocument(document);
      var assetList = (assets || []).map(function (asset) {
        var record = assetMetadata(asset);
        record.blob = toBlob(asset);
        record.dataUrl = asset.dataUrl || '';
        return record;
      });

      if (storage.mode === 'idb') {
        if (!storage._db) {
          return Promise.reject(storageError('STORAGE_WRITE_FAILED', '本機資料庫尚未開啟。'));
        }
        var transaction;
        try {
          transaction = storage._db.transaction(['documents', 'assets'], 'readwrite');
        } catch (error) {
          return Promise.reject(storageError('STORAGE_WRITE_FAILED', '本機資料庫交易失敗。', error));
        }
        var documentsStore = transaction.objectStore('documents');
        var assetsStore = transaction.objectStore('assets');
        documentsStore.put(documentCopy);
        var cursorRequest = assetsStore.index('documentId').openCursor(
          global.IDBKeyRange ? global.IDBKeyRange.only(document.id) : document.id
        );
        cursorRequest.onsuccess = function () {
          var cursor = cursorRequest.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
        assetList.forEach(function (asset) {
          var record = assetMetadata(asset);
          if (asset.blob) {
            record.blob = asset.blob;
          }
          assetsStore.put(record);
        });
        return transactionDone(transaction).then(function () {
          return documentCopy;
        });
      }

      if (storage.mode === 'local') {
        return storage._saveLocalDocument(documentCopy, assets).then(function () {
          return documentCopy;
        });
      }

      storage._memory.documents[document.id] = documentCopy;
      Object.keys(storage._memory.assets).forEach(function (id) {
        if (storage._memory.assets[id].documentId === document.id) {
          delete storage._memory.assets[id];
        }
      });
      (assets || []).forEach(function (asset) {
        storage._memory.assets[asset.id] = Utils.deepClone(asset);
      });
      return Promise.resolve(documentCopy);
    };

    storage._saveLocalDocument = function (document, assets) {
      var library = storage._readLocalLibrary();
      library.documents = library.documents.filter(function (entry) {
        return entry.id !== document.id;
      });
      library.documents.push(document);
      library.assets = library.assets.filter(function (asset) {
        return asset.documentId !== document.id;
      });
      return Promise.all((assets || []).map(function (asset) {
        return toDataUrl(asset).then(function (dataUrl) {
          var record = assetMetadata(asset);
          if (dataUrl) {
            record.dataUrl = dataUrl;
          }
          return record;
        });
      })).then(function (newAssets) {
        library.assets = library.assets.concat(newAssets);
        library.updatedAt = Utils.nowIso();
        storage._writeLocalLibrary(library);
      });
    };

    storage.deleteDocument = function (documentId) {
      if (!documentId) {
        return Promise.resolve(false);
      }
      if (storage.mode === 'idb') {
        if (!storage._db) {
          return Promise.reject(storageError('STORAGE_WRITE_FAILED', '本機資料庫尚未開啟。'));
        }
        var transaction = storage._db.transaction(['documents', 'assets'], 'readwrite');
        transaction.objectStore('documents').delete(documentId);
        var cursorRequest = transaction.objectStore('assets').index('documentId').openCursor(
          global.IDBKeyRange ? global.IDBKeyRange.only(documentId) : documentId
        );
        cursorRequest.onsuccess = function () {
          var cursor = cursorRequest.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
        return transactionDone(transaction).then(function () {
          return storage._deleteMeta('fileTarget:' + documentId).catch(function () {});
        }).then(function () {
          return true;
        });
      }
      if (storage.mode === 'local') {
        var library = storage._readLocalLibrary();
        library.documents = library.documents.filter(function (entry) {
          return entry.id !== documentId;
        });
        library.assets = library.assets.filter(function (asset) {
          return asset.documentId !== documentId;
        });
        storage._writeLocalLibrary(library);
        delete storage._memory.fileTargets[documentId];
        return Promise.resolve(true);
      }
      delete storage._memory.documents[documentId];
      Object.keys(storage._memory.assets).forEach(function (id) {
        if (storage._memory.assets[id].documentId === documentId) {
          delete storage._memory.assets[id];
        }
      });
      delete storage._memory.fileTargets[documentId];
      return Promise.resolve(true);
    };

    storage.clearLibrary = function () {
      if (storage.mode === 'idb') {
        if (!storage._db) {
          return Promise.reject(storageError('STORAGE_WRITE_FAILED', '本機資料庫尚未開啟。'));
        }
        var transaction = storage._db.transaction(['documents', 'assets', 'meta'], 'readwrite');
        transaction.objectStore('documents').clear();
        transaction.objectStore('assets').clear();
        transaction.objectStore('meta').clear();
        transaction.objectStore('meta').put({ key: 'schemaVersion', value: Model.SCHEMA_VERSION });
        return transactionDone(transaction);
      }
      storage._memory.documents = {};
      storage._memory.assets = {};
      storage._memory.fileTargets = {};
      if (storage.mode === 'local' || storage._localAvailable) {
        try {
          var local = storage._localStorage();
          if (local) {
            local.removeItem(LIBRARY_KEY);
            var keys = [];
            for (var i = 0; i < local.length; i += 1) {
              var key = local.key(i);
              if (key && key.indexOf('fileTarget:') === 0) {
                keys.push(key);
              }
            }
            keys.forEach(function (key) { local.removeItem(key); });
          }
        } catch (error) {
          return Promise.reject(storageError('STORAGE_WRITE_FAILED', '本機資料清除失敗。', error));
        }
      }
      return Promise.resolve();
    };

    storage.getPreferences = function () {
      var local = storage._localStorage();
      if (local) {
        try {
          var raw = local.getItem(PREFS_KEY);
          if (raw) {
            var parsed = JSON.parse(raw);
            return Model.normalizePreferences(parsed);
          }
        } catch (error) {
          try {
            var corrupt = local.getItem(PREFS_KEY) || '';
            storage._isolateCorrupt(corrupt, 'preferences');
            local.removeItem(PREFS_KEY);
          } catch (removeError) { /* ignore */ }
        }
      }
      if (storage._memory.preferences) {
        return Model.normalizePreferences(storage._memory.preferences);
      }
      return Model.createPreferences();
    };

    storage.savePreferences = function (preferences) {
      var normalized = Model.normalizePreferences(preferences);
      storage._memory.preferences = normalized;
      var local = storage._localStorage();
      if (local) {
        try {
          local.setItem(PREFS_KEY, JSON.stringify(normalized));
        } catch (error) {
          throw storageError('STORAGE_FULL', '偏好設定無法寫入本機儲存空間。', error);
        }
      }
      return normalized;
    };

    storage.getLastDocumentId = function () {
      return storage.getPreferences().lastDocumentId;
    };

    storage.setLastDocumentId = function (documentId) {
      var preferences = storage.getPreferences();
      preferences.lastDocumentId = documentId || null;
      return storage.savePreferences(preferences);
    };

    storage.getFileTarget = function (documentId) {
      if (!documentId) {
        return Promise.resolve(null);
      }
      if (storage.mode === 'idb') {
        return storage._getMeta('fileTarget:' + documentId).then(function (value) {
          return value || null;
        });
      }
      if (storage._memory.fileTargets[documentId]) {
        return Promise.resolve(storage._memory.fileTargets[documentId]);
      }
      if (storage.mode === 'local') {
        try {
          var local = storage._localStorage();
          var raw = local ? local.getItem('fileTarget:' + documentId) : null;
          return Promise.resolve(raw ? JSON.parse(raw) : null);
        } catch (error) {
          return Promise.resolve(null);
        }
      }
      return Promise.resolve(null);
    };

    storage.setFileTarget = function (documentId, target) {
      if (!documentId) {
        return Promise.resolve();
      }
      storage._memory.fileTargets[documentId] = target;
      if (storage.mode === 'idb') {
        try {
          return Promise.resolve(storage._setMeta('fileTarget:' + documentId, target))
            .catch(function () {
              // Directory handles may not be structured-cloneable in every browser.
            });
        } catch (error) {
          return Promise.resolve();
        }
      }
      if (storage.mode === 'local') {
        try {
          var local = storage._localStorage();
          if (local) {
            local.setItem('fileTarget:' + documentId, JSON.stringify(target));
          }
        } catch (error) {
          // File targets are a progressive enhancement; ignore serialization limits.
        }
      }
      return Promise.resolve();
    };

    storage.removeFileTarget = function (documentId) {
      delete storage._memory.fileTargets[documentId];
      if (storage.mode === 'idb') {
        return storage._deleteMeta('fileTarget:' + documentId);
      }
      if (storage.mode === 'local') {
        try {
          var local = storage._localStorage();
          if (local) {
            local.removeItem('fileTarget:' + documentId);
          }
        } catch (error) { /* ignore */ }
      }
      return Promise.resolve();
    };

    storage.close = function () {
      if (storage._db) {
        storage._db.close();
        storage._db = null;
      }
    };

    return storage;
  }

  var api = {
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    LIBRARY_KEY: LIBRARY_KEY,
    PREFS_KEY: PREFS_KEY,
    createStorage: createStorage
  };

  global.Prompter = global.Prompter || {};
  global.Prompter.storage = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
