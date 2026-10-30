(function (global) {
  'use strict';

  var Utils = global.Prompter.utils;
  var Model = global.Prompter.model;
  var Storage = global.Prompter.storage;
  var Files = global.Prompter.files;
  var Markdown = global.Prompter.markdown;
  var Search = global.Prompter.search;

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
    tabs: [],
    activeTabId: null,
    selectedBlockId: null,
    selectedBlockIds: [],
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
  var directoryDocuments = [];
  var directoryAssets = [];
  var directoryIndex = { entries: [] };
  var directoryRequestId = 0;
  var searchTimer = null;
  var directoryDateFormatter = null;
  var directoryCompactDateFormatter = null;

  function cacheElements() {
    [
      'file-menu-button', 'file-menu', 'edit-menu-button', 'edit-menu',
      'directory-toggle', 'directory', 'directory-overlay',
      'layer-toggle', 'layer-toolbar', 'layer-collapse-all', 'layer-expand-all',
      'app-main', 'preview-button', 'copy-button', 'style-select', 'theme-toggle', 'settings-button',
      'document-title', 'document-status', 'storage-warning', 'storage-warning-text',
      'storage-warning-dismiss', 'search-input', 'clear-search', 'result-count',
      'document-list', 'directory-empty', 'directory-no-results', 'empty-new-button',
      'no-results-clear', 'workspace', 'start-view', 'start-title', 'start-subtitle',
      'recent-list', 'recent-empty', 'start-new-button', 'start-directory-button',
      'start-open-button', 'editor-pane', 'document-tabs', 'document-tab-items',
      'preview-label', 'preview-file-name', 'preview-close', 'canvas', 'canvas-empty',
      'canvas-new-button',
      'toast-region', 'alert-region', 'move-announcer', 'preview-view', 'preview-content',
      'settings-dialog', 'settings-close', 'default-marker', 'follow-system-theme',
      'clear-library-button', 'app-version', 'schema-version',
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

  function settingsModule() {
    return global.Prompter && global.Prompter.settings;
  }

  function effectiveTheme() {
    var settings = settingsModule();
    if (settings && typeof settings.effectiveTheme === 'function') {
      return settings.effectiveTheme(state.preferences);
    }
    return state.preferences.theme === 'dark' ? 'dark' : 'light';
  }

  function applyAppearance() {
    var settings = settingsModule();
    if (settings && typeof settings.applyAppearance === 'function') {
      settings.applyAppearance();
    }
  }

  function savePreferences() {
    var settings = settingsModule();
    if (settings && typeof settings.savePreferences === 'function') {
      return settings.savePreferences();
    }
  }

  function updateStatus() {
    if (!elements['document-status']) {
      return;
    }
    var text = 'No document open';
    if (state.fileBusy) {
      text = state.fileBusyLabel || 'Working…';
    } else if (state.document) {
      if (state.dirty) {
        text = 'Unsaved changes';
      } else if (state.documentPersisted) {
        text = 'Saved';
      } else {
        text = 'New document';
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
    updateMenuState();
  }

  function updateMenuState() {
    var hasDocument = !!state.document;
    var busy = !!state.fileBusy;
    var fileMenu = elements['file-menu'];
    if (fileMenu) {
      Array.prototype.forEach.call(fileMenu.querySelectorAll('[role="menuitem"]'), function (item) {
        var action = item.getAttribute('data-action');
        if (action === 'new' || action === 'open') {
          item.disabled = busy;
        } else {
          item.disabled = busy || !hasDocument;
        }
      });
    }
    var editMenu = elements['edit-menu'];
    if (editMenu) {
      var editor = global.Prompter && global.Prompter.editor;
      var canUndo = !!(editor && typeof editor.canUndo === 'function' && editor.canUndo());
      var canRedo = !!(editor && typeof editor.canRedo === 'function' && editor.canRedo());
      var undoItem = editMenu.querySelector('[data-action="undo"]');
      var redoItem = editMenu.querySelector('[data-action="redo"]');
      if (undoItem) {
        undoItem.disabled = busy || !hasDocument || !canUndo;
      }
      if (redoItem) {
        redoItem.disabled = busy || !hasDocument || !canRedo;
      }
    }
    if (elements['file-menu-button']) {
      elements['file-menu-button'].setAttribute('aria-busy', busy ? 'true' : 'false');
    }
    if (elements['edit-menu-button']) {
      elements['edit-menu-button'].setAttribute('aria-busy', busy ? 'true' : 'false');
    }
  }

  function setFileBusy(busy, label) {
    state.fileBusy = !!busy;
    state.fileBusyLabel = busy ? (label || 'Working…') : '';
    updateStatus();
  }

  function setDirty(dirty) {
    state.dirty = !!dirty;
    updateStatus();
    updateActiveTabDirtyClass();
    if (global.Prompter.preview && typeof global.Prompter.preview.scheduleRefresh === 'function') {
      global.Prompter.preview.scheduleRefresh();
    }
  }

  function activeTab() {
    if (!state.activeTabId) {
      return null;
    }
    for (var i = 0; i < state.tabs.length; i += 1) {
      var tab = state.tabs[i];
      if (tab.document && tab.document.id === state.activeTabId) {
        return tab;
      }
    }
    return null;
  }

  function findTab(documentId) {
    for (var i = 0; i < state.tabs.length; i += 1) {
      if (state.tabs[i].document && state.tabs[i].document.id === documentId) {
        return state.tabs[i];
      }
    }
    return null;
  }

  function makeTab(document, assets, options) {
    var opts = options || {};
    return {
      document: document,
      assets: assets ? assets.slice() : [],
      fileTarget: opts.fileTarget || null,
      documentPersisted: opts.persisted === true,
      dirty: opts.dirty === true,
      composer: opts.composer || null,
      selectedBlockId: null,
      selectedBlockIds: [],
      editingBlockId: null
    };
  }

  function captureActiveTab() {
    var tab = activeTab();
    if (!tab || !state.document) {
      return tab;
    }
    tab.document = state.document;
    tab.assets = state.assets.slice();
    tab.fileTarget = state.fileTarget;
    tab.documentPersisted = state.documentPersisted;
    tab.dirty = state.dirty;
    tab.composer = state.composer;
    tab.selectedBlockId = state.selectedBlockId;
    tab.selectedBlockIds = state.selectedBlockIds.slice();
    tab.editingBlockId = state.editingBlockId;
    return tab;
  }

  function applyTab(tab) {
    if (!tab || !tab.document) {
      return;
    }
    state.document = tab.document;
    state.assets = tab.assets ? tab.assets.slice() : [];
    state.fileTarget = tab.fileTarget || null;
    state.documentPersisted = tab.documentPersisted === true;
    state.dirty = tab.dirty === true;
    state.composer = tab.composer || null;
    state.selectedBlockId = tab.selectedBlockId || null;
    state.selectedBlockIds = tab.selectedBlockIds ? tab.selectedBlockIds.slice() : [];
    state.editingBlockId = tab.editingBlockId || null;
    state.activeTabId = tab.document.id;
  }

  function updateActiveTabDirtyClass() {
    var bar = elements['document-tabs'];
    if (!bar) {
      return;
    }
    var active = bar.querySelector('.document-tab.active');
    if (active) {
      active.classList.toggle('dirty', !!state.dirty);
    }
  }

  function updatePreviewLabel() {
    var label = elements['preview-label'];
    var name = elements['preview-file-name'];
    if (!label || !name) {
      return;
    }
    var previewOpen = !!(global.Prompter.preview &&
      typeof global.Prompter.preview.isOpen === 'function' &&
      global.Prompter.preview.isOpen());
    if (!state.document || !previewOpen) {
      label.hidden = true;
      name.textContent = '';
      return;
    }
    var title = state.document.title || 'Untitled';
    label.hidden = false;
    label.title = title;
    label.setAttribute('aria-label', '預覽文件：' + title);
    name.textContent = title;
  }

  function renderDocumentTabs() {
    var tabs = elements['document-tabs'];
    var items = elements['document-tab-items'];
    var input = elements['document-title'];
    if (!tabs || !items || !input) {
      return;
    }
    updatePreviewLabel();
    items.textContent = '';
    if (!state.tabs.length) {
      tabs.hidden = true;
      input.hidden = true;
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
      return;
    }
    tabs.hidden = false;
    state.tabs.forEach(function (tab) {
      var title = (tab.document && tab.document.title) || 'Untitled';
      var active = tab.document && tab.document.id === state.activeTabId;
      var wrapper = global.document.createElement('div');
      wrapper.className = 'document-tab' + (active ? ' active' : '');
      if (active ? state.dirty : tab.dirty) {
        wrapper.classList.add('dirty');
      }
      wrapper.setAttribute('role', 'presentation');
      wrapper.setAttribute('data-document-id', tab.document.id);
      if (active) {
        input.hidden = false;
        input.disabled = false;
        input.value = state.document ? state.document.title : title;
        input.setAttribute('role', 'tab');
        input.setAttribute('aria-selected', 'true');
        wrapper.appendChild(input);
      } else {
        var label = global.document.createElement('button');
        label.type = 'button';
        label.className = 'document-tab-label';
        label.setAttribute('role', 'tab');
        label.setAttribute('aria-selected', 'false');
        label.title = title;
        label.textContent = title;
        label.addEventListener('click', function () {
          activateTab(tab.document.id, { focus: 'canvas' });
        });
        wrapper.appendChild(label);
      }
      var close = global.document.createElement('button');
      close.type = 'button';
      close.className = 'document-tab-close';
      close.setAttribute('aria-label', '關閉文件「' + title + '」');
      close.title = '關閉';
      close.textContent = '×';
      close.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        closeTab(tab.document.id);
      });
      wrapper.appendChild(close);
      items.appendChild(wrapper);
    });
    if (!input.parentNode && state.tabs.length) {
      input.hidden = true;
    }
  }

  function updateTitleInput() {
    var input = elements['document-title'];
    if (!input) {
      return;
    }
    if (!state.document) {
      input.value = '';
      input.disabled = true;
      input.placeholder = 'Untitled';
      input.hidden = true;
    } else {
      input.disabled = false;
      input.value = state.document.title;
      input.hidden = false;
    }
    renderDocumentTabs();
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
    var settings = settingsModule();
    if (settings && typeof settings.syncDialog === 'function') {
      settings.syncDialog();
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

  function closePreviewIfOpen() {
    var preview = global.Prompter && global.Prompter.preview;
    if (preview && typeof preview.isOpen === 'function' && preview.isOpen() &&
        typeof preview.close === 'function') {
      preview.close();
    }
  }

  function openPreviewByDefault() {
    var preview = global.Prompter && global.Prompter.preview;
    if (preview && typeof preview.openDefault === 'function') {
      preview.openDefault();
    }
  }

  function rememberDocument(documentId) {
    if (!state.storage || typeof state.storage.setLastDocumentId !== 'function') {
      return;
    }
    try {
      var saved = state.storage.setLastDocumentId(documentId || null);
      if (saved && typeof saved.catch === 'function') {
        saved.catch(function () {});
      }
    } catch (error) {
      // Remembering the last document is optional.
    }
  }

  function renderActiveDocument(options) {
    var opts = options || {};
    updateTitleInput();
    updateStatus();
    updateStartView();
    if (global.Prompter.editor && typeof global.Prompter.editor.render === 'function') {
      global.Prompter.editor.render();
    }
    renderDirectory();
    if (global.Prompter.preview && typeof global.Prompter.preview.isOpen === 'function' &&
        global.Prompter.preview.isOpen() &&
        typeof global.Prompter.preview.refresh === 'function') {
      global.Prompter.preview.refresh();
    }
    if (opts.focus === 'composer' && global.Prompter.editor &&
        typeof global.Prompter.editor.focusComposer === 'function') {
      global.Prompter.editor.focusComposer();
    } else if (opts.focus === 'canvas' && elements.canvas) {
      elements.canvas.focus();
    }
  }

  function activateTab(documentId, options) {
    var tab = findTab(documentId);
    if (!tab) {
      return Promise.resolve(false);
    }
    if (state.activeTabId !== documentId) {
      captureActiveTab();
      applyTab(tab);
      renderActiveDocument(options);
    } else {
      renderDocumentTabs();
      updateStatus();
    }
    if (state.documentPersisted) {
      rememberDocument(documentId);
    }
    return Promise.resolve(true);
  }

  function clearAllTabs(forgetLast) {
    state.tabs = [];
    state.activeTabId = null;
    state.document = null;
    state.assets = [];
    state.fileTarget = null;
    state.documentPersisted = false;
    state.selectedBlockId = null;
    state.selectedBlockIds = [];
    state.editingBlockId = null;
    state.composer = null;
    state.dirty = false;
    if (forgetLast) {
      rememberDocument(null);
    }
    updateTitleInput();
    updateStatus();
    if (global.Prompter.preview && typeof global.Prompter.preview.isOpen === 'function' &&
        global.Prompter.preview.isOpen() &&
        typeof global.Prompter.preview.close === 'function') {
      global.Prompter.preview.close();
    }
    if (elements['canvas-empty']) {
      elements['canvas-empty'].hidden = false;
    }
    if (global.Prompter.editor && typeof global.Prompter.editor.render === 'function') {
      global.Prompter.editor.render();
    }
    renderDirectory();
    if (global.Prompter.search && typeof global.Prompter.search.refreshDirectory === 'function') {
      global.Prompter.search.refreshDirectory();
    }
  }

  function setDocument(document, assets, options) {
    var opts = options || {};
    if (!document) {
      clearAllTabs();
      return;
    }
    var hadActiveDocument = !!activeTab();
    var existing = findTab(document.id);
    if (opts.newTab && existing) {
      return activateTab(document.id, opts);
    }
    if (opts.newTab || !activeTab()) {
      captureActiveTab();
      var tab = makeTab(document, assets, opts);
      state.tabs.push(tab);
      applyTab(tab);
    } else {
      var active = activeTab();
      active.document = document;
      active.assets = assets ? assets.slice() : [];
      active.fileTarget = opts.fileTarget !== undefined ? opts.fileTarget : active.fileTarget;
      active.documentPersisted = opts.persisted === true;
      active.dirty = opts.dirty === true;
      active.composer = null;
      active.selectedBlockId = null;
      active.selectedBlockIds = [];
      active.editingBlockId = null;
      state.activeTabId = document.id;
      applyTab(active);
    }
    if (state.documentPersisted) {
      rememberDocument(document.id);
    }
    renderActiveDocument({ focus: opts.focus });
    if (opts.newTab || !hadActiveDocument) {
      openPreviewByDefault();
    }
  }

  function closeTab(documentId) {
    if (state.fileBusy) {
      return Promise.resolve(false);
    }
    var tab = findTab(documentId);
    if (!tab) {
      return Promise.resolve(false);
    }
    var previousActiveId = state.activeTabId;
    if (previousActiveId !== documentId && !tab.dirty) {
      var cleanIndex = state.tabs.indexOf(tab);
      if (cleanIndex !== -1) {
        state.tabs.splice(cleanIndex, 1);
        renderDocumentTabs();
        updateStatus();
        return Promise.resolve(true);
      }
    }
    var temporaryActivation = previousActiveId !== documentId;
    if (temporaryActivation) {
      activateTab(documentId, { focus: 'canvas' });
    }

    function finish(proceed) {
      if (!proceed) {
        if (temporaryActivation && previousActiveId && findTab(previousActiveId)) {
          activateTab(previousActiveId, { focus: 'canvas' });
        }
        return false;
      }
      var index = state.tabs.indexOf(tab);
      if (index === -1) {
        return false;
      }
      state.tabs.splice(index, 1);
      if (!state.tabs.length) {
        clearAllTabs(true);
        updateStartView({ focus: true });
        return true;
      }
      if (temporaryActivation && previousActiveId && findTab(previousActiveId)) {
        activateTab(previousActiveId, { focus: 'canvas' });
      } else {
        var next = state.tabs[Math.min(index, state.tabs.length - 1)];
        applyTab(next);
        rememberDocument(next.documentPersisted ? next.document.id : null);
        renderActiveDocument({ focus: 'canvas' });
      }
      return true;
    }

    if (state.dirty) {
      return confirmUnsaved().then(finish);
    }
    return Promise.resolve(finish(true));
  }

  function clearDocument() {
    clearAllTabs();
  }

  function sortedDocuments(documents) {
    return (documents || []).slice().sort(function (left, right) {
      var leftTime = Date.parse(left.updatedAt) || 0;
      var rightTime = Date.parse(right.updatedAt) || 0;
      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      return String(left.id).localeCompare(String(right.id));
    });
  }

  function formatUpdatedAt(value) {
    var date = new Date(value);
    if (!value || isNaN(date.getTime())) {
      return '更新時間未知';
    }
    if (directoryDateFormatter === null) {
      try {
        directoryDateFormatter = new Intl.DateTimeFormat('zh-Hant', {
          dateStyle: 'medium',
          timeStyle: 'short'
        });
      } catch (error) {
        directoryDateFormatter = false;
      }
    }
    if (directoryDateFormatter) {
      return directoryDateFormatter.format(date);
    }
    return date.toLocaleString();
  }

  function formatDirectoryUpdatedAt(value) {
    var date = new Date(value);
    if (!value || isNaN(date.getTime())) {
      return '更新時間未知';
    }
    if (directoryCompactDateFormatter === null) {
      try {
        directoryCompactDateFormatter = new Intl.DateTimeFormat('zh-Hant', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
      } catch (error) {
        directoryCompactDateFormatter = false;
      }
    }
    if (directoryCompactDateFormatter) {
      return directoryCompactDateFormatter.format(date);
    }
    return date.toLocaleString();
  }

  function renderRecentDocuments() {
    var list = elements['recent-list'];
    if (!list) {
      return;
    }
    var documents = sortedDocuments(directoryDocuments).slice(0, 10);
    var fragment = global.document.createDocumentFragment();
    documents.forEach(function (document) {
      var entry = global.document.createElement('div');
      entry.setAttribute('role', 'listitem');
      var button = global.document.createElement('button');
      button.type = 'button';
      button.className = 'recent-item';
      button.setAttribute('data-document-id', document.id);
      var fileText = document.fileName || 'untitled.md';
      var modified = formatUpdatedAt(document.updatedAt);
      button.setAttribute('aria-label',
        '開啟文件：' + fileText + '，' + modified);
      var file = global.document.createElement('span');
      file.className = 'recent-item-file';
      file.textContent = fileText;
      var time = global.document.createElement('time');
      time.className = 'recent-item-time';
      if (document.updatedAt) {
        time.setAttribute('datetime', document.updatedAt);
      }
      time.textContent = modified;
      button.appendChild(file);
      button.appendChild(time);
      entry.appendChild(button);
      fragment.appendChild(entry);
    });
    list.textContent = '';
    list.appendChild(fragment);
    list.hidden = documents.length === 0;
    if (elements['recent-empty']) {
      elements['recent-empty'].hidden = documents.length > 0;
    }
    if (elements['start-subtitle']) {
      elements['start-subtitle'].textContent = documents.length === 0
        ? '最近編輯的文件'
        : '最近更新的 ' + documents.length + ' 份文件';
    }
  }

  function updateStartView(options) {
    var view = elements['start-view'];
    if (!view) {
      return;
    }
    var visible = !state.document;
    view.hidden = !visible;
    if (elements.workspace) {
      elements.workspace.classList.toggle('start-open', visible);
    }
    if (!visible) {
      return;
    }
    renderRecentDocuments();
    if (options && options.focus) {
      var target = listFirstRecent() || elements['start-new-button'] || view;
      if (target && typeof target.focus === 'function') {
        target.focus();
      }
    }
  }

  function listFirstRecent() {
    if (!elements['recent-list']) {
      return null;
    }
    return elements['recent-list'].querySelector('.recent-item');
  }

  function updateSearchControls() {
    var hasQuery = Search.normalizeQuery(state.searchQuery) !== '';
    if (elements['clear-search']) {
      elements['clear-search'].hidden = !hasQuery;
    }
  }

  function renderDirectory() {
    var list = elements['document-list'];
    if (!list) {
      return;
    }
    var query = Search.normalizeQuery(state.searchQuery);
    var matches = Search.searchIndex(directoryIndex, query);
    var currentId = state.document ? state.document.id : null;
    var fragment = global.document.createDocumentFragment();

    matches.forEach(function (document) {
      var entry = global.document.createElement('div');
      entry.setAttribute('role', 'listitem');
      var button = global.document.createElement('button');
      button.type = 'button';
      button.className = 'document-item';
      button.setAttribute('data-document-id', document.id);
      if (document.id === currentId) {
        button.setAttribute('aria-current', 'true');
      }
      var fileText = document.fileName || 'untitled.md';
      var modified = formatDirectoryUpdatedAt(document.updatedAt);
      button.setAttribute('aria-label', '開啟文件：' + fileText + '，' + modified);
      var file = global.document.createElement('span');
      file.className = 'document-item-file';
      file.textContent = fileText;
      var time = global.document.createElement('time');
      time.className = 'document-item-time';
      if (document.updatedAt) {
        time.setAttribute('datetime', document.updatedAt);
      }
      time.textContent = modified;
      button.appendChild(file);
      button.appendChild(time);
      entry.appendChild(button);
      fragment.appendChild(entry);
    });

    list.textContent = '';
    list.appendChild(fragment);
    list.hidden = matches.length === 0;

    var libraryEmpty = directoryDocuments.length === 0;
    if (elements['directory-empty']) {
      elements['directory-empty'].hidden = !libraryEmpty;
    }
    if (elements['directory-no-results']) {
      elements['directory-no-results'].hidden = libraryEmpty || matches.length > 0 || !query;
    }
    if (elements['result-count']) {
      elements['result-count'].textContent = query
        ? matches.length + ' 個結果'
        : matches.length + ' 個文件';
    }
    updateSearchControls();
    if (!state.document) {
      updateStartView();
    }
  }

  function refreshDirectory() {
    if (!state.storage) {
      return Promise.resolve();
    }
    var requestId = directoryRequestId + 1;
    directoryRequestId = requestId;
    var documentsPromise = state.storage.getDocuments();
    var assetsPromise = typeof state.storage.getAllAssets === 'function'
      ? state.storage.getAllAssets()
      : Promise.resolve([]);
    return Promise.all([documentsPromise, assetsPromise]).then(function (values) {
      if (requestId !== directoryRequestId) {
        return;
      }
      directoryDocuments = sortedDocuments(values[0]);
      directoryAssets = values[1] || [];
      directoryIndex = Search.buildIndex(directoryDocuments, directoryAssets);
      renderDirectory();
    }).catch(function (error) {
      if (requestId !== directoryRequestId) {
        return;
      }
      directoryDocuments = [];
      directoryAssets = [];
      directoryIndex = Search.buildIndex([], []);
      renderDirectory();
      if (state.storage && state.storage.lastReadWarning) {
        announce(state.storage.lastReadWarning, true);
      } else {
        showError(error);
      }
    });
  }

  function clearLastDocumentId() {
    try {
      var result = state.storage.setLastDocumentId(null);
      if (result && typeof result.catch === 'function') {
        result.catch(function () {});
      }
    } catch (error) {
      // Forgetting a missing document is best-effort.
    }
  }

  function restoreLastDocument() {
    var documentId = state.storage && typeof state.storage.getLastDocumentId === 'function'
      ? state.storage.getLastDocumentId()
      : null;
    if (!documentId) {
      return Promise.resolve(null);
    }
    return state.storage.getDocument(documentId).then(function (loaded) {
      if (!loaded || !loaded.document) {
        clearLastDocumentId();
        return null;
      }
      setDocument(loaded.document, loaded.assets, { persisted: true });
      return state.storage.getFileTarget(documentId).catch(function () {
        return null;
      }).then(function (target) {
        state.fileTarget = target || null;
        return loaded;
      });
    }).catch(function () {
      return null;
    });
  }

  function clearDirectorySearch() {
    if (searchTimer) {
      global.clearTimeout(searchTimer);
      searchTimer = null;
    }
    state.searchQuery = '';
    if (elements['search-input']) {
      elements['search-input'].value = '';
    }
    updateSearchControls();
  }

  function scheduleDirectoryRender() {
    if (searchTimer) {
      global.clearTimeout(searchTimer);
    }
    searchTimer = global.setTimeout(function () {
      searchTimer = null;
      renderDirectory();
    }, 80);
  }

  function setDirectoryOpen(open) {
    if (!elements.directory) {
      return;
    }
    elements.directory.classList.toggle('open', !!open);
    if (elements['app-main']) {
      elements['app-main'].classList.toggle('directory-open', !!open);
    }
    if (elements['directory-toggle']) {
      elements['directory-toggle'].setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (elements['directory-overlay']) {
      elements['directory-overlay'].hidden = !open;
    }
    if (global.Prompter.editor && typeof global.Prompter.editor.reflowLayout === 'function') {
      global.Prompter.editor.reflowLayout();
    }
  }

  function closeDirectoryDrawer() {
    if (!elements.directory) {
      return;
    }
    var wasOpen = elements.directory.classList.contains('open');
    setDirectoryOpen(false);
    if (wasOpen && elements['directory-toggle']) {
      elements['directory-toggle'].focus();
    }
  }

  function closeDirectoryDrawerIfNarrow() {
    if (global.innerWidth <= 768) {
      closeDirectoryDrawer();
    }
  }

  function openDirectoryDocument(documentId) {
    if (!documentId || state.fileBusy) {
      return Promise.resolve({ ok: false });
    }
    if (state.document && state.document.id === documentId) {
      closeDirectoryDrawerIfNarrow();
      return Promise.resolve({ ok: true, same: true });
    }
    return requestOpenSavedDocument(documentId).then(function (result) {
      if (result && result.ok) {
        closeDirectoryDrawerIfNarrow();
        renderDirectory();
      }
      return result;
    });
  }

  function newDocument() {
    var preferences = state.preferences;
    var document = Model.createPromptDocument({
      title: 'Untitled',
      blocks: [],
      trailingNewline: true
    });
    captureActiveTab();
    var tab = makeTab(document, [], { persisted: false, dirty: false });
    tab.composer = Model.createComposer({
      mode: 'initial',
      anchorBlockId: null,
      x: Files.COLUMN_X,
      y: Files.COLUMN_START_Y,
      marker: preferences.defaultMarker,
      text: ''
    });
    state.tabs.push(tab);
    applyTab(tab);
    if (elements['canvas-empty']) {
      elements['canvas-empty'].hidden = true;
    }
    clearDirectorySearch();
    renderActiveDocument({ focus: 'composer' });
    openPreviewByDefault();
  }

  function menuPairs() {
    return [
      {
        button: elements['file-menu-button'],
        menu: elements['file-menu']
      },
      {
        button: elements['edit-menu-button'],
        menu: elements['edit-menu']
      }
    ].filter(function (pair) {
      return !!(pair.button && pair.menu);
    });
  }

  function toggleMenu(button, menu, open) {
    if (!button || !menu) {
      return;
    }
    var shouldOpen = open === undefined ? menu.hidden : !!open;
    if (shouldOpen) {
      menuPairs().forEach(function (pair) {
        if (pair.menu !== menu) {
          toggleMenu(pair.button, pair.menu, false);
        }
      });
      updateMenuState();
    }
    menu.hidden = !shouldOpen;
    button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    if (shouldOpen) {
      var first = menuItems(menu)[0];
      if (first) {
        first.focus();
      }
    }
  }

  function toggleFileMenu(open) {
    toggleMenu(elements['file-menu-button'], elements['file-menu'], open);
  }

  function toggleEditMenu(open) {
    toggleMenu(elements['edit-menu-button'], elements['edit-menu'], open);
  }

  function menuItems(menu) {
    if (!menu) {
      return [];
    }
    return Array.prototype.slice.call(
      menu.querySelectorAll('[role="menuitem"]')
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
    newDocument();
    return Promise.resolve(true);
  }

  function requestOpenPicker() {
    return (Files && typeof Files.requestOpenPicker === 'function')
      ? Files.requestOpenPicker()
      : Promise.resolve({ ok: false, error: new Error('開啟功能尚未就緒。') });
  }

  function requestOpenSavedDocument(documentId) {
    if (findTab(documentId)) {
      return activateTab(documentId, { focus: 'canvas' }).then(function (activated) {
        return activated
          ? { ok: true, document: state.document, assets: state.assets }
          : { ok: false };
      });
    }
    if (Files && typeof Files.openSavedDocument === 'function') {
      return Files.openSavedDocument(documentId);
    }
    return Promise.resolve({ ok: false, error: new Error('開啟功能尚未就緒。') });
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

  function handleEditAction(action) {
    toggleEditMenu(false);
    if (action === 'undo' || action === 'redo') {
      var editor = global.Prompter && global.Prompter.editor;
      var method = action === 'undo' ? 'undo' : 'redo';
      if (!editor || typeof editor[method] !== 'function') {
        toast('History is not available yet.');
        return;
      }
      var changed = !!editor[method]();
      if (!changed) {
        toast(action === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.');
      }
      return;
    }
    toast('This action is not available yet.');
  }

  function setShortcutLabels() {
    var menu = elements['edit-menu'];
    if (!menu) {
      return;
    }
    var platform = String(
      (global.navigator && (global.navigator.platform ||
        (global.navigator.userAgentData && global.navigator.userAgentData.platform))) || ''
    );
    var isMac = /Mac|iPhone|iPad|iPod/.test(platform);
    var labels = isMac
      ? { undo: '⌘Z', redo: '⇧⌘Z' }
      : { undo: 'Ctrl+Z', redo: 'Ctrl+Shift+Z' };
    Array.prototype.forEach.call(menu.querySelectorAll('[data-shortcut]'), function (item) {
      var key = item.getAttribute('data-shortcut');
      item.textContent = labels[key] || '';
    });
  }

  function wireMenus() {
    setShortcutLabels();
    menuPairs().forEach(function (pair) {
      var button = pair.button;
      var menu = pair.menu;
      var isFileMenu = menu === elements['file-menu'];
      button.addEventListener('click', function () {
        toggleMenu(button, menu, menu.hidden);
      });
      button.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          toggleMenu(button, menu, true);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          toggleMenu(button, menu, true);
          var items = menuItems(menu);
          if (items.length) {
            items[items.length - 1].focus();
          }
        }
      });
      menu.addEventListener('click', function (event) {
        var item = event.target.closest('[role="menuitem"]');
        if (!item) {
          return;
        }
        if (isFileMenu) {
          handleFileAction(item.getAttribute('data-action'));
        } else {
          handleEditAction(item.getAttribute('data-action'));
        }
      });
      menu.addEventListener('keydown', function (event) {
        var items = menuItems(menu);
        var index = items.indexOf(global.document.activeElement);
        if (event.key === 'Tab') {
          toggleMenu(button, menu, false);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          toggleMenu(button, menu, false);
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
    });
    global.document.addEventListener('click', function (event) {
      menuPairs().forEach(function (pair) {
        if (!pair.menu.hidden && !pair.menu.contains(event.target) &&
            !pair.button.contains(event.target)) {
          toggleMenu(pair.button, pair.menu, false);
        }
      });
    });
  }

  function wireHeader() {
    if (elements['preview-button']) {
      elements['preview-button'].addEventListener('click', function () {
        if (!state.document) {
          return;
        }
        var preview = global.Prompter.preview;
        if (preview && typeof preview.toggle === 'function') {
          preview.toggle(elements['preview-button']);
        } else if (preview && typeof preview.open === 'function') {
          preview.open(elements['preview-button']);
        } else {
          toast('預覽將在後續版本提供。');
        }
      });
    }
    if (elements['preview-close']) {
      elements['preview-close'].addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var preview = global.Prompter.preview;
        if (preview && typeof preview.close === 'function') {
          preview.close();
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

  function wireDirectory() {
    if (elements['directory-toggle']) {
      elements['directory-toggle'].addEventListener('click', function () {
        var open = !elements.directory.classList.contains('open');
        setDirectoryOpen(open);
        if (open) {
          var first = elements['search-input'] ||
            elements.directory.querySelector('input, button');
          if (first) {
            first.focus();
          }
        }
      });
    }
    if (elements['directory-overlay']) {
      elements['directory-overlay'].addEventListener('click', function () {
        closeDirectoryDrawer();
      });
    }
    if (elements['search-input']) {
      elements['search-input'].addEventListener('input', function () {
        state.searchQuery = elements['search-input'].value;
        updateSearchControls();
        scheduleDirectoryRender();
      });
    }
    if (elements['clear-search']) {
      elements['clear-search'].addEventListener('click', function () {
        clearDirectorySearch();
        renderDirectory();
        if (elements['search-input']) {
          elements['search-input'].focus();
        }
      });
    }
    if (elements['no-results-clear']) {
      elements['no-results-clear'].addEventListener('click', function () {
        clearDirectorySearch();
        renderDirectory();
        if (elements['search-input']) {
          elements['search-input'].focus();
        }
      });
    }
    if (elements['empty-new-button']) {
      elements['empty-new-button'].addEventListener('click', function () {
        requestNewDocument();
      });
    }
    if (elements['canvas-new-button']) {
      elements['canvas-new-button'].addEventListener('click', function () {
        requestNewDocument();
      });
    }
    if (elements['document-list']) {
      elements['document-list'].addEventListener('click', function (event) {
        var item = event.target.closest ? event.target.closest('[data-document-id]') : null;
        if (!item) {
          return;
        }
        openDirectoryDocument(item.getAttribute('data-document-id'));
      });
    }
  }

  function wireStartView() {
    if (elements['recent-list']) {
      elements['recent-list'].addEventListener('click', function (event) {
        var item = event.target.closest
          ? event.target.closest('[data-document-id]')
          : null;
        if (!item) {
          return;
        }
        openDirectoryDocument(item.getAttribute('data-document-id'));
      });
    }
    if (elements['start-new-button']) {
      elements['start-new-button'].addEventListener('click', function () {
        requestNewDocument();
      });
    }
    if (elements['start-directory-button']) {
      elements['start-directory-button'].addEventListener('click', function () {
        setDirectoryOpen(true);
        if (elements['search-input']) {
          elements['search-input'].focus();
        }
      });
    }
    if (elements['start-open-button']) {
      elements['start-open-button'].addEventListener('click', function () {
        requestOpenPicker();
      });
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
      updatePreviewLabel();
      setDirty(true);
    });
    elements['document-title'].addEventListener('blur', function () {
      if (!state.document || !elements['document-title'].isConnected) {
        return;
      }
      state.document.title = Model.normalizeTitle(elements['document-title'].value);
      elements['document-title'].value = state.document.title;
      updatePreviewLabel();
      renderDirectory();
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
      captureActiveTab();
      if (!state.tabs.some(function (tab) { return tab.dirty; })) {
        return undefined;
      }
      event.preventDefault();
      event.returnValue = '';
      return '';
    });
    global.document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        menuPairs().forEach(function (pair) {
          if (!pair.menu.hidden) {
            toggleMenu(pair.button, pair.menu, false);
            pair.button.focus();
          }
        });
        if (elements.directory.classList.contains('open')) {
          closeDirectoryDrawer();
        }
      }
    });
  }

  function init() {
    cacheElements();
    state.storage = Storage.createStorage();
    wireMenus();
    wireHeader();
    if (global.Prompter.settings && typeof global.Prompter.settings.init === 'function') {
      global.Prompter.settings.init();
    }
    wireDirectory();
    wireStartView();
    setDirectoryOpen(false);
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
      return refreshDirectory().then(function () {
        updateStartView();
        state.initialized = true;
        return state;
      });
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
    activateTab: activateTab,
    closeTab: closeTab,
    findTab: findTab,
    setDirty: setDirty,
    setFileBusy: setFileBusy,
    updateStatus: updateStatus,
    updateTitleInput: updateTitleInput,
    updatePreviewLabel: updatePreviewLabel,
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
    toggleEditMenu: toggleEditMenu,
    handleFileAction: handleFileAction,
    handleEditAction: handleEditAction,
    requestNewDocument: requestNewDocument,
    requestOpenPicker: requestOpenPicker,
    requestOpenSavedDocument: requestOpenSavedDocument,
    insertImagesFromPicker: insertImagesFromPicker,
    refreshDirectory: refreshDirectory,
    renderDirectory: renderDirectory,
    restoreLastDocument: restoreLastDocument,
    openDirectoryDocument: openDirectoryDocument,
    clearDirectorySearch: clearDirectorySearch
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
