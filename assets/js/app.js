(function (global) {
  'use strict';

  var Utils = global.Prompter.utils;
  var Model = global.Prompter.model;
  var Storage = global.Prompter.storage;
  var Files = global.Prompter.files;
  var Markdown = global.Prompter.markdown;

  var VERSION = '1.0.0';

  function byId(id) {
    return global.document.getElementById(id);
  }

  var state = {
    storage: null,
    storageInfo: null,
    preferences: Model.createPreferences(),
    document: null,
    assets: [],
    fileTarget: null,
    documentPersisted: false,
    selectedBlockId: null,
    editingBlockId: null,
    composer: null,
    dirty: false,
    fileBusy: false,
    fileBusyLabel: '',
    searchQuery: '',
    initialized: false,
    storageWarningDismissed: false
  };

  var elements = {};
  var unsavedResolver = null;
  var unsavedSaving = false;

  function cacheElements() {
    [
      'file-menu-button', 'file-menu', 'directory-toggle', 'directory', 'directory-overlay',
      'preview-button', 'copy-button', 'style-select', 'theme-toggle', 'settings-button',
      'document-title', 'document-status', 'storage-warning', 'storage-warning-text',
      'storage-warning-dismiss', 'search-input', 'clear-search', 'result-count',
      'document-list', 'directory-empty', 'directory-no-results', 'empty-new-button',
      'no-results-clear', 'workspace', 'canvas', 'canvas-empty', 'canvas-new-button',
      'toast-region', 'alert-region', 'move-announcer', 'preview-dialog', 'preview-content',
      'preview-close', 'settings-dialog', 'settings-close', 'default-marker', 'show-grid',
      'follow-system-button', 'clear-library-button', 'app-version', 'schema-version',
      'storage-mode-label', 'clear-dialog', 'clear-cancel', 'clear-confirm',
      'unsaved-dialog', 'unsaved-save', 'unsaved-discard', 'unsaved-cancel',
      'manual-copy-dialog', 'manual-copy-close', 'manual-copy-text', 'manual-copy-select',
      'filename-dialog', 'filename-form', 'filename-input', 'filename-cancel',
      'filename-confirm', 'conflict-dialog', 'conflict-list', 'conflict-cancel',
      'conflict-choose', 'conflict-overwrite', 'open-input', 'image-input'
    ].forEach(function (id) {
      elements[id] = byId(id);
    });
  }

  function effectiveTheme() {
    if (state.preferences.theme === 'light' || state.preferences.theme === 'dark') {
      return state.preferences.theme;
    }
    return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function applyAppearance() {
    var root = global.document.documentElement;
    root.setAttribute('data-theme', effectiveTheme());
    root.setAttribute('data-style', state.preferences.style);
    if (elements['style-select']) {
      elements['style-select'].value = state.preferences.style;
    }
    if (elements.canvas) {
      elements.canvas.classList.toggle('grid-hidden', !state.preferences.showGrid);
    }
    if (elements['show-grid']) {
      elements['show-grid'].checked = state.preferences.showGrid;
    }
    if (elements['default-marker']) {
      elements['default-marker'].value = state.preferences.defaultMarker;
    }
  }

  function savePreferences() {
    try {
      state.preferences = state.storage.savePreferences(state.preferences);
      state.preferences = Model.normalizePreferences(state.preferences);
    } catch (error) {
      showError(error);
    }
    applyAppearance();
  }

  function updateStatus() {
    if (!elements['document-status']) {
      return;
    }
    var text = '尚未開啟文件';
    if (state.fileBusy) {
      text = state.fileBusyLabel || '處理中…';
    } else if (state.document) {
      if (state.dirty) {
        text = '尚未儲存的變更';
      } else if (state.documentPersisted) {
        text = '已儲存';
      } else {
        text = '新文件';
      }
    }
    elements['document-status'].textContent = text;
    elements['document-status'].classList.toggle('dirty', !!state.dirty);
    elements['document-status'].classList.toggle('busy', !!state.fileBusy);
    if (elements['copy-button']) {
      elements['copy-button'].disabled = !state.document ||
        !state.document.blocks || state.document.blocks.length === 0;
    }
    if (elements['preview-button']) {
      elements['preview-button'].disabled = !state.document;
    }
    updateFileMenuState();
  }

  function updateFileMenuState() {
    var menu = elements['file-menu'];
    if (!menu) {
      return;
    }
    var hasDocument = !!state.document;
    var busy = !!state.fileBusy;
    Array.prototype.forEach.call(menu.querySelectorAll('[role="menuitem"]'), function (item) {
      var action = item.getAttribute('data-action');
      if (action === 'new' || action === 'open') {
        item.disabled = busy;
      } else {
        item.disabled = busy || !hasDocument;
      }
    });
    if (elements['file-menu-button']) {
      elements['file-menu-button'].setAttribute('aria-busy', busy ? 'true' : 'false');
    }
  }

  function setFileBusy(busy, label) {
    state.fileBusy = !!busy;
    state.fileBusyLabel = busy ? (label || '處理中…') : '';
    updateStatus();
  }

  function setDirty(dirty) {
    state.dirty = !!dirty;
    updateStatus();
  }

  function updateTitleInput() {
    if (!elements['document-title']) {
      return;
    }
    if (!state.document) {
      elements['document-title'].value = '';
      elements['document-title'].disabled = true;
      elements['document-title'].placeholder = 'Untitled';
    } else {
      elements['document-title'].disabled = false;
      elements['document-title'].value = state.document.title;
    }
  }

  function toast(message) {
    if (!elements['toast-region']) {
      return;
    }
    var node = global.document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    elements['toast-region'].appendChild(node);
    setTimeout(function () {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }, 3600);
  }

  function announce(message, assertive) {
    if (assertive && elements['alert-region']) {
      var alert = global.document.createElement('div');
      alert.className = 'alert';
      alert.textContent = message;
      elements['alert-region'].appendChild(alert);
      setTimeout(function () {
        if (alert.parentNode) {
          alert.parentNode.removeChild(alert);
        }
      }, 7000);
      return;
    }
    if (elements['move-announcer']) {
      elements['move-announcer'].textContent = '';
      elements['move-announcer'].textContent = message;
    }
  }

  function showError(error) {
    var message = error && error.message ? error.message : String(error);
    announce(message, true);
    if (global.console && global.console.error) {
      global.console.error(error);
    }
  }

  function showStorageWarning() {
    if (!elements['storage-warning'] || state.storageWarningDismissed) {
      return;
    }
    var info = state.storageInfo || (state.storage && state.storage.info());
    if (!info) {
      return;
    }
    if (info.mode === 'idb' && info.reason === 'ok') {
      elements['storage-warning'].hidden = true;
      return;
    }
    var modeText = info.mode === 'local' ? '瀏覽器本機儲存（localStorage）' :
      (info.mode === 'memory' ? '本次工作階段記憶體' : info.modeLabel);
    elements['storage-warning-text'].textContent =
      '目前儲存模式：' + modeText + '。' + (info.detail || '') +
      ' 未儲存的內容可能無法在重新載入後保留。';
    elements['storage-warning'].hidden = false;
    if (elements['storage-mode-label']) {
      elements['storage-mode-label'].textContent = info.modeLabel || modeText;
    }
  }

  function refreshStorageInfo() {
    if (!state.storage) {
      return;
    }
    state.storageInfo = state.storage.info();
    if (state.storage.lastReadWarning) {
      announce(state.storage.lastReadWarning, true);
    }
    showStorageWarning();
  }

  function syncSettingsDialog() {
    if (elements['app-version']) {
      elements['app-version'].textContent = VERSION;
    }
    if (elements['schema-version']) {
      elements['schema-version'].textContent = String(Model.SCHEMA_VERSION);
    }
    if (elements['storage-mode-label']) {
      var info = state.storageInfo || (state.storage && state.storage.info());
      elements['storage-mode-label'].textContent = info ? info.modeLabel : '—';
    }
    if (elements['default-marker']) {
      elements['default-marker'].value = state.preferences.defaultMarker;
    }
    if (elements['show-grid']) {
      elements['show-grid'].checked = state.preferences.showGrid;
    }
  }

  function openDialog(dialog) {
    if (!dialog) {
      return;
    }
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog(dialog) {
    if (!dialog) {
      return;
    }
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  function setDocument(document, assets, options) {
    var opts = options || {};
    state.document = document || null;
    state.assets = assets ? assets.slice() : [];
    state.documentPersisted = opts.persisted === true;
    state.selectedBlockId = null;
    state.editingBlockId = null;
    state.composer = null;
    state.dirty = opts.dirty === true;
    updateTitleInput();
    updateStatus();
    if (opts.persisted && document) {
      try {
        var saved = state.storage.setLastDocumentId(document.id);
        if (saved && typeof saved.catch === 'function') {
          saved.catch(function () {});
        }
      } catch (error) {
        // Remembering the last document is optional; keep the open flow usable.
      }
    }
    if (global.Prompter.editor && typeof global.Prompter.editor.render === 'function') {
      global.Prompter.editor.render();
    }
  }

  function clearDocument() {
    setDocument(null, [], { persisted: false });
    if (elements['canvas-empty']) {
      elements['canvas-empty'].hidden = false;
    }
    if (global.Prompter.editor && typeof global.Prompter.editor.render === 'function') {
      global.Prompter.editor.render();
    }
    if (global.Prompter.search && typeof global.Prompter.search.refreshDirectory === 'function') {
      global.Prompter.search.refreshDirectory();
    }
  }

  function newDocument() {
    var preferences = state.preferences;
    var document = Model.createPromptDocument({
      title: 'Untitled',
      blocks: [],
      trailingNewline: true
    });
    setDocument(document, [], { persisted: false });
    state.fileTarget = null;
    state.composer = Model.createComposer({
      mode: 'initial',
      anchorBlockId: null,
      x: Files.COLUMN_X,
      y: Files.COLUMN_START_Y,
      marker: preferences.defaultMarker,
      text: ''
    });
    if (elements['canvas-empty']) {
      elements['canvas-empty'].hidden = true;
    }
    if (global.Prompter.editor && typeof global.Prompter.editor.render === 'function') {
      global.Prompter.editor.render();
    }
    if (global.Prompter.editor && typeof global.Prompter.editor.focusComposer === 'function') {
      global.Prompter.editor.focusComposer();
    }
    updateTitleInput();
    updateStatus();
  }

  function toggleFileMenu(open) {
    var button = elements['file-menu-button'];
    var menu = elements['file-menu'];
    if (!button || !menu) {
      return;
    }
    var shouldOpen = open === undefined ? menu.hidden : !!open;
    menu.hidden = !shouldOpen;
    button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    if (shouldOpen) {
      var first = menuItems()[0];
      if (first) {
        first.focus();
      }
    }
  }

  function menuItems() {
    return Array.prototype.slice.call(
      elements['file-menu'].querySelectorAll('[role="menuitem"]')
    ).filter(function (item) {
      return !item.disabled;
    });
  }

  function setUnsavedBusy(busy) {
    ['unsaved-save', 'unsaved-discard', 'unsaved-cancel'].forEach(function (id) {
      if (elements[id]) {
        elements[id].disabled = busy;
      }
    });
    if (elements['unsaved-save']) {
      elements['unsaved-save'].textContent = busy ? '儲存中…' : '儲存';
    }
    if (elements['unsaved-dialog']) {
      elements['unsaved-dialog'].setAttribute('aria-busy', busy ? 'true' : 'false');
    }
  }

  function settleUnsaved(proceed) {
    if (!unsavedResolver) {
      return;
    }
    var resolver = unsavedResolver;
    unsavedResolver = null;
    unsavedSaving = false;
    setUnsavedBusy(false);
    closeDialog(elements['unsaved-dialog']);
    resolver(!!proceed);
  }

  function confirmUnsaved() {
    if (!state.dirty) {
      return Promise.resolve(true);
    }
    var dialog = elements['unsaved-dialog'];
    if (!dialog) {
      return Promise.resolve(true);
    }
    return new Promise(function (resolve) {
      unsavedResolver = resolve;
      openDialog(dialog);
      if (elements['unsaved-save']) {
        elements['unsaved-save'].focus();
      }
    });
  }

  function requestNewDocument() {
    if (!state.dirty) {
      newDocument();
      return Promise.resolve(true);
    }
    return confirmUnsaved().then(function (proceed) {
      if (!proceed) {
        return false;
      }
      newDocument();
      return true;
    });
  }

  function requestOpenPicker() {
    if (!state.dirty) {
      return (Files && typeof Files.requestOpenPicker === 'function')
        ? Files.requestOpenPicker()
        : Promise.resolve({ ok: false, error: new Error('開啟功能尚未就緒。') });
    }
    return confirmUnsaved().then(function (proceed) {
      if (!proceed) {
        return { ok: false, canceled: true };
      }
      if (Files && typeof Files.requestOpenPicker === 'function') {
        return Files.requestOpenPicker();
      }
      return { ok: false, error: new Error('開啟功能尚未就緒。') };
    });
  }

  function requestOpenSavedDocument(documentId) {
    if (!state.dirty) {
      if (Files && typeof Files.openSavedDocument === 'function') {
        return Files.openSavedDocument(documentId);
      }
      return Promise.resolve({ ok: false, error: new Error('開啟功能尚未就緒。') });
    }
    return confirmUnsaved().then(function (proceed) {
      if (!proceed) {
        return { ok: false, canceled: true };
      }
      if (Files && typeof Files.openSavedDocument === 'function') {
        return Files.openSavedDocument(documentId);
      }
      return { ok: false, error: new Error('開啟功能尚未就緒。') };
    });
  }

  function wireUnsavedDialog() {
    if (elements['unsaved-discard']) {
      elements['unsaved-discard'].addEventListener('click', function () {
        if (!unsavedSaving) {
          settleUnsaved(true);
        }
      });
    }
    if (elements['unsaved-cancel']) {
      elements['unsaved-cancel'].addEventListener('click', function () {
        if (!unsavedSaving) {
          settleUnsaved(false);
        }
      });
    }
    if (elements['unsaved-save']) {
      elements['unsaved-save'].addEventListener('click', function () {
        if (!unsavedResolver || unsavedSaving) {
          return;
        }
        if (!Files || typeof Files.saveCurrentDocument !== 'function') {
          showError(new Error('儲存功能尚未就緒。'));
          return;
        }
        unsavedSaving = true;
        setUnsavedBusy(true);
        closeDialog(elements['unsaved-dialog']);
        Files.saveCurrentDocument({ saveAs: false }).then(function (result) {
          unsavedSaving = false;
          setUnsavedBusy(false);
          if (result && result.ok) {
            settleUnsaved(true);
            return;
          }
          if (unsavedResolver) {
            openDialog(elements['unsaved-dialog']);
            if (elements['unsaved-save']) {
              elements['unsaved-save'].focus();
            }
            if (result && result.canceled) {
              toast('已取消儲存，文件仍未儲存。');
            }
          }
        }).catch(function (error) {
          unsavedSaving = false;
          setUnsavedBusy(false);
          if (unsavedResolver) {
            openDialog(elements['unsaved-dialog']);
            if (elements['unsaved-save']) {
              elements['unsaved-save'].focus();
            }
          }
          showError(error);
        });
      });
    }
    if (elements['unsaved-dialog']) {
      elements['unsaved-dialog'].addEventListener('cancel', function (event) {
        event.preventDefault();
        if (!unsavedSaving) {
          settleUnsaved(false);
        }
      });
    }
  }

  function wireImagePicker() {
    var input = elements['image-input'];
    if (!input) {
      return;
    }
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      if (files.length === 0) {
        return;
      }
      if (!state.document) {
        newDocument();
      }
      if (global.Prompter.editor && typeof global.Prompter.editor.insertImageFiles === 'function') {
        global.Prompter.editor.insertImageFiles(files);
      } else {
        toast('圖片插入功能尚未就緒。');
      }
    });
  }

  function insertImagesFromPicker() {
    if (!state.document) {
      newDocument();
    }
    if (!elements['image-input']) {
      return;
    }
    elements['image-input'].value = '';
    elements['image-input'].click();
  }

  function wireOpenPicker() {
    var input = elements['open-input'];
    if (!input) {
      return;
    }
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      if (files.length === 0) {
        return;
      }
      if (!Files || typeof Files.handleOpenFiles !== 'function') {
        toast('開啟功能尚未就緒。');
        return;
      }
      Files.handleOpenFiles(files);
    });
  }

  function handleFileAction(action) {
    toggleFileMenu(false);
    if (action === 'new') {
      requestNewDocument();
      return;
    }
    if (action === 'open') {
      requestOpenPicker();
      return;
    }
    if (action === 'insert-image') {
      insertImagesFromPicker();
      return;
    }
    if (action === 'save' || action === 'save-as') {
      if (!state.document) {
        toast('目前沒有開啟的文件。');
        return;
      }
      if (!Files || typeof Files.saveCurrentDocument !== 'function') {
        toast('儲存功能尚未就緒。');
        return;
      }
      Files.saveCurrentDocument({ saveAs: action === 'save-as' });
      return;
    }
    toast('此功能將在後續版本提供。');
  }

  function wireFileMenu() {
    var button = elements['file-menu-button'];
    var menu = elements['file-menu'];
    if (!button || !menu) {
      return;
    }
    button.addEventListener('click', function () {
      toggleFileMenu(menu.hidden);
    });
    button.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        toggleFileMenu(true);
      }
    });
    menu.addEventListener('click', function (event) {
      var item = event.target.closest('[role="menuitem"]');
      if (!item) {
        return;
      }
      handleFileAction(item.getAttribute('data-action'));
    });
    menu.addEventListener('keydown', function (event) {
      var items = menuItems();
      var index = items.indexOf(global.document.activeElement);
      if (event.key === 'Tab') {
        toggleFileMenu(false);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        toggleFileMenu(false);
        button.focus();
        return;
      }
      if (items.length === 0) {
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[(index + 1) % items.length].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[(index - 1 + items.length) % items.length].focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        items[0].focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        items[items.length - 1].focus();
      }
    });
    global.document.addEventListener('click', function (event) {
      if (!menu.hidden && !menu.contains(event.target) && !button.contains(event.target)) {
        toggleFileMenu(false);
      }
    });
  }

  function wireHeader() {
    if (elements['theme-toggle']) {
      elements['theme-toggle'].addEventListener('click', function () {
        state.preferences.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
        savePreferences();
      });
    }
    if (elements['style-select']) {
      elements['style-select'].addEventListener('change', function () {
        state.preferences.style = elements['style-select'].value === 'graphite' ? 'graphite' : 'paper';
        savePreferences();
      });
    }
    if (elements['settings-button']) {
      elements['settings-button'].addEventListener('click', function () {
        syncSettingsDialog();
        openDialog(elements['settings-dialog']);
      });
    }
    if (elements['settings-close']) {
      elements['settings-close'].addEventListener('click', function () {
        closeDialog(elements['settings-dialog']);
      });
    }
    if (elements['settings-dialog']) {
      elements['settings-dialog'].addEventListener('close', function () {
        if (elements['settings-button']) {
          elements['settings-button'].focus();
        }
      });
    }
    if (elements['preview-button']) {
      elements['preview-button'].addEventListener('click', function () {
        if (!state.document) {
          return;
        }
        if (global.Prompter.preview && typeof global.Prompter.preview.open === 'function') {
          global.Prompter.preview.open(elements['preview-button']);
        } else {
          toast('預覽將在後續版本提供。');
        }
      });
    }
    if (elements['copy-button']) {
      elements['copy-button'].addEventListener('click', function () {
        if (global.Prompter.clipboard && typeof global.Prompter.clipboard.copy === 'function') {
          global.Prompter.clipboard.copy();
        } else {
          toast('複製將在後續版本提供。');
        }
      });
    }
  }

  function wireSettings() {
    if (elements['default-marker']) {
      elements['default-marker'].addEventListener('change', function () {
        state.preferences.defaultMarker = elements['default-marker'].value;
        savePreferences();
        if (global.Prompter.editor && typeof global.Prompter.editor.setDefaultMarker === 'function') {
          global.Prompter.editor.setDefaultMarker(state.preferences.defaultMarker);
        }
      });
    }
    if (elements['show-grid']) {
      elements['show-grid'].addEventListener('change', function () {
        state.preferences.showGrid = elements['show-grid'].checked;
        savePreferences();
      });
    }
    if (elements['follow-system-button']) {
      elements['follow-system-button'].addEventListener('click', function () {
        state.preferences.theme = 'system';
        savePreferences();
        toast('已改為跟隨系統明暗。');
      });
    }
    if (elements['clear-library-button']) {
      elements['clear-library-button'].addEventListener('click', function () {
        openDialog(elements['clear-dialog']);
      });
    }
    if (elements['clear-cancel']) {
      elements['clear-cancel'].addEventListener('click', function () {
        closeDialog(elements['clear-dialog']);
      });
    }
    if (elements['clear-confirm']) {
      elements['clear-confirm'].addEventListener('click', function () {
        state.storage.clearLibrary().then(function () {
          closeDialog(elements['clear-dialog']);
          closeDialog(elements['settings-dialog']);
          clearDocument();
          toast('本機資料庫已清除，磁碟上的檔案不受影響。');
        }).catch(showError);
      });
    }
  }

  function wireDirectory() {
    if (elements['directory-toggle']) {
      elements['directory-toggle'].addEventListener('click', function () {
        var open = !elements.directory.classList.contains('open');
        elements.directory.classList.toggle('open', open);
        elements['directory-toggle'].setAttribute('aria-expanded', open ? 'true' : 'false');
        if (elements['directory-overlay']) {
          elements['directory-overlay'].hidden = !open;
        }
        if (open) {
          var first = elements.directory.querySelector('input, button');
          if (first) {
            first.focus();
          }
        }
      });
    }
    if (elements['directory-overlay']) {
      elements['directory-overlay'].addEventListener('click', function () {
        elements.directory.classList.remove('open');
        elements['directory-toggle'].setAttribute('aria-expanded', 'false');
        elements['directory-overlay'].hidden = true;
        elements['directory-toggle'].focus();
      });
    }
    if (elements['empty-new-button']) {
      elements['empty-new-button'].addEventListener('click', newDocument);
    }
    if (elements['canvas-new-button']) {
      elements['canvas-new-button'].addEventListener('click', newDocument);
    }
  }

  function wireTitle() {
    if (!elements['document-title']) {
      return;
    }
    elements['document-title'].addEventListener('input', function () {
      if (!state.document) {
        return;
      }
      state.document.title = elements['document-title'].value;
      setDirty(true);
    });
    elements['document-title'].addEventListener('blur', function () {
      if (!state.document) {
        return;
      }
      state.document.title = Model.normalizeTitle(elements['document-title'].value);
      elements['document-title'].value = state.document.title;
    });
  }

  function wireGlobalEvents() {
    if (elements['storage-warning-dismiss']) {
      elements['storage-warning-dismiss'].addEventListener('click', function () {
        state.storageWarningDismissed = true;
        if (elements['storage-warning']) {
          elements['storage-warning'].hidden = true;
        }
      });
    }
    global.addEventListener('error', function (event) {
      if (event && event.error) {
        showError(event.error);
      }
    });
    global.addEventListener('unhandledrejection', function (event) {
      showError(event && event.reason ? event.reason : new Error('未處理的錯誤。'));
    });
    global.addEventListener('beforeunload', function (event) {
      if (!state.dirty) {
        return undefined;
      }
      event.preventDefault();
      event.returnValue = '';
      return '';
    });
    if (global.matchMedia) {
      var media = global.matchMedia('(prefers-color-scheme: dark)');
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', function () {
          if (state.preferences.theme === 'system') {
            applyAppearance();
          }
        });
      }
    }
    global.document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (!elements['file-menu'].hidden) {
          toggleFileMenu(false);
          elements['file-menu-button'].focus();
        }
        if (elements.directory.classList.contains('open')) {
          elements.directory.classList.remove('open');
          elements['directory-toggle'].setAttribute('aria-expanded', 'false');
          elements['directory-overlay'].hidden = true;
          elements['directory-toggle'].focus();
        }
      }
    });
  }

  function init() {
    cacheElements();
    state.storage = Storage.createStorage();
    wireFileMenu();
    wireHeader();
    wireSettings();
    wireDirectory();
    wireTitle();
    wireImagePicker();
    wireOpenPicker();
    wireUnsavedDialog();
    wireGlobalEvents();
    updateTitleInput();
    updateStatus();
    return state.storage.init().then(function (info) {
      state.storageInfo = info;
      state.preferences = state.storage.getPreferences();
      applyAppearance();
      refreshStorageInfo();
      syncSettingsDialog();
      state.initialized = true;
      if (global.Prompter.editor && typeof global.Prompter.editor.init === 'function') {
        global.Prompter.editor.init();
      }
      if (global.Prompter.preview && typeof global.Prompter.preview.init === 'function') {
        global.Prompter.preview.init();
      }
      if (global.Prompter.clipboard && typeof global.Prompter.clipboard.init === 'function') {
        global.Prompter.clipboard.init();
      }
      if (global.Prompter.search && typeof global.Prompter.search.init === 'function') {
        global.Prompter.search.init();
      }
      return state;
    }).catch(function (error) {
      showError(error);
      state.initialized = true;
      return state;
    });
  }

  var api = {
    VERSION: VERSION,
    state: state,
    elements: elements,
    init: init,
    newDocument: newDocument,
    setDocument: setDocument,
    clearDocument: clearDocument,
    setDirty: setDirty,
    setFileBusy: setFileBusy,
    updateStatus: updateStatus,
    updateTitleInput: updateTitleInput,
    applyAppearance: applyAppearance,
    savePreferences: savePreferences,
    effectiveTheme: effectiveTheme,
    refreshStorageInfo: refreshStorageInfo,
    syncSettingsDialog: syncSettingsDialog,
    openDialog: openDialog,
    closeDialog: closeDialog,
    toast: toast,
    announce: announce,
    showError: showError,
    toggleFileMenu: toggleFileMenu,
    handleFileAction: handleFileAction,
    requestNewDocument: requestNewDocument,
    requestOpenPicker: requestOpenPicker,
    requestOpenSavedDocument: requestOpenSavedDocument,
    insertImagesFromPicker: insertImagesFromPicker
  };

  global.Prompter = global.Prompter || {};
  global.Prompter.app = api;

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
