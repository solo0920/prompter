(function (global) {
  'use strict';

  var Utils = (typeof module === 'object' && module.exports)
    ? require('./utils.js')
    : global.Prompter.utils;
  var Markdown = (typeof module === 'object' && module.exports)
    ? require('./markdown.js')
    : global.Prompter.markdown;

  var SCHEMA_VERSION = 1;
  var MAX_TITLE_LENGTH = 200;
  var SUPPORTED_STYLES = [
    'apple', 'nvidia', 'meta', 'ibm', 'stripe', 'vercel',
    'notion', 'figma', 'spacex', 'spotify'
  ];
  var DEFAULT_STYLE = 'apple';

  function valueOr(value, fallback) {
    return value === undefined || value === null ? fallback : value;
  }

  function normalizeTitle(title) {
    var value = String(title == null ? '' : title).trim();
    if (!value) {
      value = 'Untitled';
    }
    return Utils.truncateCodePoints(value, MAX_TITLE_LENGTH);
  }

  function normalizeMarker(marker) {
    return Utils.isSupportedMarker(marker) ? marker : 'none';
  }

  function isSupportedStyle(style) {
    return SUPPORTED_STYLES.indexOf(style) !== -1;
  }

  function normalizeStyle(style) {
    return isSupportedStyle(style) ? style : DEFAULT_STYLE;
  }

  function normalizeTheme(theme) {
    return theme === 'light' || theme === 'dark' ? theme : 'system';
  }

  function createLibrary(overrides) {
    var input = overrides || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      documents: Object.prototype.toString.call(input.documents) === '[object Array]'
        ? input.documents.slice()
        : [],
      updatedAt: input.updatedAt || Utils.nowIso()
    };
  }

  function createPromptDocument(overrides) {
    var input = overrides || {};
    var title = normalizeTitle(valueOr(input.title, 'Untitled'));
    var now = Utils.nowIso();
    var fileName;
    if (input.fileName) {
      fileName = Utils.ensureMarkdownExtension(input.fileName);
    } else if (title === 'Untitled') {
      fileName = 'untitled.md';
    } else {
      fileName = Utils.ensureMarkdownExtension(title);
    }
    return {
      id: input.id || Utils.randomUUID(),
      title: title,
      fileName: fileName,
      blocks: Object.prototype.toString.call(input.blocks) === '[object Array]' ? input.blocks.slice() : [],
      leadingBlankLines: valueOr(input.leadingBlankLines, 0),
      trailingBlankLines: valueOr(input.trailingBlankLines, 0),
      trailingNewline: valueOr(input.trailingNewline, true),
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now
    };
  }

  function baseBlockFields(input) {
    return {
      id: input.id || Utils.randomUUID(),
      x: valueOr(input.x, 0),
      y: valueOr(input.y, 0),
      z: valueOr(input.z, 0),
      seq: valueOr(input.seq, 0),
      blankLinesAfter: valueOr(input.blankLinesAfter, 0)
    };
  }

  function createTextBlock(overrides) {
    var input = overrides || {};
    var block = baseBlockFields(input);
    block.type = 'text';
    block.text = valueOr(input.text, '');
    block.marker = normalizeMarker(valueOr(input.marker, 'none'));
    return block;
  }

  function createImageBlock(overrides) {
    var input = overrides || {};
    var block = baseBlockFields(input);
    block.type = 'image';
    block.assetId = valueOr(input.assetId, '');
    block.alt = valueOr(input.alt, '');
    return block;
  }

  function createImageAsset(overrides) {
    var input = overrides || {};
    var asset = {
      id: input.id || Utils.randomUUID(),
      documentId: valueOr(input.documentId, ''),
      fileName: valueOr(input.fileName, ''),
      originalName: valueOr(input.originalName, ''),
      mimeType: valueOr(input.mimeType, ''),
      width: valueOr(input.width, 0),
      height: valueOr(input.height, 0),
      size: valueOr(input.size, 0),
      createdAt: input.createdAt || Utils.nowIso()
    };
    if (input.blob !== undefined) {
      asset.blob = input.blob;
    }
    if (input.dataUrl !== undefined) {
      asset.dataUrl = input.dataUrl;
    }
    if (input.bytes !== undefined) {
      asset.bytes = input.bytes;
    }
    return asset;
  }

  function createPreferences(overrides) {
    var input = overrides || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      style: normalizeStyle(input.style),
      theme: normalizeTheme(input.theme),
      defaultMarker: normalizeMarker(valueOr(input.defaultMarker, 'none')),
      showGrid: input.showGrid === true,
      lastDocumentId: typeof input.lastDocumentId === 'string' && input.lastDocumentId
        ? input.lastDocumentId
        : null
    };
  }

  function normalizePreferences(input) {
    return createPreferences(input || {});
  }

  function createComposer(overrides) {
    var input = overrides || {};
    return {
      mode: input.mode === 'inserted' ? 'inserted' : 'initial',
      anchorBlockId: input.anchorBlockId || null,
      insertIndex: Utils.isInteger(input.insertIndex) && input.insertIndex >= 0
        ? input.insertIndex
        : 0,
      x: valueOr(input.x, 0),
      y: valueOr(input.y, 0),
      marker: normalizeMarker(valueOr(input.marker, 'none')),
      text: valueOr(input.text, '')
    };
  }

  function createDirtyTracker(onChange) {
    var tracker = {
      dirty: false,
      markDirty: function () {
        var changed = !tracker.dirty;
        tracker.dirty = true;
        if (changed && typeof onChange === 'function') {
          onChange(true);
        }
        return tracker;
      },
      markClean: function () {
        var changed = tracker.dirty;
        tracker.dirty = false;
        if (changed && typeof onChange === 'function') {
          onChange(false);
        }
        return tracker;
      }
    };
    return tracker;
  }

  function isValidDate(value) {
    return typeof value === 'string' && !isNaN(new Date(value).getTime());
  }

  function validateBlock(block, seenIds) {
    var errors = [];
    if (!block || typeof block !== 'object') {
      return ['block must be an object'];
    }
    if (typeof block.id !== 'string' || !block.id) {
      errors.push('block id is required');
    } else if (seenIds) {
      if (seenIds[block.id]) {
        errors.push('duplicate block id: ' + block.id);
      }
      seenIds[block.id] = true;
    }
    if (block.type !== 'text' && block.type !== 'image') {
      errors.push('block type must be text or image');
    }
    if (typeof block.x !== 'number' || !isFinite(block.x) || block.x < 0) {
      errors.push('block x must be a finite number >= 0');
    }
    if (typeof block.y !== 'number' || !isFinite(block.y) || block.y < 0) {
      errors.push('block y must be a finite number >= 0');
    }
    if (!Utils.isInteger(block.z)) {
      errors.push('block z must be an integer');
    }
    if (!Utils.isInteger(block.seq) || block.seq < 0) {
      errors.push('block seq must be an integer >= 0');
    }
    if (!Utils.isInteger(block.blankLinesAfter) || block.blankLinesAfter < 0) {
      errors.push('block blankLinesAfter must be an integer >= 0');
    }
    if (block.type === 'text') {
      if (typeof block.text !== 'string' || block.text.trim() === '') {
        errors.push('text block text must be non-empty');
      }
      if (!Utils.isSupportedMarker(block.marker)) {
        errors.push('text block marker is not supported');
      }
    }
    if (block.type === 'image') {
      if (typeof block.assetId !== 'string' || !block.assetId) {
        errors.push('image block assetId is required');
      }
      if (typeof block.alt !== 'string' || block.alt === '') {
        errors.push('image block alt must be non-empty');
      }
    }
    return errors;
  }

  function validateDocument(document) {
    var errors = [];
    if (!document || typeof document !== 'object') {
      return { valid: false, errors: ['document must be an object'] };
    }
    if (typeof document.id !== 'string' || !document.id) {
      errors.push('document id is required');
    }
    if (typeof document.title !== 'string' || document.title.trim() === '') {
      errors.push('title is required');
    } else if (Array.from(document.title).length > MAX_TITLE_LENGTH) {
      errors.push('title must be at most 200 characters');
    }
    if (typeof document.fileName !== 'string' || !/\.md$/i.test(document.fileName) ||
        !Utils.isSafeFileName(document.fileName)) {
      errors.push('fileName must be a safe basename ending in .md');
    }
    if (Object.prototype.toString.call(document.blocks) !== '[object Array]') {
      errors.push('blocks must be an array');
    } else {
      var seenIds = {};
      document.blocks.forEach(function (block) {
        errors = errors.concat(validateBlock(block, seenIds));
      });
    }
    if (!Utils.isInteger(document.leadingBlankLines) || document.leadingBlankLines < 0) {
      errors.push('leadingBlankLines must be an integer >= 0');
    }
    if (!Utils.isInteger(document.trailingBlankLines) || document.trailingBlankLines < 0) {
      errors.push('trailingBlankLines must be an integer >= 0');
    }
    if (typeof document.trailingNewline !== 'boolean') {
      errors.push('trailingNewline must be a boolean');
    }
    if (!isValidDate(document.createdAt)) {
      errors.push('createdAt must be an ISO date');
    }
    if (!isValidDate(document.updatedAt)) {
      errors.push('updatedAt must be an ISO date');
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function validateImageAsset(asset) {
    var errors = [];
    if (!asset || typeof asset !== 'object') {
      return { valid: false, errors: ['image asset must be an object'] };
    }
    if (typeof asset.id !== 'string' || !asset.id) {
      errors.push('asset id is required');
    }
    if (typeof asset.documentId !== 'string' || !asset.documentId) {
      errors.push('asset documentId is required');
    }
    if (typeof asset.fileName !== 'string' || !Utils.isSafeRelativeImageName(asset.fileName)) {
      errors.push('asset fileName must be a safe relative basename');
    }
    if (typeof asset.originalName !== 'string') {
      errors.push('asset originalName must be a string');
    }
    if (!Utils.isSupportedImageMime(asset.mimeType)) {
      errors.push('asset mimeType is not supported');
    }
    if (!Utils.isInteger(asset.width) || asset.width <= 0) {
      errors.push('asset width must be an integer > 0');
    }
    if (!Utils.isInteger(asset.height) || asset.height <= 0) {
      errors.push('asset height must be an integer > 0');
    }
    if (!Utils.isInteger(asset.size) || asset.size < 0) {
      errors.push('asset size must be an integer >= 0');
    }
    if (!isValidDate(asset.createdAt)) {
      errors.push('asset createdAt must be an ISO date');
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function validateLibrary(library) {
    var errors = [];
    if (!library || typeof library !== 'object') {
      return { valid: false, errors: ['library must be an object'] };
    }
    if (library.schemaVersion !== SCHEMA_VERSION) {
      errors.push('unsupported schema version');
    }
    if (Object.prototype.toString.call(library.documents) !== '[object Array]') {
      errors.push('documents must be an array');
    } else {
      var seenDocumentIds = {};
      library.documents.forEach(function (document) {
        if (seenDocumentIds[document.id]) {
          errors.push('duplicate document id: ' + document.id);
        }
        seenDocumentIds[document.id] = true;
        errors = errors.concat(validateDocument(document).errors);
      });
    }
    if (!isValidDate(library.updatedAt)) {
      errors.push('library updatedAt must be an ISO date');
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function validatePreferences(preferences) {
    var errors = [];
    if (!preferences || typeof preferences !== 'object') {
      return { valid: false, errors: ['preferences must be an object'] };
    }
    if (preferences.schemaVersion !== SCHEMA_VERSION) {
      errors.push('unsupported preferences schema version');
    }
    if (!isSupportedStyle(preferences.style)) {
      errors.push('style is not supported');
    }
    if (['system', 'light', 'dark'].indexOf(preferences.theme) === -1) {
      errors.push('theme must be system, light, or dark');
    }
    if (!Utils.isSupportedMarker(preferences.defaultMarker)) {
      errors.push('defaultMarker is not supported');
    }
    if (typeof preferences.showGrid !== 'boolean') {
      errors.push('showGrid must be a boolean');
    }
    if (preferences.lastDocumentId !== null && typeof preferences.lastDocumentId !== 'string') {
      errors.push('lastDocumentId must be a string or null');
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function nextSeq(document) {
    var max = 0;
    (document && document.blocks ? document.blocks : []).forEach(function (block) {
      if (Utils.isInteger(block.seq) && block.seq > max) {
        max = block.seq;
      }
    });
    return max + 1;
  }

  function nextZ(document) {
    var max = 0;
    (document && document.blocks ? document.blocks : []).forEach(function (block) {
      if (Utils.isInteger(block.z) && block.z > max) {
        max = block.z;
      }
    });
    return max + 1;
  }

  function getAssetById(assets, assetId) {
    for (var i = 0; i < (assets || []).length; i += 1) {
      if (assets[i].id === assetId) {
        return assets[i];
      }
    }
    return null;
  }

  function touchDocument(document) {
    if (document) {
      document.updatedAt = Utils.nowIso();
    }
    return document;
  }

  function removeBlock(document, blockId) {
    if (!document || !document.blocks) {
      return null;
    }
    var index = -1;
    for (var i = 0; i < document.blocks.length; i += 1) {
      if (document.blocks[i].id === blockId) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      return null;
    }
    var ordered = sequenceBlocks(document);
    var orderedIndex = -1;
    for (var k = 0; k < ordered.length; k += 1) {
      if (ordered[k].id === blockId) {
        orderedIndex = k;
        break;
      }
    }
    var removed = document.blocks[index];
    var blanks = Utils.isInteger(removed.blankLinesAfter) ? removed.blankLinesAfter : 0;
    if (orderedIndex > 0) {
      var previous = ordered[orderedIndex - 1];
      previous.blankLinesAfter = (Utils.isInteger(previous.blankLinesAfter) ? previous.blankLinesAfter : 0) + blanks;
    } else {
      document.leadingBlankLines = (Utils.isInteger(document.leadingBlankLines) ? document.leadingBlankLines : 0) + blanks;
    }
    document.blocks.splice(index, 1);
    return removed;
  }

  function sequenceBlocks(document) {
    if (!document || !document.blocks) {
      return [];
    }
    if (document.layoutVersion === 2) {
      return document.blocks.slice().sort(function (left, right) {
        var seqDifference = Number(left.seq || 0) - Number(right.seq || 0);
        if (seqDifference !== 0) {
          return seqDifference;
        }
        var leftId = String(left.id || '');
        var rightId = String(right.id || '');
        return leftId < rightId ? -1 : (leftId > rightId ? 1 : 0);
      });
    }
    return Markdown.blocksInReadingOrder(document.blocks);
  }

  function normalizeSequence(document) {
    if (!document || !document.blocks) {
      return [];
    }
    var ordered = sequenceBlocks(document);
    document.blocks = ordered.slice();
    ordered.forEach(function (block, index) {
      block.seq = index + 1;
    });
    document.layoutVersion = 2;
    return ordered;
  }

  function insertBlocksAtIndex(document, blocks, index) {
    if (!document) {
      return [];
    }
    var incoming = Object.prototype.toString.call(blocks) === '[object Array]'
      ? blocks.slice()
      : [];
    var ordered = normalizeSequence(document);
    var target = Math.floor(Number(index));
    if (!isFinite(target)) {
      target = ordered.length;
    }
    target = Math.max(0, Math.min(ordered.length, target));
    var result = ordered.slice();
    Array.prototype.splice.apply(result, [target, 0].concat(incoming));
    document.blocks = result;
    result.forEach(function (block, position) {
      block.seq = position + 1;
    });
    document.layoutVersion = 2;
    return result;
  }

  function insertBlocksAfter(document, blocks, anchorId) {
    if (!document) {
      return [];
    }
    var ordered = normalizeSequence(document);
    var index = ordered.length;
    if (anchorId) {
      for (var i = 0; i < ordered.length; i += 1) {
        if (ordered[i].id === anchorId) {
          index = i + 1;
          break;
        }
      }
    }
    return insertBlocksAtIndex(document, blocks, index);
  }

  function moveBlockToIndex(document, blockId, targetIndex) {
    var ordered = normalizeSequence(document);
    var index = -1;
    for (var i = 0; i < ordered.length; i += 1) {
      if (ordered[i].id === blockId) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      return false;
    }
    var target = Math.floor(Number(targetIndex));
    if (!isFinite(target)) {
      return false;
    }
    target = Math.max(0, Math.min(ordered.length - 1, target));
    if (target === index) {
      return false;
    }
    var moved = ordered.slice();
    var block = moved[index];
    moved.splice(index, 1);
    moved.splice(target, 0, block);
    document.blocks = moved;
    moved.forEach(function (entry, position) {
      entry.seq = position + 1;
    });
    document.layoutVersion = 2;
    return true;
  }

  function cloneDocumentForSaveAs(document, overrides) {
    var input = overrides || {};
    var now = Utils.nowIso();
    var blocks = (document.blocks || []).map(function (block) {
      var cloned = JSON.parse(JSON.stringify(block));
      cloned.id = Utils.randomUUID();
      return cloned;
    });
    return {
      id: input.id || Utils.randomUUID(),
      title: normalizeTitle(valueOr(input.title, document.title)),
      fileName: Utils.ensureMarkdownExtension(valueOr(input.fileName, document.fileName)),
      blocks: blocks,
      leadingBlankLines: document.leadingBlankLines,
      trailingBlankLines: document.trailingBlankLines,
      trailingNewline: document.trailingNewline,
      createdAt: now,
      updatedAt: now
    };
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    MAX_TITLE_LENGTH: MAX_TITLE_LENGTH,
    SUPPORTED_STYLES: SUPPORTED_STYLES.slice(),
    DEFAULT_STYLE: DEFAULT_STYLE,
    isSupportedStyle: isSupportedStyle,
    normalizeStyle: normalizeStyle,
    normalizeTitle: normalizeTitle,
    normalizeMarker: normalizeMarker,
    normalizePreferences: normalizePreferences,
    createLibrary: createLibrary,
    createPromptDocument: createPromptDocument,
    createTextBlock: createTextBlock,
    createImageBlock: createImageBlock,
    createImageAsset: createImageAsset,
    createPreferences: createPreferences,
    createComposer: createComposer,
    createDirtyTracker: createDirtyTracker,
    validateBlock: validateBlock,
    validateDocument: validateDocument,
    validateImageAsset: validateImageAsset,
    validateLibrary: validateLibrary,
    validatePreferences: validatePreferences,
    nextSeq: nextSeq,
    nextZ: nextZ,
    getAssetById: getAssetById,
    touchDocument: touchDocument,
    removeBlock: removeBlock,
    sequenceBlocks: sequenceBlocks,
    normalizeSequence: normalizeSequence,
    insertBlocksAtIndex: insertBlocksAtIndex,
    insertBlocksAfter: insertBlocksAfter,
    moveBlockToIndex: moveBlockToIndex,
    cloneDocumentForSaveAs: cloneDocumentForSaveAs
  };

  global.Prompter = global.Prompter || {};
  global.Prompter.model = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
