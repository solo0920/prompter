(function (global) {
  'use strict';

  function normalizeQuery(query) {
    return String(query == null ? '' : query).trim();
  }

  function assetListFor(assetsByDocument, documentId) {
    return assetsByDocument[documentId] || [];
  }

  function searchableText(document, assetsByDocument) {
    var parts = [];
    if (!document) {
      return '';
    }
    parts.push(document.title || '');
    (document.blocks || []).forEach(function (block) {
      if (!block) {
        return;
      }
      if (block.type === 'image') {
        if (block.alt) {
          parts.push(block.alt);
        }
        return;
      }
      if (block.text) {
        parts.push(block.text);
      }
    });
    assetListFor(assetsByDocument, document.id).forEach(function (asset) {
      if (!asset) {
        return;
      }
      if (asset.fileName) {
        parts.push(asset.fileName);
      }
      if (asset.originalName && asset.originalName !== asset.fileName) {
        parts.push(asset.originalName);
      }
    });
    return parts.join('\n').toLowerCase();
  }

  function groupAssets(assets) {
    var grouped = {};
    (assets || []).forEach(function (asset) {
      if (!asset || !asset.documentId) {
        return;
      }
      if (!grouped[asset.documentId]) {
        grouped[asset.documentId] = [];
      }
      grouped[asset.documentId].push(asset);
    });
    return grouped;
  }

  function buildIndex(documents, assets) {
    var assetsByDocument = groupAssets(assets);
    return {
      entries: (documents || []).map(function (document) {
        return {
          document: document,
          text: searchableText(document, assetsByDocument)
        };
      })
    };
  }

  function searchIndex(index, query) {
    var entries = index && index.entries ? index.entries : [];
    var normalized = normalizeQuery(query).toLowerCase();
    if (!normalized) {
      return entries.map(function (entry) {
        return entry.document;
      });
    }
    return entries.filter(function (entry) {
      return entry.text.indexOf(normalized) !== -1;
    }).map(function (entry) {
      return entry.document;
    });
  }

  function searchDocuments(documents, query, assets) {
    return searchIndex(buildIndex(documents, assets), query);
  }

  function refreshDirectory() {
    var app = global.Prompter && global.Prompter.app;
    if (app && typeof app.refreshDirectory === 'function') {
      return app.refreshDirectory();
    }
    return Promise.resolve();
  }

  function init() {
    // Search wiring lives with the directory UI in app.js; this module owns indexing.
  }

  var api = {
    init: init,
    normalizeQuery: normalizeQuery,
    buildIndex: buildIndex,
    searchIndex: searchIndex,
    searchDocuments: searchDocuments,
    search: searchDocuments,
    refreshDirectory: refreshDirectory
  };

  global.Prompter = global.Prompter || {};
  global.Prompter.search = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
