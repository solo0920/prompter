(function (global) {
  'use strict';

  // Settings persistence is handled by app.js during bootstrap; Phase 7 (US5) expands the
  // dialog behavior and adds verification hooks here.
  var api = {
    init: function () {}
  };

  global.Prompter = global.Prompter || {};
  global.Prompter.settings = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
