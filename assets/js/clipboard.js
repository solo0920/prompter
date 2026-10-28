(function (global) {
  'use strict';

  var Preview = (typeof module === 'object' && module.exports)
    ? require('./preview.js')
    : global.Prompter.preview;
  var Markdown = (typeof module === 'object' && module.exports)
    ? require('./markdown.js')
    : global.Prompter.markdown;

  var DEFAULT_MAX_DATA_URL_LENGTH = 8 * 1024 * 1024;
  var initialized = false;
  var lastCopyTrigger = null;
  var copyInFlight = null;

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

  function clipboardError(code, message) {
    var error = new Error(message || code);
    error.code = code;
    return error;
  }

  function uniqueStrings(values) {
    var seen = {};
    var result = [];
    (values || []).forEach(function (value) {
      var text = String(value == null ? '' : value);
      if (text && !seen[text]) {
        seen[text] = true;
        result.push(text);
      }
    });
    return result;
  }

  function blockHasImage(block) {
    if (!block) {
      return false;
    }
    if (block.type === 'image') {
      return true;
    }
    return block.type === 'text' &&
      !!Markdown.matchImageLine(String(block.text == null ? '' : block.text));
  }

  function documentHasImages(document) {
    return !!document && !!document.blocks && document.blocks.some(blockHasImage);
  }

  function buildClipboardPayload(document, assets, options) {
    var input = options || {};
    if (!document || !document.blocks || document.blocks.length === 0) {
      return Promise.reject(clipboardError('EMPTY_DOCUMENT', '文件是空的，沒有可複製的內容。'));
    }
    var assetList = assets || [];
    var markdown = Markdown.serializeDocument(document, { assets: assetList });
    var hasImages = documentHasImages(document);
    var limit = input.maxDataUrlLength === undefined
      ? DEFAULT_MAX_DATA_URL_LENGTH
      : Number(input.maxDataUrlLength);
    return Preview.buildImageDataUrlMap(assetList, { maxDataUrlLength: limit })
      .then(function (urls) {
        var rendered = Preview.renderMarkdown(markdown, {
          assets: assetList,
          imageUrls: urls,
          mathOutput: 'mathml'
        });
        return {
          markdown: markdown,
          html: rendered.html,
          hasImages: hasImages,
          omittedImages: uniqueStrings(rendered.missingImages)
        };
      });
  }

  function supportsClipboardWrite() {
    return !!(global.navigator && global.navigator.clipboard &&
      typeof global.navigator.clipboard.write === 'function' &&
      typeof global.ClipboardItem === 'function' && typeof global.Blob === 'function');
  }

  function makeClipboardItem(payload) {
    var items = {};
    items['text/plain'] = new global.Blob([payload.markdown], {
      type: 'text/plain;charset=utf-8'
    });
    if (payload.hasImages) {
      items['text/html'] = new global.Blob([payload.html], {
        type: 'text/html;charset=utf-8'
      });
    }
    try {
      if (global.ClipboardItem.supports &&
          global.ClipboardItem.supports('text/markdown')) {
        items['text/markdown'] = new global.Blob([payload.markdown], {
          type: 'text/markdown;charset=utf-8'
        });
      }
    } catch (error) {
      // Optional flavor; unsupported types are ignored.
    }
    return new global.ClipboardItem(items);
  }

  function writeWithAsyncClipboard(payload) {
    if (!supportsClipboardWrite()) {
      return Promise.resolve(false);
    }
    try {
      return Promise.resolve(global.navigator.clipboard.write([
        makeClipboardItem(payload)
      ])).then(function () {
        return true;
      }, function () {
        return false;
      });
    } catch (error) {
      return Promise.resolve(false);
    }
  }

  function writeWithExecCommand(payload) {
    if (!global.document || typeof global.document.execCommand !== 'function' ||
        !global.document.body) {
      return false;
    }
    var container = global.document.createElement('div');
    container.setAttribute('contenteditable', 'true');
    container.setAttribute('aria-hidden', 'true');
    container.style.position = 'fixed';
    container.style.left = '-99999px';
    container.style.top = '0';
    container.style.opacity = '0';
    if (payload.hasImages) {
      container.innerHTML = payload.html;
    } else {
      container.textContent = payload.markdown;
    }
    global.document.body.appendChild(container);

    var selection = typeof global.getSelection === 'function' ? global.getSelection() : null;
    var previousRanges = [];
    if (selection) {
      for (var i = 0; i < selection.rangeCount; i += 1) {
        previousRanges.push(selection.getRangeAt(i));
      }
    }

    var handled = false;
    function onCopy(event) {
      if (!event || !event.clipboardData) {
        return;
      }
      event.preventDefault();
      event.clipboardData.setData('text/plain', payload.markdown);
      if (payload.hasImages) {
        event.clipboardData.setData('text/html', payload.html);
      }
      handled = true;
    }

    var copied = false;
    try {
      if (selection) {
        var range = global.document.createRange();
        range.selectNodeContents(container);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      global.document.addEventListener('copy', onCopy, true);
      copied = global.document.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    global.document.removeEventListener('copy', onCopy, true);
    if (selection) {
      selection.removeAllRanges();
      previousRanges.forEach(function (range) {
        try {
          selection.addRange(range);
        } catch (error) {
          // A stale selection can fail to restore; copying still succeeded.
        }
      });
    }
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    return copied && handled;
  }

  function showManualCopy(payload) {
    var app = getApp();
    if (!app || !app.elements) {
      return false;
    }
    var dialog = app.elements['manual-copy-dialog'];
    var textarea = app.elements['manual-copy-text'];
    if (!dialog || !textarea) {
      return false;
    }
    textarea.value = payload.markdown;
    if (typeof app.openDialog === 'function') {
      app.openDialog(dialog);
    } else {
      dialog.showModal();
    }
    textarea.focus();
    try {
      textarea.select();
    } catch (error) {
      textarea.setSelectionRange(0, textarea.value.length);
    }
    return true;
  }

  function reportCopySuccess(payload, hadImages) {
    var app = getApp();
    if (!app) {
      return;
    }
    if (payload.omittedImages.length > 0) {
      var warning = '已複製 Markdown，但圖片無法包含。';
      app.toast(warning);
      if (typeof app.announce === 'function') {
        app.announce(warning + '缺少的圖片：' + payload.omittedImages.join('、'), true);
      }
      return;
    }
    app.toast(hadImages ? '已複製 Markdown 與圖片。' : '已複製 Markdown。');
  }

  function copy() {
    var app = getApp();
    if (!app || !app.state) {
      return Promise.resolve({ ok: false });
    }
    var document = app.state.document;
    if (!document || !document.blocks || document.blocks.length === 0) {
      if (typeof app.announce === 'function') {
        app.announce('文件是空的，沒有可複製的內容。', true);
      }
      return Promise.resolve({ ok: false, empty: true });
    }
    if (copyInFlight) {
      return copyInFlight;
    }
    lastCopyTrigger = global.document ? global.document.activeElement : null;
    var hadImages = document.blocks.some(function (block) {
      return block.type === 'image';
    });
    copyInFlight = buildClipboardPayload(document, app.state.assets).then(function (payload) {
      return writeWithAsyncClipboard(payload).then(function (asyncWritten) {
        if (asyncWritten) {
          reportCopySuccess(payload, hadImages);
          return { ok: true, method: 'async', payload: payload };
        }
        if (writeWithExecCommand(payload)) {
          reportCopySuccess(payload, hadImages);
          return { ok: true, method: 'execCommand', payload: payload };
        }
        var manual = showManualCopy(payload);
        return { ok: false, manual: manual, payload: payload };
      });
    }).catch(function (error) {
      if (typeof app.showError === 'function') {
        app.showError(error);
      }
      return { ok: false, error: error };
    }).then(function (result) {
      copyInFlight = null;
      return result;
    }, function (error) {
      copyInFlight = null;
      throw error;
    });
    return copyInFlight;
  }

  function init() {
    if (initialized) {
      return;
    }
    initialized = true;
    var app = getApp();
    var elements = app && app.elements ? app.elements : null;
    var dialog = elements ? elements['manual-copy-dialog'] : null;
    var textarea = elements ? elements['manual-copy-text'] : null;
    var close = elements ? elements['manual-copy-close'] : null;
    var select = elements ? elements['manual-copy-select'] : null;
    if (close) {
      close.addEventListener('click', function () {
        if (app && typeof app.closeDialog === 'function') {
          app.closeDialog(dialog);
        } else if (dialog) {
          dialog.close();
        }
      });
    }
    if (select) {
      select.addEventListener('click', function () {
        if (!textarea) {
          return;
        }
        textarea.focus();
        textarea.select();
      });
    }
    if (dialog) {
      dialog.addEventListener('close', function () {
        if (lastCopyTrigger && typeof lastCopyTrigger.focus === 'function') {
          lastCopyTrigger.focus();
        }
        lastCopyTrigger = null;
      });
    }
    var canvas = app && app.elements ? app.elements.canvas : null;
    if (!canvas) {
      return;
    }
    canvas.addEventListener('paste', handlePaste);
  }

  var api = {
    init: init,
    copy: copy,
    handlePaste: handlePaste,
    buildClipboardPayload: buildClipboardPayload
  };

  global.Prompter = global.Prompter || {};
  global.Prompter.clipboard = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
