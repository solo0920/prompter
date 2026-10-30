(function (global) {
  'use strict';

  var Utils = (typeof module === 'object' && module.exports)
    ? require('./utils.js')
    : global.Prompter.utils;
  var Markdown = (typeof module === 'object' && module.exports)
    ? require('./markdown.js')
    : global.Prompter.markdown;
  var Model = (typeof module === 'object' && module.exports)
    ? require('./model.js')
    : global.Prompter.model;

  var COLUMN_X = 32;
  var COLUMN_START_Y = 32;
  var COLUMN_STEP_Y = 88;

  function readUint16BE(bytes, offset) {
    return (bytes[offset] << 8) | bytes[offset + 1];
  }

  function readUint32BE(bytes, offset) {
    return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) + bytes[offset + 3];
  }

  function readUint16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readUint24LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
  }

  function readUint32LE(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>> 0;
  }

  function sniffMimeType(bytes) {
    if (!bytes || bytes.length < 4) {
      return '';
    }
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
        bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a &&
        bytes[7] === 0x0a) {
      return 'image/png';
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      return 'image/gif';
    }
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
        bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 &&
        bytes[11] === 0x50) {
      return 'image/webp';
    }
    return '';
  }

  function readPngSize(bytes) {
    if (bytes.length < 24) {
      return null;
    }
    return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
  }

  function readGifSize(bytes) {
    if (bytes.length < 10) {
      return null;
    }
    return { width: readUint16LE(bytes, 6), height: readUint16LE(bytes, 8) };
  }

  function readJpegSize(bytes) {
    var offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      var marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) {
        break;
      }
      if (offset + 3 >= bytes.length) {
        break;
      }
      var length = readUint16BE(bytes, offset + 2);
      if (length < 2) {
        break;
      }
      var isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isStartOfFrame) {
        if (offset + 8 >= bytes.length) {
          return null;
        }
        return {
          height: readUint16BE(bytes, offset + 5),
          width: readUint16BE(bytes, offset + 7)
        };
      }
      offset += 2 + length;
    }
    return null;
  }

  function readWebpSize(bytes) {
    if (bytes.length < 20) {
      return null;
    }
    var fourcc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (fourcc === 'VP8X') {
      if (bytes.length < 30) {
        return null;
      }
      return {
        width: readUint24LE(bytes, 24) + 1,
        height: readUint24LE(bytes, 27) + 1
      };
    }
    if (fourcc === 'VP8L') {
      if (bytes.length < 25) {
        return null;
      }
      var bits = readUint32LE(bytes, 21);
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >>> 14) & 0x3fff)
      };
    }
    if (fourcc === 'VP8 ') {
      if (bytes.length < 30) {
        return null;
      }
      if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
        return null;
      }
      return {
        width: readUint16LE(bytes, 26) & 0x3fff,
        height: readUint16LE(bytes, 28) & 0x3fff
      };
    }
    return null;
  }

  function imageDimensions(bytes, mimeType) {
    var mime = mimeType || sniffMimeType(bytes);
    if (mime === 'image/png') {
      return readPngSize(bytes);
    }
    if (mime === 'image/jpeg') {
      return readJpegSize(bytes);
    }
    if (mime === 'image/gif') {
      return readGifSize(bytes);
    }
    if (mime === 'image/webp') {
      return readWebpSize(bytes);
    }
    return null;
  }

  function inspectImageBytes(bytes, declaredMimeType) {
    var source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    var mimeType = sniffMimeType(source);
    if (!Utils.isSupportedImageMime(mimeType)) {
      return {
        valid: false,
        error: 'UNSUPPORTED_IMAGE',
        declaredMimeType: declaredMimeType || '',
        message: '僅支援 PNG、JPEG、GIF 與 WebP 圖片。'
      };
    }
    var size = imageDimensions(source, mimeType);
    if (!size || !size.width || !size.height) {
      return {
        valid: false,
        error: 'CORRUPT_IMAGE',
        mimeType: mimeType,
        message: '圖片資料無法解碼。'
      };
    }
    return {
      valid: true,
      mimeType: mimeType,
      width: size.width,
      height: size.height,
      size: source.byteLength
    };
  }

  function toUint8Array(value) {
    if (value instanceof Uint8Array) {
      return value;
    }
    if (value && value.buffer instanceof ArrayBuffer) {
      return new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength);
    }
    return new Uint8Array(value);
  }

  function readFileAsArrayBuffer(file) {
    if (file && typeof file.arrayBuffer === 'function') {
      return Promise.resolve(file.arrayBuffer()).then(toUint8Array);
    }
    return new Promise(function (resolve, reject) {
      if (!global.FileReader) {
        reject(new Error('FileReader is unavailable.'));
        return;
      }
      var reader = new global.FileReader();
      reader.onload = function () {
        resolve(new Uint8Array(reader.result));
      };
      reader.onerror = function () {
        reject(reader.error || new Error('Unable to read the file.'));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function readFileAsText(file) {
    if (file && typeof file.text === 'function') {
      return Promise.resolve(file.text());
    }
    return new Promise(function (resolve, reject) {
      if (!global.FileReader) {
        reject(new Error('FileReader is unavailable.'));
        return;
      }
      var reader = new global.FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ''));
      };
      reader.onerror = function () {
        reject(reader.error || new Error('Unable to read the file.'));
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  function decodeDataUrl(dataUrl) {
    var match = /^data:([^;,]*)((?:;[^,]*)*),(.*)$/i.exec(String(dataUrl || ''));
    if (!match) {
      return null;
    }
    var mimeType = match[1] || '';
    var parameters = match[2] || '';
    var payload = match[3] || '';
    var bytes;
    try {
      if (/;base64/i.test(parameters)) {
        bytes = Utils.base64ToBytes(payload);
      } else {
        var decoded = decodeURIComponent(payload);
        bytes = new Uint8Array(decoded.length);
        for (var i = 0; i < decoded.length; i += 1) {
          bytes[i] = decoded.charCodeAt(i) & 0xff;
        }
      }
    } catch (error) {
      return null;
    }
    return { mimeType: mimeType, bytes: bytes };
  }

  function dataUrlToBlob(dataUrl) {
    var decoded = decodeDataUrl(dataUrl);
    if (!decoded) {
      return null;
    }
    if (typeof global.Blob !== 'function') {
      return null;
    }
    return new global.Blob([decoded.bytes], { type: decoded.mimeType || 'application/octet-stream' });
  }

  function blobToDataUrl(blob) {
    if (!blob) {
      return Promise.resolve('');
    }
    if (typeof global.FileReader === 'function') {
      return new Promise(function (resolve, reject) {
        var reader = new global.FileReader();
        reader.onload = function () { resolve(String(reader.result || '')); };
        reader.onerror = function () { reject(reader.error || new Error('Unable to read the blob.')); };
        reader.readAsDataURL(blob);
      });
    }
    if (typeof blob.arrayBuffer === 'function') {
      return blob.arrayBuffer().then(function (buffer) {
        var bytes = new Uint8Array(buffer);
        return 'data:' + (blob.type || 'application/octet-stream') + ';base64,' +
          Utils.bytesToBase64(bytes);
      });
    }
    return Promise.resolve('');
  }

  function basenameWithoutExtension(name) {
    var parts = Utils.splitExtension(String(name == null ? '' : name).replace(/^.*[\\/]/, ''));
    return parts.base;
  }

  function imageFileNameFor(preferredName, originalName, mimeType, usedNames) {
    var candidateName = preferredName || originalName || 'image-01';
    var source = String(candidateName).replace(/^.*[\\/]/, '');
    var parts = Utils.splitExtension(source);
    var extension = Utils.mimeToExtension(mimeType);
    if (parts.extension && Utils.extensionToMime(parts.extension) === mimeType) {
      extension = parts.extension.toLowerCase();
    }
    var base = Utils.sanitizeFileName(parts.base, { fallback: 'image-01', maxLength: 60 });
    var desired = base + (extension ? '.' + extension : '');
    return Utils.uniqueFileName(desired, usedNames);
  }

  function createAssetFromBytes(options) {
    var input = options || {};
    var bytes = toUint8Array(input.bytes || []);
    var inspected = inspectImageBytes(bytes, input.mimeType);
    if (!inspected.valid) {
      var error = new Error(inspected.message || 'Invalid image.');
      error.code = inspected.error;
      error.inspected = inspected;
      throw error;
    }
    var originalName = String(input.originalName || input.preferredName || 'image-01');
    var fileName = imageFileNameFor(
      input.preferredName || '',
      originalName,
      inspected.mimeType,
      input.usedNames || []
    );
    var asset = Model.createImageAsset({
      id: input.id || Utils.randomUUID(),
      documentId: input.documentId || '',
      fileName: fileName,
      originalName: originalName,
      mimeType: inspected.mimeType,
      width: inspected.width,
      height: inspected.height,
      size: inspected.size,
      createdAt: input.createdAt || Utils.nowIso()
    });
    if (typeof global.Blob === 'function') {
      asset.blob = new global.Blob([bytes], { type: inspected.mimeType });
    }
    asset.bytes = bytes;
    return asset;
  }

  function createAssetFromDataUrl(dataUrl, options) {
    var input = options || {};
    var decoded = decodeDataUrl(dataUrl);
    if (!decoded) {
      var error = new Error('Data URL could not be decoded.');
      error.code = 'INVALID_DATA_URL';
      throw error;
    }
    return createAssetFromBytes({
      bytes: decoded.bytes,
      mimeType: decoded.mimeType,
      originalName: input.originalName || 'image-01',
      preferredName: input.preferredName || '',
      documentId: input.documentId || '',
      usedNames: input.usedNames || [],
      createdAt: input.createdAt
    });
  }

  function inspectImageFile(file) {
    return readFileAsArrayBuffer(file).then(function (bytes) {
      var inspected = inspectImageBytes(bytes, file && file.type);
      if (!inspected.valid) {
        var error = new Error(inspected.message || 'Invalid image.');
        error.code = inspected.error;
        error.inspected = inspected;
        throw error;
      }
      return {
        bytes: bytes,
        mimeType: inspected.mimeType,
        width: inspected.width,
        height: inspected.height,
        size: inspected.size,
        originalName: (file && (file.name || file.originalName)) || 'image-01'
      };
    });
  }

  function createAssetFromFile(file, options) {
    var input = options || {};
    return inspectImageFile(file).then(function (info) {
      return createAssetFromBytes({
        bytes: info.bytes,
        mimeType: info.mimeType,
        originalName: info.originalName,
        preferredName: input.preferredName || '',
        documentId: input.documentId || '',
        usedNames: input.usedNames || [],
        createdAt: input.createdAt
      });
    });
  }

  function matchImageReference(reference, imageFiles) {
    var target = Utils.normalizeReference(reference);
    if (!target || Utils.isExternalReference(reference)) {
      return null;
    }
    var targetBase = Utils.referenceBasename(target).toLowerCase();
    var exactMatch = null;
    var basenameMatch = null;
    (imageFiles || []).forEach(function (file) {
      if (!file) {
        return;
      }
      var relative = Utils.normalizeReference(file.webkitRelativePath || file.name || '');
      var fileBase = Utils.referenceBasename(file.name || relative).toLowerCase();
      if (relative.toLowerCase() === target.toLowerCase()) {
        exactMatch = exactMatch || file;
      }
      if (fileBase === targetBase) {
        basenameMatch = basenameMatch || file;
      }
    });
    return exactMatch || basenameMatch;
  }

  function sourceOrderY(index) {
    return COLUMN_START_Y + (index * COLUMN_STEP_Y);
  }

  function parseMarkdownDocument(source, options) {
    var input = options || {};
    var parsed = Markdown.parseMarkdown(source);
    var documentId = input.documentId || Utils.randomUUID();
    var assets = [];
    var usedNames = [];
    var blocks = [];
    var imageFiles = input.imageFiles || [];
    var warnings = input.warnings || [];
    var warningSeen = {};

    function warn(message) {
      var text = String(message || '').trim();
      if (!text || warningSeen[text]) {
        return;
      }
      warningSeen[text] = true;
      warnings.push(text);
    }

    function addAsset(asset) {
      asset.documentId = documentId;
      assets.push(asset);
      usedNames.push(asset.fileName);
      return asset;
    }

    function literalTextBlock(descriptor) {
      blocks.push(Model.createTextBlock({
        id: Utils.randomUUID(),
        text: descriptor.raw,
        marker: 'none',
        x: COLUMN_X,
        y: sourceOrderY(blocks.length),
        z: blocks.length + 1,
        seq: blocks.length + 1,
        blankLinesAfter: descriptor.blankLinesAfter || 0
      }));
    }

    function addImageBlock(descriptor, asset) {
      blocks.push(Model.createImageBlock({
        id: Utils.randomUUID(),
        assetId: asset.id,
        alt: descriptor.alt || asset.originalName || asset.fileName,
        x: COLUMN_X,
        y: sourceOrderY(blocks.length),
        z: blocks.length + 1,
        seq: blocks.length + 1,
        blankLinesAfter: descriptor.blankLinesAfter || 0
      }));
    }

    var work = Promise.resolve();
    parsed.lines.forEach(function (descriptor) {
      work = work.then(function () {
        if (descriptor.kind !== 'image') {
          blocks.push(Model.createTextBlock({
            id: Utils.randomUUID(),
            text: descriptor.text,
            marker: descriptor.marker,
            x: COLUMN_X,
            y: sourceOrderY(blocks.length),
            z: blocks.length + 1,
            seq: blocks.length + 1,
            blankLinesAfter: descriptor.blankLinesAfter || 0
          }));
          return;
        }
        if (/^data:/i.test(descriptor.target)) {
          try {
            var dataAsset = addAsset(createAssetFromDataUrl(descriptor.target, {
              originalName: 'image-01',
              documentId: documentId,
              usedNames: usedNames
            }));
            addImageBlock(descriptor, dataAsset);
          } catch (error) {
            warn('內嵌圖片無法解碼，已保留原始文字。');
            literalTextBlock(descriptor);
          }
          return;
        }
        if (Utils.isExternalReference(descriptor.target)) {
          literalTextBlock(descriptor);
          return;
        }
        var matched = matchImageReference(descriptor.target, imageFiles);
        if (!matched) {
          warn('找不到圖片：' + descriptor.target);
          literalTextBlock(descriptor);
          return;
        }
        return createAssetFromFile(matched, {
          preferredName: Utils.referenceBasename(descriptor.target),
          documentId: documentId,
          usedNames: usedNames
        }).then(function (asset) {
          addAsset(asset);
          addImageBlock(descriptor, asset);
        }).catch(function (error) {
          warn('圖片無法使用：' + descriptor.target +
            (error && error.message ? '（' + error.message + '）' : ''));
          literalTextBlock(descriptor);
        });
      });
    });

    return work.then(function () {
      var sourceName = input.fileName || 'untitled.md';
      var fileName = Utils.ensureMarkdownExtension(sourceName);
      var title = input.title || Utils.deriveTitleFromFileName(sourceName);
      var document = Model.createPromptDocument({
        id: documentId,
        title: title,
        fileName: fileName,
        blocks: blocks,
        leadingBlankLines: parsed.leadingBlankLines,
        trailingBlankLines: parsed.trailingBlankLines,
        trailingNewline: parsed.trailingNewline,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt
      });
      return { document: document, assets: assets, warnings: warnings };
    });
  }

  function referencedAssets(document, assets) {
    var byId = {};
    (assets || []).forEach(function (asset) { byId[asset.id] = asset; });
    var result = [];
    var seen = {};
    (document.blocks || []).forEach(function (block) {
      if (block.type === 'image' && block.assetId && !seen[block.assetId] && byId[block.assetId]) {
        seen[block.assetId] = true;
        result.push(byId[block.assetId]);
      }
    });
    return result;
  }

  function serializeDocumentWithAssets(document, assets) {
    var included = referencedAssets(document, assets);
    var markdown = Markdown.serializeDocument(document, { assets: assets || [] });
    var images = included.map(function (asset) {
      return {
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        blob: asset.blob || null,
        bytes: asset.bytes || null,
        dataUrl: asset.dataUrl || null
      };
    });
    var missing = [];
    (document.blocks || []).forEach(function (block) {
      if (block.type === 'image' && !Model.getAssetById(assets || [], block.assetId)) {
        missing.push(block.alt || block.assetId);
      }
    });
    return { markdown: markdown, images: images, missingImages: missing };
  }

  function downloadBlob(blob, fileName) {
    if (!global.document || !global.URL || typeof global.URL.createObjectURL !== 'function') {
      throw new Error('Downloads are unavailable.');
    }
    var url = global.URL.createObjectURL(blob);
    var link = global.document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    global.document.body.appendChild(link);
    link.click();
    global.document.body.removeChild(link);
    setTimeout(function () {
      global.URL.revokeObjectURL(url);
    }, 30000);
  }

  function assetBlob(asset) {
    if (asset && asset.blob) {
      return Promise.resolve(asset.blob);
    }
    if (asset && asset.dataUrl) {
      return Promise.resolve(dataUrlToBlob(asset.dataUrl));
    }
    if (asset && asset.bytes && typeof global.Blob === 'function') {
      return Promise.resolve(new global.Blob([asset.bytes], { type: asset.mimeType }));
    }
    return Promise.resolve(null);
  }

  function getApp() {
    return global.Prompter && global.Prompter.app ? global.Prompter.app : null;
  }

  function isMarkdownFileName(name) {
    return /\.(?:md|markdown)$/i.test(String(name == null ? '' : name));
  }

  function isSupportedImageSelection(file) {
    if (!file) {
      return false;
    }
    var type = String(file.type || '').toLowerCase();
    if (Utils.isSupportedImageMime(type)) {
      return true;
    }
    var extension = Utils.splitExtension(String(file.name || '')).extension;
    return Utils.isSupportedImageMime(Utils.extensionToMime(extension));
  }

  function analyzeOpenSelection(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    var markdownFiles = [];
    var imageFiles = [];
    var ignoredFiles = [];
    var warnings = [];
    files.forEach(function (file) {
      if (!file) {
        return;
      }
      if (isMarkdownFileName(file.name)) {
        markdownFiles.push(file);
        return;
      }
      if (isSupportedImageSelection(file)) {
        imageFiles.push(file);
        return;
      }
      ignoredFiles.push(file);
      warnings.push('已忽略不支援的檔案：' + (file.name || '未命名檔案'));
    });
    var errors = [];
    if (markdownFiles.length === 0) {
      errors.push({
        code: 'NO_MARKDOWN',
        message: '請選擇一個 Markdown 檔案（.md 或 .markdown），可同時選取相關圖片。'
      });
    } else if (markdownFiles.length > 1) {
      errors.push({
        code: 'MULTIPLE_MARKDOWN',
        message: '一次只能開啟一個 Markdown 檔案，但選取了 ' +
          markdownFiles.length + ' 個。'
      });
    }
    return {
      markdownFiles: markdownFiles,
      imageFiles: imageFiles,
      ignoredFiles: ignoredFiles,
      warnings: warnings,
      errors: errors
    };
  }

  function openSelectionError(descriptor) {
    var error = new Error(descriptor.message || '無法開啟檔案。');
    error.code = descriptor.code || 'OPEN_FAILED';
    return error;
  }

  function openSelection(fileList) {
    var selection = analyzeOpenSelection(fileList);
    if (selection.errors.length > 0) {
      return Promise.reject(openSelectionError(selection.errors[0]));
    }
    var markdownFile = selection.markdownFiles[0];
    return readFileAsText(markdownFile).then(function (source) {
      return parseMarkdownDocument(source, {
        fileName: markdownFile.name,
        imageFiles: selection.imageFiles,
        warnings: selection.warnings.slice()
      });
    }).then(function (result) {
      var validation = Model.validateDocument(result.document);
      if (!validation.valid) {
        var error = new Error('Markdown 檔案轉換失敗：' + validation.errors.join('；'));
        error.code = 'INVALID_OPEN_DOCUMENT';
        throw error;
      }
      result.selection = selection;
      result.warnings = result.warnings || [];
      return result;
    });
  }

  function markdownFileNameFor(name) {
    return Utils.ensureMarkdownExtension(name || 'untitled');
  }

  function defaultSaveFileName(document) {
    if (!document) {
      return 'untitled.md';
    }
    var title = String(document.title == null ? '' : document.title).trim();
    if (title && title !== 'Untitled') {
      return markdownFileNameFor(title);
    }
    return markdownFileNameFor(document.fileName || 'untitled.md');
  }

  function buildSavePlan(document, assets, options) {
    var input = options || {};
    var fileName = markdownFileNameFor(input.fileName || document.fileName || document.title);
    var included = referencedAssets(document, assets);
    var missingImages = [];
    (document.blocks || []).forEach(function (block) {
      if (block.type === 'image' && !Model.getAssetById(assets || [], block.assetId)) {
        missingImages.push(block.alt || block.assetId || 'missing-image');
      }
    });
    return Promise.all(included.map(function (asset) {
      return assetBlob(asset).then(function (blob) {
        if (!blob) {
          missingImages.push(asset.fileName || asset.originalName || asset.id);
        }
        return {
          assetId: asset.id,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          blob: blob
        };
      });
    })).then(function (images) {
      var writableImages = images.filter(function (image) {
        return image.blob && Utils.isSafeRelativeImageName(image.fileName);
      });
      return {
        documentId: document.id,
        fileName: fileName,
        markdown: Markdown.serializeDocument(document, { assets: assets || [] }),
        images: writableImages,
        missingImages: missingImages,
        outputNames: writableImages.map(function (image) {
          return image.fileName;
        }).concat([fileName])
      };
    });
  }

  function conflictingFileNames(existingNames, ownedNames, outputNames) {
    var existing = {};
    var owned = {};
    (existingNames || []).forEach(function (name) {
      existing[String(name).toLowerCase()] = true;
    });
    (ownedNames || []).forEach(function (name) {
      owned[String(name).toLowerCase()] = true;
    });
    var seen = {};
    var conflicts = [];
    (outputNames || []).forEach(function (name) {
      var key = String(name).toLowerCase();
      if (!key || seen[key]) {
        return;
      }
      seen[key] = true;
      if (existing[key] && !owned[key]) {
        conflicts.push(name);
      }
    });
    return conflicts;
  }

  function cloneDocumentWithAssets(document, assets, options) {
    var input = options || {};
    var cloneDocument = Model.cloneDocumentForSaveAs(document, {
      fileName: input.fileName || document.fileName,
      title: input.title || document.title
    });
    var assetIdMap = {};
    var clonedAssets = (assets || []).map(function (asset) {
      var copy = Object.assign({}, asset);
      copy.id = Utils.randomUUID();
      copy.documentId = cloneDocument.id;
      copy.createdAt = Utils.nowIso();
      assetIdMap[asset.id] = copy.id;
      return copy;
    });
    cloneDocument.blocks.forEach(function (block) {
      if (block.type === 'image' && assetIdMap[block.assetId]) {
        block.assetId = assetIdMap[block.assetId];
      }
    });
    return { document: cloneDocument, assets: clonedAssets };
  }

  function warningText(warnings) {
    var unique = [];
    var seen = {};
    (warnings || []).forEach(function (warning) {
      var text = String(warning || '').trim();
      if (text && !seen[text]) {
        seen[text] = true;
        unique.push(text);
      }
    });
    if (unique.length === 0) {
      return '';
    }
    var shown = unique.slice(0, 3).join('；');
    if (unique.length > 3) {
      shown += '；另有 ' + (unique.length - 3) + ' 項。';
    }
    return shown;
  }

  function setBusy(busy, label) {
    var app = getApp();
    if (!app) {
      return;
    }
    if (typeof app.setFileBusy === 'function') {
      app.setFileBusy(busy, label || '');
    }
  }

  function closeAppDialog(dialog) {
    var app = getApp();
    if (dialog && app && typeof app.closeDialog === 'function') {
      app.closeDialog(dialog);
    } else if (dialog) {
      try {
        dialog.close();
      } catch (error) {
        dialog.removeAttribute('open');
      }
    }
  }

  function showFilenameDialog(defaultFileName) {
    var app = getApp();
    var dialog = app && app.elements ? app.elements['filename-dialog'] : null;
    var input = app && app.elements ? app.elements['filename-input'] : null;
    var cancel = app && app.elements ? app.elements['filename-cancel'] : null;
    var form = app && app.elements ? app.elements['filename-form'] : null;
    if (!dialog || !input || !form) {
      return Promise.resolve(defaultFileName || 'untitled.md');
    }
    input.value = defaultFileName || 'untitled.md';
    return new Promise(function (resolve) {
      var settled = false;
      function cleanup() {
        form.removeEventListener('submit', onSubmit);
        if (cancel) {
          cancel.removeEventListener('click', onCancel);
        }
        dialog.removeEventListener('cancel', onCancel);
      }
      function finish(value) {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        closeAppDialog(dialog);
        resolve(value);
      }
      function onSubmit(event) {
        event.preventDefault();
        finish(input.value);
      }
      function onCancel(event) {
        if (event) {
          event.preventDefault();
        }
        finish(null);
      }
      form.addEventListener('submit', onSubmit);
      if (cancel) {
        cancel.addEventListener('click', onCancel);
      }
      dialog.addEventListener('cancel', onCancel);
      if (app && typeof app.openDialog === 'function') {
        app.openDialog(dialog);
      } else {
        dialog.showModal();
      }
      input.focus();
      var parts = Utils.splitExtension(input.value);
      try {
        input.setSelectionRange(0, parts.base.length);
      } catch (error) {
        input.select();
      }
    });
  }

  function showConflictDialog(fileNames) {
    var app = getApp();
    var dialog = app && app.elements ? app.elements['conflict-dialog'] : null;
    var list = app && app.elements ? app.elements['conflict-list'] : null;
    var cancel = app && app.elements ? app.elements['conflict-cancel'] : null;
    var choose = app && app.elements ? app.elements['conflict-choose'] : null;
    var overwrite = app && app.elements ? app.elements['conflict-overwrite'] : null;
    if (!dialog || !list) {
      return Promise.resolve('cancel');
    }
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
    (fileNames || []).forEach(function (name) {
      var item = global.document.createElement('li');
      item.textContent = name;
      list.appendChild(item);
    });
    return new Promise(function (resolve) {
      var settled = false;
      function cleanup() {
        if (cancel) { cancel.removeEventListener('click', onCancel); }
        if (choose) { choose.removeEventListener('click', onChoose); }
        if (overwrite) { overwrite.removeEventListener('click', onOverwrite); }
        dialog.removeEventListener('cancel', onCancel);
      }
      function finish(value) {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        closeAppDialog(dialog);
        resolve(value);
      }
      function onCancel(event) {
        if (event) { event.preventDefault(); }
        finish('cancel');
      }
      function onChoose() { finish('choose'); }
      function onOverwrite() { finish('overwrite'); }
      if (cancel) { cancel.addEventListener('click', onCancel); }
      if (choose) { choose.addEventListener('click', onChoose); }
      if (overwrite) { overwrite.addEventListener('click', onOverwrite); }
      dialog.addEventListener('cancel', onCancel);
      if (app && typeof app.openDialog === 'function') {
        app.openDialog(dialog);
      } else {
        dialog.showModal();
      }
      if (overwrite) {
        overwrite.focus();
      }
    });
  }

  function directoryFileExists(directory, fileName) {
    if (!directory || typeof directory.getFileHandle !== 'function') {
      return Promise.resolve(false);
    }
    return directory.getFileHandle(fileName).then(function () {
      return true;
    }, function (error) {
      if (error && (error.name === 'NotFoundError' || error.code === 8)) {
        return false;
      }
      throw error;
    });
  }

  function findDirectoryConflicts(directory, plan, ownedNames) {
    return Promise.all(plan.outputNames.map(function (fileName) {
      return directoryFileExists(directory, fileName).then(function (exists) {
        return exists ? fileName : null;
      });
    })).then(function (existing) {
      return conflictingFileNames(
        existing.filter(function (name) { return name !== null; }),
        ownedNames || [],
        plan.outputNames
      );
    });
  }

  function ensureDirectoryPermission(directory) {
    if (!directory || typeof directory.queryPermission !== 'function') {
      return Promise.resolve(true);
    }
    return Promise.resolve(directory.queryPermission({ mode: 'readwrite' })).then(function (state) {
      if (state === 'granted') {
        return true;
      }
      if (state !== 'prompt' || typeof directory.requestPermission !== 'function') {
        return false;
      }
      return Promise.resolve(directory.requestPermission({ mode: 'readwrite' })).then(function (next) {
        return next === 'granted';
      }, function () {
        return false;
      });
    }, function () {
      return false;
    });
  }

  function pickDirectory() {
    if (typeof global.showDirectoryPicker !== 'function') {
      return Promise.resolve({ unsupported: true });
    }
    return Promise.resolve().then(function () {
      return global.showDirectoryPicker({ mode: 'readwrite' });
    }).then(function (handle) {
      return { handle: handle };
    }, function (error) {
      if (error && error.name === 'AbortError') {
        return { canceled: true };
      }
      if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
        return { denied: true, error: error };
      }
      throw error;
    });
  }

  function writeBlobToDirectory(directory, fileName, blob) {
    if (!blob) {
      var missing = new Error('缺少圖片資料：' + fileName);
      missing.code = 'IMAGE_BYTES_MISSING';
      missing.fileName = fileName;
      return Promise.reject(missing);
    }
    return directory.getFileHandle(fileName, { create: true }).then(function (handle) {
      return handle.createWritable();
    }).then(function (writable) {
      return Promise.resolve(writable.write(blob)).then(function () {
        return writable.close();
      }, function (error) {
        try { writable.abort(); } catch (abortError) { /* ignore */ }
        throw error;
      });
    }).catch(function (error) {
      if (!error.fileName) {
        error.fileName = fileName;
      }
      if (!error.code) {
        error.code = 'FILE_WRITE_FAILED';
      }
      throw error;
    });
  }

  function writePlanToDirectory(plan, directory) {
    var chain = Promise.resolve();
    plan.images.forEach(function (image) {
      chain = chain.then(function () {
        return writeBlobToDirectory(directory, image.fileName, image.blob);
      });
    });
    return chain.then(function () {
      var blob = new global.Blob([plan.markdown], { type: 'text/markdown;charset=utf-8' });
      return writeBlobToDirectory(directory, plan.fileName, blob);
    });
  }

  function pause(milliseconds) {
    return new Promise(function (resolve) {
      global.setTimeout(resolve, milliseconds || 0);
    });
  }

  function downloadPlan(plan) {
    var chain = Promise.resolve();
    plan.images.forEach(function (image) {
      chain = chain.then(function () {
        if (image.blob) {
          downloadBlob(image.blob, image.fileName);
        }
        return pause(180);
      });
    });
    return chain.then(function () {
      var blob = new global.Blob([plan.markdown], { type: 'text/markdown;charset=utf-8' });
      downloadBlob(blob, plan.fileName);
    });
  }

  function currentFileTarget(app, document) {
    if (app.state.fileTarget) {
      return Promise.resolve(app.state.fileTarget);
    }
    return app.state.storage.getFileTarget(document.id).then(function (target) {
      app.state.fileTarget = target || null;
      return target;
    }).catch(function () {
      return null;
    });
  }

  function buildTargetMetadata(mode, fileName, ownedFileNames, directoryHandle) {
    var target = {
      mode: mode,
      fileName: fileName,
      ownedFileNames: (ownedFileNames || []).slice()
    };
    if (directoryHandle) {
      target.directoryHandle = directoryHandle;
    }
    return target;
  }

  function markSaved(app, workingDocument, workingAssets, plan, target, saveAs, direct) {
    workingDocument.fileName = plan.fileName;
    workingDocument.updatedAt = Utils.nowIso();
    if (saveAs && workingDocument.title === 'Untitled' && plan.fileName !== 'untitled.md') {
      workingDocument.title = Utils.deriveTitleFromFileName(plan.fileName);
    }
    return app.state.storage.saveDocument(workingDocument, workingAssets).then(function () {
      try {
        return Promise.resolve(app.state.storage.setFileTarget(workingDocument.id, target))
          .catch(function () {});
      } catch (error) {
        return undefined;
      }
    }).then(function () {
      if (saveAs) {
        app.setDocument(workingDocument, workingAssets, { persisted: true });
      } else {
        var document = app.state.document;
        document.title = workingDocument.title;
        document.fileName = workingDocument.fileName;
        document.updatedAt = workingDocument.updatedAt;
        app.state.documentPersisted = true;
        app.state.fileTarget = target;
        app.setDirty(false);
        app.updateTitleInput();
        app.updateStatus();
      }
      if (saveAs) {
        app.state.fileTarget = target;
      }
      if (global.Prompter.search && typeof global.Prompter.search.refreshDirectory === 'function') {
        global.Prompter.search.refreshDirectory();
      }
      var message;
      if (direct) {
        message = saveAs ? '已另存為「' + plan.fileName + '」。' :
          '已儲存「' + plan.fileName + '」。';
      } else if (plan.images.length > 0) {
        message = (saveAs ? '已另存為「' : '已下載「') + plan.fileName + '」與 ' +
          plan.images.length + ' 張圖片。請將檔案保持在一起且不要重新命名；若瀏覽器' +
          '封鎖多檔下載，請允許下載後重試，或使用 Chrome/Edge 直接儲存。';
      } else {
        message = (saveAs ? '已另存為「' : '已下載「') + plan.fileName +
          '」。若瀏覽器封鎖下載，請允許下載後重試。';
      }
      app.toast(message);
      if (plan.missingImages.length > 0) {
        app.announce('有圖片未能寫入：' + warningText(plan.missingImages), true);
      }
      return {
        ok: true,
        document: workingDocument,
        assets: workingAssets,
        target: target,
        fileName: plan.fileName
      };
    });
  }

  function saveCurrentDocument(options) {
    var app = getApp();
    if (!app || !app.state) {
      return Promise.resolve({ ok: false, error: new Error('應用程式尚未就緒。') });
    }
    var state = app.state;
    var document = state.document;
    if (!document) {
      return Promise.resolve({ ok: false, error: new Error('目前沒有開啟的文件。') });
    }
    if (state.fileBusy) {
      return Promise.resolve({ ok: false, busy: true });
    }
    var opts = options || {};
    setBusy(true, 'Saving…');
    return currentFileTarget(app, document).then(function (existingTarget) {
      var promptName = opts.saveAs === true || state.documentPersisted !== true;
      var forceDirectory = opts.saveAs === true || promptName ||
        !existingTarget || !existingTarget.directoryHandle;
      var attempts = 0;

      function attempt() {
        attempts += 1;
        if (attempts > 8) {
          throw new Error('儲存位置重試次數過多，已取消儲存。');
        }
        var fallbackName = existingTarget && existingTarget.fileName
          ? existingTarget.fileName
          : document.fileName;
        var namePromise = promptName
          ? showFilenameDialog(defaultSaveFileName(document))
          : Promise.resolve(fallbackName);
        return namePromise.then(function (rawName) {
          if (rawName === null || rawName === undefined) {
            return { ok: false, canceled: true };
          }
          var fileName = markdownFileNameFor(rawName);
          var working;
          var saveAsAttempt = opts.saveAs === true;
          if (saveAsAttempt) {
            working = cloneDocumentWithAssets(document, state.assets, { fileName: fileName });
          } else {
            working = {
              document: Utils.deepClone(document),
              assets: state.assets.slice()
            };
          }
          working.document.fileName = fileName;
          if (working.document.title === 'Untitled' && fileName !== 'untitled.md') {
            working.document.title = Utils.deriveTitleFromFileName(fileName);
          }
          return buildSavePlan(working.document, working.assets, { fileName: fileName })
            .then(function (plan) {
              var canTryDirect = !opts.forceDownload &&
                typeof global.showDirectoryPicker === 'function' &&
                (saveAsAttempt || promptName ||
                  (existingTarget && existingTarget.directoryHandle));
              if (!canTryDirect) {
                return { mode: 'download', plan: plan, direct: false };
              }
              var directoryPromise;
              if (!forceDirectory && existingTarget && existingTarget.directoryHandle) {
                directoryPromise = Promise.resolve({ handle: existingTarget.directoryHandle });
              } else {
                directoryPromise = pickDirectory();
              }
              return directoryPromise.then(function (picked) {
                if (picked.canceled) {
                  return { ok: false, canceled: true };
                }
                if (picked.unsupported || picked.denied || !picked.handle) {
                  app.announce('無法取得資料夾寫入權限，改以下載方式儲存。', true);
                  return { mode: 'download', plan: plan, direct: false };
                }
                return ensureDirectoryPermission(picked.handle).then(function (granted) {
                  if (!granted) {
                    app.announce('資料夾權限遭拒，改以下載方式儲存。', true);
                    return { mode: 'download', plan: plan, direct: false };
                  }
                  var ownedNames = (forceDirectory || saveAsAttempt || !existingTarget)
                    ? []
                    : (existingTarget.ownedFileNames || []);
                  return findDirectoryConflicts(picked.handle, plan, ownedNames)
                    .then(function (conflicts) {
                      if (conflicts.length === 0) {
                        return { mode: 'direct', plan: plan, direct: true, directoryHandle: picked.handle };
                      }
                      return showConflictDialog(conflicts).then(function (choice) {
                        if (choice === 'cancel') {
                          return { ok: false, canceled: true };
                        }
                        if (choice === 'choose') {
                          promptName = true;
                          forceDirectory = true;
                          return { retry: true };
                        }
                        return { mode: 'direct', plan: plan, direct: true, directoryHandle: picked.handle };
                      });
                    });
                });
              });
            })
            .then(function (resolved) {
              if (!resolved || resolved.ok === false) {
                return resolved;
              }
              if (resolved.retry) {
                return attempt();
              }
              working.document.fileName = resolved.plan.fileName;
              var writing = resolved.mode === 'direct'
                ? writePlanToDirectory(resolved.plan, resolved.directoryHandle)
                : downloadPlan(resolved.plan);
              return writing.then(function () {
                var target = buildTargetMetadata(
                  resolved.mode,
                  resolved.plan.fileName,
                  resolved.plan.outputNames,
                  resolved.directoryHandle
                );
                return markSaved(
                  app,
                  working.document,
                  working.assets,
                  resolved.plan,
                  target,
                  saveAsAttempt,
                  resolved.mode === 'direct'
                );
              }, function (error) {
                var fileName = error && error.fileName ? '「' + error.fileName + '」' : '檔案';
                var wrapped = new Error('無法寫入' + fileName + '。' +
                  (error && error.message ? error.message : '請確認權限與儲存空間。'));
                wrapped.code = error && error.code ? error.code : 'SAVE_WRITE_FAILED';
                wrapped.fileName = error && error.fileName;
                wrapped.cause = error;
                throw wrapped;
              });
            });
        });
      }

      return attempt().then(function (result) {
        if (result && result.ok === false && result.error) {
          app.showError(result.error);
        }
        return result;
      }, function (error) {
        app.showError(error);
        return { ok: false, error: error };
      });
    }).then(function (result) {
      setBusy(false);
      return result;
    }, function (error) {
      setBusy(false);
      app.showError(error);
      return { ok: false, error: error };
    });
  }

  function handleOpenFiles(fileList) {
    var app = getApp();
    if (!app || !app.state) {
      return Promise.resolve({ ok: false });
    }
    var files = Array.prototype.slice.call(fileList || []);
    if (files.length === 0) {
      return Promise.resolve({ ok: false, canceled: true });
    }
    if (app.state.fileBusy) {
      return Promise.resolve({ ok: false, busy: true });
    }
    setBusy(true, 'Opening…');
    return openSelection(files).then(function (result) {
      var storageError = null;
      return app.state.storage.saveDocument(result.document, result.assets).catch(function (error) {
        storageError = error;
        return null;
      }).then(function () {
        app.setDocument(result.document, result.assets, {
          persisted: !storageError,
          newTab: true
        });
        app.state.fileTarget = null;
        if (global.Prompter.search && typeof global.Prompter.search.refreshDirectory === 'function') {
          global.Prompter.search.refreshDirectory();
        }
        if (result.warnings.length > 0) {
          app.announce('開啟完成，但' + warningText(result.warnings), true);
        }
        if (storageError) {
          var warning = new Error('文件已開啟，但無法加入本機目錄：' +
            (storageError.message || storageError));
          warning.code = storageError.code;
          app.showError(warning);
        } else {
          app.toast('已開啟「' + result.document.title + '」。');
        }
        return {
          ok: true,
          document: result.document,
          assets: result.assets,
          warnings: result.warnings
        };
      });
    }).catch(function (error) {
      app.showError(error);
      return { ok: false, error: error };
    }).then(function (result) {
      setBusy(false);
      return result;
    }, function (error) {
      setBusy(false);
      app.showError(error);
      return { ok: false, error: error };
    });
  }

  function requestOpenPicker() {
    var app = getApp();
    var input = app && app.elements ? app.elements['open-input'] : null;
    if (!input) {
      return Promise.resolve({ ok: false, error: new Error('找不到檔案選擇器。') });
    }
    input.value = '';
    input.click();
    return Promise.resolve({ ok: true, pickerOpened: true });
  }

  function openSavedDocument(documentId) {
    var app = getApp();
    if (!app || !app.state) {
      return Promise.resolve({ ok: false });
    }
    setBusy(true, 'Opening…');
    return app.state.storage.getDocument(documentId).then(function (loaded) {
      if (!loaded || !loaded.document) {
        var missing = new Error('找不到這份本機文件。');
        missing.code = 'DOCUMENT_NOT_FOUND';
        throw missing;
      }
      app.setDocument(loaded.document, loaded.assets, { persisted: true, newTab: true });
      return app.state.storage.getFileTarget(documentId).catch(function () {
        return null;
      }).then(function (target) {
        app.state.fileTarget = target || null;
        if (global.Prompter.search && typeof global.Prompter.search.refreshDirectory === 'function') {
          global.Prompter.search.refreshDirectory();
        }
        return { ok: true, document: loaded.document, assets: loaded.assets };
      });
    }).catch(function (error) {
      app.showError(error);
      return { ok: false, error: error };
    }).then(function (result) {
      setBusy(false);
      return result;
    }, function (error) {
      setBusy(false);
      app.showError(error);
      return { ok: false, error: error };
    });
  }

  var api = {
    COLUMN_X: COLUMN_X,
    COLUMN_START_Y: COLUMN_START_Y,
    COLUMN_STEP_Y: COLUMN_STEP_Y,
    sniffMimeType: sniffMimeType,
    imageDimensions: imageDimensions,
    inspectImageBytes: inspectImageBytes,
    inspectImageFile: inspectImageFile,
    readFileAsArrayBuffer: readFileAsArrayBuffer,
    readFileAsText: readFileAsText,
    decodeDataUrl: decodeDataUrl,
    dataUrlToBlob: dataUrlToBlob,
    blobToDataUrl: blobToDataUrl,
    imageFileNameFor: imageFileNameFor,
    createAssetFromBytes: createAssetFromBytes,
    createAssetFromDataUrl: createAssetFromDataUrl,
    createAssetFromFile: createAssetFromFile,
    matchImageReference: matchImageReference,
    parseMarkdownDocument: parseMarkdownDocument,
    analyzeOpenSelection: analyzeOpenSelection,
    openSelection: openSelection,
    handleOpenFiles: handleOpenFiles,
    requestOpenPicker: requestOpenPicker,
    openSavedDocument: openSavedDocument,
    saveCurrentDocument: saveCurrentDocument,
    markdownFileNameFor: markdownFileNameFor,
    defaultSaveFileName: defaultSaveFileName,
    buildSavePlan: buildSavePlan,
    conflictingFileNames: conflictingFileNames,
    cloneDocumentWithAssets: cloneDocumentWithAssets,
    referencedAssets: referencedAssets,
    serializeDocumentWithAssets: serializeDocumentWithAssets,
    downloadBlob: downloadBlob,
    assetBlob: assetBlob
  };

  global.Prompter = global.Prompter || {};
  global.Prompter.files = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
