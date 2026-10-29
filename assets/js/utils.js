(function (global) {
  'use strict';

  var SUPPORTED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  var MARKER_VALUES = ['none', '#', '##', '###', '-', '1.', '>', '.'];
  var INVALID_FILE_CHARS = /[\/\\:*?"<>|\u0000-\u001f\u007f]/g;
  var RESERVED_FILE_NAMES = { '.': true, '..': true };

  function nowIso() {
    return new Date().toISOString();
  }

  function randomUUID() {
    var cryptoObj = global.crypto || global.msCrypto;
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
      return cryptoObj.randomUUID();
    }
    var bytes = new Uint8Array(16);
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      cryptoObj.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 16; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = '';
    for (var j = 0; j < 16; j += 1) {
      hex += bytes[j].toString(16).padStart(2, '0');
    }
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) +
      '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function toCodePoints(value) {
    if (typeof Array.from === 'function') {
      return Array.from(value);
    }
    return String(value).split('');
  }

  function truncateCodePoints(value, maxLength) {
    var points = toCodePoints(value);
    if (points.length <= maxLength) {
      return value;
    }
    return points.slice(0, maxLength).join('');
  }

  function sanitizeFileName(name, options) {
    var opts = options || {};
    var fallback = opts.fallback || 'untitled';
    var maxLength = opts.maxLength || 80;
    var value = String(name == null ? '' : name);
    value = value.replace(INVALID_FILE_CHARS, '');
    value = value.replace(/[\s\u00a0]+/g, '-');
    value = value.replace(/^[.\s-]+/, '').replace(/[.\s]+$/, '');
    value = truncateCodePoints(value, maxLength);
    value = value.replace(/^[.\s-]+/, '').replace(/[.\s]+$/, '');
    if (!value || RESERVED_FILE_NAMES[value]) {
      value = String(fallback).replace(INVALID_FILE_CHARS, '').replace(/[\s\u00a0]+/g, '-');
      value = value.replace(/^[.\s-]+/, '').replace(/[.\s]+$/, '') || 'untitled';
      value = truncateCodePoints(value, maxLength);
    }
    if (RESERVED_FILE_NAMES[value]) {
      value = 'untitled';
    }
    return value;
  }

  function ensureMarkdownExtension(name) {
    var base = String(name == null ? '' : name).trim();
    base = base.replace(/\.(?:md|markdown)$/i, '');
    return sanitizeFileName(base, { fallback: 'untitled', maxLength: 80 }) + '.md';
  }

  function deriveTitleFromFileName(fileName) {
    var base = String(fileName == null ? '' : fileName).replace(/^.*[\\/]/, '');
    base = base.replace(/\.(?:md|markdown)$/i, '').trim();
    return base || 'Untitled';
  }

  function splitExtension(name) {
    var value = String(name == null ? '' : name);
    var index = value.lastIndexOf('.');
    if (index <= 0 || index === value.length - 1) {
      return { base: value, extension: '' };
    }
    return { base: value.slice(0, index), extension: value.slice(index + 1) };
  }

  function isSafeFileName(name) {
    var value = String(name == null ? '' : name);
    if (!value || value === '.' || value === '..') {
      return false;
    }
    if (/[\/\\\u0000-\u001f\u007f]/.test(value)) {
      return false;
    }
    if (/^[.\s]|[.\s]$/.test(value)) {
      return false;
    }
    return true;
  }

  function isSafeRelativeImageName(name) {
    var value = String(name == null ? '' : name);
    if (!isSafeFileName(value)) {
      return false;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.indexOf('//') === 0) {
      return false;
    }
    if (value.split('/').indexOf('..') !== -1) {
      return false;
    }
    return true;
  }

  function isExternalReference(reference) {
    var value = String(reference == null ? '' : reference).trim();
    return /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(value);
  }

  function normalizeReference(reference) {
    var value = String(reference == null ? '' : reference).trim();
    if (!value) {
      return '';
    }
    try {
      value = decodeURIComponent(value);
    } catch (error) {
      // Keep the literal reference when it is not valid percent-encoding.
    }
    value = value.replace(/\\/g, '/');
    while (value.indexOf('./') === 0) {
      value = value.slice(2);
    }
    return value;
  }

  function referenceBasename(reference) {
    var normalized = normalizeReference(reference);
    var index = normalized.lastIndexOf('/');
    return index === -1 ? normalized : normalized.slice(index + 1);
  }

  function uniqueFileName(desired, usedNames) {
    var desiredName = String(desired == null ? '' : desired) || 'untitled';
    var used = {};
    if (usedNames && typeof usedNames.forEach === 'function') {
      usedNames.forEach(function (name) { used[String(name).toLowerCase()] = true; });
    } else if (Object.prototype.toString.call(usedNames) === '[object Array]') {
      usedNames.forEach(function (name) { used[String(name).toLowerCase()] = true; });
    } else if (usedNames && typeof usedNames === 'object') {
      Object.keys(usedNames).forEach(function (name) { used[String(name).toLowerCase()] = true; });
    }
    if (!used[desiredName.toLowerCase()]) {
      return desiredName;
    }
    var parts = splitExtension(desiredName);
    var base = parts.base || 'image';
    var extension = parts.extension ? '.' + parts.extension : '';
    for (var index = 2; index < 10000; index += 1) {
      var candidate = base + '-' + index + extension;
      if (!used[candidate.toLowerCase()]) {
        return candidate;
      }
    }
    return base + '-' + Date.now() + extension;
  }

  function mimeToExtension(mimeType) {
    switch (String(mimeType || '').toLowerCase()) {
      case 'image/png': return 'png';
      case 'image/jpeg': return 'jpg';
      case 'image/gif': return 'gif';
      case 'image/webp': return 'webp';
      default: return '';
    }
  }

  function extensionToMime(extension) {
    switch (String(extension || '').toLowerCase()) {
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'gif': return 'image/gif';
      case 'webp': return 'image/webp';
      default: return '';
    }
  }

  function isSupportedImageMime(mimeType) {
    return SUPPORTED_IMAGE_MIME_TYPES.indexOf(String(mimeType || '').toLowerCase()) !== -1;
  }

  function isSupportedMarker(marker) {
    return MARKER_VALUES.indexOf(marker) !== -1 || /^\d+\.$/.test(String(marker || ''));
  }

  function formatDate(value, locale) {
    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) {
      return '';
    }
    var targetLocale = locale || 'zh-Hant';
    try {
      return new Intl.DateTimeFormat(targetLocale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch (error) {
      return date.toLocaleString();
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(fn, wait) {
    var timer = null;
    var lastArgs = null;
    var lastThis = null;
    function debounced() {
      lastArgs = arguments;
      lastThis = this;
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(function () {
        timer = null;
        fn.apply(lastThis, lastArgs);
      }, wait || 0);
    }
    debounced.cancel = function () {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    debounced.flush = function () {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
        fn.apply(lastThis, lastArgs);
      }
    };
    return debounced;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function isInteger(value) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
  }

  function asInteger(value, fallback) {
    var number = Number(value);
    return isInteger(number) ? number : fallback;
  }

  function deepClone(value) {
    if (typeof global.structuredClone === 'function') {
      try {
        return global.structuredClone(value);
      } catch (error) {
        // Fall through to JSON cloning for plain data.
      }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function bytesToBase64(bytes) {
    var source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < source.length; i += chunk) {
      var slice = source.subarray(i, i + chunk);
      binary += String.fromCharCode.apply(null, Array.prototype.slice.call(slice));
    }
    return global.btoa ? global.btoa(binary) : Buffer.from(source).toString('base64');
  }

  function base64ToBytes(base64) {
    var value = String(base64 || '').replace(/\s+/g, '');
    var binary;
    if (typeof global.atob === 'function') {
      binary = global.atob(value);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(value, 'base64'));
    }
    throw new Error('Base64 decoding is unavailable.');
  }

  function formatCount(count, singular, plural) {
    return count + ' ' + (count === 1 ? singular : (plural || singular));
  }

  var api = {
    SUPPORTED_IMAGE_MIME_TYPES: SUPPORTED_IMAGE_MIME_TYPES,
    MARKER_VALUES: MARKER_VALUES,
    nowIso: nowIso,
    randomUUID: randomUUID,
    truncateCodePoints: truncateCodePoints,
    sanitizeFileName: sanitizeFileName,
    ensureMarkdownExtension: ensureMarkdownExtension,
    deriveTitleFromFileName: deriveTitleFromFileName,
    splitExtension: splitExtension,
    isSafeFileName: isSafeFileName,
    isSafeRelativeImageName: isSafeRelativeImageName,
    isExternalReference: isExternalReference,
    normalizeReference: normalizeReference,
    referenceBasename: referenceBasename,
    uniqueFileName: uniqueFileName,
    mimeToExtension: mimeToExtension,
    extensionToMime: extensionToMime,
    isSupportedImageMime: isSupportedImageMime,
    isSupportedMarker: isSupportedMarker,
    formatDate: formatDate,
    escapeHtml: escapeHtml,
    debounce: debounce,
    clamp: clamp,
    isInteger: isInteger,
    asInteger: asInteger,
    deepClone: deepClone,
    bytesToBase64: bytesToBase64,
    base64ToBytes: base64ToBytes,
    formatCount: formatCount
  };

  global.Prompter = global.Prompter || {};
  global.Prompter.utils = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
