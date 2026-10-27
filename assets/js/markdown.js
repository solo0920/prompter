(function (global) {
  'use strict';

  var Utils = (typeof module === 'object' && module.exports)
    ? require('./utils.js')
    : global.Prompter.utils;

  var PREFIXED_MARKERS = ['###', '##', '#', '-', '1.', '>', '.'];
  var ROW_HEIGHT = 24;

  function normalizeText(value) {
    var text = String(value == null ? '' : value);
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    return text.replace(/\r\n?/g, '\n');
  }

  function isBlankLine(line) {
    return /^[\s\u00a0]*$/.test(line);
  }

  function detectMarker(input) {
    var line = String(input == null ? '' : input);
    for (var i = 0; i < PREFIXED_MARKERS.length; i += 1) {
      var marker = PREFIXED_MARKERS[i];
      var prefix = marker + ' ';
      if (line.slice(0, prefix.length) === prefix) {
        var rest = line.slice(prefix.length);
        if (rest.trim() !== '') {
          return { marker: marker, text: rest };
        }
        return { marker: 'none', text: line };
      }
    }
    return { marker: 'none', text: line };
  }

  function markerPrefix(marker) {
    return marker && marker !== 'none' ? marker + ' ' : '';
  }

  function escapeAltText(alt) {
    return String(alt == null ? '' : alt)
      .replace(/\\/g, '\\\\')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
  }

  function unescapeAltText(alt) {
    return String(alt == null ? '' : alt).replace(/\\([\\\[\]])/g, '$1');
  }

  function matchImageLine(line) {
    var match = /^!\[((?:\\.|[^\\\]])*)\]\((.*)\)\s*$/.exec(line);
    if (!match || match[2].trim() === '') {
      return null;
    }
    return {
      alt: unescapeAltText(match[1]),
      target: match[2].trim()
    };
  }

  function parseLine(line) {
    var image = matchImageLine(line);
    if (image) {
      return {
        kind: 'image',
        alt: image.alt,
        target: image.target,
        raw: line,
        marker: 'none',
        text: line,
        blankLinesAfter: 0
      };
    }
    var detected = detectMarker(line);
    return {
      kind: 'text',
      marker: detected.marker,
      text: detected.text,
      raw: line,
      blankLinesAfter: 0
    };
  }

  function parseMarkdown(source) {
    var text = normalizeText(source);
    var trailingNewline = text.charAt(text.length - 1) === '\n';
    var lines;
    if (text === '') {
      lines = [];
    } else {
      lines = text.split('\n');
      if (trailingNewline) {
        lines.pop();
      }
    }

    var leading = 0;
    while (leading < lines.length && isBlankLine(lines[leading])) {
      leading += 1;
    }
    var trailing = 0;
    if (leading < lines.length) {
      while (trailing < lines.length - leading && isBlankLine(lines[lines.length - 1 - trailing])) {
        trailing += 1;
      }
    } else {
      leading = 0;
      trailing = lines.length;
    }

    var descriptors = [];
    var pendingBlankLines = 0;
    for (var i = leading; i < lines.length - trailing; i += 1) {
      var line = lines[i];
      if (isBlankLine(line)) {
        pendingBlankLines += 1;
        continue;
      }
      if (descriptors.length > 0) {
        descriptors[descriptors.length - 1].blankLinesAfter = pendingBlankLines;
      }
      pendingBlankLines = 0;
      descriptors.push(parseLine(line));
    }

    return {
      leadingBlankLines: leading,
      lines: descriptors,
      trailingBlankLines: trailing,
      trailingNewline: trailingNewline
    };
  }

  function rowFor(block) {
    return Math.round(Number(block.y || 0) / ROW_HEIGHT);
  }

  function compareStrings(left, right) {
    var a = String(left == null ? '' : left);
    var b = String(right == null ? '' : right);
    if (a < b) {
      return -1;
    }
    if (a > b) {
      return 1;
    }
    return 0;
  }

  function blocksInReadingOrder(blocks) {
    return (blocks || []).slice().sort(function (left, right) {
      var rowDifference = rowFor(left) - rowFor(right);
      if (rowDifference !== 0) {
        return rowDifference;
      }
      var xDifference = Number(left.x || 0) - Number(right.x || 0);
      if (xDifference !== 0) {
        return xDifference;
      }
      var seqDifference = Number(left.seq || 0) - Number(right.seq || 0);
      if (seqDifference !== 0) {
        return seqDifference;
      }
      return compareStrings(left.id, right.id);
    });
  }

  function assetFor(options, block) {
    var assets = options && options.assets;
    if (!assets) {
      return null;
    }
    if (typeof assets.get === 'function') {
      return assets.get(block.assetId) || null;
    }
    if (Object.prototype.toString.call(assets) === '[object Array]') {
      for (var i = 0; i < assets.length; i += 1) {
        if (assets[i].id === block.assetId) {
          return assets[i];
        }
      }
      return null;
    }
    return assets[block.assetId] || null;
  }

  function serializeBlockLine(block, options) {
    if (!block) {
      return '';
    }
    if (block.type === 'image') {
      var asset = assetFor(options, block);
      var fileName = (asset && asset.fileName) || block.fileName || 'missing-image.png';
      var alt = block.alt != null && block.alt !== ''
        ? block.alt
        : ((asset && asset.originalName) || fileName);
      return '![' + escapeAltText(alt) + '](' + fileName + ')';
    }
    return markerPrefix(block.marker) + String(block.text == null ? '' : block.text);
  }

  function serializeDocument(document, options) {
    if (!document) {
      return '';
    }
    var blocks = blocksInReadingOrder(document.blocks || []);
    var lines = [];
    var leading = Math.max(0, Number(document.leadingBlankLines) || 0);
    var trailing = Math.max(0, Number(document.trailingBlankLines) || 0);
    var i;
    var j;
    for (i = 0; i < leading; i += 1) {
      lines.push('');
    }
    for (i = 0; i < blocks.length; i += 1) {
      lines.push(serializeBlockLine(blocks[i], options));
      if (i < blocks.length - 1) {
        var blankLines = Math.max(0, Number(blocks[i].blankLinesAfter) || 0);
        for (j = 0; j < blankLines; j += 1) {
          lines.push('');
        }
      }
    }
    for (i = 0; i < trailing; i += 1) {
      lines.push('');
    }
    var result = lines.join('\n');
    if (document.trailingNewline && lines.length > 0) {
      result += '\n';
    }
    return result;
  }

  var api = {
    ROW_HEIGHT: ROW_HEIGHT,
    normalizeText: normalizeText,
    isBlankLine: isBlankLine,
    detectMarker: detectMarker,
    markerPrefix: markerPrefix,
    escapeAltText: escapeAltText,
    unescapeAltText: unescapeAltText,
    matchImageLine: matchImageLine,
    parseLine: parseLine,
    parseMarkdown: parseMarkdown,
    rowFor: rowFor,
    blocksInReadingOrder: blocksInReadingOrder,
    serializeBlockLine: serializeBlockLine,
    serializeDocument: serializeDocument
  };

  global.Prompter = global.Prompter || {};
  global.Prompter.markdown = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
