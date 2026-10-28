(function (global) {
  'use strict';

  var Utils = global.Prompter.utils;
  var Model = global.Prompter.model;
  var Markdown = global.Prompter.markdown;
  var Files = global.Prompter.files;

  var GAP = 8;
  var DEFAULT_BLOCK_HEIGHT = 72;
  var DRAG_THRESHOLD = 4;

  var initialized = false;
  var objectUrls = {};
  var currentDocumentId = null;
  var markerMenu = null;
  var dragState = null;
  var editDraft = null;
  var lastTap = { blockId: null, time: 0 };

  function getApp() {
    return global.Prompter.app;
  }

  function getState() {
    var app = getApp();
    return app ? app.state : null;
  }

  function getCanvas() {
    var app = getApp();
    return app && app.elements ? app.elements.canvas : null;
  }

  function getWorkspace() {
    var app = getApp();
    return app && app.elements ? app.elements.workspace : null;
  }

  function currentDocument() {
    var state = getState();
    return state ? state.document : null;
  }

  function currentAssets() {
    var state = getState();
    return state ? state.assets : [];
  }

  function findBlock(blockId) {
    var document = currentDocument();
    if (!document || !document.blocks) {
      return null;
    }
    for (var i = 0; i < document.blocks.length; i += 1) {
      if (document.blocks[i].id === blockId) {
        return document.blocks[i];
      }
    }
    return null;
  }

  function findAsset(assetId) {
    var assets = currentAssets();
    for (var i = 0; i < assets.length; i += 1) {
      if (assets[i].id === assetId) {
        return assets[i];
      }
    }
    return null;
  }

  function blockElement(blockId) {
    var canvas = getCanvas();
    if (!canvas || !blockId) {
      return null;
    }
    return canvas.querySelector('.block[data-block-id="' + cssEscape(blockId) + '"]');
  }

  function cssEscape(value) {
    if (global.CSS && typeof global.CSS.escape === 'function') {
      return global.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function markDirty() {
    var app = getApp();
    if (app) {
      app.setDirty(true);
    }
  }

  function announce(message) {
    var app = getApp();
    if (app && typeof app.announce === 'function') {
      app.announce(message);
    }
  }

  function showError(error) {
    var app = getApp();
    if (app && typeof app.showError === 'function') {
      app.showError(error);
    }
  }

  function markerToken(marker) {
    return marker === 'none' ? '無' : marker;
  }

  function markerLabel(marker) {
    return marker === 'none' ? '無' : marker;
  }

  function blockLabel(block) {
    var state = getState();
    var selected = state && state.selectedBlockId === block.id;
    var editing = state && state.editingBlockId === block.id;
    var label;
    if (block.type === 'image') {
      label = '圖片區塊：' + (block.alt || '未命名圖片');
    } else {
      var preview = String(block.text || '').slice(0, 80);
      label = '文字區塊，' + (block.marker === 'none' ? '無標記' : '標記 ' + block.marker) +
        '：' + preview;
    }
    if (selected) {
      label += '，已選取';
    }
    if (editing) {
      label += '，編輯中';
    }
    return label;
  }

  function updateCanvasSize() {
    var canvas = getCanvas();
    var workspace = getWorkspace();
    if (!canvas || !workspace) {
      return;
    }
    var maxBottom = 0;
    var children = canvas.querySelectorAll('.block, .composer');
    Array.prototype.forEach.call(children, function (element) {
      var top = parseFloat(element.style.top) || 0;
      maxBottom = Math.max(maxBottom, top + element.offsetHeight);
    });
    var minimum = Math.max(workspace.clientHeight || 0, 420);
    var height = Math.max(minimum, maxBottom + 120);
    canvas.style.height = height + 'px';
  }

  function revokeObjectUrls() {
    Object.keys(objectUrls).forEach(function (id) {
      try {
        global.URL.revokeObjectURL(objectUrls[id]);
      } catch (error) {
        // Ignore URLs already revoked by the browser.
      }
    });
    objectUrls = {};
  }

  function assetUrl(asset) {
    if (!asset) {
      return '';
    }
    if (asset.dataUrl) {
      return asset.dataUrl;
    }
    if (objectUrls[asset.id]) {
      return objectUrls[asset.id];
    }
    var blob = asset.blob;
    if (!blob && asset.bytes && typeof global.Blob === 'function') {
      blob = new global.Blob([asset.bytes], { type: asset.mimeType });
    }
    if (blob && global.URL && typeof global.URL.createObjectURL === 'function') {
      objectUrls[asset.id] = global.URL.createObjectURL(blob);
      return objectUrls[asset.id];
    }
    return '';
  }

  function createButton(className, label, text) {
    var button = global.document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', label);
    if (text !== undefined) {
      button.textContent = text;
    }
    return button;
  }

  function createMarkerButton(block, editing) {
    var button = createButton(
      'block-marker' + (block.marker === 'none' ? ' none' : ''),
      '變更標記，目前為' + markerLabel(block.marker),
      markerToken(block.marker)
    );
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      openMarkerMenu(button, block.marker, function (marker) {
        if (editing) {
          applyEditingMarker(marker);
        } else {
          if (block.marker !== marker) {
            block.marker = marker;
            markDirty();
          }
          render();
          selectBlock(block.id, { focus: true });
        }
      }, function (open) {
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
    return button;
  }

  function createTextContent(block) {
    var isEditing = getState() && getState().editingBlockId === block.id;
    if (isEditing) {
      var input = global.document.createElement('input');
      input.type = 'text';
      input.className = 'block-edit-input';
      input.setAttribute('aria-label', '編輯區塊內容');
      input.value = editDraft && editDraft.id === block.id ? editDraft.draftText : block.text;
      input.addEventListener('input', function () {
        if (editDraft && editDraft.id === block.id) {
          editDraft.draftText = input.value;
        }
      });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          commitEditing();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelEditing();
        }
      });
      input.addEventListener('focusout', function (event) {
        var next = event.relatedTarget;
        if (next && (next.closest('.marker-menu') || next.closest('.block.editing'))) {
          return;
        }
        setTimeout(function () {
          if (!input.isConnected) {
            return;
          }
          var state = getState();
          if (state && state.editingBlockId === block.id &&
              global.document.activeElement !== input) {
            commitEditing();
          }
        }, 0);
      });
      return input;
    }
    var content = global.document.createElement('span');
    content.className = 'block-content';
    content.textContent = block.text;
    return content;
  }

  function createImageContent(block) {
    var asset = findAsset(block.assetId);
    var wrapper = global.document.createElement('div');
    wrapper.className = 'block-image-wrap';
    var url = assetUrl(asset);
    if (!url) {
      var placeholder = global.document.createElement('div');
      placeholder.className = 'block-image-placeholder';
      placeholder.textContent = '圖片無法載入：' + (block.alt || '未命名圖片');
      wrapper.appendChild(placeholder);
      return wrapper;
    }
    var image = global.document.createElement('img');
    image.className = 'block-image';
    image.alt = block.alt || (asset && asset.originalName) || '圖片';
    image.src = url;
    image.addEventListener('load', updateCanvasSize);
    image.addEventListener('error', function () {
      var placeholder = global.document.createElement('div');
      placeholder.className = 'block-image-placeholder';
      placeholder.textContent = '圖片無法載入：' + (block.alt || '未命名圖片');
      wrapper.textContent = '';
      wrapper.appendChild(placeholder);
      updateCanvasSize();
    });
    wrapper.appendChild(image);
    return wrapper;
  }

  function createBlockElement(block) {
    var state = getState();
    var element = global.document.createElement('div');
    element.className = 'block' + (block.type === 'image' ? ' block-image-block' : '');
    element.dataset.blockId = block.id;
    element.setAttribute('role', 'listitem');
    element.tabIndex = 0;
    element.style.left = block.x + 'px';
    element.style.top = block.y + 'px';
    element.style.zIndex = String(block.z || 1);
    var selected = state && state.selectedBlockId === block.id;
    element.setAttribute('aria-current', selected ? 'true' : 'false');
    if (selected) {
      element.classList.add('selected');
    }
    element.setAttribute('aria-label', blockLabel(block));
    if (state && state.editingBlockId === block.id) {
      element.classList.add('editing');
    }

    if (block.type === 'image') {
      element.appendChild(createImageContent(block));
    } else {
      var row = global.document.createElement('div');
      row.className = 'block-text';
      row.appendChild(createMarkerButton(block, state && state.editingBlockId === block.id));
      row.appendChild(createTextContent(block));
      element.appendChild(row);
    }

    var plus = createButton('block-plus', '在此區塊下方新增', '+');
    plus.addEventListener('click', function (event) {
      event.stopPropagation();
      openComposer(block.id);
    });
    element.appendChild(plus);

    if (block.type === 'image') {
      var remove = createButton('block-remove', '移除圖片', '×');
      remove.addEventListener('click', function (event) {
        event.stopPropagation();
        removeImageBlock(block.id);
      });
      element.appendChild(remove);
    }

    var handle = createButton('drag-handle', '拖曳區塊', '⠿');
    handle.addEventListener('pointerdown', function (event) {
      event.stopPropagation();
      beginDrag(event, block.id, element, true);
    });
    element.appendChild(handle);

    return element;
  }

  function renderComposer(state) {
    var composer = state.composer;
    if (!composer) {
      return null;
    }
    var element = global.document.createElement('div');
    element.className = 'composer';
    element.style.left = composer.x + 'px';
    element.style.top = composer.y + 'px';
    element.setAttribute('role', 'group');
    element.setAttribute('aria-label', composer.mode === 'initial' ? '新增第一個區塊' : '新增區塊');

    var markerButton = createButton(
      'composer-marker' + (composer.marker === 'none' ? ' none' : ''),
      '選擇標記，目前為' + markerLabel(composer.marker),
      markerToken(composer.marker)
    );
    markerButton.setAttribute('aria-haspopup', 'menu');
    markerButton.setAttribute('aria-expanded', 'false');
    markerButton.addEventListener('click', function (event) {
      event.stopPropagation();
      openMarkerMenu(markerButton, composer.marker, function (marker) {
        composer.markerOverride = marker;
        composer.marker = marker;
        markerButton.textContent = markerToken(marker);
        markerButton.classList.toggle('none', marker === 'none');
        markerButton.setAttribute('aria-label', '選擇標記，目前為' + markerLabel(marker));
        updateComposerDetection(element, composer);
        focusComposer();
      }, function (open) {
        markerButton.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
    element.appendChild(markerButton);

    var body = global.document.createElement('div');
    body.className = 'composer-body';
    var input = global.document.createElement('input');
    input.type = 'text';
    input.className = 'composer-input';
    input.setAttribute('aria-label', '新增區塊內容');
    input.placeholder = '輸入內容，按 Enter 建立區塊';
    input.value = composer.text || '';
    input.addEventListener('input', function () {
      composer.text = input.value;
      composer.markerOverride = null;
      updateComposerDetection(element, composer);
      if (input.value !== '') {
        markDirty();
      }
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        commitComposer();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dismissComposer();
      }
    });
    body.appendChild(input);

    var detection = global.document.createElement('span');
    detection.className = 'composer-detection';
    detection.setAttribute('aria-live', 'polite');
    body.appendChild(detection);
    element.appendChild(body);

    element.addEventListener('pointerdown', function (event) {
      event.stopPropagation();
    });
    element.addEventListener('click', function (event) {
      event.stopPropagation();
    });

    updateComposerDetection(element, composer);
    return element;
  }

  function updateComposerDetection(element, composer) {
    var detection = element.querySelector('.composer-detection');
    if (!detection) {
      return;
    }
    var detected = Markdown.detectMarker(composer.text || '');
    if (detected.marker !== 'none' && !composer.markerOverride) {
      detection.textContent = '偵測到： ' + detected.marker;
    } else {
      detection.textContent = '';
    }
    var markerButton = element.querySelector('.composer-marker');
    if (markerButton) {
      var shown = composer.markerOverride ||
        (detected.marker !== 'none' ? detected.marker : composer.marker);
      markerButton.textContent = markerToken(shown);
      markerButton.classList.toggle('none', shown === 'none');
      markerButton.setAttribute('aria-label', '選擇標記，目前為' + markerLabel(shown));
    }
  }

  function ensureInitialComposer(state) {
    if (!state.document || state.document.blocks.length > 0 || state.composer) {
      return;
    }
    var preferences = state.preferences || Model.createPreferences();
    state.composer = Model.createComposer({
      mode: 'initial',
      anchorBlockId: null,
      x: Files.COLUMN_X,
      y: Files.COLUMN_START_Y,
      marker: preferences.defaultMarker,
      text: ''
    });
  }

  function render() {
    var state = getState();
    var canvas = getCanvas();
    if (!state || !canvas) {
      return;
    }
    if (state.document && currentDocumentId !== state.document.id) {
      revokeObjectUrls();
      editDraft = null;
      currentDocumentId = state.document.id;
    } else if (!state.document) {
      revokeObjectUrls();
      currentDocumentId = null;
      editDraft = null;
    }

    Array.prototype.forEach.call(canvas.querySelectorAll('.block, .composer'), function (element) {
      element.parentNode.removeChild(element);
    });

    var empty = getApp().elements['canvas-empty'];
    if (!state.document) {
      if (empty) {
        empty.hidden = false;
      }
      updateCanvasSize();
      return;
    }

    if (empty) {
      empty.hidden = true;
    }
    ensureInitialComposer(state);
    var blocks = Markdown.blocksInReadingOrder(state.document.blocks);
    blocks.forEach(function (block) {
      canvas.appendChild(createBlockElement(block));
    });
    var composerElement = renderComposer(state);
    if (composerElement) {
      canvas.appendChild(composerElement);
    }
    updateCanvasSize();

    if (state.editingBlockId) {
      var editingElement = blockElement(state.editingBlockId);
      var input = editingElement ? editingElement.querySelector('.block-edit-input') : null;
      if (input) {
        input.focus();
        var caret = editDraft && editDraft.id === state.editingBlockId ? editDraft.caret : null;
        var position = caret === null || caret === undefined ? input.value.length : caret;
        try {
          input.setSelectionRange(position, position);
        } catch (error) {
          // Some browsers disallow selection changes on unfocused inputs.
        }
      }
    }
  }

  function selectBlock(blockId, options) {
    var opts = options || {};
    var state = getState();
    if (!state || !state.document) {
      return;
    }
    if (blockId) {
      var block = findBlock(blockId);
      if (!block) {
        return;
      }
      if (state.selectedBlockId !== blockId) {
        block.z = Model.nextZ(state.document);
      }
    }
    state.selectedBlockId = blockId;
    var canvas = getCanvas();
    if (canvas) {
      Array.prototype.forEach.call(canvas.querySelectorAll('.block'), function (element) {
        var id = element.dataset.blockId;
        var selected = id === blockId;
        element.classList.toggle('selected', selected);
        element.setAttribute('aria-current', selected ? 'true' : 'false');
        var block = findBlock(id);
        if (block) {
          element.style.zIndex = String(block.z || 1);
          element.setAttribute('aria-label', blockLabel(block));
        }
      });
    }
    if (opts.focus) {
      var element = blockElement(blockId);
      if (element) {
        element.focus();
      }
    }
  }

  function clearSelection() {
    selectBlock(null);
    var state = getState();
    if (state) {
      state.selectedBlockId = null;
    }
  }

  function beginDrag(event, blockId, element, fromHandle) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    var state = getState();
    if (!state || state.editingBlockId === blockId) {
      return;
    }
    if (event.pointerType === 'touch' && !fromHandle) {
      return;
    }
    var block = findBlock(blockId);
    if (!block) {
      return;
    }
    selectBlock(blockId);
    dragState = {
      blockId: blockId,
      element: element,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: block.x,
      startY: block.y,
      currentX: block.x,
      currentY: block.y,
      moved: false,
      frame: null,
      pointerType: event.pointerType || 'mouse'
    };
    try {
      element.setPointerCapture(event.pointerId);
    } catch (error) {
      // Synthetic pointer events and some touch environments do not allow capture.
    }
    global.addEventListener('pointermove', onDragMove, true);
    global.addEventListener('pointerup', onDragEnd, true);
    global.addEventListener('pointercancel', onDragCancel, true);
  }

  function onDragMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    var dx = event.clientX - dragState.startClientX;
    var dy = event.clientY - dragState.startClientY;
    if (!dragState.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
      return;
    }
    dragState.moved = true;
    dragState.element.classList.add('dragging');
    var canvas = getCanvas();
    var maxX = Math.max(0, canvas.clientWidth - dragState.element.offsetWidth);
    var maxY = Math.max(0, canvas.clientHeight - dragState.element.offsetHeight);
    dragState.currentX = Utils.clamp(dragState.startX + dx, 0, maxX);
    dragState.currentY = Utils.clamp(dragState.startY + dy, 0, maxY);
    event.preventDefault();
    if (dragState.frame === null) {
      dragState.frame = global.requestAnimationFrame(function () {
        if (!dragState) {
          return;
        }
        dragState.frame = null;
        dragState.element.style.transform = 'translate(' +
          (dragState.currentX - dragState.startX) + 'px, ' +
          (dragState.currentY - dragState.startY) + 'px)';
      });
    }
  }

  function finishDrag(commit) {
    if (!dragState) {
      return;
    }
    var drag = dragState;
    dragState = null;
    global.removeEventListener('pointermove', onDragMove, true);
    global.removeEventListener('pointerup', onDragEnd, true);
    global.removeEventListener('pointercancel', onDragCancel, true);
    if (drag.frame !== null) {
      global.cancelAnimationFrame(drag.frame);
    }
    try {
      drag.element.releasePointerCapture(drag.pointerId);
    } catch (error) {
      // Ignore environments where capture was not established.
    }
    drag.element.classList.remove('dragging');
    drag.element.style.transform = '';
    if (!commit || !drag.moved) {
      if (!drag.moved) {
        selectBlock(drag.blockId, { focus: false });
      }
      return;
    }
    var block = findBlock(drag.blockId);
    if (!block) {
      return;
    }
    var changed = block.x !== drag.currentX || block.y !== drag.currentY;
    if (changed) {
      block.x = drag.currentX;
      block.y = drag.currentY;
      markDirty();
      render();
      selectBlock(drag.blockId, { focus: true });
      announcePosition(block);
    }
  }

  function onDragEnd(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    finishDrag(true);
  }

  function onDragCancel(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    finishDrag(false);
  }

  function announcePosition(block) {
    var document = currentDocument();
    if (!document) {
      return;
    }
    var row = Math.round(block.y / Markdown.ROW_HEIGHT) + 1;
    var ordered = Markdown.blocksInReadingOrder(document.blocks);
    var rowBlocks = ordered.filter(function (entry) {
      return Math.round(entry.y / Markdown.ROW_HEIGHT) === Math.round(block.y / Markdown.ROW_HEIGHT);
    });
    var column = rowBlocks.indexOf(block) + 1;
    announce('區塊已移動到第 ' + row + ' 列，第 ' + column + ' 欄。');
  }

  function moveBlockByKeyboard(block, dx, dy) {
    var element = blockElement(block.id);
    var canvas = getCanvas();
    if (!element || !canvas) {
      return false;
    }
    var maxX = Math.max(0, canvas.clientWidth - element.offsetWidth);
    var maxY = Math.max(0, canvas.clientHeight - element.offsetHeight);
    var nextX = Utils.clamp(block.x + dx, 0, maxX);
    var nextY = Utils.clamp(block.y + dy, 0, maxY);
    if (nextX === block.x && nextY === block.y) {
      return false;
    }
    block.x = nextX;
    block.y = nextY;
    block.z = Model.nextZ(currentDocument());
    markDirty();
    render();
    selectBlock(block.id, { focus: true });
    announcePosition(block);
    return true;
  }

  function beginEditing(blockId, options) {
    var block = findBlock(blockId);
    var state = getState();
    if (!block || block.type !== 'text' || !state) {
      return;
    }
    var caret = options && options.caret !== undefined ? options.caret : block.text.length;
    editDraft = {
      id: block.id,
      text: block.text,
      draftText: block.text,
      marker: block.marker,
      originalMarker: block.marker,
      caret: caret
    };
    state.editingBlockId = block.id;
    state.selectedBlockId = block.id;
    block.z = Model.nextZ(state.document);
    render();
  }

  function applyEditingMarker(marker) {
    var state = getState();
    if (!state || !state.editingBlockId) {
      return;
    }
    var block = findBlock(state.editingBlockId);
    if (!block) {
      return;
    }
    block.marker = marker;
    if (editDraft) {
      editDraft.marker = marker;
    }
    var element = blockElement(block.id);
    if (element) {
      var markerButton = element.querySelector('.block-marker');
      if (markerButton) {
        markerButton.textContent = markerToken(marker);
        markerButton.classList.toggle('none', marker === 'none');
        markerButton.setAttribute('aria-label', '變更標記，目前為' + markerLabel(marker));
      }
    }
    focusComposerOrEditing();
  }

  function focusComposerOrEditing() {
    var state = getState();
    if (!state || !state.editingBlockId) {
      return;
    }
    var element = blockElement(state.editingBlockId);
    var input = element ? element.querySelector('.block-edit-input') : null;
    if (input) {
      input.focus();
      try {
        input.setSelectionRange(input.value.length, input.value.length);
      } catch (error) {
        // Ignore.
      }
    }
  }

  function commitEditing() {
    var state = getState();
    if (!state || !state.editingBlockId) {
      return;
    }
    var block = findBlock(state.editingBlockId);
    if (!block) {
      state.editingBlockId = null;
      editDraft = null;
      render();
      return;
    }
    var element = blockElement(block.id);
    var input = element ? element.querySelector('.block-edit-input') : null;
    var value = input ? input.value : (editDraft ? editDraft.draftText : block.text);
    var originalText = editDraft ? editDraft.text : block.text;
    var originalMarker = editDraft ? editDraft.originalMarker : block.marker;
    var detected = Markdown.detectMarker(value);
    var text = value;
    var marker = block.marker;
    if (detected.marker !== 'none' && block.marker === 'none') {
      marker = detected.marker;
      text = detected.text;
    }

    state.editingBlockId = null;
    editDraft = null;

    if (text.trim() === '') {
      Model.removeBlock(state.document, block.id);
      markDirty();
      render();
      if (state.document.blocks.length === 0) {
        ensureInitialComposer(state);
        render();
        focusComposer();
      } else {
        selectBlock(state.selectedBlockId === block.id ? null : state.selectedBlockId);
        var canvas = getCanvas();
        if (canvas) {
          canvas.focus();
        }
      }
      return;
    }

    var changed = text !== originalText || marker !== originalMarker;
    block.text = text;
    block.marker = marker;
    if (changed) {
      markDirty();
    }
    render();
    selectBlock(block.id, { focus: true });
  }

  function cancelEditing() {
    var state = getState();
    if (!state || !state.editingBlockId) {
      return;
    }
    var block = findBlock(state.editingBlockId);
    if (block && editDraft && editDraft.id === block.id) {
      block.text = editDraft.text;
      block.marker = editDraft.originalMarker;
    }
    state.editingBlockId = null;
    editDraft = null;
    render();
    if (block) {
      selectBlock(block.id, { focus: true });
    }
  }

  function anchorForInsertion(preferredId) {
    var state = getState();
    if (preferredId && findBlock(preferredId)) {
      return findBlock(preferredId);
    }
    if (state && state.editingBlockId && findBlock(state.editingBlockId)) {
      return findBlock(state.editingBlockId);
    }
    if (state && state.selectedBlockId && findBlock(state.selectedBlockId)) {
      return findBlock(state.selectedBlockId);
    }
    var document = currentDocument();
    if (!document) {
      return null;
    }
    var ordered = Markdown.blocksInReadingOrder(document.blocks);
    return ordered.length ? ordered[ordered.length - 1] : null;
  }

  function elementHeightFor(block) {
    var element = block ? blockElement(block.id) : null;
    return element ? element.offsetHeight : DEFAULT_BLOCK_HEIGHT;
  }

  function elementWidthFor(block) {
    var element = block ? blockElement(block.id) : null;
    return element ? element.offsetWidth : 160;
  }

  function blocksOverlap(left, right) {
    return left.x < right.x + right.width + GAP &&
      left.x + left.width + GAP > right.x &&
      left.y < right.y + right.height + GAP &&
      left.y + left.height + GAP > right.y;
  }

  function pushOverlappingBlocksBelow(document, firstBlock) {
    if (!document || !firstBlock) {
      return false;
    }
    var firstElement = blockElement(firstBlock.id);
    if (!firstElement) {
      return false;
    }
    var ordered = Markdown.blocksInReadingOrder(document.blocks);
    var index = ordered.indexOf(firstBlock);
    if (index < 0) {
      return false;
    }
    var placed = [{
      x: firstBlock.x,
      y: firstBlock.y,
      width: firstElement.offsetWidth,
      height: firstElement.offsetHeight
    }];
    var changed = false;
    for (var i = index + 1; i < ordered.length; i += 1) {
      var block = ordered[i];
      var rect = {
        x: block.x,
        y: block.y,
        width: elementWidthFor(block),
        height: elementHeightFor(block)
      };
      var targetY = null;
      placed.forEach(function (entry) {
        if (blocksOverlap(rect, entry)) {
          var candidate = entry.y + entry.height + GAP;
          targetY = targetY === null ? candidate : Math.max(targetY, candidate);
        }
      });
      if (targetY !== null && targetY > block.y) {
        block.y = targetY;
        rect.y = targetY;
        placed.push(rect);
        changed = true;
      }
    }
    return changed;
  }

  function insertionPoint(anchor) {
    if (!anchor) {
      return { x: Files.COLUMN_X, y: Files.COLUMN_START_Y };
    }
    return {
      x: anchor.x,
      y: anchor.y + elementHeightFor(anchor) + GAP
    };
  }

  function shiftLowerBlocks(document, anchorId, insertY) {
    var row = Math.round(insertY / Markdown.ROW_HEIGHT);
    var ordered = Markdown.blocksInReadingOrder(document.blocks);
    var anchorIndex = ordered.length - 1;
    if (anchorId) {
      for (var i = 0; i < ordered.length; i += 1) {
        if (ordered[i].id === anchorId) {
          anchorIndex = i;
          break;
        }
      }
    }
    for (var k = anchorIndex + 1; k < ordered.length; k += 1) {
      var block = ordered[k];
      var blockRow = Math.round(block.y / Markdown.ROW_HEIGHT);
      if (blockRow <= row) {
        block.y += (row + 1 - blockRow) * Markdown.ROW_HEIGHT;
      }
    }
  }

  function insertBlockWithShift(block, anchorId) {
    var document = currentDocument();
    if (!document) {
      return;
    }
    shiftLowerBlocks(document, anchorId, block.y);
    document.blocks.push(block);
  }

  function openComposer(anchorId) {
    var state = getState();
    if (!state || !state.document) {
      return;
    }
    if (state.composer) {
      if ((state.composer.text || '').trim() !== '') {
        commitComposer();
      } else {
        state.composer = null;
      }
    }
    var anchor = anchorId ? findBlock(anchorId) : null;
    var point = insertionPoint(anchor);
    state.composer = Model.createComposer({
      mode: anchor ? 'inserted' : 'initial',
      anchorBlockId: anchor ? anchor.id : null,
      x: point.x,
      y: point.y,
      marker: state.preferences.defaultMarker,
      text: ''
    });
    render();
    focusComposer();
  }

  function dismissComposer() {
    var state = getState();
    if (!state || !state.composer) {
      return;
    }
    var composer = state.composer;
    if (composer.mode === 'initial') {
      focusComposer();
      return;
    }
    var anchorId = composer.anchorBlockId;
    state.composer = null;
    render();
    if (anchorId) {
      selectBlock(anchorId, { focus: true });
    } else {
      var canvas = getCanvas();
      if (canvas) {
        canvas.focus();
      }
    }
  }

  function commitComposer() {
    var state = getState();
    if (!state || !state.document || !state.composer) {
      return;
    }
    var composer = state.composer;
    var element = getCanvas() ? getCanvas().querySelector('.composer') : null;
    var input = element ? element.querySelector('.composer-input') : null;
    var value = input ? input.value : composer.text;
    if (String(value).trim() === '') {
      focusComposer();
      return;
    }
    var detected = Markdown.detectMarker(value);
    var marker = composer.markerOverride ||
      (detected.marker !== 'none' ? detected.marker : composer.marker);
    var text = detected.marker !== 'none' ? detected.text : value;
    if (text.trim() === '') {
      focusComposer();
      return;
    }
    var document = state.document;
    var block = Model.createTextBlock({
      id: Utils.randomUUID(),
      text: text,
      marker: marker,
      x: composer.x,
      y: composer.y,
      z: Model.nextZ(document),
      seq: Model.nextSeq(document),
      blankLinesAfter: 0
    });
    var anchorId = composer.anchorBlockId || null;
    shiftLowerBlocks(document, anchorId, block.y);
    document.blocks.push(block);
    state.composer = null;
    markDirty();
    render();
    if (pushOverlappingBlocksBelow(document, block)) {
      render();
    }
    selectBlock(block.id);
    openComposer(block.id);
  }

  function focusComposer() {
    var canvas = getCanvas();
    if (!canvas) {
      return;
    }
    var input = canvas.querySelector('.composer-input');
    if (input) {
      input.focus();
      try {
        input.setSelectionRange(input.value.length, input.value.length);
      } catch (error) {
        // Ignore.
      }
    }
  }

  function removeImageBlock(blockId) {
    var state = getState();
    var block = findBlock(blockId);
    if (!state || !block || block.type !== 'image') {
      return;
    }
    var assetId = block.assetId;
    Model.removeBlock(state.document, blockId);
    var stillUsed = state.document.blocks.some(function (entry) {
      return entry.type === 'image' && entry.assetId === assetId;
    });
    if (!stillUsed) {
      state.assets = state.assets.filter(function (asset) { return asset.id !== assetId; });
      if (objectUrls[assetId]) {
        try { global.URL.revokeObjectURL(objectUrls[assetId]); } catch (error) { /* ignore */ }
        delete objectUrls[assetId];
      }
    }
    markDirty();
    if (state.selectedBlockId === blockId) {
      state.selectedBlockId = null;
    }
    render();
    if (state.document.blocks.length === 0) {
      ensureInitialComposer(state);
      render();
      focusComposer();
    } else {
      var canvas = getCanvas();
      if (canvas) {
        canvas.focus();
      }
    }
  }

  function waitForBlockImages(blocks) {
    var waits = [];
    (blocks || []).forEach(function (block) {
      if (block.type !== 'image') {
        return;
      }
      var element = blockElement(block.id);
      var image = element ? element.querySelector('img.block-image') : null;
      if (!image || (image.complete && image.naturalWidth > 0)) {
        return;
      }
      waits.push(new Promise(function (resolve) {
        var done = false;
        function finish() {
          if (done) {
            return;
          }
          done = true;
          resolve();
        }
        image.addEventListener('load', finish, { once: true });
        image.addEventListener('error', finish, { once: true });
        global.setTimeout(finish, 2000);
      }));
    });
    return Promise.all(waits);
  }

  function validateAndCreateAssets(files, existingNames) {
    var usedNames = existingNames.slice();
    return Promise.all(files.map(function (file) {
      return Files.inspectImageFile(file).catch(function (error) {
        var name = (file && (file.name || file.originalName)) || '未命名圖片';
        var wrapped = new Error((error && error.message ? error.message : '圖片無法使用。') +
          '（' + name + '）');
        wrapped.code = error && error.code ? error.code : 'INVALID_IMAGE';
        throw wrapped;
      });
    })).then(function (infos) {
      return infos.map(function (info, index) {
        try {
          var asset = Files.createAssetFromBytes({
            bytes: info.bytes,
            mimeType: info.mimeType,
            originalName: info.originalName,
            documentId: currentDocument().id,
            usedNames: usedNames
          });
          usedNames.push(asset.fileName);
          return asset;
        } catch (error) {
          var name = (files[index] && (files[index].name || files[index].originalName)) ||
            '未命名圖片';
          var wrapped = new Error((error && error.message ? error.message : '圖片無法使用。') +
            '（' + name + '）');
          wrapped.code = error && error.code ? error.code : 'INVALID_IMAGE';
          throw wrapped;
        }
      });
    });
  }

  function insertPastedContent(payload) {
    var input = payload || {};
    var files = input.files || [];
    var text = input.text || '';
    var state = getState();
    if (!state) {
      return Promise.resolve(false);
    }
    if (!state.document) {
      getApp().newDocument();
      state = getState();
    }
    var editingBlockId = state.editingBlockId;
    var anchor = anchorForInsertion(input.anchorBlockId || editingBlockId);
    var document = state.document;
    var existingNames = state.assets.map(function (asset) { return asset.fileName; });

    return validateAndCreateAssets(files, existingNames).then(function (newAssets) {
      var newBlocks = [];
      var usedAnchor = anchor;

      if (!editingBlockId && text) {
        text.split(/\r?\n/).forEach(function (line) {
          if (line.trim() === '') {
            return;
          }
          var detected = Markdown.detectMarker(line);
          newBlocks.push(Model.createTextBlock({
            id: Utils.randomUUID(),
            text: detected.marker === 'none' ? line : detected.text,
            marker: detected.marker,
            x: usedAnchor ? usedAnchor.x : Files.COLUMN_X,
            y: 0,
            z: 0,
            seq: 0,
            blankLinesAfter: 0
          }));
        });
      }

      newAssets.forEach(function (asset) {
        newBlocks.push(Model.createImageBlock({
          id: Utils.randomUUID(),
          assetId: asset.id,
          alt: asset.originalName || asset.fileName,
          x: usedAnchor ? usedAnchor.x : Files.COLUMN_X,
          y: 0,
          z: 0,
          seq: 0,
          blankLinesAfter: 0
        }));
      });

      if (newBlocks.length === 0) {
        return false;
      }

      newAssets.forEach(function (asset) { state.assets.push(asset); });
      var nextY = null;
      newBlocks.forEach(function (block) {
        block.seq = Model.nextSeq(document);
        block.z = Model.nextZ(document);
        if (nextY === null) {
          var point = usedAnchor
            ? insertionPoint(usedAnchor)
            : { x: Files.COLUMN_X, y: Files.COLUMN_START_Y };
          block.x = point.x;
          block.y = point.y;
        } else {
          block.x = usedAnchor ? usedAnchor.x : Files.COLUMN_X;
          block.y = nextY;
        }
        shiftLowerBlocks(document, usedAnchor ? usedAnchor.id : null, block.y);
        document.blocks.push(block);
        usedAnchor = block;
        nextY = block.y + DEFAULT_BLOCK_HEIGHT + GAP;
      });

      markDirty();
      render();
      if (editingBlockId) {
        var editingInput = blockElement(editingBlockId);
        if (editingInput) {
          var inputElement = editingInput.querySelector('.block-edit-input');
          if (inputElement) {
            inputElement.focus();
          }
        }
      } else {
        var last = newBlocks[newBlocks.length - 1];
        selectBlock(last.id, { focus: true });
      }
      var imageCount = newAssets.length;
      var textCount = newBlocks.length - imageCount;
      var parts = [];
      if (textCount) {
        parts.push(textCount + ' 個文字區塊');
      }
      if (imageCount) {
        parts.push(imageCount + ' 張圖片');
      }
      return waitForBlockImages(newBlocks).then(function () {
        if (pushOverlappingBlocksBelow(document, newBlocks[0])) {
          render();
        }
        announce('已插入' + parts.join('與') + '。');
        return true;
      });
    }).catch(function (error) {
      showError(error);
      return false;
    });
  }

  function insertImageFiles(files, options) {
    var optionsValue = options || {};
    return insertPastedContent({
      files: files,
      text: '',
      anchorBlockId: optionsValue.anchorBlockId,
      keepEditing: optionsValue.keepEditing
    });
  }

  function openMarkerMenu(anchor, currentMarker, onSelect, onToggle) {
    closeMarkerMenu();
    var menu = global.document.createElement('div');
    menu.className = 'marker-menu menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '選擇標記');
    var labels = {
      none: '無',
      '#': '# 標題 1',
      '##': '## 標題 2',
      '###': '### 標題 3',
      '-': '- 項目',
      '1.': '1. 編號項目',
      '>': '> 引用',
      '.': '. 點號'
    };
    Utils.MARKER_VALUES.forEach(function (marker) {
      var item = global.document.createElement('button');
      item.type = 'button';
      item.className = 'menu-item marker-menu-item';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', marker === currentMarker ? 'true' : 'false');
      item.dataset.marker = marker;
      item.textContent = labels[marker] || marker;
      item.addEventListener('click', function () {
        closeMarkerMenu();
        onSelect(marker);
        anchor.focus();
      });
      menu.appendChild(item);
    });
    global.document.body.appendChild(menu);
    var rect = anchor.getBoundingClientRect();
    var menuWidth = menu.offsetWidth;
    var menuHeight = menu.offsetHeight;
    var left = Math.min(rect.left, global.innerWidth - menuWidth - 8);
    var top = rect.bottom + 4;
    if (top + menuHeight > global.innerHeight - 8) {
      top = Math.max(8, rect.top - menuHeight - 4);
    }
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top = top + 'px';
    markerMenu = { element: menu, anchor: anchor, onToggle: onToggle };
    if (onToggle) {
      onToggle(true);
    }
    var items = Array.prototype.slice.call(menu.querySelectorAll('.marker-menu-item'));
    var checked = menu.querySelector('[aria-checked="true"]') || items[0];
    if (checked) {
      checked.focus();
    }
    menu.addEventListener('keydown', function (event) {
      var current = items.indexOf(global.document.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[(current + 1) % items.length].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[(current - 1 + items.length) % items.length].focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        items[0].focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeMarkerMenu();
        anchor.focus();
      }
    });
    setTimeout(function () {
      global.document.addEventListener('pointerdown', onMarkerOutside, true);
    }, 0);
  }

  function onMarkerOutside(event) {
    if (!markerMenu) {
      return;
    }
    if (markerMenu.element.contains(event.target) || markerMenu.anchor.contains(event.target)) {
      return;
    }
    closeMarkerMenu();
  }

  function closeMarkerMenu() {
    if (!markerMenu) {
      return;
    }
    var menu = markerMenu;
    markerMenu = null;
    global.document.removeEventListener('pointerdown', onMarkerOutside, true);
    if (menu.element.parentNode) {
      menu.element.parentNode.removeChild(menu.element);
    }
    if (menu.onToggle) {
      menu.onToggle(false);
    }
  }

  function handleBlockKeydown(event) {
    var target = event.target.closest ? event.target.closest('.block') : null;
    if (!target) {
      return;
    }
    var blockId = target.dataset.blockId;
    var block = findBlock(blockId);
    if (!block) {
      return;
    }
    if (event.target.classList.contains('block-edit-input')) {
      return;
    }
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' ||
        event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      var step = event.shiftKey ? 1 : Markdown.ROW_HEIGHT;
      var dx = event.key === 'ArrowLeft' ? -step : (event.key === 'ArrowRight' ? step : 0);
      var dy = event.key === 'ArrowUp' ? -step : (event.key === 'ArrowDown' ? step : 0);
      moveBlockByKeyboard(block, dx, dy);
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      if (block.type === 'text') {
        event.preventDefault();
        event.stopPropagation();
        beginEditing(block.id);
      }
      return;
    }
  }

  function handleCanvasClick(event) {
    var target = event.target;
    if (target === event.currentTarget) {
      clearSelection();
      return;
    }
    var control = target.closest && target.closest('button, input, .block-edit-input');
    var block = target.closest ? target.closest('.block') : null;
    if (!block) {
      return;
    }
    if (control && !control.classList.contains('drag-handle')) {
      return;
    }
    selectBlock(block.dataset.blockId);
  }

  function handleCanvasDoubleClick(event) {
    var target = event.target;
    if (target.closest && target.closest('button, input, .block-edit-input')) {
      return;
    }
    var block = target.closest ? target.closest('.block') : null;
    if (!block) {
      return;
    }
    var model = findBlock(block.dataset.blockId);
    if (model && model.type === 'text') {
      event.preventDefault();
      beginEditing(model.id);
    }
  }

  function handleCanvasPointerDown(event) {
    if (event.target.closest && event.target.closest('.composer')) {
      return;
    }
    if (event.target.closest && event.target.closest('button, input, .block-edit-input')) {
      return;
    }
    var blockElementNode = event.target.closest ? event.target.closest('.block') : null;
    if (!blockElementNode) {
      return;
    }
    var state = getState();
    if (state && state.editingBlockId === blockElementNode.dataset.blockId) {
      return;
    }
    beginDrag(event, blockElementNode.dataset.blockId, blockElementNode, false);
  }

  function init() {
    if (initialized) {
      return;
    }
    initialized = true;
    var canvas = getCanvas();
    if (!canvas) {
      return;
    }
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('dblclick', handleCanvasDoubleClick);
    canvas.addEventListener('pointerdown', handleCanvasPointerDown);
    canvas.addEventListener('keydown', handleBlockKeydown);
    canvas.addEventListener('pointerup', function (event) {
      if (event.pointerType === 'touch' && !dragState) {
        var block = event.target.closest ? event.target.closest('.block') : null;
        if (!block) {
          return;
        }
        var now = Date.now();
        if (lastTap.blockId === block.dataset.blockId && now - lastTap.time < 350) {
          var model = findBlock(block.dataset.blockId);
          if (model && model.type === 'text') {
            beginEditing(model.id);
          }
          lastTap = { blockId: null, time: 0 };
        } else {
          lastTap = { blockId: block.dataset.blockId, time: now };
        }
      }
    });
    global.addEventListener('resize', updateCanvasSize);
    global.document.addEventListener('pointerdown', function (event) {
      var state = getState();
      if (!state || !state.editingBlockId) {
        return;
      }
      if (event.target.closest && (event.target.closest('.block.editing') ||
          event.target.closest('.marker-menu'))) {
        return;
      }
      commitEditing();
    }, true);
    global.addEventListener('beforeunload', revokeObjectUrls);
    render();
  }

  var api = {
    init: init,
    render: render,
    focusComposer: focusComposer,
    setDefaultMarker: function (marker) {
      var state = getState();
      if (state && state.composer && !state.composer.text) {
        state.composer.marker = marker;
        render();
        focusComposer();
      }
    },
    beginEditing: beginEditing,
    commitEditing: commitEditing,
    cancelEditing: cancelEditing,
    selectBlock: selectBlock,
    openComposer: openComposer,
    insertBlockWithShift: insertBlockWithShift,
    shiftLowerBlocks: shiftLowerBlocks,
    insertImageFiles: insertImageFiles,
    insertPastedContent: insertPastedContent,
    getEditingBlockId: function () {
      var state = getState();
      return state ? state.editingBlockId : null;
    },
    getSelectedBlockId: function () {
      var state = getState();
      return state ? state.selectedBlockId : null;
    },
    closeMarkerMenu: closeMarkerMenu,
    updateCanvasSize: updateCanvasSize
  };

  global.Prompter = global.Prompter || {};
  global.Prompter.editor = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
