(function (global) {
  'use strict';

  var Model = (typeof module === 'object' && module.exports)
    ? require('./model.js')
    : global.Prompter.model;

  var initialized = false;
  var clearBusy = false;

  function getApp() {
    return global.Prompter && global.Prompter.app;
  }

  function getState() {
    var app = getApp();
    return app ? app.state : null;
  }

  function getElements() {
    var app = getApp();
    return app ? app.elements : {};
  }

  function normalizePreferences(input) {
    return Model.normalizePreferences(input || {});
  }

  function effectiveTheme(preferences, options) {
    var value = preferences && preferences.theme;
    if (value === 'light' || value === 'dark') {
      return value;
    }
    var dark = options && typeof options.dark === 'boolean'
      ? options.dark
      : !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
    return dark ? 'dark' : 'light';
  }

  function preflightAppearance(preferences, options) {
    var normalized = normalizePreferences(preferences);
    return {
      theme: effectiveTheme(normalized, options),
      style: normalized.style
    };
  }

  function applyAppearance() {
    var app = getApp();
    var state = getState();
    var elements = getElements();
    if (!app || !state || !global.document) {
      return;
    }
    var preferences = normalizePreferences(state.preferences);
    var theme = effectiveTheme(preferences);
    var root = global.document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-style', preferences.style);
    if (elements['style-select']) {
      elements['style-select'].value = preferences.style;
    }
    if (elements.canvas) {
      elements.canvas.classList.toggle('grid-hidden', !preferences.showGrid);
    }
    if (elements['show-grid']) {
      elements['show-grid'].checked = preferences.showGrid;
    }
    if (elements['default-marker']) {
      elements['default-marker'].value = preferences.defaultMarker;
    }
    if (elements['theme-toggle']) {
      var nextLabel = theme === 'dark' ? 'Switch to light' : 'Switch to dark';
      elements['theme-toggle'].setAttribute('aria-label', nextLabel);
      elements['theme-toggle'].setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    }
    if (global.Prompter.editor && typeof global.Prompter.editor.reflowLayout === 'function') {
      global.Prompter.editor.reflowLayout();
    }
  }

  function savePreferences() {
    var app = getApp();
    var state = getState();
    if (!app || !state) {
      return;
    }
    var candidate = normalizePreferences(state.preferences);
    try {
      state.preferences = normalizePreferences(state.storage.savePreferences(candidate));
    } catch (error) {
      state.preferences = candidate;
      app.showError(error);
    }
    applyAppearance();
    return state.preferences;
  }

  function updatePreferences(changes) {
    var state = getState();
    if (!state) {
      return;
    }
    var next = normalizePreferences(state.preferences);
    Object.keys(changes || {}).forEach(function (key) {
      next[key] = changes[key];
    });
    state.preferences = normalizePreferences(next);
    return savePreferences();
  }

  function syncDialog() {
    var app = getApp();
    var state = getState();
    var elements = getElements();
    if (!app || !state) {
      return;
    }
    if (elements['app-version']) {
      elements['app-version'].textContent = app.VERSION;
    }
    if (elements['schema-version']) {
      elements['schema-version'].textContent = String(Model.SCHEMA_VERSION);
    }
    if (elements['storage-mode-label']) {
      var info = state.storageInfo || (state.storage && state.storage.info());
      elements['storage-mode-label'].textContent = info ? info.modeLabel : '—';
    }
    applyAppearance();
  }

  function setDefaultMarker(marker) {
    var preferences = updatePreferences({ defaultMarker: marker });
    if (preferences && global.Prompter.editor &&
        typeof global.Prompter.editor.setDefaultMarker === 'function') {
      global.Prompter.editor.setDefaultMarker(preferences.defaultMarker);
    }
  }

  function clearLibrary() {
    var app = getApp();
    var state = getState();
    var elements = getElements();
    if (!app || !state || clearBusy) {
      return Promise.resolve(false);
    }
    clearBusy = true;
    var confirmButton = elements['clear-confirm'];
    var originalLabel = confirmButton ? confirmButton.textContent : '';
    if (confirmButton) {
      confirmButton.disabled = true;
      confirmButton.textContent = '清除中…';
    }

    function finish(value) {
      clearBusy = false;
      if (confirmButton) {
        confirmButton.disabled = false;
        confirmButton.textContent = originalLabel || '清除';
      }
      return value;
    }

    return Promise.resolve(state.storage.clearLibrary()).then(function () {
      try {
        state.storage.setLastDocumentId(null);
      } catch (error) {
        // Forgetting the removed document is best-effort; the clear itself succeeded.
      }
      if (typeof app.clearDirectorySearch === 'function') {
        app.clearDirectorySearch();
      }
      app.closeDialog(elements['clear-dialog']);
      app.closeDialog(elements['settings-dialog']);
      app.clearDocument();
      return app.refreshDirectory();
    }).then(function () {
      app.toast('本機資料庫已清除，磁碟上的檔案不受影響。');
      return true;
    }).catch(function (error) {
      app.showError(error);
      return Promise.resolve(app.refreshDirectory()).then(function () {
        return false;
      }, function () {
        return false;
      });
    }).then(finish);
  }

  function onMediaChange() {
    var state = getState();
    if (state && state.preferences.theme === 'system') {
      applyAppearance();
    }
  }

  function init() {
    var app = getApp();
    if (!app || initialized) {
      return;
    }
    initialized = true;
    var elements = app.elements;

    if (elements['theme-toggle']) {
      elements['theme-toggle'].addEventListener('click', function () {
        updatePreferences({
          theme: effectiveTheme(getState().preferences) === 'dark' ? 'light' : 'dark'
        });
      });
    }
    if (elements['style-select']) {
      elements['style-select'].addEventListener('change', function () {
        updatePreferences({ style: elements['style-select'].value });
      });
    }
    if (elements['default-marker']) {
      elements['default-marker'].addEventListener('change', function () {
        setDefaultMarker(elements['default-marker'].value);
      });
    }
    if (elements['show-grid']) {
      elements['show-grid'].addEventListener('change', function () {
        updatePreferences({ showGrid: elements['show-grid'].checked });
      });
    }
    if (elements['follow-system-button']) {
      elements['follow-system-button'].addEventListener('click', function () {
        updatePreferences({ theme: 'system' });
        app.toast('已改為跟隨系統明暗。');
      });
    }
    if (elements['settings-button']) {
      elements['settings-button'].addEventListener('click', function () {
        syncDialog();
        app.openDialog(elements['settings-dialog']);
      });
    }
    if (elements['settings-close']) {
      elements['settings-close'].addEventListener('click', function () {
        app.closeDialog(elements['settings-dialog']);
      });
    }
    if (elements['settings-dialog']) {
      elements['settings-dialog'].addEventListener('close', function () {
        if (elements['settings-button']) {
          elements['settings-button'].focus();
        }
      });
    }
    if (elements['clear-library-button']) {
      elements['clear-library-button'].addEventListener('click', function () {
        app.openDialog(elements['clear-dialog']);
      });
    }
    if (elements['clear-cancel']) {
      elements['clear-cancel'].addEventListener('click', function () {
        app.closeDialog(elements['clear-dialog']);
      });
    }
    if (elements['clear-confirm']) {
      elements['clear-confirm'].addEventListener('click', function () {
        clearLibrary();
      });
    }

    if (global.matchMedia) {
      var media = global.matchMedia('(prefers-color-scheme: dark)');
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', onMediaChange);
      } else if (typeof media.addListener === 'function') {
        media.addListener(onMediaChange);
      }
    }
  }

  function isSupportedTheme(theme) {
    return theme === 'light' || theme === 'dark' || theme === 'system';
  }

  function isSupportedStyle(style) {
    return Model.isSupportedStyle(style);
  }

  var api = {
    SCHEMA_VERSION: Model.SCHEMA_VERSION,
    SUPPORTED_STYLES: Model.SUPPORTED_STYLES,
    DEFAULT_STYLE: Model.DEFAULT_STYLE,
    init: init,
    normalizePreferences: normalizePreferences,
    effectiveTheme: effectiveTheme,
    preflightAppearance: preflightAppearance,
    applyAppearance: applyAppearance,
    savePreferences: savePreferences,
    updatePreferences: updatePreferences,
    syncDialog: syncDialog,
    clearLibrary: clearLibrary,
    isSupportedTheme: isSupportedTheme,
    isSupportedStyle: isSupportedStyle
  };

  global.Prompter = global.Prompter || {};
  global.Prompter.settings = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
