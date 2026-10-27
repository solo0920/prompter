(function (global) {
  'use strict';

  // Directory search is implemented in Phase 6 (US4). The namespace exists from bootstrap so
  // the shell can call it without feature detection branch failures.
  var api = {
    init: function () {},
    refreshDirectory: function () {},
    search: function () { return []; }
  };

  global.Prompter = global.Prompter || {};
  global.Prompter.search = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
