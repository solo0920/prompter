(function (global) {
  'use strict';

  // Preview rendering is implemented in Phase 5 (US3).
  var api = {
    open: function () {
      if (global.Prompter.app) {
        global.Prompter.app.toast('預覽將在後續版本提供。');
      }
    }
  };

  global.Prompter = global.Prompter || {};
  global.Prompter.preview = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
