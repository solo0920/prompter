(function (global) {
  'use strict';

  var Utils = global.Prompter.utils;
  var Model = global.Prompter.model;
  var Markdown = global.Prompter.markdown;
  var Files = global.Prompter.files;

  var GAP = 8;
  var INDENT_STEP = 20;
  var DEFAULT_BLOCK_HEIGHT = 72;
  var DRAG_THRESHOLD = 4;
  var COMPOSER_ITEM_ID = '__prompter_composer__';

  var initialized = false;
  var objectUrls = {};
  var currentDocumentId = null;
  var markerMenu = null;
  var markerCloseTimer = null;
  var measureCanvas = null;
  var dragState = null;
  var marqueeState = null;
  var ignoreNextCanvasClick = false;
  var ignoreCanvasClickTimer = null;
  var editDraft = null;
  var lastTap = { blockId: null, time: 0 };
  var hoveredBlock = null;
  var activeCollapse = null;
  var collapsedByDocument = typeof global.WeakMap === 'function' ? new global.WeakMap() : null;
  var collapsedFallback = {};

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
    return app && app.elements
      ? (app.elements['editor-pane'] || app.elements.workspace)
      : null;
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

  function schedulePreviewRefresh() {
    var preview = global.Prompter && global.Prompter.preview;
    if (preview && typeof preview.scheduleRefresh === 'function') {
      preview.scheduleRefresh();
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
    return marker === 'none' ? '' : marker;
  }

  function markerLabel(marker) {
    return marker === 'none' ? '無' : marker;
  }

  function selectedBlockIds(state) {
    if (!state) {
      return [];
    }
    return Object.prototype.toString.call(state.selectedBlockIds) === '[object Array]'
      ? state.selectedBlockIds
      : [];
  }

  function isBlockSelected(state, blockId) {
    return selectedBlockIds(state).indexOf(blockId) !== -1;
  }

  function blockLabel(block) {
    var state = getState();
    var selected = state && isBlockSelected(state, block.id);
    var editing = state && state.editingBlockId === block.id;
    var label;
    if (block.type === 'image') {
      label = '圖片區塊：' + (block.alt || '未命名圖片');
    } else {
      var preview = String(block.text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
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

  function collapseSetFor(document) {
    if (!document) {
      return {};
    }
    if (collapsedByDocument) {
      var set = collapsedByDocument.get(document);
      if (!set) {
        set = {};
        collapsedByDocument.set(document, set);
      }
      return set;
    }
    var key = document.id || 'document';
    if (!collapsedFallback[key]) {
      collapsedFallback[key] = {};
    }
    return collapsedFallback[key];
  }

  function blockRank(block) {
    if (!block || block.type !== 'text') {
      return Markdown.markerRank('none');
    }
    return Markdown.markerRank(block.marker);
  }

  function headingLevel(block) {
    if (!block || block.type !== 'text') {
      return 0;
    }
    if (block.marker === '#') {
      return 1;
    }
    if (block.marker === '##') {
      return 2;
    }
    if (block.marker === '###') {
      return 3;
    }
    return 0;
  }

  function outlineIndentation(ordered) {
    var levels = {};
    var after = [];
    var stack = [];
    var base = 0;
    var contentRank = Markdown.markerRank('none');
    (ordered || []).forEach(function (block, index) {
      var heading = headingLevel(block);
      if (heading > 0) {
        base = heading;
        stack = [];
        levels[block.id] = heading - 1;
        after[index] = base;
        return;
      }
      var rank = blockRank(block);
      if (rank < contentRank) {
        while (stack.length && stack[stack.length - 1] >= rank) {
          stack.pop();
        }
        levels[block.id] = base + stack.length;
        stack.push(rank);
      } else {
        levels[block.id] = base + stack.length;
      }
      after[index] = base + stack.length;
    });
    return { levels: levels, after: after };
  }

  function collapseModelForDocument(document, ordered) {
    var order = ordered || (document ? Model.normalizeSequence(document) : []);
    var collapsed = collapseSetFor(document);
    var model = {
      ordered: order,
      hasChildren: {},
      childEnd: {},
      childCount: {},
      collapsed: {},
      hidden: {},
      hiddenAncestor: {},
      ranges: []
    };
    var i;
    for (i = 0; i < order.length; i += 1) {
      var block = order[i];
      var rank = blockRank(block);
      if (rank >= Markdown.markerRank('none')) {
        continue;
      }
      var end = i + 1;
      while (end < order.length && blockRank(order[end]) > rank) {
        end += 1;
      }
      if (end > i + 1) {
        model.hasChildren[block.id] = true;
        model.childEnd[block.id] = end;
        model.childCount[block.id] = end - i - 1;
      }
    }
    var active = null;
    for (i = 0; i < order.length; i += 1) {
      var current = order[i];
      if (active && i >= active.end) {
        active = null;
      }
      if (active) {
        model.hidden[current.id] = true;
        model.hiddenAncestor[current.id] = active.parentId;
        continue;
      }
      if (model.hasChildren[current.id] && collapsed[current.id]) {
        model.collapsed[current.id] = true;
        active = {
          parentId: current.id,
          end: model.childEnd[current.id]
        };
        model.ranges.push({
          parentId: current.id,
          start: i,
          end: active.end
        });
      }
    }
    return model;
  }

  function blockIsHidden(blockId) {
    return !!(activeCollapse && activeCollapse.hidden[blockId]);
  }

  function sanitizeCollapsedView(state, collapse) {
    if (!state || !collapse) {
      return;
    }
    var ids = selectedBlockIds(state).filter(function (id) {
      return !collapse.hidden[id];
    });
    state.selectedBlockIds = ids;
    if (state.selectedBlockId && collapse.hidden[state.selectedBlockId]) {
      state.selectedBlockId = ids.length ? ids[ids.length - 1] : null;
    }
    if (state.editingBlockId && collapse.hidden[state.editingBlockId]) {
      state.editingBlockId = null;
      editDraft = null;
    }
    if (state.composer) {
      var insertIndex = Number(state.composer.insertIndex);
      collapse.ranges.forEach(function (range) {
        if (insertIndex > range.start && insertIndex < range.end) {
          state.composer.insertIndex = range.end;
          state.composer.anchorBlockId = range.parentId;
        }
      });
    }
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

  function computeSequenceLayout(ordered, composer, heights, collapse, indentInfo) {
    var positions = {};
    var hidden = collapse && collapse.hidden ? collapse.hidden : {};
    var indentation = indentInfo || outlineIndentation(ordered);
    var y = Files.COLUMN_START_Y;
    var composerTop = null;
    var composerX = Files.COLUMN_X;
    var composerIndex = composer && composer.insertIndex !== undefined
      ? Math.max(0, Math.min(ordered.length, Number(composer.insertIndex)))
      : null;
    ordered.forEach(function (block, index) {
      if (composer && composerIndex === index) {
        composerTop = y;
        composerX = Files.COLUMN_X +
          ((index > 0 ? indentation.after[index - 1] : 0) * INDENT_STEP);
        y += (composer.height || 0) + GAP;
      }
      if (hidden[block.id]) {
        positions[block.id] = { x: Files.COLUMN_X, y: y };
        return;
      }
      var height = heights && heights[block.id] !== undefined
        ? heights[block.id]
        : elementHeightFor(block);
      positions[block.id] = {
        x: Files.COLUMN_X + ((indentation.levels[block.id] || 0) * INDENT_STEP),
        y: y
      };
      y += height + GAP;
    });
    if (composer && composerTop === null) {
      composerTop = y;
      composerX = Files.COLUMN_X + ((indentation.after[ordered.length - 1] || 0) * INDENT_STEP);
    }
    return {
      positions: positions,
      composerTop: composerTop,
      composerX: composerX,
      nextY: y
    };
  }

  function applyIndentedWidth(element, x, basePadding, minimumWidth) {
    if (!element) {
      return;
    }
    var offset = Math.max(0, Number(x) - Files.COLUMN_X);
    if (offset > 0) {
      var canvas = getCanvas();
      var available = canvas ? canvas.clientWidth : global.innerWidth;
      var maximum = Math.min(560, available - basePadding - offset);
      element.style.maxWidth = 'min(560px, calc(100% - ' +
        (basePadding + offset) + 'px))';
      if (maximum < (minimumWidth || 0)) {
        element.style.minWidth = '0';
      } else {
        element.style.removeProperty('min-width');
      }
    } else {
      element.style.removeProperty('max-width');
      element.style.removeProperty('min-width');
    }
  }

  function applySequenceLayout() {
    var state = getState();
    var canvas = getCanvas();
    if (!state || !canvas || !state.document) {
      updateCanvasSize();
      return;
    }
    var ordered = Model.normalizeSequence(state.document);
    activeCollapse = collapseModelForDocument(state.document, ordered);
    sanitizeCollapsedView(state, activeCollapse);
    var indentInfo = outlineIndentation(ordered);
    ordered.forEach(function (block) {
      if (activeCollapse.hidden[block.id]) {
        return;
      }
      applyIndentedWidth(blockElement(block.id), Files.COLUMN_X +
        ((indentInfo.levels[block.id] || 0) * INDENT_STEP), 48, 140);
    });
    Array.prototype.forEach.call(
      canvas.querySelectorAll('.composer-input, .block-edit-input'),
      autoResizeTextarea
    );
    var composerElement = canvas.querySelector('.composer');
    var composer = state.composer ? {
      insertIndex: state.composer.insertIndex,
      height: composerElement ? composerElement.offsetHeight : 0
    } : null;
    var layout = computeSequenceLayout(ordered, composer, null, activeCollapse, indentInfo);
    ordered.forEach(function (block, index) {
      var point = layout.positions[block.id];
      block.x = point.x;
      block.y = point.y;
      block.seq = index + 1;
      var element = blockElement(block.id);
      if (element) {
        element.style.left = point.x + 'px';
        element.style.top = point.y + 'px';
      }
    });
    if (composer && composerElement && layout.composerTop !== null) {
      state.composer.x = layout.composerX;
      state.composer.y = layout.composerTop;
      composerElement.style.left = layout.composerX + 'px';
      composerElement.style.top = layout.composerTop + 'px';
      applyIndentedWidth(composerElement, layout.composerX, 32, 220);
    }
    updateCanvasSize();
  }

  function reflowSequenceLayout() {
    var canvas = getCanvas();
    if (dragState || (canvas && (canvas.hidden || canvas.offsetParent === null))) {
      return;
    }
    applySequenceLayout();
  }

  function pointerNearRect(event, rect, margin) {
    return event.clientX >= rect.left - margin &&
      event.clientX <= rect.right + margin &&
      event.clientY >= rect.top - margin &&
      event.clientY <= rect.bottom + margin;
  }

  function pointerOverMarkerUi(event) {
    if (!markerMenu || !markerMenu.element || !markerMenu.anchor) {
      return false;
    }
    var margin = 10;
    return pointerNearRect(event, markerMenu.anchor.getBoundingClientRect(), margin) ||
      pointerNearRect(event, markerMenu.element.getBoundingClientRect(), margin);
  }

  function cancelMarkerMenuClose() {
    if (markerCloseTimer !== null) {
      global.clearTimeout(markerCloseTimer);
      markerCloseTimer = null;
    }
  }

  function scheduleMarkerMenuClose() {
    cancelMarkerMenuClose();
    if (!markerMenu || !markerMenu.hoverOpened) {
      return;
    }
    markerCloseTimer = global.setTimeout(function () {
      markerCloseTimer = null;
      closeMarkerMenu();
    }, 180);
  }

  function clearBlockHover() {
    if (hoveredBlock) {
      hoveredBlock.classList.remove('hover-left', 'hover-right');
      hoveredBlock = null;
    }
  }

  function handleBlockHover(event) {
    if (dragState || event.pointerType === 'touch') {
      return;
    }
    if (markerMenu && markerMenu.hoverOpened) {
      if (pointerOverMarkerUi(event)) {
        cancelMarkerMenuClose();
      } else {
        scheduleMarkerMenuClose();
      }
    }
    var target = event.target;
    var block = target && target.closest ? target.closest('.block') : null;
    if (!block) {
      clearBlockHover();
      return;
    }
    if (hoveredBlock && hoveredBlock !== block) {
      hoveredBlock.classList.remove('hover-left', 'hover-right');
    }
    hoveredBlock = block;
    var rect = block.getBoundingClientRect();
    var side;
    if (target.closest('.block-marker')) {
      side = 'left';
    } else if (target.closest('.block-plus, .drag-handle, .block-remove')) {
      side = 'right';
    } else {
      side = event.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
    }
    var markerButton = block.querySelector('.block-marker');
    var markerZone = false;
    if (markerButton && !target.closest('.block-collapse')) {
      var markerRect = markerButton.getBoundingClientRect();
      markerZone = event.clientX >= rect.left && event.clientX <= markerRect.right + 6;
    }
    if (markerZone && markerButton && markerButton._prompterMarkerHover) {
      markerButton._prompterMarkerHover.open();
    }
    block.classList.toggle('hover-left', side === 'left');
    block.classList.toggle('hover-right', side === 'right');
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

  function createChevronIcon(direction) {
    var namespace = 'http://www.w3.org/2000/svg';
    var svg = global.document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var path = global.document.createElementNS(namespace, 'path');
    path.setAttribute('d', direction === 'right' ? 'M9 5l7 7-7 7' : 'M5 9l7 7 7-7');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2.2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  function wireMarkerMenu(anchor, getMarker, onSelect, onToggle) {
    anchor.setAttribute('aria-haspopup', 'menu');
    anchor.setAttribute('aria-expanded', 'false');
    function show(focusMenu, hoverOpened) {
      openMarkerMenu(anchor, getMarker(), onSelect, onToggle, {
        focusMenu: focusMenu,
        hoverOpened: hoverOpened
      });
    }
    function openHoverMenu() {
      show(false, true);
    }
    anchor._prompterMarkerHover = {
      open: openHoverMenu
    };
    anchor._prompterMarkerMenu = {
      open: function () {
        show(false, false);
      }
    };
    anchor.addEventListener('click', function (event) {
      event.stopPropagation();
      show(true, false);
    });
    anchor.addEventListener('keydown', function (event) {
      if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        show(true, false);
      } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
          markerMenu && markerMenu.anchor === anchor) {
        event.preventDefault();
        event.stopPropagation();
        var menuItems = markerMenu.element.querySelectorAll('.marker-menu-item');
        var checked = markerMenu.element.querySelector('[aria-checked="true"]') ||
          menuItems[event.key === 'ArrowDown' ? 0 : menuItems.length - 1];
        if (checked) {
          checked.focus();
        }
      }
    });
    anchor.addEventListener('pointerenter', function (event) {
      if (event.pointerType === 'touch') {
        return;
      }
      openHoverMenu();
    });
    anchor.addEventListener('pointerleave', function (event) {
      if (event.pointerType === 'touch') {
        return;
      }
      scheduleMarkerMenuClose();
    });
  }

  function applyMarkerToSelection(anchorBlock, marker) {
    var state = getState();
    if (!state) {
      return;
    }
    var ids = selectedBlockIds(state).slice();
    if (ids.indexOf(anchorBlock.id) === -1) {
      ids = [anchorBlock.id];
    }
    var changed = false;
    ids.forEach(function (id) {
      var target = findBlock(id);
      if (target && target.type === 'text' && target.marker !== marker) {
        target.marker = marker;
        changed = true;
      }
    });
    state.selectedBlockIds = ids;
    state.selectedBlockId = anchorBlock.id;
    if (changed) {
      markDirty();
    }
    render();
    var element = blockElement(anchorBlock.id);
    if (element) {
      element.focus();
    }
  }

  function createMarkerButton(block, editing) {
    var button = createButton(
      'block-marker' + (block.marker === 'none' ? ' none' : ''),
      '變更標記，目前為' + markerLabel(block.marker),
      markerToken(block.marker)
    );
    wireMarkerMenu(button, function () {
      return block.marker;
    }, function (marker) {
      if (editing) {
        applyEditingMarker(marker);
      } else {
        applyMarkerToSelection(block, marker);
      }
    }, function (open) {
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    return button;
  }

  function createTextContent(block) {
    var isEditing = getState() && getState().editingBlockId === block.id;
    if (isEditing) {
      var input = global.document.createElement('textarea');
      input.rows = 1;
      input.className = 'block-edit-input';
      input.setAttribute('aria-label', '編輯區塊內容');
      input.setAttribute('aria-keyshortcuts', 'Enter Shift+Enter');
      input.value = editDraft && editDraft.id === block.id ? editDraft.draftText : block.text;
      input.addEventListener('input', function () {
        if (editDraft && editDraft.id === block.id) {
          editDraft.draftText = input.value;
        }
        if (autoResizeTextarea(input)) {
          reflowSequenceLayout();
        }
        schedulePreviewRefresh();
      });
      input.addEventListener('keydown', function (event) {
        if (event.isComposing || event.keyCode === 229) {
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
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
    content.tabIndex = 0;
    content.setAttribute('aria-keyshortcuts', 'Enter F2');
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
    image.addEventListener('load', function () {
      reflowSequenceLayout();
    });
    image.addEventListener('error', function () {
      var placeholder = global.document.createElement('div');
      placeholder.className = 'block-image-placeholder';
      placeholder.textContent = '圖片無法載入：' + (block.alt || '未命名圖片');
      wrapper.textContent = '';
      wrapper.appendChild(placeholder);
      reflowSequenceLayout();
    });
    wrapper.appendChild(image);
    return wrapper;
  }

  function createCollapseToggle(block, collapse) {
    var collapsed = !!(collapse && collapse.collapsed[block.id]);
    var count = collapse && collapse.childCount ? (collapse.childCount[block.id] || 0) : 0;
    var preview = String(block.text || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    var label = (collapsed ? '展開' : '收合') + '「' + preview + '」下的 ' + count + ' 個區塊';
    var button = createButton(
      'block-collapse' + (collapsed ? ' collapsed' : ''),
      label
    );
    button.dataset.direction = collapsed ? 'right' : 'down';
    button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    button.title = label;
    button.appendChild(createChevronIcon(collapsed ? 'right' : 'down'));
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleBlockCollapse(block.id);
    });
    return button;
  }

  function createBlockElement(block, collapse) {
    var state = getState();
    var element = global.document.createElement('div');
    element.className = 'block' + (block.type === 'image' ? ' block-image-block' : '');
    element.dataset.blockId = block.id;
    element.setAttribute('role', 'listitem');
    element.tabIndex = 0;
    element.style.left = block.x + 'px';
    element.style.top = block.y + 'px';
    element.style.zIndex = String(block.z || 1);
    var selected = state && isBlockSelected(state, block.id);
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
      if (collapse && collapse.hasChildren[block.id]) {
        row.appendChild(createCollapseToggle(block, collapse));
      }
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

  function toggleBlockCollapse(blockId) {
    var state = getState();
    var document = state && state.document;
    if (!document) {
      return;
    }
    var ordered = Model.normalizeSequence(document);
    var before = collapseModelForDocument(document, ordered);
    if (!before.hasChildren[blockId]) {
      return;
    }
    var set = collapseSetFor(document);
    var collapsing = !set[blockId];
    if (state.editingBlockId) {
      commitEditing();
      state = getState();
      document = state && state.document;
      if (!document || !findBlock(blockId)) {
        return;
      }
      ordered = Model.normalizeSequence(document);
      before = collapseModelForDocument(document, ordered);
      if (!before.hasChildren[blockId]) {
        return;
      }
      set = collapseSetFor(document);
    }
    var index = -1;
    var end = -1;
    for (var i = 0; i < ordered.length; i += 1) {
      if (ordered[i].id === blockId) {
        index = i;
        break;
      }
    }
    if (collapsing) {
      end = before.childEnd[blockId];
      set[blockId] = true;
    } else {
      delete set[blockId];
    }
    var after = collapseModelForDocument(document, ordered);
    activeCollapse = after;
    var ids = selectedBlockIds(state).filter(function (id) {
      return !after.hidden[id];
    });
    var activeId = state.selectedBlockId;
    if (activeId && after.hidden[activeId]) {
      ids = index === -1 ? ids : [blockId];
      activeId = index === -1 ? (ids.length ? ids[ids.length - 1] : null) : blockId;
    }
    state.selectedBlockIds = ids;
    state.selectedBlockId = activeId;
    if (collapsing && state.composer && index !== -1) {
      var composerIndex = Number(state.composer.insertIndex);
      if (composerIndex > index && composerIndex < end) {
        state.composer.insertIndex = end;
        state.composer.anchorBlockId = blockId;
      }
    }
    if (state.editingBlockId && after.hidden[state.editingBlockId]) {
      state.editingBlockId = null;
      editDraft = null;
    }
    render();
    var element = blockElement(blockId);
    var toggle = element ? element.querySelector('.block-collapse') : null;
    if (toggle) {
      toggle.focus();
    } else {
      selectBlock(blockId, { focus: true });
    }
    var preview = String((findBlock(blockId) || {}).text || '').replace(/\s+/g, ' ').trim()
      .slice(0, 40);
    announce((collapsing ? '已收合' : '已展開') + '「' + preview + '」下的 ' +
      (before.childCount[blockId] || 0) + ' 個區塊。');
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
    wireMarkerMenu(markerButton, function () {
      return composer.marker;
    }, function (marker) {
      var composerInput = element.querySelector('.composer-input');
      var caretStart = composerInput ? composerInput.selectionStart : null;
      var caretEnd = composerInput ? composerInput.selectionEnd : null;
      composer.markerOverride = marker;
      composer.marker = marker;
      markerButton.textContent = markerToken(marker);
      markerButton.classList.toggle('none', marker === 'none');
      markerButton.setAttribute('aria-label', '選擇標記，目前為' + markerLabel(marker));
      updateComposerDetection(element, composer);
      schedulePreviewRefresh();
      focusComposer(caretStart, caretEnd);
    }, function (open) {
      markerButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    element.appendChild(markerButton);

    var body = global.document.createElement('div');
    body.className = 'composer-body';
    var input = global.document.createElement('textarea');
    input.rows = 1;
    input.className = 'composer-input';
    input.setAttribute('aria-label', '新增區塊內容');
    input.setAttribute('aria-keyshortcuts', 'Enter Shift+Enter');
    input.placeholder = '輸入內容';
    input.value = composer.text || '';
    input.addEventListener('input', function () {
      composer.text = input.value;
      composer.markerOverride = null;
      updateComposerDetection(element, composer);
      if (input.value !== '') {
        markDirty();
      }
      if (autoResizeTextarea(input)) {
        reflowSequenceLayout();
      }
      schedulePreviewRefresh();
    });
    input.addEventListener('keydown', function (event) {
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
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

    var handle = createButton('composer-handle', '拖曳輸入框', '⠿');
    handle.addEventListener('pointerdown', function (event) {
      event.stopPropagation();
      beginComposerDrag(event, element);
    });
    element.appendChild(handle);

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
    if (String(composer.text || '') === '') {
      detection.textContent = 'Enter 建立 · Shift+Enter 換行';
    } else if (detected.marker !== 'none' && !composer.markerOverride) {
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
      insertIndex: 0,
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
    clearBlockHover();
    closeMarkerMenu();
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
    var blocks = Model.normalizeSequence(state.document);
    activeCollapse = collapseModelForDocument(state.document, blocks);
    sanitizeCollapsedView(state, activeCollapse);
    blocks.forEach(function (block) {
      if (activeCollapse.hidden[block.id]) {
        return;
      }
      canvas.appendChild(createBlockElement(block, activeCollapse));
    });
    var composerElement = renderComposer(state);
    if (composerElement) {
      canvas.appendChild(composerElement);
    }
    applySequenceLayout();

    if (state.editingBlockId) {
      var editingElement = blockElement(state.editingBlockId);
      var input = editingElement ? editingElement.querySelector('.block-edit-input') : null;
      if (input) {
        input.focus();
        var caret = editDraft && editDraft.id === state.editingBlockId ? editDraft.caret : null;
        var caretEnd = editDraft && editDraft.id === state.editingBlockId
          ? editDraft.caretEnd
          : null;
        var position = caret === null || caret === undefined ? input.value.length : caret;
        var selectionEnd = caretEnd === null || caretEnd === undefined ? position : caretEnd;
        try {
          input.setSelectionRange(position, selectionEnd);
        } catch (error) {
          // Some browsers disallow selection changes on unfocused inputs.
        }
      }
    }
  }

  function refreshSelectionDom() {
    var state = getState();
    var canvas = getCanvas();
    if (!state || !canvas) {
      return;
    }
    var ids = selectedBlockIds(state);
    Array.prototype.forEach.call(canvas.querySelectorAll('.block'), function (element) {
      var id = element.dataset.blockId;
      var selected = ids.indexOf(id) !== -1;
      element.classList.toggle('selected', selected);
      element.setAttribute('aria-current', selected ? 'true' : 'false');
      var block = findBlock(id);
      if (block) {
        element.style.zIndex = String(block.z || 1);
        element.setAttribute('aria-label', blockLabel(block));
      }
    });
  }

  function setBlockSelection(ids, activeId, options) {
    var opts = options || {};
    var state = getState();
    if (!state || !state.document) {
      return;
    }
    var unique = [];
    (ids || []).forEach(function (id) {
      if (findBlock(id) && unique.indexOf(id) === -1) {
        unique.push(id);
      }
    });
    state.selectedBlockIds = unique;
    state.selectedBlockId = activeId && unique.indexOf(activeId) !== -1
      ? activeId
      : (unique.length ? unique[unique.length - 1] : null);
    refreshSelectionDom();
    if (opts.focus && state.selectedBlockId) {
      var element = blockElement(state.selectedBlockId);
      if (element) {
        element.focus();
      }
    }
  }

  function selectBlock(blockId, options) {
    var state = getState();
    if (!state || !state.document) {
      return;
    }
    if (blockId) {
      var block = findBlock(blockId);
      if (!block) {
        return;
      }
      if (!isBlockSelected(state, blockId)) {
        block.z = Model.nextZ(state.document);
      }
    }
    setBlockSelection(blockId ? [blockId] : [], blockId, options);
  }

  function toggleBlockSelection(blockId, options) {
    var state = getState();
    if (!state || !state.document) {
      return;
    }
    var block = findBlock(blockId);
    if (!block) {
      return;
    }
    var ids = selectedBlockIds(state).slice();
    var index = ids.indexOf(blockId);
    var active = state.selectedBlockId;
    if (index === -1) {
      ids.push(blockId);
      active = blockId;
      block.z = Model.nextZ(state.document);
    } else {
      ids.splice(index, 1);
      if (active === blockId) {
        active = ids.length ? ids[ids.length - 1] : null;
      }
    }
    setBlockSelection(ids, active, { focus: false });
    var element = blockElement(blockId);
    if (element) {
      element.focus();
    }
  }

  function clearSelection() {
    setBlockSelection([], null, { focus: false });
  }

  function removeFromSelection(blockId) {
    var state = getState();
    if (!state) {
      return;
    }
    var ids = selectedBlockIds(state).filter(function (id) {
      return id !== blockId;
    });
    var active = state.selectedBlockId === blockId
      ? (ids.length ? ids[ids.length - 1] : null)
      : state.selectedBlockId;
    state.selectedBlockIds = ids;
    state.selectedBlockId = active;
  }

  function isComposerItem(item) {
    return !!(item && item.id === COMPOSER_ITEM_ID);
  }

  function dragItemsFor(state) {
    var ordered = Model.normalizeSequence(state.document);
    var items = ordered.slice();
    if (state.composer) {
      var index = Math.max(0, Math.min(items.length, Number(state.composer.insertIndex) || 0));
      items.splice(index, 0, { id: COMPOSER_ITEM_ID, type: 'composer' });
    }
    return items;
  }

  function navigationItemsFor(state) {
    return dragItemsFor(state).filter(function (item) {
      return isComposerItem(item) || !blockIsHidden(item.id);
    });
  }

  function blocksFromItems(items) {
    return items.filter(function (item) {
      return !isComposerItem(item);
    });
  }

  function composerIndexFromItems(items) {
    for (var i = 0; i < items.length; i += 1) {
      if (isComposerItem(items[i])) {
        return i;
      }
    }
    return -1;
  }

  function sameBlockOrder(left, right) {
    if (!left || !right || left.length !== right.length) {
      return false;
    }
    for (var i = 0; i < left.length; i += 1) {
      if (left[i].id !== right[i].id) {
        return false;
      }
    }
    return true;
  }

  function dragCenters(items) {
    var centers = {};
    var state = getState();
    var canvas = getCanvas();
    var canvasTop = canvas ? canvas.getBoundingClientRect().top : 0;
    var composerElement = canvas ? canvas.querySelector('.composer') : null;
    items.forEach(function (item) {
      if (isComposerItem(item)) {
        if (state && state.composer && composerElement) {
          centers[item.id] = canvasTop + state.composer.y + composerElement.offsetHeight / 2;
        }
        return;
      }
      centers[item.id] = canvasTop + item.y + elementHeightFor(item) / 2;
    });
    return centers;
  }

  function groupVisualBounds(drag) {
    var top = Infinity;
    var bottom = -Infinity;
    var base = drag.layout && drag.layout.positions[drag.itemId];
    var offsetY = base ? drag.currentY - base.y : drag.currentY - drag.startY;
    drag.groupItems.forEach(function (block) {
      var point = drag.layout && drag.layout.positions[block.id];
      var blockTop = point ? point.y : block.y;
      var height = drag.heights[block.id] !== undefined
        ? drag.heights[block.id]
        : elementHeightFor(block);
      top = Math.min(top, blockTop + offsetY);
      bottom = Math.max(bottom, blockTop + offsetY + height);
    });
    return top === Infinity ? null : { top: top, bottom: bottom };
  }

  function snapCollapsedDropIndex(items, target) {
    var result = target;
    items.forEach(function (item, index) {
      if (isComposerItem(item) || !activeCollapse || !activeCollapse.collapsed[item.id]) {
        return;
      }
      var count = activeCollapse.childCount[item.id] || 0;
      if (count > 0 && result > index && result <= index + count) {
        result = index + count;
      }
    });
    return result;
  }

  function targetIndexForDrag(drag, clientY) {
    var pointerCenter = clientY - drag.grabOffsetY + drag.element.offsetHeight / 2;
    var movingUp = pointerCenter < drag.startCenter;
    var comparison = pointerCenter;
    if (drag.groupContiguous) {
      var bounds = groupVisualBounds(drag);
      if (bounds) {
        comparison = drag.canvasTop + (movingUp ? bounds.top : bounds.bottom);
      }
    }
    var target = 0;
    drag.items.forEach(function (item) {
      if (item.id === drag.itemId || drag.groupIdSet[item.id]) {
        return;
      }
      var center = drag.centers[item.id];
      if (center === undefined) {
        return;
      }
      if (movingUp ? center < comparison : center <= comparison) {
        target += 1;
      }
    });
    return Utils.clamp(snapCollapsedDropIndex(drag.remainingItems, target),
      0, drag.remainingItems.length);
  }

  function previewItemsForTarget(drag, targetIndex) {
    var remaining = drag.remainingItems.slice();
    var moving = drag.groupItems.length ? drag.groupItems : [drag.item];
    Array.prototype.splice.apply(remaining, [targetIndex, 0].concat(moving));
    return remaining;
  }

  function previewDragLayout(drag) {
    var canvas = getCanvas();
    if (!canvas) {
      return;
    }
    var composerElement = canvas.querySelector('.composer');
    var blockOrder = blocksFromItems(drag.previewItems);
    var composerIndex = composerIndexFromItems(drag.previewItems);
    var composer = composerIndex >= 0 ? {
      insertIndex: composerIndex,
      height: drag.composerHeight
    } : null;
    var layout = computeSequenceLayout(blockOrder, composer, drag.heights, activeCollapse);
    drag.previewBlockOrder = blockOrder;
    drag.previewComposerIndex = composerIndex;
    blockOrder.forEach(function (block) {
      var point = layout.positions[block.id];
      var element = blockElement(block.id);
      if (element) {
        applyIndentedWidth(element, point.x, 48, 140);
        element.style.left = point.x + 'px';
        element.style.top = point.y + 'px';
      }
    });
    if (composer && composerElement && layout.composerTop !== null) {
      composerElement.style.left = layout.composerX + 'px';
      composerElement.style.top = layout.composerTop + 'px';
      applyIndentedWidth(composerElement, layout.composerX, 32, 220);
    }
    drag.layout = layout;
  }

  function applyDragTransform(drag) {
    if (drag.kind === 'composer') {
      var composerPoint = drag.layout && drag.layout.composerTop !== null
        ? { x: drag.layout.composerX, y: drag.layout.composerTop }
        : null;
      if (!composerPoint) {
        drag.element.style.transform = '';
        return;
      }
      drag.element.style.transform = 'translate(' +
        (drag.currentX - composerPoint.x) + 'px, ' +
        (drag.currentY - composerPoint.y) + 'px)';
      return;
    }
    var point = drag.layout && drag.layout.positions[drag.itemId];
    if (!point) {
      drag.groupIds.forEach(function (id) {
        var element = blockElement(id);
        if (element) {
          element.style.transform = '';
        }
      });
      return;
    }
    var dx = drag.currentX - point.x;
    var dy = drag.currentY - point.y;
    drag.groupIds.forEach(function (id) {
      var element = blockElement(id);
      if (!element) {
        return;
      }
      var groupPoint = drag.layout.positions[id];
      if (!groupPoint) {
        element.style.transform = '';
        return;
      }
      element.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
    });
  }

  function addGroupDragStyles(drag) {
    if (drag.kind !== 'block') {
      return;
    }
    drag.groupIds.forEach(function (id) {
      var element = blockElement(id);
      if (!element) {
        return;
      }
      element.classList.add('group-dragging');
      drag.originalZIndexes[id] = element.style.zIndex;
      element.style.zIndex = '40';
    });
  }

  function clearGroupDragStyles(drag) {
    if (!drag) {
      return;
    }
    drag.groupIds.forEach(function (id) {
      var element = blockElement(id);
      if (!element) {
        return;
      }
      element.classList.remove('group-dragging');
      element.style.transform = '';
      if (drag.originalZIndexes[id] !== undefined) {
        element.style.zIndex = drag.originalZIndexes[id];
      }
    });
    drag.element.classList.remove('dragging');
    drag.element.style.transform = '';
  }

  function startDrag(event, config) {
    var state = getState();
    var canvas = getCanvas();
    if (!state || !canvas) {
      return;
    }
    var items = dragItemsFor(state);
    var startIndex = -1;
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].id === config.itemId) {
        startIndex = i;
        break;
      }
    }
    if (startIndex === -1) {
      return;
    }
    var groupIds = [];
    var groupIdSet = {};
    if (config.kind === 'block') {
      var requested = config.groupIds && config.groupIds.length
        ? config.groupIds
        : [config.itemId];
      items.forEach(function (item) {
        if (!isComposerItem(item) && requested.indexOf(item.id) !== -1) {
          groupIds.push(item.id);
        }
      });
      if (groupIds.indexOf(config.itemId) === -1) {
        groupIds = [config.itemId];
      }
      if (activeCollapse) {
        var extraIds = [];
        groupIds.forEach(function (id) {
          if (!activeCollapse.collapsed[id]) {
            return;
          }
          var end = activeCollapse.childEnd[id];
          for (var index = 0; index < activeCollapse.ordered.length; index += 1) {
            if (activeCollapse.ordered[index].id === id) {
              for (var child = index + 1; child < end; child += 1) {
                var childId = activeCollapse.ordered[child].id;
                if (groupIds.indexOf(childId) === -1 && extraIds.indexOf(childId) === -1) {
                  extraIds.push(childId);
                }
              }
              break;
            }
          }
        });
        groupIds = groupIds.concat(extraIds);
      }
      groupIds.forEach(function (id) {
        groupIdSet[id] = true;
      });
    }
    var groupIndices = [];
    items.forEach(function (item, index) {
      if (groupIdSet[item.id]) {
        groupIndices.push(index);
      }
    });
    var groupContiguous = groupIndices.length > 1 &&
      groupIndices[groupIndices.length - 1] - groupIndices[0] === groupIndices.length - 1;
    var groupItems = groupIds.length ? items.filter(function (item) {
      return !!groupIdSet[item.id];
    }) : [];
    var remainingItems = items.filter(function (item) {
      return !groupIdSet[item.id] && item.id !== config.itemId;
    });
    var startTargetIndex = 0;
    for (var j = 0; j < items.length; j += 1) {
      if (items[j].id === config.itemId) {
        break;
      }
      if (!groupIdSet[items[j].id]) {
        startTargetIndex += 1;
      }
    }
    canvas.classList.add('reordering');
    var rect = config.element.getBoundingClientRect();
    var canvasTop = canvas.getBoundingClientRect().top;
    var composerElement = canvas.querySelector('.composer');
    var heights = {};
    blocksFromItems(items).forEach(function (block) {
      heights[block.id] = elementHeightFor(block);
    });
    dragState = {
      kind: config.kind,
      item: config.item,
      itemId: config.itemId,
      blockId: config.kind === 'block' ? config.itemId : null,
      element: config.element,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      grabOffsetY: event.clientY - (canvasTop + config.startY),
      startX: config.startX,
      startY: config.startY,
      currentX: config.startX,
      currentY: config.startY,
      canvasTop: canvasTop,
      startIndex: startIndex,
      startCenter: canvasTop + config.startY + rect.height / 2,
      items: items,
      groupIds: groupIds,
      groupIdSet: groupIdSet,
      groupItems: groupItems,
      groupContiguous: groupContiguous,
      remainingItems: remainingItems,
      centers: dragCenters(items),
      heights: heights,
      previewItems: items.slice(),
      targetIndex: startTargetIndex,
      startTargetIndex: startTargetIndex,
      startBlockOrder: blocksFromItems(items),
      composerHeight: composerElement ? composerElement.offsetHeight : 0,
      previewBlockOrder: null,
      previewComposerIndex: -1,
      layout: null,
      validDrop: true,
      moved: false,
      frame: null,
      originalZIndexes: {},
      pointerType: event.pointerType || 'mouse'
    };
    try {
      config.element.setPointerCapture(event.pointerId);
    } catch (error) {
      // Synthetic pointer events and some touch environments do not allow capture.
    }
    global.addEventListener('pointermove', onDragMove, true);
    global.addEventListener('pointerup', onDragEnd, true);
    global.addEventListener('pointercancel', onDragCancel, true);
    global.addEventListener('keydown', onDragKeydown, true);
  }

  function beginDrag(event, blockId, element, fromHandle) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    if (event.metaKey || event.ctrlKey) {
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
    clearBlockHover();
    closeMarkerMenu();
    var selected = selectedBlockIds(state);
    var groupIds;
    if (selected.indexOf(blockId) === -1) {
      selectBlock(blockId);
      groupIds = [blockId];
    } else {
      groupIds = selected.slice();
      setBlockSelection(groupIds, blockId, { focus: false });
      groupIds = selectedBlockIds(state).slice();
    }
    startDrag(event, {
      kind: 'block',
      item: block,
      itemId: blockId,
      groupIds: groupIds,
      element: element,
      startX: block.x,
      startY: block.y
    });
  }

  function beginComposerDrag(event, element) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    var state = getState();
    if (!state || !state.composer) {
      return;
    }
    clearBlockHover();
    closeMarkerMenu();
    event.preventDefault();
    startDrag(event, {
      kind: 'composer',
      item: { id: COMPOSER_ITEM_ID, type: 'composer' },
      itemId: COMPOSER_ITEM_ID,
      element: element,
      startX: state.composer.x,
      startY: state.composer.y
    });
  }

  function onDragMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    var drag = dragState;
    var dx = event.clientX - drag.startClientX;
    var dy = event.clientY - drag.startClientY;
    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
      return;
    }
    drag.moved = true;
    drag.element.classList.add('dragging');
    if (!drag.groupStyled) {
      addGroupDragStyles(drag);
      drag.groupStyled = true;
    }
    var canvas = getCanvas();
    if (!canvas) {
      return;
    }
    var maxX = Math.max(0, canvas.clientWidth - drag.element.offsetWidth);
    var maxY = Math.max(0, canvas.clientHeight - drag.element.offsetHeight);
    drag.currentX = Utils.clamp(drag.startX + dx, 0, maxX);
    drag.currentY = Utils.clamp(drag.startY + dy, 0, maxY);
    var canvasRect = canvas.getBoundingClientRect();
    drag.validDrop = event.clientX >= canvasRect.left && event.clientX <= canvasRect.right &&
      event.clientY >= canvasRect.top && event.clientY <= canvasRect.bottom;
    var targetIndex = targetIndexForDrag(drag, event.clientY);
    if (targetIndex !== drag.targetIndex || !drag.layout) {
      drag.targetIndex = targetIndex;
      drag.previewItems = targetIndex === drag.startTargetIndex
        ? drag.items.slice()
        : previewItemsForTarget(drag, targetIndex);
      previewDragLayout(drag);
      applyDragTransform(drag);
    }
    event.preventDefault();
    if (drag.frame === null) {
      drag.frame = global.requestAnimationFrame(function () {
        if (!dragState) {
          return;
        }
        dragState.frame = null;
        applyDragTransform(dragState);
      });
    }
  }

  function onDragKeydown(event) {
    if (!dragState || event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    finishDrag(false);
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
    global.removeEventListener('keydown', onDragKeydown, true);
    var dragCanvas = getCanvas();
    if (dragCanvas) {
      dragCanvas.classList.remove('reordering');
    }
    if (drag.frame !== null) {
      global.cancelAnimationFrame(drag.frame);
    }
    try {
      drag.element.releasePointerCapture(drag.pointerId);
    } catch (error) {
      // Ignore environments where capture was not established.
    }
    clearGroupDragStyles(drag);
    if (!drag.moved) {
      if (drag.kind === 'block') {
        selectBlock(drag.blockId, { focus: false });
      } else {
        focusComposer();
      }
      return;
    }
    var state = getState();
    if (drag.kind === 'composer') {
      var composerChanged = !!(commit && drag.validDrop && state && state.composer &&
        drag.previewComposerIndex >= 0 &&
        Number(state.composer.insertIndex) !== drag.previewComposerIndex);
      if (composerChanged) {
        state.composer.insertIndex = drag.previewComposerIndex;
        render();
        focusComposer();
      } else if (drag.targetIndex !== drag.startTargetIndex) {
        render();
        focusComposer();
      }
      return;
    }
    var blockOrder = drag.previewBlockOrder || blocksFromItems(drag.previewItems);
    var orderChanged = !sameBlockOrder(blockOrder, drag.startBlockOrder);
    var composerChanged = !!(state && state.composer && drag.previewComposerIndex >= 0 &&
      Number(state.composer.insertIndex) !== drag.previewComposerIndex);
    var changed = commit && drag.validDrop && (orderChanged || composerChanged);
    if (changed) {
      if (state && state.composer && drag.previewComposerIndex >= 0) {
        state.composer.insertIndex = drag.previewComposerIndex;
      }
      if (orderChanged && state && state.document) {
        state.document.blocks = blockOrder.slice();
        blockOrder.forEach(function (block, index) {
          block.seq = index + 1;
        });
        state.document.layoutVersion = 2;
        markDirty();
      }
      render();
      selectAfterBlockDrag(drag, true);
      if (orderChanged) {
        announceSequenceMove(drag.groupIds, drag.blockId);
      }
      return;
    }
    if (drag.moved && (orderChanged || composerChanged ||
        drag.targetIndex !== drag.startTargetIndex)) {
      render();
      selectAfterBlockDrag(drag, true);
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

  function selectAfterBlockDrag(drag, focus) {
    var ids = (drag.groupIds || []).filter(function (id) {
      return !blockIsHidden(id);
    });
    if (ids.length > 1) {
      setBlockSelection(ids, ids.indexOf(drag.blockId) !== -1 ? drag.blockId : ids[0],
        { focus: !!focus });
    } else if (ids.length === 1) {
      selectBlock(ids[0], { focus: !!focus });
    } else {
      selectBlock(drag.blockId, { focus: !!focus });
    }
  }

  function announceSequencePosition(blockId) {
    var document = currentDocument();
    if (!document) {
      return;
    }
    var ordered = Model.normalizeSequence(document);
    var index = -1;
    for (var i = 0; i < ordered.length; i += 1) {
      if (ordered[i].id === blockId) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      return;
    }
    announce('區塊已移到第 ' + (index + 1) + ' 個位置，共 ' + ordered.length + ' 個區塊。');
  }

  function announceSequenceMove(ids, blockId) {
    if (!ids || ids.length <= 1) {
      announceSequencePosition(blockId);
      return;
    }
    var document = currentDocument();
    if (!document) {
      return;
    }
    var ordered = Model.normalizeSequence(document);
    var firstIndex = -1;
    ids.forEach(function (id) {
      for (var i = 0; i < ordered.length; i += 1) {
        if (ordered[i].id === id && (firstIndex === -1 || i < firstIndex)) {
          firstIndex = i;
          break;
        }
      }
    });
    if (firstIndex === -1) {
      return;
    }
    announce('已移動 ' + ids.length + ' 個區塊到第 ' + (firstIndex + 1) +
      ' 個位置，共 ' + ordered.length + ' 個區塊。');
  }

  function moveBlockByKeyboard(block, delta, options) {
    var opts = options || {};
    var document = currentDocument();
    if (!document) {
      return false;
    }
    var ordered = Model.normalizeSequence(document);
    var index = ordered.indexOf(block);
    if (index === -1) {
      return false;
    }
    var collapse = collapseModelForDocument(document, ordered);
    if (collapse.collapsed[block.id]) {
      var end = collapse.childEnd[block.id];
      var group = ordered.slice(index, end);
      var remaining = ordered.slice(0, index).concat(ordered.slice(end));
      var target = -1;
      if (delta < 0) {
        for (var previous = index - 1; previous >= 0; previous -= 1) {
          if (!collapse.hidden[ordered[previous].id]) {
            target = previous;
            break;
          }
        }
      } else {
        for (var next = end; next < ordered.length; next += 1) {
          if (!collapse.hidden[ordered[next].id]) {
            target = next - group.length + 1;
            break;
          }
        }
      }
      if (target < 0) {
        return false;
      }
      var moved = remaining.slice(0, target).concat(group, remaining.slice(target));
      document.blocks = moved;
      moved.forEach(function (entry, position) {
        entry.seq = position + 1;
      });
      document.layoutVersion = 2;
      markDirty();
      render();
      selectBlock(block.id, { focus: true });
      if (opts.focusHandle) {
        var groupElement = blockElement(block.id);
        var groupHandle = groupElement ? groupElement.querySelector('.drag-handle') : null;
        if (groupHandle) {
          groupHandle.focus();
        }
      }
      announceSequencePosition(block.id);
      return true;
    }
    var targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= ordered.length) {
      return false;
    }
    if (!Model.moveBlockToIndex(document, block.id, targetIndex)) {
      return false;
    }
    markDirty();
    render();
    selectBlock(block.id, { focus: true });
    if (opts.focusHandle) {
      var element = blockElement(block.id);
      var handle = element ? element.querySelector('.drag-handle') : null;
      if (handle) {
        handle.focus();
      }
    }
    announceSequencePosition(block.id);
    return true;
  }

  function moveComposerByKeyboard(delta) {
    var state = getState();
    if (!state || !state.document || !state.composer) {
      return false;
    }
    var ordered = Model.normalizeSequence(state.document);
    var current = Number(state.composer.insertIndex);
    if (!isFinite(current)) {
      current = ordered.length;
    }
    current = Math.max(0, Math.min(ordered.length, current));
    var next = current + delta;
    if (next < 0 || next > ordered.length || next === current) {
      return false;
    }
    state.composer.insertIndex = next;
    state.composer.anchorBlockId = next > 0 ? ordered[next - 1].id : null;
    render();
    var canvas = getCanvas();
    var handle = canvas ? canvas.querySelector('.composer-handle') : null;
    if (handle) {
      handle.focus();
    } else {
      focusComposer();
    }
    return true;
  }

  function focusZoneOfElement(element, block) {
    if (!element) {
      return null;
    }
    if (element.classList.contains('block-content') ||
        element.classList.contains('block-edit-input')) {
      return 'content';
    }
    if (element.classList.contains('block-collapse')) {
      return 'collapse';
    }
    if (element.classList.contains('block-marker')) {
      return 'marker';
    }
    if (element.classList.contains('drag-handle')) {
      return 'handle';
    }
    if (element.classList.contains('block-plus')) {
      return 'plus';
    }
    if (element.classList.contains('block-remove')) {
      return 'remove';
    }
    if (element === block) {
      return 'root';
    }
    if (element.closest && element.closest('.composer')) {
      if (element.closest('.composer-marker')) {
        return 'marker';
      }
      if (element.closest('.composer-handle')) {
        return 'handle';
      }
      return 'content';
    }
    return null;
  }

  function focusZoneInBlock(blockId, zone) {
    var block = blockElement(blockId);
    if (!block) {
      return;
    }
    var selector = '';
    if (zone === 'content') {
      selector = '.block-content, .block-edit-input';
    } else if (zone === 'collapse') {
      selector = '.block-collapse';
    } else if (zone === 'marker') {
      selector = '.block-marker';
    } else if (zone === 'handle') {
      selector = '.drag-handle';
    } else if (zone === 'plus') {
      selector = '.block-plus';
    } else if (zone === 'remove') {
      selector = '.block-remove';
    }
    var target = zone === 'root' ? block : (selector ? block.querySelector(selector) : null);
    if (!target) {
      target = block.querySelector('.block-content, .block-edit-input') || block;
    }
    target.focus();
  }

  function focusComposerZone(zone) {
    var canvas = getCanvas();
    if (!canvas) {
      return;
    }
    var target;
    if (zone === 'marker') {
      target = canvas.querySelector('.composer-marker');
    } else if (zone === 'handle') {
      target = canvas.querySelector('.composer-handle');
    } else {
      target = canvas.querySelector('.composer-input');
    }
    if (target) {
      target.focus();
    }
  }

  function selectAdjacentItem(currentItem, delta, zone) {
    var state = getState();
    if (!state || !state.document) {
      return false;
    }
    var items = navigationItemsFor(state);
    if (!items.length) {
      return false;
    }
    var index = -1;
    if (currentItem === 'composer') {
      for (var i = 0; i < items.length; i += 1) {
        if (isComposerItem(items[i])) {
          index = i;
          break;
        }
      }
    } else if (currentItem) {
      for (var j = 0; j < items.length; j += 1) {
        if (items[j].id === currentItem) {
          index = j;
          break;
        }
      }
    }
    if (index === -1) {
      index = delta > 0 ? -1 : 0;
    }
    var next = (index + delta + items.length) % items.length;
    var item = items[next];
    if (isComposerItem(item)) {
      clearSelection();
      focusComposerZone(zone);
    } else if (zone === 'content' && item.type === 'text') {
      beginEditing(item.id);
    } else if (zone) {
      selectBlock(item.id, { focus: false });
      focusZoneInBlock(item.id, zone);
    } else {
      selectBlock(item.id, { focus: true });
    }
    return true;
  }

  function navigateFromEditing(delta) {
    var state = getState();
    if (!state || !state.editingBlockId) {
      return false;
    }
    var editingId = state.editingBlockId;
    var before = navigationItemsFor(state);
    var indexBefore = -1;
    for (var i = 0; i < before.length; i += 1) {
      if (before[i].id === editingId) {
        indexBefore = i;
        break;
      }
    }

    commitEditing();

    var nextState = getState();
    if (!nextState || !nextState.document) {
      return false;
    }
    var items = navigationItemsFor(nextState);
    if (!items.length) {
      return true;
    }

    var index = -1;
    for (var j = 0; j < items.length; j += 1) {
      if (items[j].id === editingId) {
        index = j;
        break;
      }
    }

    var target = null;
    if (index !== -1) {
      target = items[(index + delta + items.length) % items.length];
    } else if (indexBefore !== -1) {
      var fallback = delta < 0 ? indexBefore - 1 : indexBefore;
      if (fallback < 0) {
        fallback = items.length - 1;
      } else if (fallback >= items.length) {
        fallback = 0;
      }
      target = items[fallback];
    }

    if (!target) {
      return true;
    }
    if (isComposerItem(target)) {
      clearSelection();
      focusComposerZone('content');
    } else if (target.type === 'text') {
      beginEditing(target.id);
    } else {
      selectBlock(target.id, { focus: false });
      focusZoneInBlock(target.id, 'content');
    }
    return true;
  }

  function beginEditing(blockId, options) {
    var block = findBlock(blockId);
    var state = getState();
    if (!block || block.type !== 'text' || !state) {
      return;
    }
    var caret = options && options.caret !== undefined ? options.caret : 0;
    var caretEnd = options && options.caretEnd !== undefined
      ? options.caretEnd
      : (options && options.caret !== undefined ? caret : block.text.length);
    editDraft = {
      id: block.id,
      text: block.text,
      draftText: block.text,
      marker: block.marker,
      originalMarker: block.marker,
      caret: caret,
      caretEnd: caretEnd
    };
    state.editingBlockId = block.id;
    state.selectedBlockIds = [block.id];
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
    schedulePreviewRefresh();
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
      removeBlockFromDocument(state.document, block.id);
      removeFromSelection(block.id);
      markDirty();
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
    schedulePreviewRefresh();
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
    var ordered = Model.normalizeSequence(document);
    return ordered.length ? ordered[ordered.length - 1] : null;
  }

  function previewDocument() {
    var state = getState();
    var document = state && state.document;
    if (!document) {
      return null;
    }
    var editing = editDraft && state.editingBlockId === editDraft.id ? editDraft : null;
    var composer = state.composer;
    var hasComposerText = !!(composer && String(composer.text || '').trim() !== '');
    if (!editing && !hasComposerText) {
      return document;
    }
    var blocks = [];
    (document.blocks || []).forEach(function (block) {
      if (editing && block.id === editing.id) {
        if (String(editing.draftText || '').trim() !== '') {
          blocks.push(Object.assign({}, block, {
            text: editing.draftText,
            marker: editing.marker
          }));
        }
        return;
      }
      blocks.push(block);
    });
    if (hasComposerText) {
      var value = String(composer.text || '');
      var detected = Markdown.detectMarker(value);
      var marker = composer.markerOverride ||
        (detected.marker !== 'none' ? detected.marker : composer.marker) || 'none';
      var text = detected.marker !== 'none' ? detected.text : value;
      if (text.trim() !== '') {
        var index = Math.max(0, Math.min(Number(composer.insertIndex) || 0, blocks.length));
        blocks.splice(index, 0, {
          id: '__preview_composer__',
          type: 'text',
          text: text,
          marker: marker,
          x: Files.COLUMN_X,
          y: Number(composer.y) || Files.COLUMN_START_Y,
          z: 0,
          seq: index,
          blankLinesAfter: 0
        });
      }
    }
    return Object.assign({}, document, { blocks: blocks });
  }

  function elementHeightFor(block) {
    if (block && blockIsHidden(block.id)) {
      return 0;
    }
    var element = block ? blockElement(block.id) : null;
    return element ? element.offsetHeight : DEFAULT_BLOCK_HEIGHT;
  }

  function autoResizeTextarea(input) {
    if (!input || input.tagName !== 'TEXTAREA') {
      return false;
    }
    var previous = input.style.height;
    var container = input.closest('.composer, .block');
    if (container && container.offsetWidth > 0 && input.clientWidth > 0) {
      var style = global.getComputedStyle(input);
      var font = style.font ||
        [style.fontStyle, style.fontVariant, style.fontWeight, style.fontSize,
          style.fontFamily].join(' ');
      if (!measureCanvas && global.document && global.document.createElement) {
        measureCanvas = global.document.createElement('canvas');
      }
      var context = measureCanvas && measureCanvas.getContext
        ? measureCanvas.getContext('2d')
        : null;
      var textWidth = 0;
      if (context) {
        context.font = font;
        String(input.value || '').split('\n').forEach(function (line) {
          textWidth = Math.max(textWidth, context.measureText(line || ' ').width);
        });
      }
      var chromeWidth = container.offsetWidth - input.clientWidth;
      var hint = container.querySelector('.composer-detection');
      var hintWidth = 0;
      if (context && hint && hint.textContent) {
        var hintStyle = global.getComputedStyle(hint);
        context.font = hintStyle.font ||
          [hintStyle.fontStyle, hintStyle.fontVariant, hintStyle.fontWeight,
            hintStyle.fontSize, hintStyle.fontFamily].join(' ');
        hintWidth = context.measureText(hint.textContent).width;
      }
      container.style.width =
        Math.ceil(Math.max(textWidth, hintWidth) + chromeWidth + 2) + 'px';
    }
    input.style.height = 'auto';
    var height = input.scrollHeight;
    if (height > 0) {
      input.style.height = height + 'px';
    }
    return input.style.height !== previous;
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

  function insertBlockWithShift(block, anchorId) {
    var document = currentDocument();
    if (!document) {
      return;
    }
    Model.insertBlocksAfter(document, [block], anchorId);
    render();
  }

  function inheritedComposerMarker(anchor) {
    var state = getState();
    var fallback = state && state.preferences
      ? state.preferences.defaultMarker
      : 'none';
    var document = currentDocument();
    if (!document) {
      return fallback;
    }
    if (anchor && anchor.type === 'text') {
      return anchor.marker;
    }
    var ordered = Model.normalizeSequence(document);
    var index = ordered.length - 1;
    if (anchor) {
      for (var i = 0; i < ordered.length; i += 1) {
        if (ordered[i].id === anchor.id) {
          index = i;
          break;
        }
      }
    }
    for (var k = index; k >= 0; k -= 1) {
      if (ordered[k].type === 'text') {
        return ordered[k].marker;
      }
    }
    return fallback;
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
    var ordered = Model.normalizeSequence(state.document);
    var insertIndex = ordered.length;
    if (anchor) {
      var anchorIndex = ordered.indexOf(anchor);
      if (anchorIndex !== -1) {
        insertIndex = anchorIndex + 1;
      }
    }
    var point = insertionPoint(anchor);
    clearSelection();
    state.composer = Model.createComposer({
      mode: anchor ? 'inserted' : 'initial',
      anchorBlockId: anchor ? anchor.id : null,
      insertIndex: insertIndex,
      x: point.x,
      y: point.y,
      marker: inheritedComposerMarker(anchor),
      text: ''
    });
    render();
    schedulePreviewRefresh();
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
    schedulePreviewRefresh();
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
    var document = state.document;
    var items = composer.markerOverride
      ? null
      : Markdown.splitComposerItems(value);
    if (items) {
      var nextZ = Model.nextZ(document);
      var blocks = items.map(function (item, index) {
        return Model.createTextBlock({
          id: Utils.randomUUID(),
          text: item.text,
          marker: item.marker,
          x: Files.COLUMN_X,
          y: Files.COLUMN_START_Y,
          z: nextZ + index,
          seq: 0,
          blankLinesAfter: item.blankLinesAfter || 0
        });
      });
      Model.insertBlocksAtIndex(document, blocks, composer.insertIndex);
      var last = blocks[blocks.length - 1];
      state.composer = null;
      markDirty();
      clearSelection();
      openComposer(last.id);
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
    var block = Model.createTextBlock({
      id: Utils.randomUUID(),
      text: text,
      marker: marker,
      x: Files.COLUMN_X,
      y: Files.COLUMN_START_Y,
      z: Model.nextZ(document),
      seq: 0,
      blankLinesAfter: 0
    });
    Model.insertBlocksAtIndex(document, [block], composer.insertIndex);
    state.composer = null;
    markDirty();
    clearSelection();
    openComposer(block.id);
  }

  function focusComposer(selectionStart, selectionEnd) {
    var canvas = getCanvas();
    if (!canvas) {
      return;
    }
    var input = canvas.querySelector('.composer-input');
    if (input) {
      input.focus();
      try {
        var start = selectionStart === undefined || selectionStart === null
          ? input.value.length
          : selectionStart;
        var end = selectionEnd === undefined || selectionEnd === null
          ? start
          : selectionEnd;
        start = Math.max(0, Math.min(start, input.value.length));
        end = Math.max(0, Math.min(end, input.value.length));
        input.setSelectionRange(start, end);
      } catch (error) {
        // Ignore.
      }
    }
  }

  function removeBlockFromDocument(document, blockId) {
    var state = getState();
    var composer = state && state.composer;
    var ordered = document ? Model.normalizeSequence(document) : [];
    var removedBlock = findBlock(blockId);
    var removedIndex = removedBlock ? ordered.indexOf(removedBlock) : -1;
    var previous = removedIndex > 0 ? ordered[removedIndex - 1] : null;
    var removed = Model.removeBlock(document, blockId);
    if (removed && composer) {
      if (removedIndex !== -1 && removedIndex < composer.insertIndex) {
        composer.insertIndex = Math.max(0, composer.insertIndex - 1);
      }
      if (composer.anchorBlockId === blockId) {
        composer.anchorBlockId = previous ? previous.id : null;
      }
    }
    return removed;
  }

  function releaseUnusedAsset(state, assetId) {
    if (!state || !assetId) {
      return;
    }
    var stillUsed = state.document.blocks.some(function (entry) {
      return entry.type === 'image' && entry.assetId === assetId;
    });
    if (stillUsed) {
      return;
    }
    state.assets = state.assets.filter(function (asset) { return asset.id !== assetId; });
    if (objectUrls[assetId]) {
      try { global.URL.revokeObjectURL(objectUrls[assetId]); } catch (error) { /* ignore */ }
      delete objectUrls[assetId];
    }
  }

  function removeImageBlock(blockId) {
    var state = getState();
    var block = findBlock(blockId);
    if (!state || !block || block.type !== 'image') {
      return;
    }
    var assetId = block.assetId;
    removeBlockFromDocument(state.document, blockId);
    releaseUnusedAsset(state, assetId);
    markDirty();
    removeFromSelection(blockId);
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

  function removeSelectedBlocks() {
    var state = getState();
    if (!state || !state.document) {
      return false;
    }
    var ids = selectedBlockIds(state).slice();
    if (!ids.length && state.selectedBlockId) {
      ids = [state.selectedBlockId];
    }
    if (!ids.length) {
      return false;
    }
    var ordered = Model.normalizeSequence(state.document);
    var indexById = {};
    ordered.forEach(function (block, index) {
      indexById[block.id] = index;
    });
    ids = ids.filter(function (id) {
      return indexById[id] !== undefined;
    });
    if (!ids.length) {
      return false;
    }
    ids.sort(function (left, right) {
      return indexById[right] - indexById[left];
    });
    var assetIds = [];
    var removedCount = 0;
    ids.forEach(function (id) {
      var block = findBlock(id);
      if (!block) {
        return;
      }
      if (block.type === 'image') {
        assetIds.push(block.assetId);
      }
      if (removeBlockFromDocument(state.document, id)) {
        removedCount += 1;
      }
    });
    if (removedCount === 0) {
      return false;
    }
    assetIds.forEach(function (assetId) {
      releaseUnusedAsset(state, assetId);
    });
    if (state.composer) {
      var remaining = Model.normalizeSequence(state.document);
      var insertIndex = Math.max(0, Math.min(remaining.length,
        Number(state.composer.insertIndex) || 0));
      state.composer.insertIndex = insertIndex;
      state.composer.anchorBlockId = insertIndex > 0
        ? remaining[insertIndex - 1].id
        : null;
    }
    setBlockSelection([], null, { focus: false });
    markDirty();
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
    announce('已刪除 ' + removedCount + ' 個區塊。');
    return true;
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
            x: Files.COLUMN_X,
            y: Files.COLUMN_START_Y,
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
          x: Files.COLUMN_X,
          y: Files.COLUMN_START_Y,
          z: 0,
          seq: 0,
          blankLinesAfter: 0
        }));
      });

      if (newBlocks.length === 0) {
        return false;
      }

      newAssets.forEach(function (asset) { state.assets.push(asset); });
      var nextZ = Model.nextZ(document);
      newBlocks.forEach(function (block, index) {
        block.seq = index + 1;
        block.z = nextZ + index;
      });
      Model.insertBlocksAfter(document, newBlocks, anchor ? anchor.id : null);

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

  function openMarkerMenu(anchor, currentMarker, onSelect, onToggle, options) {
    var opts = options || {};
    var focusMenu = opts.focusMenu !== false;
    var hoverOpened = opts.hoverOpened === true;
    cancelMarkerMenuClose();
    if (markerMenu && markerMenu.anchor === anchor) {
      if (focusMenu) {
        markerMenu.hoverOpened = false;
        var existingChecked = markerMenu.element.querySelector('[aria-checked="true"]') ||
          markerMenu.element.querySelector('.marker-menu-item');
        if (existingChecked) {
          existingChecked.focus();
        }
      }
      return;
    }
    closeMarkerMenu();
    var menu = global.document.createElement('div');
    menu.className = 'marker-menu menu marker-menu-grid';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '選擇標記');
    var labels = {
      none: '無標記',
      '#': '# 標題 1',
      '##': '## 標題 2',
      '###': '### 標題 3',
      '-': '- 項目',
      '1.': '1. 編號項目',
      '>': '> 引用',
      '.': '. 點號'
    };
    var menuOrder = ['none', '1.', '>', '.', '-', '#', '##', '###'];
    menuOrder.forEach(function (marker) {
      var item = global.document.createElement('button');
      item.type = 'button';
      item.className = 'menu-item marker-menu-item';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', marker === currentMarker ? 'true' : 'false');
      item.setAttribute('aria-label', labels[marker] || marker);
      item.dataset.marker = marker;
      item.textContent = marker === 'none' ? '×' : markerToken(marker);
      item.addEventListener('click', function () {
        closeMarkerMenu();
        onSelect(marker);
        var active = global.document.activeElement;
        if (!active || active === global.document.body || !active.isConnected) {
          anchor.focus();
        }
      });
      item.addEventListener('keydown', function (event) {
        if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          item.click();
        }
      });
      menu.appendChild(item);
    });
    global.document.body.appendChild(menu);
    var row = anchor.closest('.block') ||
      anchor.closest('.composer') ||
      anchor;
    var rect = row.getBoundingClientRect();
    var markerRect = anchor.getBoundingClientRect();
    var menuWidth = menu.offsetWidth;
    var menuHeight = menu.offsetHeight;
    var left = markerRect.left + (markerRect.width - menuWidth) / 2;
    var alignment = 'marker-center';
    var pageLeft = 8;
    var pageRight = global.innerWidth - menuWidth - 8;
    if (left < pageLeft) {
      left = pageLeft;
      alignment = 'page-left';
    } else if (left > pageRight) {
      left = pageRight;
      alignment = 'page-right';
    }
    var top = rect.top - menuHeight - 8;
    var placement = 'above';
    if (top < 4) {
      top = rect.bottom + 8;
      placement = 'below';
    }
    top = Math.max(4, Math.min(top, global.innerHeight - menuHeight - 4));
    menu.dataset.placement = placement;
    menu.dataset.alignment = alignment;
    menu.style.left = Math.round(left) + 'px';
    menu.style.top = Math.round(top) + 'px';
    markerMenu = {
      element: menu,
      anchor: anchor,
      onToggle: onToggle,
      hoverOpened: hoverOpened
    };
    if (onToggle) {
      onToggle(true);
    }
    menu.addEventListener('pointerenter', function () {
      cancelMarkerMenuClose();
    });
    menu.addEventListener('pointerleave', function () {
      scheduleMarkerMenuClose();
    });
    var items = Array.prototype.slice.call(menu.querySelectorAll('.marker-menu-item'));
    var checked = menu.querySelector('[aria-checked="true"]') || items[0];
    if (focusMenu && checked) {
      checked.focus();
    }
    menu.addEventListener('keydown', function (event) {
      var current = items.indexOf(global.document.activeElement);
      var target = null;
      if (event.key === 'ArrowDown') {
        target = current + 4;
      } else if (event.key === 'ArrowUp') {
        target = current - 4;
      } else if (event.key === 'ArrowRight') {
        target = current + 1;
      } else if (event.key === 'ArrowLeft') {
        target = current - 1;
      }
      if (target !== null) {
        event.preventDefault();
        items[(target + items.length * 2) % items.length].focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        items[0].focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        closeMarkerMenu();
        var item = anchor.closest ? (anchor.closest('.block') || anchor.closest('.composer')) : null;
        var focusables = item ? focusablesForItem(item) : canvasFocusables(getCanvas());
        if (item && item.classList.contains('block')) {
          var targetNode = event.shiftKey
            ? focusables[focusables.length - 1]
            : focusables[0];
          if (targetNode) {
            focusTabTarget(targetNode);
          } else {
            anchor.focus();
          }
          return;
        }
        var index = focusables.indexOf(anchor);
        if (index === -1) {
          anchor.focus();
          return;
        }
        var next = event.shiftKey
          ? (index === 0 ? focusables.length - 1 : index - 1)
          : (index === focusables.length - 1 ? 0 : index + 1);
        focusables[next].focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeMarkerMenu();
        anchor.focus();
      }
    });
    global.document.addEventListener('keydown', onMarkerEscape, true);
    global.document.addEventListener('pointerdown', onMarkerOutside, true);
  }

  function onMarkerEscape(event) {
    if (!markerMenu || event.key !== 'Escape') {
      return;
    }
    if (markerMenu.element.contains(event.target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    closeMarkerMenu();
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
      cancelMarkerMenuClose();
      return;
    }
    cancelMarkerMenuClose();
    var menu = markerMenu;
    markerMenu = null;
    global.document.removeEventListener('keydown', onMarkerEscape, true);
    global.document.removeEventListener('pointerdown', onMarkerOutside, true);
    if (menu.element.parentNode) {
      menu.element.parentNode.removeChild(menu.element);
    }
    if (menu.onToggle) {
      menu.onToggle(false);
    }
  }

  function handleBlockKeydown(event) {
    if (dragState || marqueeState || event.defaultPrevented) {
      return;
    }
    var target = event.target;
    if (!target || !target.closest || event.isComposing) {
      return;
    }
    var plainArrow = !event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown');
    var arrowDelta = event.key === 'ArrowDown' ? 1 : -1;
    if (plainArrow && target.closest('.composer-handle')) {
      event.preventDefault();
      event.stopPropagation();
      moveComposerByKeyboard(arrowDelta);
      return;
    }
    if (plainArrow && target.closest('.composer')) {
      event.preventDefault();
      event.stopPropagation();
      selectAdjacentItem('composer', arrowDelta,
        focusZoneOfElement(target, null));
      return;
    }
    if (plainArrow && target.closest('.block-edit-input')) {
      event.preventDefault();
      event.stopPropagation();
      navigateFromEditing(arrowDelta);
      return;
    }
    if (target.closest('input, textarea, select, [contenteditable="true"]') ||
        target.isContentEditable) {
      return;
    }
    if (target.closest('.composer')) {
      return;
    }
    var state = getState();
    var blockElementNode = target.closest('.block');
    var block = blockElementNode ? findBlock(blockElementNode.dataset.blockId) : null;
    if (plainArrow) {
      if (block && target.closest('.drag-handle')) {
        event.preventDefault();
        event.stopPropagation();
        moveBlockByKeyboard(block, arrowDelta, { focusHandle: true });
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      selectAdjacentItem(block ? block.id : (state ? state.selectedBlockId : null),
        arrowDelta, block ? focusZoneOfElement(target, block) : null);
      return;
    }
    if (!block) {
      return;
    }
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' ||
        event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      var moveDelta = (event.key === 'ArrowLeft' || event.key === 'ArrowUp') ? -1 : 1;
      moveBlockByKeyboard(block, moveDelta);
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      if (block.type === 'text' && !target.closest('button')) {
        event.preventDefault();
        event.stopPropagation();
        beginEditing(block.id);
      }
      return;
    }
  }

  function handleCanvasDeleteKeydown(event) {
    if (dragState || marqueeState || event.defaultPrevented) {
      return;
    }
    if (event.key !== 'Delete' && event.key !== 'Backspace') {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    var target = event.target;
    if (target && target.closest &&
        (target.closest('input, textarea, select, .composer, [contenteditable="true"]') ||
         target.isContentEditable)) {
      return;
    }
    var state = getState();
    if (!state || !state.document || state.editingBlockId) {
      return;
    }
    if (!selectedBlockIds(state).length && !state.selectedBlockId) {
      return;
    }
    if (global.document.querySelector('dialog[open]')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    removeSelectedBlocks();
  }

  function canvasFocusables(container) {
    if (!container) {
      return [];
    }
    var selector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    return Array.prototype.filter.call(container.querySelectorAll(selector), function (node) {
      if (node.hidden || node.disabled) {
        return false;
      }
      if (node.getAttribute('aria-hidden') === 'true' || node.closest('[hidden]')) {
        return false;
      }
      if (node.tabIndex < 0 || node.getClientRects().length === 0) {
        return false;
      }
      var style = global.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function blockFocusPriority(node) {
    if (node.classList.contains('block-content') ||
        node.classList.contains('block-edit-input')) {
      return 1;
    }
    if (node.classList.contains('block-collapse')) {
      return 2;
    }
    if (node.classList.contains('block-marker')) {
      return 3;
    }
    if (node.classList.contains('drag-handle')) {
      return 4;
    }
    if (node.classList.contains('block-remove')) {
      return 5;
    }
    if (node.classList.contains('block-plus')) {
      return 6;
    }
    return 7;
  }

  function focusablesForItem(item) {
    if (!item) {
      return [];
    }
    if (item.classList && item.classList.contains('block')) {
      var nodes = canvasFocusables(item).sort(function (left, right) {
        return blockFocusPriority(left) - blockFocusPriority(right);
      });
      return nodes.concat([item]);
    }
    return canvasFocusables(item);
  }

  function currentItemForTab(active) {
    if (!active || !active.closest) {
      return null;
    }
    var block = active.closest('.block');
    if (block) {
      return block;
    }
    return active.closest('.composer');
  }

  function tabFocusables(canvas, active) {
    var item = currentItemForTab(active);
    if (item) {
      return focusablesForItem(item);
    }
    var state = getState();
    if (state && state.selectedBlockId) {
      var selected = blockElement(state.selectedBlockId);
      if (selected) {
        return focusablesForItem(selected);
      }
    }
    return canvasFocusables(canvas);
  }

  function focusTabTarget(target) {
    if (!target) {
      return;
    }
    closeMarkerMenu();
    if (target.classList.contains('block-content')) {
      var block = target.closest('.block');
      if (block && block.dataset.blockId) {
        beginEditing(block.dataset.blockId);
        return;
      }
    }
    target.focus();
    if ((target.classList.contains('block-marker') ||
        target.classList.contains('composer-marker')) &&
        target._prompterMarkerMenu) {
      target._prompterMarkerMenu.open();
    }
  }

  function handleCanvasTabKeydown(event) {
    if (dragState || marqueeState || event.key !== 'Tab' || event.defaultPrevented) {
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    var canvas = getCanvas();
    var active = global.document.activeElement;
    if (!canvas || !active || !canvas.contains(active)) {
      return;
    }
    var focusables = tabFocusables(canvas, active);
    if (!focusables.length) {
      return;
    }
    var index = focusables.indexOf(active);
    var next;
    if (index === -1) {
      next = event.shiftKey ? focusables.length - 1 : 0;
    } else if (event.shiftKey) {
      next = index === 0 ? focusables.length - 1 : index - 1;
    } else {
      next = index === focusables.length - 1 ? 0 : index + 1;
    }
    event.preventDefault();
    event.stopPropagation();
    focusTabTarget(focusables[next]);
  }

  function selectionInReadingOrder(ids) {
    var state = getState();
    if (!state || !state.document) {
      return ids.slice();
    }
    var wanted = {};
    ids.forEach(function (id) {
      wanted[id] = true;
    });
    var ordered = [];
    state.document.blocks.forEach(function (block) {
      if (wanted[block.id]) {
        ordered.push(block.id);
      }
    });
    return ordered;
  }

  function blocksInMarquee(left, top, right, bottom) {
    var state = getState();
    var canvas = getCanvas();
    if (!state || !state.document || !canvas) {
      return [];
    }
    var canvasRect = canvas.getBoundingClientRect();
    var ids = [];
    state.document.blocks.forEach(function (block) {
      var element = blockElement(block.id);
      if (!element) {
        return;
      }
      var rect = element.getBoundingClientRect();
      var blockLeft = rect.left - canvasRect.left;
      var blockTop = rect.top - canvasRect.top;
      if (blockLeft < right && blockLeft + rect.width > left &&
          blockTop < bottom && blockTop + rect.height > top) {
        ids.push(block.id);
      }
    });
    return ids;
  }

  function beginMarquee(event) {
    if (marqueeState || dragState) {
      return;
    }
    if (event.pointerType === 'touch') {
      return;
    }
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    var canvas = getCanvas();
    var state = getState();
    if (!canvas || !state || !state.document) {
      return;
    }
    closeMarkerMenu();
    clearBlockHover();
    var rect = canvas.getBoundingClientRect();
    var element = global.document.createElement('div');
    element.className = 'selection-marquee';
    element.setAttribute('aria-hidden', 'true');
    element.hidden = true;
    canvas.appendChild(element);
    var startX = Utils.clamp(event.clientX - rect.left, 0, canvas.clientWidth);
    var startY = Utils.clamp(event.clientY - rect.top, 0, canvas.clientHeight);
    marqueeState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: startX,
      startY: startY,
      currentX: startX,
      currentY: startY,
      element: element,
      baseSelection: selectedBlockIds(state).slice(),
      baseActiveId: state.selectedBlockId,
      additive: !!(event.metaKey || event.ctrlKey),
      moved: false,
      lastSelectionKey: null
    };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // Synthetic pointer events and some environments do not allow capture.
    }
    global.addEventListener('pointermove', onMarqueeMove, true);
    global.addEventListener('pointerup', onMarqueeEnd, true);
    global.addEventListener('pointercancel', onMarqueeCancel, true);
    global.addEventListener('keydown', onMarqueeKeydown, true);
  }

  function onMarqueeMove(event) {
    if (!marqueeState || event.pointerId !== marqueeState.pointerId) {
      return;
    }
    var marquee = marqueeState;
    var dx = event.clientX - marquee.startClientX;
    var dy = event.clientY - marquee.startClientY;
    if (!marquee.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
      return;
    }
    var canvas = getCanvas();
    if (!canvas) {
      return;
    }
    var rect = canvas.getBoundingClientRect();
    marquee.currentX = Utils.clamp(event.clientX - rect.left, 0, canvas.clientWidth);
    marquee.currentY = Utils.clamp(event.clientY - rect.top, 0, canvas.clientHeight);
    marquee.moved = true;
    var left = Math.min(marquee.startX, marquee.currentX);
    var top = Math.min(marquee.startY, marquee.currentY);
    var right = Math.max(marquee.startX, marquee.currentX);
    var bottom = Math.max(marquee.startY, marquee.currentY);
    marquee.element.hidden = false;
    marquee.element.style.left = left + 'px';
    marquee.element.style.top = top + 'px';
    marquee.element.style.width = (right - left) + 'px';
    marquee.element.style.height = (bottom - top) + 'px';

    var hitIds = blocksInMarquee(left, top, right, bottom);
    var combined = marquee.additive ? marquee.baseSelection.concat(hitIds) : hitIds;
    var selection = selectionInReadingOrder(combined);
    var key = selection.join(',');
    if (key !== marquee.lastSelectionKey) {
      marquee.lastSelectionKey = key;
      var active = hitIds.length
        ? hitIds[hitIds.length - 1]
        : (selection.length ? selection[selection.length - 1] : null);
      setBlockSelection(selection, active, { focus: false });
    }
    event.preventDefault();
  }

  function onMarqueeKeydown(event) {
    if (!marqueeState || event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    finishMarquee(false);
  }

  function finishMarquee(commit) {
    if (!marqueeState) {
      return;
    }
    var marquee = marqueeState;
    marqueeState = null;
    global.removeEventListener('pointermove', onMarqueeMove, true);
    global.removeEventListener('pointerup', onMarqueeEnd, true);
    global.removeEventListener('pointercancel', onMarqueeCancel, true);
    global.removeEventListener('keydown', onMarqueeKeydown, true);
    var canvas = getCanvas();
    if (canvas) {
      try {
        canvas.releasePointerCapture(marquee.pointerId);
      } catch (error) {
        // Ignore environments where capture was not established.
      }
    }
    if (marquee.element.parentNode) {
      marquee.element.parentNode.removeChild(marquee.element);
    }
    suppressNextCanvasClick();
    if (!marquee.moved) {
      if (!marquee.additive) {
        clearSelection();
      }
      return;
    }
    if (!commit) {
      setBlockSelection(marquee.baseSelection, marquee.baseActiveId, { focus: false });
    }
  }

  function onMarqueeEnd(event) {
    if (!marqueeState || event.pointerId !== marqueeState.pointerId) {
      return;
    }
    finishMarquee(true);
  }

  function onMarqueeCancel(event) {
    if (!marqueeState || event.pointerId !== marqueeState.pointerId) {
      return;
    }
    finishMarquee(false);
  }

  function suppressNextCanvasClick() {
    ignoreNextCanvasClick = true;
    if (ignoreCanvasClickTimer !== null) {
      global.clearTimeout(ignoreCanvasClickTimer);
    }
    ignoreCanvasClickTimer = global.setTimeout(function () {
      ignoreCanvasClickTimer = null;
      ignoreNextCanvasClick = false;
    }, 0);
  }

  function consumeCanvasClickSuppression() {
    if (!ignoreNextCanvasClick) {
      return false;
    }
    ignoreNextCanvasClick = false;
    if (ignoreCanvasClickTimer !== null) {
      global.clearTimeout(ignoreCanvasClickTimer);
      ignoreCanvasClickTimer = null;
    }
    return true;
  }

  function handleCanvasClick(event) {
    if (consumeCanvasClickSuppression()) {
      return;
    }
    var target = event.target;
    if (target === event.currentTarget) {
      if (!(event.metaKey || event.ctrlKey)) {
        clearSelection();
      }
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
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      toggleBlockSelection(block.dataset.blockId);
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
    consumeCanvasClickSuppression();
    if (marqueeState) {
      return;
    }
    if (event.target.closest && event.target.closest('.composer')) {
      return;
    }
    if (event.target.closest && event.target.closest('button, input, .block-edit-input')) {
      return;
    }
    var blockElementNode = event.target.closest ? event.target.closest('.block') : null;
    if (!blockElementNode) {
      beginMarquee(event);
      return;
    }
    var state = getState();
    if (state && state.editingBlockId === blockElementNode.dataset.blockId) {
      return;
    }
    if (event.metaKey || event.ctrlKey) {
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
    canvas.addEventListener('keydown', handleCanvasDeleteKeydown);
    canvas.addEventListener('keydown', handleCanvasTabKeydown);
    global.document.addEventListener('pointermove', handleBlockHover);
    global.document.addEventListener('pointerleave', clearBlockHover);
    global.addEventListener('pointerleave', clearBlockHover);
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
    global.addEventListener('resize', function () {
      if (dragState) {
        finishDrag(false);
      }
      if (marqueeState) {
        finishMarquee(false);
      }
      reflowSequenceLayout();
    });
    global.addEventListener('blur', function () {
      clearBlockHover();
      closeMarkerMenu();
      if (dragState) {
        finishDrag(false);
      }
      if (marqueeState) {
        finishMarquee(false);
      }
    });
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
    insertImageFiles: insertImageFiles,
    insertPastedContent: insertPastedContent,
    previewDocument: previewDocument,
    reflowLayout: reflowSequenceLayout,
    getEditingBlockId: function () {
      var state = getState();
      return state ? state.editingBlockId : null;
    },
    getSelectedBlockId: function () {
      var state = getState();
      return state ? state.selectedBlockId : null;
    },
    getSelectedBlockIds: function () {
      var state = getState();
      return selectedBlockIds(state).slice();
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
