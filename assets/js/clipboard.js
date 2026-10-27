(function (global) {
  'use strict';

  var initialized = false;

  function getApp() {
    return global.Prompter.app;
  }

  function getEditor() {
    return global.Prompter.editor;
  }

  function hasOpenDialog() {
    return !!global.document.querySelector('dialog[open]');
  }

  function isImageFile(file) {
    if (!file) {
      return false;
    }
    var type = String(file.type || '').toLowerCase();
    if (type.indexOf('image/') === 0) {
      return true;
    }
    var name = String(file.name || '');
    return /\.(?:png|jpe?g|gif|webp|svg)$/i.test(name);
  }

  function collectClipboardPayload(event, editing) {
    var data = event.clipboardData || global.clipboardData;
    if (!data) {
      return null;
    }
    var files = [];
    var seen = [];
    var items = data.items;
    if (items && items.length) {
      for (var i = 0; i < items.length; i += 1) {
        var item = items[i];
        if (!item || item.kind !== 'file') {
          continue;
        }
        var file = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
        if (isImageFile(file)) {
          files.push(file);
          seen.push(file);
        }
      }
    }
    if (files.length === 0 && data.files && data.files.length) {
      for (var k = 0; k < data.files.length; k += 1) {
        if (isImageFile(data.files[k])) {
          files.push(data.files[k]);
        }
      }
    }
    var text = '';
    if (!editing && typeof data.getData === 'function') {
      text = data.getData('text/plain') || '';
    }
    return { files: files, text: text, data: data };
  }

  function targetIsComposerOrOtherInput(target, editing) {
    if (!target || !target.closest) {
      return false;
    }
    if (editing) {
      return false;
    }
    return !!target.closest('input, textarea, select, [contenteditable="true"]');
  }

  function handlePaste(event) {
    if (hasOpenDialog()) {
      return;
    }
    var app = getApp();
    var editor = getEditor();
    if (!app || !editor) {
      return;
    }
    var canvas = app.elements.canvas;
    var target = event.target;
    if (!canvas || !target) {
      return;
    }
    var state = app.state;
    var editingId = state && state.editingBlockId;
    var targetInCanvas = target === canvas ||
      (typeof canvas.contains === 'function' && canvas.contains(target));
    var targetIsEditorInput = !!(target.closest && target.closest('.block-edit-input'));
    if (!targetInCanvas && !targetIsEditorInput) {
      return;
    }
    if (!editingId && targetIsComposerOrOtherInput(target, false)) {
      return;
    }
    var editing = !!editingId || targetIsEditorInput;
    var payload = collectClipboardPayload(event, editing);
    if (!payload) {
      return;
    }
    if (payload.files.length === 0 && !String(payload.text || '').trim()) {
      return;
    }

    if (payload.files.length > 0) {
      event.preventDefault();
    }

    if (editing) {
      if (payload.files.length === 0) {
        return;
      }
      editor.insertImageFiles(payload.files, {
        anchorBlockId: editingId || null,
        keepEditing: true
      });
      return;
    }

    event.preventDefault();
    editor.insertPastedContent({
      files: payload.files,
      text: payload.text,
      anchorBlockId: state.selectedBlockId || null
    });
  }

  function copy() {
    if (getApp()) {
      getApp().toast('複製將在後續版本提供。');
    }
  }

  function init() {
    if (initialized) {
      return;
    }
    initialized = true;
    var app = getApp();
    var canvas = app && app.elements ? app.elements.canvas : null;
    if (!canvas) {
      return;
    }
    canvas.addEventListener('paste', handlePaste);
  }

  var api = {
    init: init,
    copy: copy,
    handlePaste: handlePaste
  };

  global.Prompter = global.Prompter || {};
  global.Prompter.clipboard = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
