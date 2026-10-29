(function (global) {
  'use strict';

  var Utils = (typeof module === 'object' && module.exports)
    ? require('./utils.js')
    : global.Prompter.utils;
  var Markdown = (typeof module === 'object' && module.exports)
    ? require('./markdown.js')
    : global.Prompter.markdown;
  var KaTeX = (typeof module === 'object' && module.exports)
    ? require('../vendor/katex/katex.min.js')
    : global.katex;

  var initialized = false;
  var lastTrigger = null;
  var renderToken = 0;
  var active = false;
  var refreshTimer = null;

  function getApp() {
    return global.Prompter && global.Prompter.app ? global.Prompter.app : null;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var AMS_ENVIRONMENTS = [
    'equation', 'equation*', 'align', 'align*', 'alignat', 'alignat*',
    'gather', 'gather*', 'CD'
  ];

  function getKaTeX() {
    return KaTeX && typeof KaTeX.renderToString === 'function' ? KaTeX : null;
  }

  function renderMath(tex, displayMode, output) {
    var katex = getKaTeX();
    if (!katex) {
      return null;
    }
    try {
      return katex.renderToString(String(tex), {
        displayMode: !!displayMode,
        throwOnError: false,
        strict: 'ignore',
        trust: false,
        output: output === 'mathml' ? 'mathml' : 'htmlAndMathml',
        maxExpand: 1000,
        maxSize: 10
      });
    } catch (error) {
      return null;
    }
  }

  function findDelimiter(text, start, delimiter) {
    var escapedAware = delimiter.charAt(0) !== '\\';
    var index = start;
    while (index < text.length) {
      if (escapedAware && text.charAt(index) === '\\') {
        index += 2;
        continue;
      }
      if (text.slice(index, index + delimiter.length) === delimiter) {
        return index;
      }
      index += 1;
    }
    return -1;
  }

  function findInlineMathEnd(text, start) {
    var index = start;
    while (index < text.length) {
      var character = text.charAt(index);
      if (character === '\\') {
        index += 2;
        continue;
      }
      if (character === '$') {
        return index > start && !/\s/.test(text.charAt(index - 1)) ? index : -1;
      }
      index += 1;
    }
    return -1;
  }

  function renderInline(value, mathOutput) {
    var text = String(value == null ? '' : value);
    var output = '';
    var buffer = '';

    function flush() {
      if (buffer) {
        output += escapeHtml(buffer);
        buffer = '';
      }
    }

    var index = 0;
    while (index < text.length) {
      var character = text.charAt(index);

      if (character === '\\') {
        var next = text.charAt(index + 1);
        if (next === '$') {
          buffer += '$';
          index += 2;
          continue;
        }
        if (next === '[' || next === '(') {
          var close = next === '[' ? '\\]' : '\\)';
          var closeIndex = findDelimiter(text, index + 2, close);
          if (closeIndex !== -1) {
            var bracketHtml = renderMath(
              text.slice(index + 2, closeIndex), next === '[', mathOutput);
            if (bracketHtml) {
              flush();
              output += bracketHtml;
              index = closeIndex + 2;
              continue;
            }
          }
        }
        var environment = /^\\begin\{([A-Za-z*]+)\}/.exec(text.slice(index));
        if (environment && AMS_ENVIRONMENTS.indexOf(environment[1]) !== -1) {
          var endToken = '\\end{' + environment[1] + '}';
          var environmentEnd = text.indexOf(endToken, index + environment[0].length);
          if (environmentEnd !== -1) {
            var environmentHtml = renderMath(
              text.slice(index, environmentEnd + endToken.length), true, mathOutput);
            if (environmentHtml) {
              flush();
              output += environmentHtml;
              index = environmentEnd + endToken.length;
              continue;
            }
          }
        }
        buffer += character;
        index += 1;
        continue;
      }

      if (character === '$') {
        if (text.charAt(index + 1) === '$') {
          var displayEnd = findDelimiter(text, index + 2, '$$');
          if (displayEnd > index + 2) {
            var displayHtml = renderMath(
              text.slice(index + 2, displayEnd), true, mathOutput);
            if (displayHtml) {
              flush();
              output += displayHtml;
              index = displayEnd + 2;
              continue;
            }
          }
        } else if (text.charAt(index + 1) && !/\s/.test(text.charAt(index + 1))) {
          var inlineEnd = findInlineMathEnd(text, index + 1);
          if (inlineEnd > index + 1) {
            var inlineHtml = renderMath(
              text.slice(index + 1, inlineEnd), false, mathOutput);
            if (inlineHtml) {
              flush();
              output += inlineHtml;
              index = inlineEnd + 1;
              continue;
            }
          }
        }
      }

      buffer += character;
      index += 1;
    }
    flush();
    return output;
  }

  function renderDisplayMathLine(value, mathOutput) {
    var line = String(value == null ? '' : value).trim();
    var match = /^\$\$([\s\S]+)\$\$$/.exec(line) ||
      /^\\\[([\s\S]+)\\\]$/.exec(line);
    if (!match) {
      return null;
    }
    var html = renderMath(match[1], true, mathOutput);
    return html ? '<div class="preview-math-display">' + html + '</div>' : null;
  }

  function normalizeKey(value) {
    return Utils.normalizeReference(value).toLowerCase();
  }

  function imageBaseName(value) {
    return Utils.referenceBasename(value).toLowerCase();
  }

  function indexAssets(assets) {
    var byName = {};
    var byBaseName = {};
    (assets || []).forEach(function (asset) {
      if (!asset || !asset.fileName) {
        return;
      }
      var key = normalizeKey(asset.fileName);
      if (key && !byName[key]) {
        byName[key] = asset;
      }
      var base = imageBaseName(asset.fileName);
      if (base && !byBaseName[base]) {
        byBaseName[base] = asset;
      }
    });
    return { byName: byName, byBaseName: byBaseName };
  }

  function findAsset(index, reference) {
    var key = normalizeKey(reference);
    if (!key) {
      return null;
    }
    return index.byName[key] || index.byBaseName[imageBaseName(reference)] || null;
  }

  function safeImageUrl(url) {
    var value = String(url == null ? '' : url).trim();
    if (!value) {
      return '';
    }
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) {
      return value;
    }
    if (/^blob:/i.test(value)) {
      return value;
    }
    return '';
  }

  function lookupImageUrl(options, asset, reference) {
    if (typeof options.imageUrlFor === 'function') {
      return safeImageUrl(options.imageUrlFor(asset, reference));
    }
    var urls = options.imageUrls || {};
    var candidates = [];
    if (asset) {
      candidates.push(asset.fileName, asset.id);
    }
    candidates.push(reference, normalizeKey(reference));
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i];
      if (candidate && Object.prototype.hasOwnProperty.call(urls, candidate)) {
        var found = safeImageUrl(urls[candidate]);
        if (found) {
          return found;
        }
      }
    }
    return '';
  }

  function imagePlaceholder(alt, reference, kind) {
    var label = alt || reference || '圖片';
    var suffix = kind === 'remote' ? '（遠端圖片未載入）' : '（圖片無法顯示）';
    return '<span class="missing-image" role="img" aria-label="' +
      escapeHtml(label + suffix) + '">' + escapeHtml(label + suffix) + '</span>';
  }

  function renderImageLine(line, options, assetIndex, missing) {
    var descriptor = Markdown.matchImageLine(line);
    if (!descriptor) {
      return null;
    }
    var reference = descriptor.target;
    if (/^data:/i.test(reference)) {
      missing.push(descriptor.alt || '內嵌圖片');
      return imagePlaceholder(descriptor.alt, reference, 'missing');
    }
    var external = Utils.isExternalReference(reference);
    var asset = external ? null : findAsset(assetIndex, reference);
    var url = external ? '' : lookupImageUrl(options, asset, reference);
    if (url) {
      return '<p class="preview-image"><img src="' + escapeHtml(url) +
        '" alt="' + escapeHtml(descriptor.alt || '') + '" loading="lazy"></p>';
    }
    missing.push(reference);
    return imagePlaceholder(descriptor.alt, reference, external ? 'remote' : 'missing');
  }

  function splitTableRow(line) {
    var value = String(line == null ? '' : line).trim();
    if (value.charAt(0) === '|') {
      value = value.slice(1);
    }
    if (value.charAt(value.length - 1) === '|') {
      value = value.slice(0, -1);
    }
    return value.split('|').map(function (cell) {
      return cell.trim();
    });
  }

  function isTableSeparator(line) {
    if (String(line == null ? '' : line).indexOf('|') === -1) {
      return false;
    }
    var cells = splitTableRow(line);
    if (cells.length === 0) {
      return false;
    }
    return cells.every(function (cell) {
      return /^:?-{3,}:?$/.test(cell);
    });
  }

  function isTableHeader(lines, index) {
    return String(lines[index] || '').indexOf('|') !== -1 &&
      index + 1 < lines.length && isTableSeparator(lines[index + 1]);
  }

  function renderTableRow(cells, tag, mathOutput) {
    return '<tr>' + cells.map(function (cell) {
      return '<' + tag + '>' + renderInline(cell, mathOutput) + '</' + tag + '>';
    }).join('') + '</tr>';
  }

  function renderMarkdown(markdown, options) {
    var input = options || {};
    var text = Markdown.normalizeText(markdown);
    var lines = text === '' ? [] : text.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    var assetIndex = indexAssets(input.assets || []);
    var mathOutput = input.mathOutput === 'mathml' ? 'mathml' : 'htmlAndMathml';
    var missing = [];
    var missingSeen = {};
    var html = [];
    var index = 0;

    function addMissing(reference) {
      var key = String(reference == null ? '' : reference);
      if (!key || missingSeen[key]) {
        return;
      }
      missingSeen[key] = true;
      missing.push(key);
    }

    while (index < lines.length) {
      var line = lines[index];
      if (/^\s*$/.test(line)) {
        index += 1;
        continue;
      }

      var displayStart = /^\s*(\$\$|\\\[)\s*$/.exec(line);
      if (displayStart) {
        var closer = displayStart[1] === '$$' ? /^\s*\$\$\s*$/ : /^\s*\\\]\s*$/;
        var mathLines = [];
        var scan = index + 1;
        while (scan < lines.length && !closer.test(lines[scan])) {
          mathLines.push(lines[scan]);
          scan += 1;
        }
        if (scan < lines.length) {
          var blockMath = renderMath(mathLines.join('\n'), true, mathOutput);
          if (blockMath) {
            html.push('<div class="preview-math-display">' + blockMath + '</div>');
            index = scan + 1;
            continue;
          }
        }
      }

      var environmentStart = /^\s*\\begin\{([A-Za-z*]+)\}\s*$/.exec(line);
      if (environmentStart && AMS_ENVIRONMENTS.indexOf(environmentStart[1]) !== -1) {
        var environmentEnd = '\\end{' + environmentStart[1] + '}';
        var environmentLines = [line];
        var environmentScan = index + 1;
        while (environmentScan < lines.length &&
            lines[environmentScan].trim() !== environmentEnd) {
          environmentLines.push(lines[environmentScan]);
          environmentScan += 1;
        }
        if (environmentScan < lines.length) {
          environmentLines.push(lines[environmentScan]);
          var blockEnvironment = renderMath(
            environmentLines.join('\n'), true, mathOutput);
          if (blockEnvironment) {
            html.push('<div class="preview-math-display">' + blockEnvironment + '</div>');
            index = environmentScan + 1;
            continue;
          }
        }
      }

      var fence = /^```(.*)$/.exec(line);
      if (fence) {
        var language = fence[1].trim().split(/\s+/)[0] || '';
        var codeLines = [];
        index += 1;
        while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) {
          index += 1;
        }
        html.push('<pre><code' +
          (language ? ' class="language-' + escapeHtml(language) + '"' : '') +
          '>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
        continue;
      }

      if (isTableHeader(lines, index)) {
        var header = splitTableRow(line);
        var rows = [];
        index += 2;
        while (index < lines.length && lines[index].indexOf('|') !== -1 &&
            !/^\s*$/.test(lines[index])) {
          rows.push(splitTableRow(lines[index]));
          index += 1;
        }
        html.push('<table>\n<thead>\n' + renderTableRow(header, 'th', mathOutput) +
          '\n</thead>\n<tbody>\n' + rows.map(function (row) {
            return renderTableRow(row, 'td', mathOutput);
          }).join('\n') + '\n</tbody>\n</table>');
        continue;
      }

      var heading = /^(#{1,3})\s+(.*)$/.exec(line);
      if (heading) {
        html.push('<h' + heading[1].length + '>' +
          renderInline(heading[2], mathOutput) + '</h' + heading[1].length + '>');
        index += 1;
        continue;
      }

      if (/^- /.test(line)) {
        var bullets = [];
        while (index < lines.length && /^- /.test(lines[index])) {
          bullets.push(lines[index].slice(2));
          index += 1;
        }
        html.push('<ul>\n' + bullets.map(function (item) {
          return '<li>' + renderInline(item, mathOutput) + '</li>';
        }).join('\n') + '\n</ul>');
        continue;
      }

      var ordered = /^(\d+)\. (.*)$/.exec(line);
      if (ordered) {
        var items = [];
        while (index < lines.length) {
          var match = /^(\d+)\. (.*)$/.exec(lines[index]);
          if (!match) {
            break;
          }
          items.push({ value: match[1], text: match[2] });
          index += 1;
        }
        html.push('<ol>\n' + items.map(function (item) {
          return '<li value="' + escapeHtml(item.value) + '">' +
            renderInline(item.text, mathOutput) + '</li>';
        }).join('\n') + '\n</ol>');
        continue;
      }

      if (/^> /.test(line)) {
        var quotes = [];
        while (index < lines.length && /^> /.test(lines[index])) {
          quotes.push(lines[index].slice(2));
          index += 1;
        }
        html.push('<blockquote>\n' + quotes.map(function (quote) {
          return '<p>' + renderInline(quote, mathOutput) + '</p>';
        }).join('\n') + '\n</blockquote>');
        continue;
      }

      var image = renderImageLine(line, input, assetIndex, { push: addMissing });
      if (image !== null) {
        html.push(image);
        index += 1;
        continue;
      }

      var displayMath = renderDisplayMathLine(line, mathOutput);
      if (displayMath !== null) {
        html.push(displayMath);
        index += 1;
        continue;
      }

      html.push('<p>' + renderInline(line, mathOutput) + '</p>');
      index += 1;
    }

    return {
      html: html.join('\n'),
      missingImages: missing
    };
  }

  function blobToDataUrl(blob) {
    if (!blob) {
      return Promise.resolve('');
    }
    if (typeof global.FileReader === 'function') {
      return new Promise(function (resolve) {
        var reader = new global.FileReader();
        reader.onload = function () {
          resolve(String(reader.result || ''));
        };
        reader.onerror = function () {
          resolve('');
        };
        reader.readAsDataURL(blob);
      });
    }
    if (typeof blob.arrayBuffer === 'function') {
      return blob.arrayBuffer().then(function (buffer) {
        return 'data:' + (blob.type || 'application/octet-stream') + ';base64,' +
          Utils.bytesToBase64(new Uint8Array(buffer));
      }, function () {
        return '';
      });
    }
    return Promise.resolve('');
  }

  function assetDataUrl(asset) {
    if (!asset) {
      return Promise.resolve('');
    }
    if (asset.dataUrl) {
      return Promise.resolve(asset.dataUrl);
    }
    if (asset.bytes) {
      return Promise.resolve('data:' + (asset.mimeType || 'application/octet-stream') +
        ';base64,' + Utils.bytesToBase64(asset.bytes));
    }
    if (asset.blob) {
      return blobToDataUrl(asset.blob);
    }
    return Promise.resolve('');
  }

  function buildImageDataUrlMap(assets, options) {
    var input = options || {};
    var limit = Number(input.maxDataUrlLength) || 0;
    var urls = {};
    return Promise.all((assets || []).map(function (asset) {
      if (!asset || !asset.fileName) {
        return null;
      }
      return assetDataUrl(asset).then(function (url) {
        if (!url) {
          return null;
        }
        if (limit > 0 && url.length > limit) {
          return null;
        }
        urls[asset.fileName] = url;
        return null;
      }, function () {
        return null;
      });
    })).then(function () {
      return urls;
    });
  }

  function emptyState(content) {
    content.textContent = '';
    var message = global.document.createElement('p');
    message.className = 'preview-empty';
    message.textContent = '目前沒有可預覽的內容。';
    content.appendChild(message);
  }

  function failureState(content, markdown, error) {
    content.textContent = '';
    var message = global.document.createElement('p');
    message.className = 'preview-error';
    message.setAttribute('role', 'alert');
    message.textContent = '預覽發生錯誤，以下為原始 Markdown。' +
      (error && error.message ? '（' + error.message + '）' : '');
    var pre = global.document.createElement('pre');
    pre.textContent = markdown;
    content.appendChild(message);
    content.appendChild(pre);
  }

  function showImageWarnings(content, missingImages) {
    if (!missingImages || missingImages.length === 0) {
      return;
    }
    var warning = global.document.createElement('p');
    warning.className = 'preview-warning';
    warning.setAttribute('role', 'status');
    warning.textContent = '圖片無法顯示：' + missingImages.join('、');
    content.insertBefore(warning, content.firstChild);
  }

  function reflowEditor() {
    if (global.Prompter.editor && typeof global.Prompter.editor.reflowLayout === 'function') {
      global.setTimeout(function () {
        global.Prompter.editor.reflowLayout();
      }, 0);
    }
  }

  function setPreviewMode(on) {
    var app = getApp();
    if (!app || !app.elements) {
      return;
    }
    var view = app.elements['preview-view'];
    if (view) {
      view.hidden = !on;
    }
    var workspace = app.elements.workspace;
    if (workspace) {
      workspace.classList.toggle('preview-open', !!on);
    }
    var button = app.elements['preview-button'];
    if (button) {
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.setAttribute('aria-label', on ? '關閉即時預覽' : '即時預覽');
      button.title = on ? '關閉即時預覽' : '即時預覽';
    }
    if (app && typeof app.updatePreviewLabel === 'function') {
      app.updatePreviewLabel();
    }
    reflowEditor();
  }

  function clearPreviewContent() {
    var app = getApp();
    var content = app && app.elements ? app.elements['preview-content'] : null;
    if (content) {
      content.textContent = '';
    }
  }

  function renderCurrent() {
    var app = getApp();
    if (!app || !app.state || !app.elements) {
      return Promise.resolve({ ok: false, empty: true });
    }
    var content = app.elements['preview-content'];
    if (!content) {
      app.toast('預覽功能尚未就緒。');
      return Promise.resolve({ ok: false });
    }
    var document = app.state.document;
    if (global.Prompter.editor &&
        typeof global.Prompter.editor.previewDocument === 'function') {
      document = global.Prompter.editor.previewDocument() || document;
    }
    if (!document || !document.blocks || document.blocks.length === 0) {
      renderToken += 1;
      emptyState(content);
      return Promise.resolve({ ok: true, empty: true });
    }

    var markdown = Markdown.serializeDocument(document, { assets: app.state.assets });
    if (!content.firstChild) {
      var loading = global.document.createElement('p');
      loading.className = 'preview-empty';
      loading.textContent = '正在準備預覽…';
      content.appendChild(loading);
    }
    var token = renderToken + 1;
    renderToken = token;
    return buildImageDataUrlMap(app.state.assets).then(function (urls) {
      if (token !== renderToken) {
        return { ok: false, stale: true };
      }
      try {
        var rendered = renderMarkdown(markdown, {
          assets: app.state.assets,
          imageUrls: urls
        });
        content.innerHTML = rendered.html;
        showImageWarnings(content, rendered.missingImages);
        return {
          ok: true,
          markdown: markdown,
          html: rendered.html,
          missingImages: rendered.missingImages
        };
      } catch (error) {
        failureState(content, markdown, error);
        return { ok: false, error: error };
      }
    });
  }

  function open(trigger) {
    var app = getApp();
    if (!app || !app.state || !app.elements) {
      return Promise.resolve({ ok: false, empty: true });
    }
    var view = app.elements['preview-view'];
    if (!view) {
      app.toast('預覽功能尚未就緒。');
      return Promise.resolve({ ok: false });
    }
    active = true;
    lastTrigger = trigger || app.elements['preview-button'] ||
      (global.document ? global.document.activeElement : null);
    setPreviewMode(true);
    return renderCurrent();
  }

  function openDefault() {
    var app = getApp();
    if (!app || !app.state || !app.state.document) {
      return Promise.resolve({ ok: false, empty: true });
    }
    if (active) {
      return Promise.resolve({ ok: true, alreadyOpen: true });
    }
    return open(app.elements['preview-button']);
  }

  function refresh() {
    if (!active) {
      return Promise.resolve({ ok: false, inactive: true });
    }
    return renderCurrent();
  }

  function scheduleRefresh() {
    if (!active) {
      return;
    }
    if (refreshTimer !== null) {
      global.clearTimeout(refreshTimer);
    }
    refreshTimer = global.setTimeout(function () {
      refreshTimer = null;
      refresh();
    }, 80);
  }

  function close() {
    if (!active) {
      return;
    }
    active = false;
    if (refreshTimer !== null) {
      global.clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    renderToken += 1;
    setPreviewMode(false);
    clearPreviewContent();
    var target = lastTrigger;
    lastTrigger = null;
    if (target && typeof target.focus === 'function' && !target.disabled) {
      try {
        target.focus();
      } catch (error) {
        // The trigger may have been removed by a document change.
      }
    }
  }

  function toggle(trigger) {
    if (active) {
      close();
      return Promise.resolve({ ok: true, closed: true });
    }
    return open(trigger);
  }

  function isOpen() {
    return active;
  }

  function init() {
    if (initialized) {
      return;
    }
    initialized = true;
    setPreviewMode(false);
  }

  var api = {
    init: init,
    open: open,
    openDefault: openDefault,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    refresh: refresh,
    scheduleRefresh: scheduleRefresh,
    renderMarkdown: renderMarkdown,
    buildImageDataUrlMap: buildImageDataUrlMap,
    escapeHtml: escapeHtml
  };

  global.Prompter = global.Prompter || {};
  global.Prompter.preview = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
