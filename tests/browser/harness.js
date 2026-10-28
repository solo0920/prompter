(function () {
  'use strict';

  var tests = [];
  var PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4FhMDAAOaAY+ewF4JAAAAAElFTkSuQmCC';
  var frame = document.getElementById('app-frame');

  function test(name, fn) {
    tests.push({ name: name, fn: fn });
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed.');
    }
  }

  function equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error((message || 'Values differ.') + '\nExpected: ' + expected + '\nActual: ' + actual);
    }
  }

  function waitFor(predicate, timeout) {
    var limit = timeout || 5000;
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      (function poll() {
        var value;
        try {
          value = predicate();
        } catch (error) {
          reject(error);
          return;
        }
        if (value) {
          resolve(value);
          return;
        }
        if (Date.now() - started > limit) {
          reject(new Error('Timed out waiting for the expected application state.'));
          return;
        }
        setTimeout(poll, 40);
      }());
    });
  }

  function frameWindow() {
    return frame.contentWindow;
  }

  function appReady() {
    return waitFor(function () {
      var win = frameWindow();
      if (win && win.Prompter && win.Prompter.app &&
          win.Prompter.app.state.initialized) {
        return win;
      }
      return null;
    }, 15000);
  }

  function byId(win, id) {
    return win.document.getElementById(id);
  }

  function closeDialogs(win) {
    Array.prototype.forEach.call(win.document.querySelectorAll('dialog[open]'), function (dialog) {
      try {
        dialog.close();
      } catch (error) {
        dialog.removeAttribute('open');
      }
    });
  }

  function setValue(win, input, text) {
    input.value = text;
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
  }

  function press(win, element, key, options) {
    var init = Object.assign({ key: key, bubbles: true, cancelable: true }, options || {});
    element.dispatchEvent(new win.KeyboardEvent('keydown', init));
  }

  function composerInput(win) {
    return win.document.querySelector('#canvas .composer-input');
  }

  function blocks(win) {
    return Array.prototype.slice.call(win.document.querySelectorAll('#canvas .block'));
  }

  function blockById(win, id) {
    return win.document.querySelector('#canvas .block[data-block-id="' + id + '"]');
  }

  function lastBlock(win) {
    var list = blocks(win);
    return list.length ? list[list.length - 1] : null;
  }

  function freshDocument(win, defaultMarker) {
    var app = win.Prompter.app;
    closeDialogs(win);
    app.clearDocument();
    app.state.preferences.defaultMarker = defaultMarker || 'none';
    if (win.Prompter.editor.setDefaultMarker) {
      win.Prompter.editor.setDefaultMarker(app.state.preferences.defaultMarker);
    }
    app.setDirty(false);
    var button = byId(win, 'file-menu-button');
    var menu = byId(win, 'file-menu');
    if (button.getAttribute('aria-expanded') !== 'true') {
      button.click();
    }
    var item = menu.querySelector('[data-action="new"]');
    assert(item, 'File > New menu item is missing.');
    item.click();
    return app.state;
  }

  function commitComposer(win, text) {
    var input = composerInput(win);
    assert(input, 'The composer input is missing.');
    if (text !== undefined) {
      setValue(win, input, text);
    }
    press(win, input, 'Enter');
    return lastBlock(win);
  }

  function addBelow(win, anchorElement, text, marker) {
    var plus = anchorElement.querySelector('.block-plus');
    assert(plus, 'The block "+" control is missing.');
    plus.click();
    if (marker !== undefined) {
      win.Prompter.editor.setDefaultMarker(marker);
    }
    return commitComposer(win, text);
  }

  function createSequence(win, texts) {
    var first = commitComposer(win, texts[0]);
    var current = first;
    for (var i = 1; i < texts.length; i += 1) {
      current = addBelow(win, current, texts[i]);
    }
    return blocks(win);
  }

  function pngFile(win, name) {
    var bytes = win.Prompter.utils.base64ToBytes(PNG_BASE64);
    return new win.File([bytes], name || 'pixel.png', { type: 'image/png' });
  }

  function addPickerImage(win, name) {
    var state = win.Prompter.app.state;
    var before = state.assets.length;
    var input = byId(win, 'image-input');
    var data = new win.DataTransfer();
    data.items.add(pngFile(win, name));
    input.files = data.files;
    input.dispatchEvent(new win.Event('change', { bubbles: true }));
    return waitFor(function () {
      return state.assets.length > before
        ? state.assets[state.assets.length - 1]
        : null;
    }, 8000);
  }

  function saveStoredDocument(win, document, assets) {
    return win.Prompter.app.state.storage.saveDocument(document, assets || [])
      .then(function () {
        return document;
      });
  }

  function directoryItems(win) {
    return Array.prototype.slice.call(
      win.document.querySelectorAll('#document-list .document-item')
    );
  }

  function directoryTitles(win) {
    return directoryItems(win).map(function (item) {
      return item.querySelector('.document-item-title').textContent;
    });
  }

  function directoryButton(win, documentId) {
    return win.document.querySelector(
      '#document-list .document-item[data-document-id="' + documentId + '"]'
    );
  }

  function cleanLibrary(win) {
    var app = win.Prompter.app;
    var state = app.state;
    return Promise.resolve(state.storage.clearLibrary()).then(function () {
      try {
        var preferences = state.storage.getPreferences();
        preferences.lastDocumentId = null;
        state.storage.savePreferences(preferences);
      } catch (error) {
        // The test cleanup still continues when preferences cannot be reset.
      }
      if (typeof app.clearDirectorySearch === 'function') {
        app.clearDirectorySearch();
      }
      app.clearDocument();
      return app.refreshDirectory();
    });
  }

  function withCleanLibrary(win, run) {
    return cleanLibrary(win).then(run).then(function (value) {
      return cleanLibrary(win).then(function () {
        return value;
      });
    }, function (error) {
      return cleanLibrary(win).then(function () {
        throw error;
      }, function () {
        throw error;
      });
    });
  }

  function withPreferences(win, changes, run) {
    var app = win.Prompter.app;
    var Model = win.Prompter.model;
    var original = Model.normalizePreferences(app.state.storage.getPreferences());
    var next = Model.normalizePreferences(original);
    Object.keys(changes || {}).forEach(function (key) {
      next[key] = changes[key];
    });
    next = Model.normalizePreferences(next);
    app.state.preferences = next;
    app.state.storage.savePreferences(next);
    app.applyAppearance();

    function restore() {
      var restored = Model.normalizePreferences(original);
      app.state.preferences = restored;
      try {
        app.state.storage.savePreferences(restored);
      } catch (error) {
        // Restoring test preferences is best-effort.
      }
      app.applyAppearance();
      if (win.Prompter.editor && typeof win.Prompter.editor.setDefaultMarker === 'function') {
        win.Prompter.editor.setDefaultMarker(restored.defaultMarker);
      }
      closeDialogs(win);
    }

    return Promise.resolve().then(run).then(function (value) {
      restore();
      return value;
    }, function (error) {
      restore();
      throw error;
    });
  }

  function changeSelect(win, select, value) {
    select.value = value;
    select.dispatchEvent(new win.Event('change', { bubbles: true }));
  }

  function toggleCheckbox(win, checkbox, checked) {
    checkbox.checked = checked;
    checkbox.dispatchEvent(new win.Event('change', { bubbles: true }));
  }

  function loadProbeFrame(win) {
    var probe = win.document.createElement('iframe');
    probe.setAttribute('aria-hidden', 'true');
    probe.title = 'Prompter appearance probe';
    probe.style.position = 'fixed';
    probe.style.left = '-2200px';
    probe.style.top = '0';
    probe.style.width = '1200px';
    probe.style.height = '820px';
    probe.style.border = '0';
    probe.src = './index.html';
    win.document.body.appendChild(probe);
    return waitFor(function () {
      var doc = probe.contentDocument;
      if (!doc || !doc.documentElement) {
        return null;
      }
      return doc.documentElement.getAttribute('data-style') ? probe : null;
    }, 10000);
  }

  function withProbeFrame(win, run) {
    return loadProbeFrame(win).then(function (probe) {
      return Promise.resolve().then(function () {
        return run(probe);
      }).then(function (value) {
        probe.remove();
        return value;
      }, function (error) {
        probe.remove();
        throw error;
      });
    });
  }

  function withClipboardStub(win, hooks, run) {
    var options = hooks || {};
    var navigator = win.navigator;
    var hadClipboard = Object.prototype.hasOwnProperty.call(navigator, 'clipboard');
    var originalClipboard = navigator.clipboard;
    var hadClipboardItem = Object.prototype.hasOwnProperty.call(win, 'ClipboardItem');
    var originalClipboardItem = win.ClipboardItem;
    var hadExecCommand = Object.prototype.hasOwnProperty.call(win.document, 'execCommand');
    var originalExecCommand = win.document.execCommand;
    var clipboard = {};

    if (options.asyncWrite) {
      clipboard.write = options.asyncWrite;
      function FakeClipboardItem(items) {
        this.items = items;
      }
      FakeClipboardItem.supports = function () {
        return false;
      };
      win.ClipboardItem = FakeClipboardItem;
    }
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: clipboard
    });
    win.document.execCommand = options.execCommand || function () {
      return false;
    };

    function restore() {
      if (hadClipboard) {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: originalClipboard
        });
      } else {
        delete navigator.clipboard;
      }
      if (hadClipboardItem) {
        win.ClipboardItem = originalClipboardItem;
      } else {
        delete win.ClipboardItem;
      }
      if (hadExecCommand) {
        win.document.execCommand = originalExecCommand;
      } else {
        delete win.document.execCommand;
      }
    }

    return Promise.resolve().then(run).then(function (value) {
      restore();
      return value;
    }, function (error) {
      restore();
      throw error;
    });
  }

  function svgFile(win, name) {
    var text = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    return new win.File([text], name || 'icon.svg', { type: 'image/svg+xml' });
  }

  function dispatchPaste(win, target, dataTransfer) {
    var event = new win.Event('paste', { bubbles: true, cancelable: true });
    win.Object.defineProperty(event, 'clipboardData', { value: dataTransfer });
    target.dispatchEvent(event);
    return event;
  }

  function markdownFile(win, name, text) {
    return new win.File([text], name, { type: 'text/markdown' });
  }

  function selectOpenFiles(win, files) {
    var input = byId(win, 'open-input');
    var data = new win.DataTransfer();
    files.forEach(function (file) {
      data.items.add(file);
    });
    input.files = data.files;
    input.dispatchEvent(new win.Event('change', { bubbles: true }));
    return input;
  }

  function fakeDirectory(win, existingNames, options) {
    var opts = options || {};
    var failWrites = opts.failWrites || [];
    var files = {};
    var writes = [];
    (existingNames || []).forEach(function (name) {
      files[name] = new win.Blob(['unrelated'], { type: 'text/plain' });
    });
    function handleFor(name) {
      return {
        name: name,
        createWritable: function () {
          return Promise.resolve({
            write: function (data) {
              if (failWrites.indexOf(name) !== -1) {
                var error = new Error('Simulated write failure for ' + name);
                error.name = 'NotAllowedError';
                return Promise.reject(error);
              }
              files[name] = data;
              writes.push(name);
              return Promise.resolve();
            },
            close: function () {
              return Promise.resolve();
            },
            abort: function () {}
          });
        }
      };
    }
    return {
      name: 'prompter-test',
      files: files,
      writes: writes,
      queryPermission: function () {
        return Promise.resolve('granted');
      },
      getFileHandle: function (name, options) {
        if (options && options.create) {
          return Promise.resolve(handleFor(name));
        }
        if (Object.prototype.hasOwnProperty.call(files, name)) {
          return Promise.resolve(handleFor(name));
        }
        var error = new Error('File not found: ' + name);
        error.name = 'NotFoundError';
        return Promise.reject(error);
      }
    };
  }

  function submitFilename(win, name) {
    return waitFor(function () {
      return byId(win, 'filename-dialog').open ? true : null;
    }, 5000).then(function () {
      setValue(win, byId(win, 'filename-input'), name);
      byId(win, 'filename-confirm').click();
    });
  }

  function readingOrder(win) {
    return win.Prompter.markdown.blocksInReadingOrder(
      win.Prompter.app.state.document.blocks
    );
  }

  test('all classic-script modules are present in the real app', function () {
    return appReady().then(function (win) {
      var modules = ['utils', 'markdown', 'model', 'storage', 'files', 'search',
        'preview', 'clipboard', 'editor', 'settings', 'app'];
      modules.forEach(function (name) {
        assert(win.Prompter && win.Prompter[name], 'Missing Prompter.' + name);
      });
    });
  });

  test('UUID fallback creates v4 identifiers', function () {
    return appReady().then(function (win) {
      var id = win.Prompter.utils.randomUUID();
      assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id),
        'Unexpected UUID: ' + id);
      assert(id !== win.Prompter.utils.randomUUID(), 'UUIDs must be unique.');
    });
  });

  test('Markdown markers and canonical serialization work', function () {
    return appReady().then(function (win) {
      var Markdown = win.Prompter.markdown;
      var Model = win.Prompter.model;
      var detected = Markdown.detectMarker('## 標題');
      equal(detected.marker, '##');
      equal(detected.text, '標題');
      equal(Markdown.detectMarker('#Heading').marker, 'none');
      var document = Model.createPromptDocument({
        blocks: [
          Model.createTextBlock({ id: 'a', marker: '#', text: 'One', y: 0, seq: 1 }),
          Model.createTextBlock({ id: 'b', marker: '-', text: 'Two', y: 24, seq: 2 })
        ]
      });
      equal(Markdown.serializeDocument(document), '# One\n- Two\n');
      equal(Markdown.serializeDocument(Model.createPromptDocument({ blocks: [] })), '');
    });
  });

  test('model validation and reading order use 24 px row bands', function () {
    return appReady().then(function (win) {
      var Model = win.Prompter.model;
      var Markdown = win.Prompter.markdown;
      var document = Model.createPromptDocument({
        blocks: [
          Model.createTextBlock({ id: 'right', text: 'B', x: 200, y: 20, seq: 2 }),
          Model.createTextBlock({ id: 'left', text: 'A', x: 10, y: 0, seq: 1 }),
          Model.createTextBlock({ id: 'below', text: 'C', x: 0, y: 24, seq: 3 })
        ]
      });
      equal(Model.validateDocument(document).valid, true);
      equal(Markdown.blocksInReadingOrder(document.blocks)[0].id, 'left');
      equal(Markdown.blocksInReadingOrder(document.blocks)[1].id, 'below');
      equal(Markdown.blocksInReadingOrder(document.blocks)[2].id, 'right');
      var invalid = Object.assign({}, document, { title: new Array(202).join('字') });
      equal(Model.validateDocument(invalid).valid, false);
    });
  });

  test('image inspection reads PNG dimensions without a server', function () {
    return appReady().then(function (win) {
      var bytes = win.Prompter.utils.base64ToBytes(PNG_BASE64);
      var inspected = win.Prompter.files.inspectImageBytes(bytes, 'image/png');
      equal(inspected.valid, true);
      equal(inspected.mimeType, 'image/png');
      equal(inspected.width, 1);
      equal(inspected.height, 1);
    });
  });

  test('storage probes a usable mode', function () {
    return appReady().then(function (win) {
      var state = win.Prompter.app.state;
      assert(state.storage, 'Storage was not initialized.');
      assert(['idb', 'local', 'memory'].indexOf(state.storageInfo.mode) !== -1,
        'Unexpected storage mode: ' + state.storageInfo.mode);
      assert(typeof state.storage.getDocuments === 'function', 'Storage API is missing.');
    });
  });

  test('T076 the storage warning names the fallback mode and can be dismissed', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = app.state;
      var originalInfo = state.storage.info;
      var originalDismissed = state.storageWarningDismissed;
      var warning = byId(win, 'storage-warning');
      var text = byId(win, 'storage-warning-text');
      function restore() {
        state.storage.info = originalInfo;
        state.storageWarningDismissed = originalDismissed;
        app.refreshStorageInfo();
      }
      state.storage.info = function () {
        return {
          mode: 'memory',
          reason: 'localstorage-unavailable',
          detail: '測試原因：本機持久儲存不可用。',
          modeLabel: '僅限本次工作階段（記憶體）'
        };
      };
      state.storageWarningDismissed = false;
      app.refreshStorageInfo();
      equal(warning.hidden, false, 'A degraded storage mode must show the warning.');
      equal(warning.getAttribute('role'), 'status');
      assert(text.textContent.indexOf('本次工作階段記憶體') !== -1,
        'The warning must name the active storage mode.');
      assert(text.textContent.indexOf('測試原因') !== -1,
        'The warning must explain why persistence is degraded.');
      equal(byId(win, 'storage-mode-label').textContent,
        '僅限本次工作階段（記憶體）');

      byId(win, 'storage-warning-dismiss').click();
      equal(warning.hidden, true);
      equal(state.storageWarningDismissed, true,
        'Dismissing the warning must last for the session.');
      restore();
      equal(state.storageWarningDismissed, originalDismissed);
    });
  });

  test('T075 the file:// app requests no network resources', function () {
    return appReady().then(function (win) {
      var resources = win.performance.getEntriesByType('resource').map(function (entry) {
        return entry.name;
      });
      var remoteResources = resources.filter(function (name) {
        return /^https?:/i.test(name);
      });
      assert(remoteResources.length === 0,
        'Runtime network requests are forbidden: ' + remoteResources.join(', '));
      var remoteMarkup = Array.prototype.filter.call(
        win.document.querySelectorAll('[src], [href]'),
        function (element) {
          var value = element.getAttribute('src') || element.getAttribute('href') || '';
          return /^(?:https?:)?\/\//i.test(value);
        });
      equal(remoteMarkup.length, 0,
        'The document must not reference remote src/href values.');
    });
  });

  test('application bootstrap shows the real empty workspace', function () {
    return appReady().then(function (win) {
      var state = win.Prompter.app.state;
      equal(state.document, null);
      equal(state.dirty, false);
      assert(byId(win, 'canvas'), 'Canvas element is missing.');
      assert(byId(win, 'file-menu-button'), 'File menu button is missing.');
      assert(byId(win, 'settings-button'), 'Settings button is missing.');
      assert(typeof win.Prompter.app.toast === 'function', 'Toast helper is missing.');
    });
  });

  test('US1 File > New creates an Unsaved document with one composer', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      assert(state.document, 'File > New did not create a document.');
      equal(state.document.title, 'Untitled');
      equal(state.document.fileName, 'untitled.md');
      equal(state.document.blocks.length, 0);
      equal(state.dirty, false);
      assert(composerInput(win), 'The initial composer is missing.');
      equal(byId(win, 'canvas-empty').hidden, true);
      equal(win.document.activeElement, composerInput(win),
        'The initial composer should receive focus.');
    });
  });

  test('US2 document tabs switch and close independent documents', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = app.state;
      var Model = win.Prompter.model;
      app.clearDocument();
      var first = Model.createPromptDocument({
        id: 'tab-first',
        title: '甲文件',
        blocks: [Model.createTextBlock({ id: 'tab-first-block', text: '甲內容', seq: 1 })]
      });
      var second = Model.createPromptDocument({
        id: 'tab-second',
        title: '乙文件',
        blocks: [Model.createTextBlock({ id: 'tab-second-block', text: '乙內容', seq: 1 })]
      });
      app.setDocument(first, [], { newTab: true });
      app.setDocument(second, [], { newTab: true });

      equal(state.tabs.length, 2, 'Two documents must be open in tabs.');
      var tabElements = Array.prototype.slice.call(
        win.document.querySelectorAll('#document-tabs .document-tab')
      );
      equal(tabElements.length, 2);
      equal(tabElements[1].getAttribute('data-document-id'), 'tab-second');
      equal(tabElements[1].classList.contains('active'), true);
      equal(byId(win, 'document-title').value, '乙文件');
      tabElements.forEach(function (tab) {
        var close = tab.querySelector('.document-tab-close');
        assert(close, 'Each tab must include a close control.');
        equal(close.textContent, '×');
        assert(close.getAttribute('aria-label').indexOf('關閉文件') !== -1);
      });

      tabElements[0].querySelector('.document-tab-label').click();
      return waitFor(function () {
        return state.document && state.document.id === 'tab-first' ? true : null;
      }, 5000).then(function () {
        equal(byId(win, 'document-title').value, '甲文件');
        equal(win.document.querySelector(
          '.document-tab[data-document-id="tab-first"]').classList.contains('active'), true);
        var firstClose = win.document.querySelector(
          '.document-tab[data-document-id="tab-first"] .document-tab-close');
        firstClose.click();
        return waitFor(function () {
          return state.tabs.length === 1 ? true : null;
        }, 5000);
      }).then(function () {
        equal(state.document.id, 'tab-second');
        equal(byId(win, 'document-title').value, '乙文件');
        var secondClose = win.document.querySelector(
          '.document-tab[data-document-id="tab-second"] .document-tab-close');
        secondClose.click();
        return waitFor(function () {
          return state.tabs.length === 0 && state.document === null ? true : null;
        }, 5000);
      }).then(function () {
        equal(byId(win, 'document-tabs').hidden, true);
        equal(app.elements['document-title'].hidden, true);
        equal(byId(win, 'canvas-empty').hidden, false);
      });
    });
  });

  test('US2 the active tab title remains editable', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      commitComposer(win, 'Tab title');
      var input = byId(win, 'document-title');
      assert(input.closest('.document-tab.active'),
        'The editable title must sit inside the active tab.');
      setValue(win, input, '新標題');
      equal(state.document.title, '新標題');
      equal(input.value, '新標題');
      equal(state.dirty, true, 'Editing the tab title must mark the document dirty.');
      input.blur();
      equal(input.value, '新標題');
    });
  });

  test('US1 the initial composer uses the default Marker preference', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      freshDocument(win, '##');
      var marker = win.document.querySelector('#canvas .composer-marker');
      assert(marker, 'Composer Marker control is missing.');
      equal(marker.textContent, '##');
      app.state.preferences.defaultMarker = 'none';
      win.Prompter.editor.setDefaultMarker('none');
    });
  });

  test('US1 typed Markers are detected live and stored once on Enter', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      var input = composerInput(win);
      setValue(win, input, '### 標題文字');
      var detection = win.document.querySelector('#canvas .composer-detection');
      assert(detection.textContent.indexOf('###') !== -1,
        'Live Marker detection label is missing.');
      press(win, input, 'Enter');
      equal(state.document.blocks.length, 1);
      equal(state.document.blocks[0].marker, '###');
      equal(state.document.blocks[0].text, '標題文字');
      var nextInput = composerInput(win);
      assert(nextInput, 'A new composer should appear after committing.');
      equal(nextInput.value, '', 'The new composer should start empty.');
      equal(win.document.activeElement, nextInput,
        'The new composer should receive focus.');
      assert(state.dirty, 'Committing a block must mark the document dirty.');
      equal(blockById(win, state.document.blocks[0].id).classList.contains('selected'), false,
        'The committed block must not stay selected while the composer is focused.');
      equal(win.getComputedStyle(blockById(win, state.document.blocks[0].id)).transitionDuration,
        '0s', 'Adding a block must not animate or flash the sequence.');
      equal(win.document.activeElement, nextInput,
        'Only the composer input should hold focus after committing.');
    });
  });

  test('US1 Enter opens a focused composer below the committed block', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      var firstInput = composerInput(win);
      assert(firstInput, 'The initial composer is missing.');
      setValue(win, firstInput, 'First');
      press(win, firstInput, 'Enter');

      var first = state.document.blocks[0];
      var firstElement = blockById(win, first.id);
      var nextInput = composerInput(win);
      assert(nextInput, 'Enter should open a new composer.');
      assert(nextInput !== firstInput, 'Enter should replace the composer input.');
      equal(win.document.activeElement, nextInput,
        'The follow-up composer should receive focus.');
      var composer = nextInput.closest('.composer');
      equal(parseFloat(composer.style.top),
        first.y + firstElement.offsetHeight + 8,
        'The follow-up composer should sit below the committed block.');
      equal(parseFloat(composer.style.left), first.x);

      setValue(win, nextInput, 'Second');
      press(win, nextInput, 'Enter');
      equal(state.document.blocks.length, 2);
      var ordered = readingOrder(win);
      equal(ordered[0].text, 'First');
      equal(ordered[1].text, 'Second');
      assert(composerInput(win), 'Continuous entry should keep a composer open.');
    });
  });

  test('US1 the Marker menu applies a selected Marker', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      var markerButton = win.document.querySelector('#canvas .composer-marker');
      var input = composerInput(win);
      setValue(win, input, '測試內容');
      input.focus();
      input.setSelectionRange(2, 2);
      markerButton.focus();
      markerButton.click();
      var menu = win.document.querySelector('.marker-menu');
      assert(menu, 'The Marker menu did not open.');
      var option = menu.querySelector('[data-marker="1."]');
      assert(option, 'The ordered-list Marker option is missing.');
      option.click();
      equal(win.document.querySelector('.marker-menu'), null);
      equal(markerButton.getAttribute('aria-label'), '選擇標記，目前為1.');
      equal(win.document.activeElement, input,
        'Choosing a Marker must keep focus in the composer input.');
      equal(input.selectionStart, 2, 'The caret position must be preserved.');
      equal(input.selectionEnd, 2, 'The selection must be preserved.');
      setValue(win, input, '第一項');
      press(win, input, 'Enter');
      equal(state.document.blocks[0].marker, '1.');
      equal(state.document.blocks[0].text, '第一項');
    });
  });

  test('US1 hovering a Marker control opens a symbol-only flyout on its left', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win, '##');
      commitComposer(win, 'Hover marker');
      var block = state.document.blocks[0];
      var element = blockById(win, block.id);
      var marker = element.querySelector('.block-marker');
      var composerMarker = win.document.querySelector('#canvas .composer-marker');

      function enter(node) {
        node.dispatchEvent(new win.PointerEvent('pointerenter', {
          pointerId: 11,
          pointerType: 'mouse',
          bubbles: false
        }));
      }

      function leave(node) {
        node.dispatchEvent(new win.PointerEvent('pointerleave', {
          pointerId: 11,
          pointerType: 'mouse',
          bubbles: false
        }));
      }

      enter(marker);
      var menu = win.document.querySelector('.marker-menu');
      assert(menu, 'Hovering the block Marker must open the flyout.');
      var symbols = Array.prototype.map.call(
        menu.querySelectorAll('.marker-menu-item'),
        function (item) { return item.textContent.trim(); }
      );
      equal(symbols.join(','), '×,#,##,###,-,1.,>,.',
        'The flyout must show Marker symbols only.');
      assert(menu.textContent.indexOf('標題') === -1,
        'The flyout must not show descriptive Marker labels.');
      var markerRect = marker.getBoundingClientRect();
      var menuRect = menu.getBoundingClientRect();
      assert(menuRect.right <= markerRect.left + 0.5,
        'The flyout must open to the left of the Marker.');
      var menuCenter = menuRect.top + menuRect.height / 2;
      var markerCenter = markerRect.top + markerRect.height / 2;
      assert(Math.abs(menuCenter - markerCenter) <= 8,
        'The flyout must stay vertically centered on the Marker when viewport-clamped.');
      equal(win.document.activeElement, composerInput(win),
        'Hovering the Marker must not move focus out of the composer.');

      menu.querySelector('[data-marker="-"]').click();
      equal(state.document.blocks[0].marker, '-');

      composerMarker = win.document.querySelector('#canvas .composer-marker');
      enter(composerMarker);
      var composerMenu = win.document.querySelector('.marker-menu');
      assert(composerMenu, 'Hovering the composer Marker must open the flyout.');
      var composerMarkerRect = composerMarker.getBoundingClientRect();
      var composerMenuRect = composerMenu.getBoundingClientRect();
      assert(composerMenuRect.right <= composerMarkerRect.left + 0.5,
        'The composer flyout must open to the left of its Marker.');
      leave(composerMarker);
      return new Promise(function (resolve) {
        setTimeout(resolve, 300);
      }).then(function () {
        assert(win.document.querySelector('.marker-menu'),
          'Leaving the Marker must not close the hover flyout before selection.');
        composerMenu.querySelector('[data-marker="#"]').click();
        equal(win.document.querySelector('.marker-menu'), null,
          'Selecting a Marker option must close the flyout.');
      });
    });
  });

  test('US1 Cmd-click selects multiple blocks and a Marker applies to all selected', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C']);
      var ids = state.document.blocks.map(function (block) { return block.id; });

      function cmdClick(blockId) {
        blockById(win, blockId).querySelector('.block-content')
          .dispatchEvent(new win.MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            metaKey: true
          }));
      }

      cmdClick(ids[0]);
      cmdClick(ids[1]);
      cmdClick(ids[2]);
      equal(win.Prompter.editor.getSelectedBlockIds().join(','), ids.join(','),
        'Cmd-click must accumulate the selected blocks.');
      ids.forEach(function (id) {
        var element = blockById(win, id);
        assert(element.classList.contains('selected'), 'Each Cmd-clicked block must be selected.');
        equal(win.getComputedStyle(element).outlineColor, 'rgb(255, 90, 0)',
          'Selected blocks must use the bright orange outline.');
      });

      cmdClick(ids[1]);
      equal(win.Prompter.editor.getSelectedBlockIds().join(','),
        [ids[0], ids[2]].join(','), 'Cmd-clicking a selected block must deselect it.');

      var marker = blockById(win, ids[0]).querySelector('.block-marker');
      marker.dispatchEvent(new win.PointerEvent('pointerenter', {
        pointerId: 14,
        pointerType: 'mouse',
        bubbles: false
      }));
      var menu = win.document.querySelector('.marker-menu');
      assert(menu, 'Hovering a selected block Marker must open the flyout.');
      menu.querySelector('[data-marker="##"]').click();

      equal(state.document.blocks[0].marker, '##',
        'The first selected block must receive the chosen Marker.');
      equal(state.document.blocks[1].marker, 'none',
        'An unselected block must keep its Marker.');
      equal(state.document.blocks[2].marker, '##',
        'The other selected block must receive the chosen Marker.');
      equal(state.dirty, true);
      var selected = win.Prompter.editor.getSelectedBlockIds();
      equal(selected.join(','), [ids[0], ids[2]].join(','),
        'Applying a Marker must keep the multi-selection.');
      assert(blockById(win, ids[0]).classList.contains('selected') &&
        blockById(win, ids[2]).classList.contains('selected'),
        'Selected blocks must stay highlighted after applying a Marker.');
    });
  });

  test('US1 composers inherit the preceding text block Marker', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win, '##');
      var composerMarker = function () {
        return win.document.querySelector('#canvas .composer-marker');
      };

      equal(composerMarker().textContent, '##',
        'The initial composer should use the default Marker.');
      var input = composerInput(win);
      setValue(win, input, '第一項');
      press(win, input, 'Enter');
      equal(state.document.blocks[0].marker, '##');
      equal(composerMarker().textContent, '##',
        'The follow-up composer should inherit the committed Marker.');

      composerMarker().click();
      var menu = win.document.querySelector('.marker-menu');
      var dash = menu.querySelector('[data-marker="-"]');
      assert(dash, 'The bullet Marker option is missing.');
      dash.click();
      input = composerInput(win);
      setValue(win, input, '第二項');
      press(win, input, 'Enter');
      equal(state.document.blocks[1].marker, '-');
      equal(state.preferences.defaultMarker, '##',
        'The settings default should remain unchanged.');
      equal(composerMarker().textContent, '-',
        'The next composer should inherit the list Marker, not the settings default.');

      var first = state.document.blocks.filter(function (block) {
        return block.text === '第一項';
      })[0];
      blockById(win, first.id).querySelector('.block-plus').click();
      equal(composerMarker().textContent, '##',
        'A composer opened from "+" should inherit the source block Marker.');
    });
  });

  test('US1 "+" insertion places a composer below the source and shifts lower blocks', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      var created = createSequence(win, ['A', 'B', 'C']);
      equal(created.length, 3);
      var document = state.document;
      var a = document.blocks[0];
      var b = document.blocks[1];
      var c = document.blocks[2];
      var aElement = blockById(win, a.id);
      var expectedY = a.y + aElement.offsetHeight + 8;
      var bBefore = b.y;
      var cBefore = c.y;

      var plus = aElement.querySelector('.block-plus');
      plus.click();
      var composer = win.document.querySelector('#canvas .composer');
      assert(composer, 'The inserted composer did not appear.');
      equal(parseFloat(composer.style.top), expectedY);
      equal(parseFloat(composer.style.left), a.x);
      setValue(win, composerInput(win), 'New');
      press(win, composerInput(win), 'Enter');

      var ordered = readingOrder(win);
      equal(ordered.length, 4);
      equal(ordered[0].text, 'A');
      equal(ordered[1].text, 'New');
      equal(ordered[2].text, 'B');
      equal(ordered[3].text, 'C');
      assert(b.y > bBefore, 'Block B should shift down.');
      assert(c.y >= cBefore, 'Block C should not move upward.');
      equal(blockById(win, ordered[1].id).classList.contains('selected'), false,
        'The inserted block must not keep a selection outline.');
      equal(win.document.activeElement, composerInput(win),
        'The composer input should keep focus after insertion.');
    });
  });

  test('US1 editing commits on Enter, cancels on Escape and removes empty blocks', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      var block = commitComposer(win, 'Hello');
      var id = state.document.blocks[0].id;

      var content = blockById(win, id).querySelector('.block-content');
      content.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      var input = win.document.querySelector('#canvas .block-edit-input');
      assert(input, 'Double-click did not enter edit mode.');
      equal(input.value, 'Hello');
      setValue(win, input, 'Changed');
      press(win, input, 'Enter');
      equal(state.document.blocks[0].text, 'Changed');
      equal(win.document.querySelector('#canvas .block-edit-input'), null);

      content = blockById(win, id).querySelector('.block-content');
      content.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      input = win.document.querySelector('#canvas .block-edit-input');
      setValue(win, input, 'Should not persist');
      press(win, input, 'Escape');
      equal(state.document.blocks[0].text, 'Changed');

      content = blockById(win, id).querySelector('.block-content');
      content.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      input = win.document.querySelector('#canvas .block-edit-input');
      setValue(win, input, '   ');
      press(win, input, 'Enter');
      equal(state.document.blocks.length, 0);
      assert(composerInput(win), 'Removing the last block must restore the initial composer.');
    });
  });

  test('US1 empty editing removes only the edited block', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['First', 'Second']);
      var first = state.document.blocks[0];
      var secondId = state.document.blocks[1].id;
      press(win, composerInput(win), 'Escape');
      equal(composerInput(win), null, 'Escape should dismiss the composer.');
      blockById(win, first.id).querySelector('.block-content')
        .dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      var input = win.document.querySelector('#canvas .block-edit-input');
      setValue(win, input, '');
      press(win, input, 'Enter');
      equal(state.document.blocks.length, 1);
      equal(state.document.blocks[0].id, secondId);
      equal(composerInput(win), null);
    });
  });

  test('US1 selected blocks use an inset highlight, compact padding and a centered handle', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      commitComposer(win, 'Style check');
      var block = state.document.blocks[0];
      var element = blockById(win, block.id);
      assert(element, 'The committed block is missing from the DOM.');
      win.Prompter.editor.selectBlock(block.id, { focus: true });
      assert(element.classList.contains('selected'), 'The selected block should be highlighted.');
      var style = win.getComputedStyle(element);
      equal(style.outlineStyle, 'solid');
      equal(style.outlineWidth, '2px');
      equal(style.outlineOffset, '-2px');
      equal(style.outlineColor, 'rgb(255, 90, 0)',
        'Selected blocks must use the bright orange highlight.');
      equal(style.paddingTop, '4.5px');
      equal(style.paddingBottom, '5px');
      equal(style.paddingLeft, '5px');

      var handle = element.querySelector('.drag-handle');
      var handleStyle = win.getComputedStyle(handle);
      equal(handleStyle.display, 'flex');
      equal(handleStyle.width, '24px');
      equal(handleStyle.height, '24px');
      var blockRect = element.getBoundingClientRect();
      var handleRect = handle.getBoundingClientRect();
      assert(Math.abs((handleRect.top + handleRect.height / 2) -
        (blockRect.top + blockRect.height / 2)) <= 1,
        'The drag handle should be vertically centered on the block.');
    });
  });

  test('US1 keyboard movement reorders one position at a time with announcements', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C']);
      var ids = state.document.blocks.map(function (block) { return block.id; });
      var aId = ids[0];
      var bId = ids[1];
      var cId = ids[2];
      state.dirty = false;

      press(win, blockById(win, aId), 'ArrowDown', { altKey: true });
      var ordered = readingOrder(win);
      equal(ordered[0].id, bId, 'B should move into the first position.');
      equal(ordered[1].id, aId, 'A should take the second position.');
      equal(ordered[2].id, cId, 'C should remain third.');
      equal(byId(win, 'move-announcer').textContent,
        '區塊已移到第 2 個位置，共 3 個區塊。');
      equal(state.dirty, true);

      var aElement = blockById(win, aId);
      var bElement = blockById(win, bId);
      assert(ordered[0].y + bElement.offsetHeight + 1 < ordered[1].y,
        'Reordered blocks must not overlap.');

      press(win, aElement, 'ArrowUp', { altKey: true });
      ordered = readingOrder(win);
      equal(ordered[0].id, aId, 'A should return to the first position.');
      equal(ordered[1].id, bId);
      equal(ordered[2].id, cId);
      equal(byId(win, 'move-announcer').textContent,
        '區塊已移到第 1 個位置，共 3 個區塊。');

      var beforeNoop = readingOrder(win).map(function (block) { return block.id; }).join(',');
      press(win, blockById(win, aId), 'ArrowUp', { altKey: true });
      equal(readingOrder(win).map(function (block) { return block.id; }).join(','),
        beforeNoop, 'Moving the first block up must not change the order.');
      equal(state.document.blocks[0].x, win.Prompter.files.COLUMN_X,
        'Sequence blocks must remain in the shared column.');
    });
  });

  test('US1 arrow keys select adjacent items and wrap through the composer', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C']);
      var ids = state.document.blocks.map(function (block) { return block.id; });
      var aId = ids[0];
      var bId = ids[1];
      var cId = ids[2];
      var canvas = byId(win, 'canvas');
      state.dirty = false;

      canvas.focus();
      press(win, canvas, 'ArrowDown');
      equal(win.Prompter.editor.getSelectedBlockId(), aId,
        'Down from an unselected canvas must select the first block.');
      equal(win.document.activeElement, blockById(win, aId),
        'Focus must move to the selected block.');

      press(win, blockById(win, aId), 'ArrowUp');
      equal(win.Prompter.editor.getSelectedBlockId(), null,
        'Up from the first item must move focus to the composer at the end.');
      equal(win.document.activeElement, composerInput(win),
        'The composer input must receive focus.');

      press(win, composerInput(win), 'ArrowUp');
      equal(win.Prompter.editor.getSelectedBlockId(), cId,
        'Up from the composer must select the previous block.');
      equal(win.document.activeElement, blockById(win, cId));

      press(win, blockById(win, cId), 'ArrowDown');
      equal(win.Prompter.editor.getSelectedBlockId(), null,
        'Down from the last block must move focus back to the composer.');
      equal(win.document.activeElement, composerInput(win));

      press(win, composerInput(win), 'ArrowDown');
      equal(win.Prompter.editor.getSelectedBlockId(), aId,
        'Down from the end composer must wrap to the first item.');
      equal(win.document.activeElement, blockById(win, aId));

      press(win, blockById(win, aId), 'ArrowDown');
      equal(win.Prompter.editor.getSelectedBlockId(), bId,
        'Down must select the next block.');
      equal(state.dirty, false, 'Arrow selection must not mark the document dirty.');
    });
  });

  test('US1 Tab cycles only within the current item', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B']);
      var ids = state.document.blocks.map(function (block) { return block.id; });
      var aElement = blockById(win, ids[0]);
      var marker = aElement.querySelector('.block-marker');
      var content = aElement.querySelector('.block-content');
      var plus = aElement.querySelector('.block-plus');
      var handle = aElement.querySelector('.drag-handle');

      aElement.focus();
      press(win, aElement, 'Tab');
      equal(win.document.activeElement, marker,
        'Tab from a block must land on its title area.');
      press(win, marker, 'Tab');
      equal(win.document.activeElement, content,
        'Tab must reach the block text area.');
      press(win, content, 'Tab');
      equal(win.document.activeElement, plus,
        'Tab must continue within the current block.');
      press(win, plus, 'Tab');
      equal(win.document.activeElement, handle,
        'Tab must continue through the current block controls.');
      press(win, handle, 'Tab');
      equal(win.document.activeElement, aElement,
        'Tab must wrap back to the block root.');

      var composer = composerInput(win);
      var composerMarker = win.document.querySelector('#canvas .composer-marker');
      var composerHandle = win.document.querySelector('#canvas .composer-handle');
      composer.focus();
      press(win, composer, 'Tab');
      equal(win.document.activeElement, composerHandle,
        'Tab from the composer input must stay within the composer.');
      press(win, composerHandle, 'Tab');
      equal(win.document.activeElement, composerMarker,
        'Tab must wrap to the first composer control.');
      press(win, composerMarker, 'Tab', { shiftKey: true });
      equal(win.document.activeElement, composerHandle,
        'Shift+Tab must wrap within the composer.');
      assert(byId(win, 'canvas').contains(win.document.activeElement),
        'Tab focus must stay inside the editor canvas.');
    });
  });

  test('US1 Tab reaches the block text area and Enter starts editing', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      commitComposer(win, 'Edit through the text area');
      var block = state.document.blocks[0];
      var element = blockById(win, block.id);
      var content = element.querySelector('.block-content');
      assert(content, 'The block text area is missing.');
      equal(content.tabIndex, 0, 'The block text area must be tabbable.');

      element.focus();
      press(win, element, 'Tab');
      press(win, element.querySelector('.block-marker'), 'Tab');
      equal(win.document.activeElement, content,
        'Tab must reach the block text area.');

      press(win, content, 'Enter');
      var input = blockById(win, block.id).querySelector('.block-edit-input');
      assert(input, 'Enter in the text area must start editing.');
      equal(win.document.activeElement, input,
        'The block editor must receive focus.');
      press(win, input, 'Escape');
      assert(blockById(win, block.id), 'Escape must keep the block.');
    });
  });

  test('US1 Up/Down from the composer selects adjacent blocks', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C']);
      var ids = state.document.blocks.map(function (block) { return block.id; });
      var aId = ids[0];
      var bId = ids[1];
      var cId = ids[2];

      var composer = composerInput(win);
      assert(composer, 'The composer input is missing.');
      composer.focus();
      press(win, composer, 'ArrowUp');
      equal(win.Prompter.editor.getSelectedBlockId(), cId,
        'Up from the end composer must select the block before it.');
      equal(win.document.activeElement, blockById(win, cId));
      assert(state.composer, 'Moving from the composer must keep it open.');

      composer = composerInput(win);
      composer.focus();
      press(win, composer, 'ArrowDown');
      equal(win.Prompter.editor.getSelectedBlockId(), aId,
        'Down from the end composer must wrap to the first block.');

      blockById(win, aId).querySelector('.block-plus').click();
      composer = composerInput(win);
      composer.focus();
      press(win, composer, 'ArrowUp');
      equal(win.Prompter.editor.getSelectedBlockId(), aId,
        'Up from a composer between A and B must select A.');

      composer = composerInput(win);
      composer.focus();
      press(win, composer, 'ArrowDown');
      equal(win.Prompter.editor.getSelectedBlockId(), bId,
        'Down from a composer between A and B must select B.');

      var composerMarker = win.document.querySelector('#canvas .composer-marker');
      composerMarker.focus();
      press(win, composerMarker, 'ArrowUp');
      equal(win.Prompter.editor.getSelectedBlockId(), aId,
        'Up must navigate when the composer title control is active.');
    });
  });

  test('US1 Up/Down on the composer handle moves the composer slot', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C']);
      var ids = state.document.blocks.map(function (block) { return block.id; });
      state.dirty = false;

      function handle() {
        return win.document.querySelector('#canvas .composer-handle');
      }

      handle().focus();
      press(win, handle(), 'ArrowUp');
      equal(state.composer.insertIndex, 2,
        'Up on the composer handle must move the composer one slot earlier.');
      equal(win.document.activeElement, handle(),
        'Focus must stay on the composer handle.');
      equal(readingOrder(win).map(function (block) { return block.id; }).join(','),
        ids.join(','), 'Moving the composer must not reorder blocks.');

      press(win, handle(), 'ArrowUp');
      equal(state.composer.insertIndex, 1);
      equal(win.document.activeElement, handle());

      press(win, handle(), 'ArrowDown');
      equal(state.composer.insertIndex, 2);

      press(win, handle(), 'ArrowDown');
      equal(state.composer.insertIndex, 3);

      press(win, handle(), 'ArrowDown');
      equal(state.composer.insertIndex, 3,
        'Down at the last composer slot must not move further.');
      equal(win.document.activeElement, handle());
      equal(state.dirty, false, 'Moving the composer must not mark the document dirty.');
    });
  });

  test('US1 Tab cycles only within the selected block', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C']);
      var ids = state.document.blocks.map(function (block) { return block.id; });
      var bId = ids[1];

      blockById(win, bId).querySelector('.block-content')
        .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      equal(win.Prompter.editor.getSelectedBlockId(), bId,
        'B must be selected before the Tab check.');
      var bElement = blockById(win, bId);
      var marker = bElement.querySelector('.block-marker');
      var content = bElement.querySelector('.block-content');
      var plus = bElement.querySelector('.block-plus');
      var handle = bElement.querySelector('.drag-handle');

      bElement.focus();
      press(win, bElement, 'Tab');
      equal(win.document.activeElement, marker,
        'Tab from the selected block must move to its title area.');
      press(win, marker, 'Tab');
      equal(win.document.activeElement, content,
        'Tab must reach the selected block text area.');
      press(win, content, 'Tab');
      equal(win.document.activeElement, plus,
        'Tab must stay within the selected block.');
      press(win, plus, 'Tab');
      equal(win.document.activeElement, handle,
        'Tab must continue through the selected block controls.');
      press(win, handle, 'Tab');
      equal(win.document.activeElement, bElement,
        'Tab must wrap back to the selected block root.');

      press(win, bElement, 'Tab', { shiftKey: true });
      equal(win.document.activeElement, handle,
        'Shift+Tab must wrap backward within the selected block.');

      byId(win, 'canvas').focus();
      press(win, byId(win, 'canvas'), 'Tab');
      equal(win.document.activeElement, bElement,
        'Tab from the canvas must enter the selected block, not another item.');
    });
  });

  test('US1 Marker menu and drag-handle keyboard navigation', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C']);
      var ids = state.document.blocks.map(function (block) { return block.id; });
      var aId = ids[0];
      var bId = ids[1];
      var cId = ids[2];

      var marker = blockById(win, aId).querySelector('.block-marker');
      marker.focus();
      press(win, marker, ' ');
      var menu = win.document.querySelector('.marker-menu');
      assert(menu, 'Space on the title area must open the Marker menu.');
      var checked = menu.querySelector('[aria-checked="true"]');
      equal(win.document.activeElement, checked,
        'The Marker menu must focus the current option.');

      press(win, win.document.activeElement, 'ArrowDown');
      equal(win.document.activeElement.dataset.marker, '#',
        'Down must move to the next Marker option.');
      press(win, win.document.activeElement, 'ArrowDown');
      equal(win.document.activeElement.dataset.marker, '##',
        'Down must continue through the Marker options.');
      press(win, win.document.activeElement, 'Enter');
      equal(state.document.blocks[0].marker, '##',
        'Enter on the focused option must apply the Marker.');

      var markerButton = blockById(win, aId).querySelector('.block-marker');
      markerButton.focus();
      press(win, markerButton, ' ');
      assert(win.document.querySelector('.marker-menu'),
        'The Marker menu must reopen for the Tab check.');
      press(win, win.document.activeElement, 'Tab');
      equal(win.document.querySelector('.marker-menu'), null,
        'Tab from the Marker menu must close the menu.');
      equal(win.document.activeElement,
        blockById(win, aId).querySelector('.block-content'),
        'Tab from the Marker menu must move to the text area.');

      var handle = blockById(win, bId).querySelector('.drag-handle');
      handle.focus();
      press(win, handle, 'ArrowDown');
      equal(readingOrder(win).map(function (block) { return block.id; }).join(','),
        [aId, cId, bId].join(','),
        'Down on the drag handle must move the item one position later.');
      equal(win.document.activeElement,
        blockById(win, bId).querySelector('.drag-handle'),
        'Focus must stay on the drag handle after moving.');

      press(win, win.document.activeElement, 'ArrowUp');
      equal(readingOrder(win).map(function (block) { return block.id; }).join(','),
        [aId, bId, cId].join(','),
        'Up on the drag handle must move the item one position earlier.');
      equal(win.document.activeElement,
        blockById(win, bId).querySelector('.drag-handle'));
      equal(byId(win, 'move-announcer').textContent,
        '區塊已移到第 2 個位置，共 3 個區塊。');
    });
  });

  test('US1 pointer dragging shifts intervening blocks in sequence', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C', 'D']);
      var ids = state.document.blocks.map(function (block) { return block.id; });
      var aId = ids[0];
      var bId = ids[1];
      var cId = ids[2];
      var dId = ids[3];
      state.dirty = false;

      function pointer(target, type, x, y) {
        target.dispatchEvent(new win.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 7,
          pointerType: 'mouse',
          button: 0,
          clientX: x,
          clientY: y
        }));
      }

      function pointerUp(x, y) {
        win.dispatchEvent(new win.PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', button: 0,
          clientX: x, clientY: y
        }));
      }

      var canvasRect = byId(win, 'canvas').getBoundingClientRect();

      function modelBlock(blockId) {
        return state.document.blocks.filter(function (block) {
          return block.id === blockId;
        })[0];
      }

      function clientLeftOf(blockId) {
        return canvasRect.left + modelBlock(blockId).x;
      }

      function clientTopOf(blockId) {
        return canvasRect.top + modelBlock(blockId).y;
      }

      function blockHeight(blockId) {
        return blockById(win, blockId).offsetHeight;
      }

      function pointerDownOn(blockId) {
        var element = blockById(win, blockId);
        var content = element.querySelector('.block-content');
        pointer(content, 'pointerdown', clientLeftOf(blockId) + 10, clientTopOf(blockId) + 10);
      }

      pointerDownOn(aId);
      pointerUp(clientLeftOf(aId) + 10, clientTopOf(aId) + 10);
      equal(state.dirty, false, 'A click without movement must not mark the document dirty.');

      var bTopBefore = parseFloat(blockById(win, bId).style.top);
      var cTopBefore = parseFloat(blockById(win, cId).style.top);
      var moveY = clientTopOf(cId) + blockHeight(cId) / 2 + 10 - blockHeight(aId) / 2;

      pointerDownOn(aId);
      pointer(win, 'pointermove', clientLeftOf(cId) + 10, moveY);
      assert(parseFloat(blockById(win, bId).style.top) < bTopBefore,
        'B should move up during the drag preview.');
      assert(parseFloat(blockById(win, cId).style.top) < cTopBefore,
        'C should move up during the drag preview.');
      pointerUp(clientLeftOf(cId) + 10, moveY);

      var ordered = readingOrder(win);
      equal(ordered.map(function (block) { return block.id; }).join(','),
        [bId, cId, aId, dId].join(','),
        'Dragging A onto C must produce B, C, A, D.');
      equal(state.dirty, true);
      equal(win.document.activeElement.dataset.blockId, aId,
        'Focus must remain on the moved block.');
      equal(byId(win, 'move-announcer').textContent,
        '區塊已移到第 3 個位置，共 4 個區塊。');
      equal(win.Prompter.markdown.serializeDocument(state.document), 'B\nC\nA\nD\n',
        'Markdown output must follow the new sequence.');

      ordered.forEach(function (block, index) {
        if (index === ordered.length - 1) {
          return;
        }
        var current = blockById(win, block.id);
        assert(block.y + current.offsetHeight + 1 < ordered[index + 1].y,
          'Reordered blocks must not overlap.');
      });

      state.dirty = false;
      var cancelY = clientTopOf(aId) + blockHeight(aId) / 2 + 10 - blockHeight(bId) / 2;
      pointerDownOn(bId);
      pointer(win, 'pointermove', clientLeftOf(aId) + 10, cancelY);
      win.dispatchEvent(new win.KeyboardEvent('keydown', {
        key: 'Escape', bubbles: true, cancelable: true
      }));

      equal(readingOrder(win).map(function (block) { return block.id; }).join(','),
        [bId, cId, aId, dId].join(','), 'Escape must restore the pre-drag sequence.');
      equal(state.dirty, false, 'A canceled drag must not mark the document dirty.');

      var upwardY = clientTopOf(bId) + blockHeight(bId) / 2 + 10 - blockHeight(aId) / 2;
      pointerDownOn(aId);
      pointer(win, 'pointermove', clientLeftOf(bId) + 10, upwardY);
      pointerUp(clientLeftOf(bId) + 10, upwardY);

      equal(readingOrder(win).map(function (block) { return block.id; }).join(','),
        [aId, bId, cId, dId].join(','),
        'Dragging A up onto B must produce A, B, C, D.');
      equal(state.dirty, true);

      state.dirty = false;
      pointerDownOn(cId);
      pointer(win, 'pointermove', canvasRect.left - 120, clientTopOf(aId) + 10);
      pointerUp(canvasRect.left - 120, clientTopOf(aId) + 10);

      equal(readingOrder(win).map(function (block) { return block.id; }).join(','),
        [aId, bId, cId, dId].join(','), 'Dropping outside the canvas must not reorder.');
      equal(state.dirty, false, 'An out-of-bounds drop must not mark the document dirty.');

      var appendY = clientTopOf(dId) + blockHeight(dId) + 20;
      pointerDownOn(aId);
      pointer(win, 'pointermove', clientLeftOf(dId) + 10, appendY);
      pointerUp(clientLeftOf(dId) + 10, appendY);

      equal(readingOrder(win).map(function (block) { return block.id; }).join(','),
        [bId, cId, dId, aId].join(','),
        'Dragging past the last block must append it.');
      equal(win.Prompter.markdown.serializeDocument(state.document), 'B\nC\nD\nA\n');
    });
  });

  test('US1 dragging a multi-selection moves the whole group together', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C', 'D']);
      var ids = state.document.blocks.map(function (block) { return block.id; });
      var aId = ids[0];
      var bId = ids[1];
      var cId = ids[2];
      var dId = ids[3];
      state.dirty = false;

      function pointer(target, type, x, y) {
        target.dispatchEvent(new win.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 21,
          pointerType: 'mouse',
          button: 0,
          clientX: x,
          clientY: y
        }));
      }

      function pointerUp(x, y) {
        win.dispatchEvent(new win.PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerId: 21, pointerType: 'mouse', button: 0,
          clientX: x, clientY: y
        }));
      }

      function cmdClick(blockId) {
        blockById(win, blockId).querySelector('.block-content')
          .dispatchEvent(new win.MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            metaKey: true
          }));
      }

      var canvasRect = byId(win, 'canvas').getBoundingClientRect();

      function modelBlock(blockId) {
        return state.document.blocks.filter(function (block) {
          return block.id === blockId;
        })[0];
      }

      function clientLeftOf(blockId) {
        return canvasRect.left + modelBlock(blockId).x;
      }

      function clientTopOf(blockId) {
        return canvasRect.top + modelBlock(blockId).y;
      }

      function blockHeight(blockId) {
        return blockById(win, blockId).offsetHeight;
      }

      function pointerDownOn(blockId) {
        var element = blockById(win, blockId);
        pointer(element.querySelector('.block-content'), 'pointerdown',
          clientLeftOf(blockId) + 10, clientTopOf(blockId) + 10);
      }

      cmdClick(aId);
      cmdClick(bId);
      equal(win.Prompter.editor.getSelectedBlockIds().join(','),
        [aId, bId].join(','), 'A and B must be multi-selected.');

      var cTopBefore = parseFloat(blockById(win, cId).style.top);
      var moveY = clientTopOf(cId) + blockHeight(cId) / 2 + 10 - blockHeight(aId) / 2;
      pointerDownOn(aId);
      pointer(win, 'pointermove', clientLeftOf(cId) + 10, moveY);

      assert(blockById(win, aId).classList.contains('group-dragging'),
        'The grabbed block must join the group drag.');
      assert(blockById(win, bId).classList.contains('group-dragging'),
        'Other selected blocks must move with the group.');
      assert(blockById(win, cId).classList.contains('group-dragging') === false,
        'Unselected blocks must not join the group drag.');
      assert(blockById(win, aId).style.transform !== '' &&
        blockById(win, bId).style.transform !== '',
      'Both selected blocks must be translated during the drag.');
      assert(parseFloat(blockById(win, cId).style.top) < cTopBefore,
        'The remaining blocks must reflow around the dragged group.');

      pointerUp(clientLeftOf(cId) + 10, moveY);

      equal(readingOrder(win).map(function (block) { return block.id; }).join(','),
        [cId, dId, aId, bId].join(','),
        'Dropping the two-block A+B group over C and D must produce C, D, A, B.');
      equal(win.Prompter.editor.getSelectedBlockIds().join(','),
        [aId, bId].join(','), 'The group must stay selected after the drop.');
      assert(blockById(win, aId).classList.contains('selected') &&
        blockById(win, bId).classList.contains('selected'),
      'Every block in the moved group must stay highlighted.');
      equal(state.dirty, true, 'Moving the group must mark the document dirty.');
      equal(win.Prompter.markdown.serializeDocument(state.document),
        'C\nD\nA\nB\n', 'Markdown output must follow the group order.');
      equal(byId(win, 'move-announcer').textContent,
        '已移動 2 個區塊到第 3 個位置，共 4 個區塊。');

      var ordered = readingOrder(win);
      ordered.forEach(function (block, index) {
        if (index === ordered.length - 1) {
          return;
        }
        var current = blockById(win, block.id);
        assert(block.y + current.offsetHeight + 1 < ordered[index + 1].y,
          'The moved group must not overlap the following blocks.');
      });

      state.dirty = false;
      var cancelY = clientTopOf(cId) + blockHeight(cId) / 2 + 10 - blockHeight(aId) / 2;
      pointerDownOn(aId);
      pointer(win, 'pointermove', clientLeftOf(cId) + 10, cancelY);
      win.dispatchEvent(new win.KeyboardEvent('keydown', {
        key: 'Escape', bubbles: true, cancelable: true
      }));

      equal(readingOrder(win).map(function (block) { return block.id; }).join(','),
        [cId, dId, aId, bId].join(','), 'Escape must restore the pre-drag group order.');
      equal(state.dirty, false, 'A canceled group drag must not mark the document dirty.');
      equal(win.Prompter.editor.getSelectedBlockIds().join(','),
        [aId, bId].join(','), 'A canceled group drag must keep the group selected.');
      assert(blockById(win, aId).classList.contains('group-dragging') === false &&
        blockById(win, bId).classList.contains('group-dragging') === false,
      'Canceled group drags must clear the drag styling.');
      equal(blockById(win, aId).style.transform, '');
      equal(blockById(win, bId).style.transform, '');
    });
  });

  test('US1 dragging a non-contiguous multi-selection groups the selected blocks', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C', 'D']);
      var ids = state.document.blocks.map(function (block) { return block.id; });
      var aId = ids[0];
      var bId = ids[1];
      var cId = ids[2];
      var dId = ids[3];
      state.dirty = false;

      function pointer(target, type, x, y) {
        target.dispatchEvent(new win.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 22,
          pointerType: 'mouse',
          button: 0,
          clientX: x,
          clientY: y
        }));
      }

      function pointerUp(x, y) {
        win.dispatchEvent(new win.PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerId: 22, pointerType: 'mouse', button: 0,
          clientX: x, clientY: y
        }));
      }

      function cmdClick(blockId) {
        blockById(win, blockId).querySelector('.block-content')
          .dispatchEvent(new win.MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            metaKey: true
          }));
      }

      var canvasRect = byId(win, 'canvas').getBoundingClientRect();

      function modelBlock(blockId) {
        return state.document.blocks.filter(function (block) {
          return block.id === blockId;
        })[0];
      }

      function clientLeftOf(blockId) {
        return canvasRect.left + modelBlock(blockId).x;
      }

      function clientTopOf(blockId) {
        return canvasRect.top + modelBlock(blockId).y;
      }

      function blockHeight(blockId) {
        return blockById(win, blockId).offsetHeight;
      }

      cmdClick(aId);
      cmdClick(cId);
      equal(win.Prompter.editor.getSelectedBlockIds().join(','),
        [aId, cId].join(','), 'A and C must be multi-selected.');

      var moveY = clientTopOf(dId) + blockHeight(dId) / 2 + 10 - blockHeight(cId) / 2;
      pointer(blockById(win, cId).querySelector('.block-content'), 'pointerdown',
        clientLeftOf(cId) + 10, clientTopOf(cId) + 10);
      pointer(win, 'pointermove', clientLeftOf(dId) + 10, moveY);
      pointerUp(clientLeftOf(dId) + 10, moveY);

      equal(readingOrder(win).map(function (block) { return block.id; }).join(','),
        [bId, dId, aId, cId].join(','),
        'The non-contiguous A+C selection must become the contiguous group B, D, A, C.');
      equal(win.Prompter.editor.getSelectedBlockIds().join(','),
        [aId, cId].join(','), 'The non-contiguous group must stay selected.');
      equal(win.Prompter.markdown.serializeDocument(state.document),
        'B\nD\nA\nC\n', 'Markdown output must preserve the selected relative order.');
      equal(byId(win, 'move-announcer').textContent,
        '已移動 2 個區塊到第 3 個位置，共 4 個區塊。');
      equal(state.dirty, true);
    });
  });

  test('US1 marquee selection selects blocks inside the dragged rectangle', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C', 'D']);
      var ids = state.document.blocks.map(function (block) { return block.id; });
      var aId = ids[0];
      var bId = ids[1];
      var cId = ids[2];
      var dId = ids[3];
      var canvas = byId(win, 'canvas');
      var canvasRect = canvas.getBoundingClientRect();
      var aRect = blockById(win, aId).getBoundingClientRect();
      var bRect = blockById(win, bId).getBoundingClientRect();
      var startX = canvasRect.left + 4;
      var startY = canvasRect.top + 4;
      var endX = Math.max(aRect.right, bRect.right) + 8;
      var endY = bRect.bottom - 4;

      function pointer(target, type, x, y, additive) {
        target.dispatchEvent(new win.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 23,
          pointerType: 'mouse',
          button: 0,
          clientX: x,
          clientY: y,
          metaKey: !!additive,
          ctrlKey: !!additive
        }));
      }

      pointer(canvas, 'pointerdown', startX, startY, false);
      pointer(win, 'pointermove', endX, endY, false);

      var marquee = canvas.querySelector('.selection-marquee');
      assert(marquee, 'Dragging on empty canvas must create a selection marquee.');
      equal(marquee.hidden, false, 'The marquee must be visible after the drag threshold.');
      assert(parseFloat(marquee.style.width) > 0 && parseFloat(marquee.style.height) > 0,
        'The marquee must cover the dragged range.');
      equal(win.Prompter.editor.getSelectedBlockIds().join(','),
        [aId, bId].join(','), 'Blocks inside the marquee must be selected.');
      assert(blockById(win, aId).classList.contains('selected') &&
        blockById(win, bId).classList.contains('selected'),
      'Marquee-selected blocks must show the orange selection outline.');
      assert(blockById(win, cId).classList.contains('selected') === false &&
        blockById(win, dId).classList.contains('selected') === false,
      'Blocks outside the marquee must stay unselected.');

      pointer(win, 'pointerup', endX, endY, false);

      equal(canvas.querySelector('.selection-marquee'), null,
        'Finishing the marquee must remove the rectangle.');
      equal(win.Prompter.editor.getSelectedBlockIds().join(','),
        [aId, bId].join(','), 'The marquee selection must remain after release.');

      canvas.dispatchEvent(new win.MouseEvent('click', {
        bubbles: true, cancelable: true
      }));
      equal(win.Prompter.editor.getSelectedBlockIds().join(','),
        [aId, bId].join(','),
        'The click generated by finishing a marquee must not clear the selection.');

      canvas.dispatchEvent(new win.MouseEvent('click', {
        bubbles: true, cancelable: true
      }));
      equal(win.Prompter.editor.getSelectedBlockIds().length, 0,
        'A plain empty-canvas click must still clear the selection.');
    });
  });

  test('US1 Cmd-marquee adds to the selection and Escape restores it', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C', 'D']);
      var ids = state.document.blocks.map(function (block) { return block.id; });
      var aId = ids[0];
      var bId = ids[1];
      var dId = ids[3];
      var canvas = byId(win, 'canvas');
      var canvasRect = canvas.getBoundingClientRect();
      var aRect = blockById(win, aId).getBoundingClientRect();
      var bRect = blockById(win, bId).getBoundingClientRect();
      var startX = canvasRect.left + 4;
      var startY = canvasRect.top + 4;
      var endX = Math.max(aRect.right, bRect.right) + 8;
      var endY = bRect.bottom - 4;

      function pointer(target, type, x, y, additive) {
        target.dispatchEvent(new win.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 24,
          pointerType: 'mouse',
          button: 0,
          clientX: x,
          clientY: y,
          metaKey: !!additive,
          ctrlKey: !!additive
        }));
      }

      blockById(win, dId).querySelector('.block-content')
        .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      equal(win.Prompter.editor.getSelectedBlockIds().join(','), dId);

      pointer(canvas, 'pointerdown', startX, startY, true);
      pointer(win, 'pointermove', endX, endY, true);
      equal(win.Prompter.editor.getSelectedBlockIds().join(','),
        [aId, bId, dId].join(','),
        'Cmd-marquee must add the covered blocks to the existing selection.');

      win.dispatchEvent(new win.KeyboardEvent('keydown', {
        key: 'Escape', bubbles: true, cancelable: true
      }));
      equal(win.Prompter.editor.getSelectedBlockIds().join(','), dId,
        'Escape must restore the pre-marquee selection.');
      equal(canvas.querySelector('.selection-marquee'), null,
        'Escape must remove the marquee rectangle.');
      canvas.dispatchEvent(new win.MouseEvent('click', {
        bubbles: true, cancelable: true
      }));
      equal(win.Prompter.editor.getSelectedBlockIds().join(','), dId,
        'The click after a canceled marquee must not change the restored selection.');
    });
  });

  test('US1 Delete removes the selected blocks and closes the gaps', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C', 'D']);
      var ids = state.document.blocks.map(function (block) { return block.id; });
      var aId = ids[0];
      var bId = ids[1];
      var cId = ids[2];
      var dId = ids[3];
      state.dirty = false;

      function cmdClick(blockId) {
        blockById(win, blockId).querySelector('.block-content')
          .dispatchEvent(new win.MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            metaKey: true
          }));
      }

      cmdClick(aId);
      equal(win.Prompter.editor.getSelectedBlockIds().join(','), aId,
        'A must be selected by the first Cmd-click.');
      cmdClick(cId);
      equal(win.Prompter.editor.getSelectedBlockIds().join(','),
        [aId, cId].join(','), 'A and C must be selected before deletion.');

      press(win, blockById(win, aId), 'Delete');
      equal(state.document.blocks.map(function (block) { return block.id; }).join(','),
        [bId, dId].join(','), 'Delete must remove every selected block.');
      equal(win.Prompter.markdown.serializeDocument(state.document), 'B\nD\n',
        'Remaining blocks must close the gaps in Markdown order.');
      equal(win.Prompter.editor.getSelectedBlockIds().length, 0,
        'Deleted blocks must not remain selected.');
      equal(state.dirty, true, 'Deleting blocks must mark the document dirty.');
      equal(byId(win, 'move-announcer').textContent, '已刪除 2 個區塊。');
      equal(win.document.activeElement, byId(win, 'canvas'),
        'After deletion, focus must move to the canvas.');

      blockById(win, bId).querySelector('.block-content')
        .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      press(win, blockById(win, bId), 'Backspace');
      equal(state.document.blocks.map(function (block) { return block.id; }).join(','),
        dId, 'The macOS Delete key (Backspace) must also remove the selection.');
      equal(byId(win, 'move-announcer').textContent, '已刪除 1 個區塊。');

      blockById(win, dId).querySelector('.block-content')
        .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      press(win, blockById(win, dId), 'Delete');
      equal(state.document.blocks.length, 0,
        'Deleting the last selected block must empty the document.');
      assert(state.composer, 'An empty document must show a composer.');
      equal(win.document.activeElement, composerInput(win),
        'The composer must receive focus after the last block is deleted.');
    });
  });

  test('US1 Delete does not remove blocks while typing', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B']);
      var ids = state.document.blocks.map(function (block) { return block.id; });
      var aId = ids[0];
      var bId = ids[1];

      blockById(win, aId).querySelector('.block-content')
        .dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      var editInput = blockById(win, aId).querySelector('.block-edit-input');
      assert(editInput, 'The block must enter edit mode.');
      press(win, editInput, 'Delete');
      equal(state.document.blocks.length, 2,
        'Delete in a block editor must not remove the block.');
      press(win, editInput, 'Escape');
      assert(blockById(win, aId), 'Escape must keep the block after canceling the edit.');

      blockById(win, bId).querySelector('.block-content')
        .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      var composer = composerInput(win);
      composer.focus();
      press(win, composer, 'Delete');
      equal(state.document.blocks.length, 2,
        'Delete in the composer must not remove selected blocks.');

      var handle = win.document.querySelector('#canvas .composer-handle');
      handle.focus();
      press(win, handle, 'Delete');
      equal(state.document.blocks.length, 2,
        'Delete on composer controls must not remove selected blocks.');
    });
  });

  test('US1 block markers stay visible and right hover reveals the add control', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win, '##');
      commitComposer(win, 'Hover me');
      var block = state.document.blocks[0];
      var element = blockById(win, block.id);
      var marker = element.querySelector('.block-marker');
      var plus = element.querySelector('.block-plus');
      var content = element.querySelector('.block-content');
      var hoverCapable = win.matchMedia('(hover: hover)').matches;
      var rect = element.getBoundingClientRect();

      function move(target, x, y) {
        target.dispatchEvent(new win.PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          pointerId: 9,
          pointerType: 'mouse',
          clientX: x,
          clientY: y
        }));
      }

      function opacity(node) {
        return win.getComputedStyle(node).opacity;
      }

      move(byId(win, 'document-title'), 10, 10);
      equal(opacity(marker), '1', 'The Marker must be visible without hover.');

      move(content, rect.left + rect.width * 0.2, rect.top + 10);
      equal(element.classList.contains('hover-left'), true);
      equal(element.classList.contains('hover-right'), false);
      equal(opacity(marker), '1', 'The Marker must stay visible on left hover.');
      if (hoverCapable) {
        equal(opacity(plus), '0', 'The add control must stay hidden on left hover.');
      }

      move(content, rect.left + rect.width * 0.8, rect.top + 10);
      equal(element.classList.contains('hover-left'), false);
      equal(element.classList.contains('hover-right'), true);
      equal(opacity(marker), '1', 'The Marker must stay visible on right hover.');
      return waitFor(function () {
        return opacity(plus) === '1' ? true : null;
      }, 1000).then(function () {
        var plusRect = plus.getBoundingClientRect();
        var blockRect = element.getBoundingClientRect();
        assert(Math.abs(plusRect.right - (blockRect.right + 12)) <= 2,
          'The add control must sit at the lower-right corner.');
        assert(Math.abs(plusRect.bottom - (blockRect.bottom + 12)) <= 2,
          'The add control must sit at the lower-right corner.');
        move(byId(win, 'document-title'), 10, 10);
        equal(element.classList.contains('hover-left'), false);
        equal(element.classList.contains('hover-right'), false);
        equal(opacity(marker), '1', 'The Marker must remain visible after hover.');
        win.document.body.dispatchEvent(new win.PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 27,
          pointerType: 'mouse',
          button: 0
        }));
        return waitFor(function () {
          var menuGone = !win.document.querySelector('.marker-menu');
          var plusHidden = !hoverCapable || opacity(plus) === '0';
          return menuGone && plusHidden ? true : null;
        }, 2000);
      });
    });
  });

  test('US1 left border hover opens the Marker flyout without a grab cursor', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win, '##');
      commitComposer(win, 'Hover border');
      var element = blockById(win, state.document.blocks[0].id);
      var marker = element.querySelector('.block-marker');
      var rect = element.getBoundingClientRect();

      function move(x, y) {
        element.dispatchEvent(new win.PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          pointerId: 25,
          pointerType: 'mouse',
          clientX: x,
          clientY: y
        }));
      }

      move(rect.left + 1, rect.top + rect.height / 2);
      equal(element.classList.contains('hover-left'), true,
        'Hovering the left border must set the left hover state.');
      equal(win.getComputedStyle(element).cursor, 'default',
        'The left side must not show a grab cursor.');
      var menu = win.document.querySelector('.marker-menu');
      assert(menu, 'Hovering the left border must open the Marker flyout.');
      var markerRect = marker.getBoundingClientRect();
      var menuRect = menu.getBoundingClientRect();
      assert(menuRect.right <= markerRect.left + 0.5,
        'The flyout must still open to the left of the Marker.');

      move(rect.right - 6, rect.top + 2);
      equal(element.classList.contains('hover-right'), true,
        'Hovering the right side must set the right hover state.');
      equal(win.getComputedStyle(element).cursor, 'grab',
        'The right side must keep the grab cursor.');
      return new Promise(function (resolve) {
        setTimeout(resolve, 300);
      }).then(function () {
        assert(win.document.querySelector('.marker-menu'),
          'Moving away from the Marker must keep the flyout open until an outside click.');
        win.document.body.dispatchEvent(new win.PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 26,
          pointerType: 'mouse',
          button: 0
        }));
        equal(win.document.querySelector('.marker-menu'), null,
          'Clicking outside the flyout must close it.');
      });
    });
  });

  test('US1 markers without a type render as blank space', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      var composerMarker = win.document.querySelector('#canvas .composer-marker');
      assert(composerMarker, 'The composer Marker control is missing.');
      equal(composerMarker.textContent.trim(), '',
        'A no-type composer must render a blank Marker area.');
      equal(composerMarker.classList.contains('none'), true);

      commitComposer(win, 'Plain');
      var block = state.document.blocks[0];
      var marker = blockById(win, block.id).querySelector('.block-marker');
      equal(marker.textContent.trim(), '',
        'A no-type block must render a blank Marker area.');
      equal(marker.classList.contains('none'), true);
      equal(win.getComputedStyle(marker).opacity, '1',
        'The blank Marker area must stay visible without hover.');

      marker.dispatchEvent(new win.PointerEvent('pointerenter', {
        pointerId: 12,
        pointerType: 'mouse',
        bubbles: false
      }));
      var menu = win.document.querySelector('.marker-menu');
      assert(menu, 'Hovering the blank Marker area must open the flyout.');
      var noneOption = menu.querySelector('[data-marker="none"]');
      assert(noneOption, 'The no-type option is missing.');
      equal(noneOption.textContent.trim(), '×',
        'The flyout may use an X symbol for the no-type option.');
      win.Prompter.editor.closeMarkerMenu();
    });
  });

  test('US1 the composer stays in its slot when the last edited block moves', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C']);
      equal(state.composer.insertIndex, 3,
        'The composer should start after the committed sequence.');
      var cId = state.document.blocks[2].id;

      press(win, blockById(win, cId), 'ArrowUp', { altKey: true });
      press(win, blockById(win, cId), 'ArrowUp', { altKey: true });

      var ordered = readingOrder(win);
      equal(ordered[0].id, cId, 'C should move to the first position.');
      equal(state.composer.insertIndex, 3,
        'The composer must keep its own sequence slot.');
      var composer = win.document.querySelector('#canvas .composer');
      var last = ordered[ordered.length - 1];
      var lastElement = blockById(win, last.id);
      assert(parseFloat(composer.style.top) >= last.y + lastElement.offsetHeight + 4,
        'The composer must remain at the end instead of following C.');
    });
  });

  test('US1 the composer can be dragged and shifts for a block dragged across it', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C']);
      var canvas = byId(win, 'canvas');
      var canvasRect = canvas.getBoundingClientRect();
      var ids = state.document.blocks.map(function (block) { return block.id; });

      function pointer(target, type, x, y) {
        target.dispatchEvent(new win.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 13,
          pointerType: 'mouse',
          button: 0,
          clientX: x,
          clientY: y
        }));
      }

      function pointerUp(x, y) {
        win.dispatchEvent(new win.PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerId: 13, pointerType: 'mouse', button: 0,
          clientX: x, clientY: y
        }));
      }

      function modelBlock(id) {
        return state.document.blocks.filter(function (block) {
          return block.id === id;
        })[0];
      }

      var composerElement = win.document.querySelector('#canvas .composer');
      var handle = composerElement.querySelector('.composer-handle');
      assert(handle, 'The composer drag handle is missing.');
      equal(handle.getAttribute('aria-label'), '拖曳輸入框');
      var composerRect = composerElement.getBoundingClientRect();
      var handleRect = handle.getBoundingClientRect();
      var startX = composerRect.left + 10;
      var startY = handleRect.top + handleRect.height / 2;
      var grabOffset = startY - (canvasRect.top + state.composer.y);
      var a = modelBlock(ids[0]);
      var b = modelBlock(ids[1]);
      var aCenter = canvasRect.top + a.y + blockById(win, a.id).offsetHeight / 2;
      var bCenter = canvasRect.top + b.y + blockById(win, b.id).offsetHeight / 2;
      var moveY = (aCenter + bCenter) / 2 + grabOffset - composerElement.offsetHeight / 2;

      pointer(handle, 'pointerdown', startX, startY);
      pointer(win, 'pointermove', startX, moveY);
      pointerUp(startX, moveY);

      equal(state.composer.insertIndex, 1,
        'Dragging the composer upward must change its insertion slot.');
      equal(readingOrder(win).map(function (block) { return block.id; }).join(','),
        ids.join(','), 'Composer movement must not reorder blocks.');
      composerElement = win.document.querySelector('#canvas .composer');
      a = modelBlock(ids[0]);
      b = modelBlock(ids[1]);
      assert(parseFloat(composerElement.style.top) >=
        a.y + blockById(win, a.id).offsetHeight + 4,
      'The composer must stay after A.');
      assert(parseFloat(composerElement.style.top) < b.y,
        'The composer must stay before B.');

      var c = modelBlock(ids[2]);
      var cElement = blockById(win, c.id);
      var cContent = cElement.querySelector('.block-content');
      var cStartX = canvasRect.left + c.x + 10;
      var cStartY = canvasRect.top + c.y + 10;
      var cGrabOffset = cStartY - (canvasRect.top + c.y);
      a = modelBlock(ids[0]);
      aCenter = canvasRect.top + a.y + blockById(win, a.id).offsetHeight / 2;
      var cMoveY = aCenter - 2 + cGrabOffset - cElement.offsetHeight / 2;

      pointer(cContent, 'pointerdown', cStartX, cStartY);
      pointer(win, 'pointermove', cStartX, cMoveY);
      pointerUp(cStartX, cMoveY);

      equal(readingOrder(win).map(function (block) { return block.id; }).join(','),
        [ids[2], ids[0], ids[1]].join(','),
        'Dragging C above A must cross and shift the composer.');
      equal(state.composer.insertIndex, 2,
        'The composer must shift toward the dragged block source.');
      composerElement = win.document.querySelector('#canvas .composer');
      a = modelBlock(ids[0]);
      b = modelBlock(ids[1]);
      assert(parseFloat(composerElement.style.top) >=
        a.y + blockById(win, a.id).offsetHeight + 4,
      'The shifted composer must stay after A.');
      assert(parseFloat(composerElement.style.top) < b.y,
        'The shifted composer must stay before B.');
    });
  });

  test('US1 the image picker inserts a validated image block and remove deletes it', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      var input = byId(win, 'image-input');
      var data = new win.DataTransfer();
      data.items.add(pngFile(win, 'picker.png'));
      input.files = data.files;
      input.dispatchEvent(new win.Event('change', { bubbles: true }));
      return waitFor(function () {
        return state.assets.length === 1 && state.document.blocks.length === 1;
      }).then(function () {
        var block = state.document.blocks[0];
        equal(block.type, 'image');
        equal(state.assets[0].fileName, 'picker.png');
        equal(block.alt, 'picker.png');
        var element = blockById(win, block.id);
        assert(element, 'The image block was not rendered.');
        var img = element.querySelector('img.block-image');
        assert(img && /^blob:/.test(img.src), 'The image should render from a local object URL.');
        var remove = element.querySelector('.block-remove');
        assert(remove, 'The image remove control is missing.');
        remove.click();
        equal(state.document.blocks.length, 0);
        equal(state.assets.length, 0);
        assert(composerInput(win), 'Removing the last image must restore the composer.');
      });
    });
  });

  test('US1 pasting text and an image creates text blocks before the image', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      var data = new win.DataTransfer();
      data.items.add(pngFile(win, 'pasted.png'));
      data.setData('text/plain', '# 貼上標題\n第二行');
      var event = dispatchPaste(win, byId(win, 'canvas'), data);
      equal(event.defaultPrevented, true, 'Paste should be handled by the app.');
      return waitFor(function () {
        return state.assets.length === 1 && state.document.blocks.length === 3;
      }).then(function () {
        var ordered = readingOrder(win);
        equal(ordered[0].type, 'text');
        equal(ordered[0].marker, '#');
        equal(ordered[0].text, '貼上標題');
        equal(ordered[1].type, 'text');
        equal(ordered[1].text, '第二行');
        equal(ordered[2].type, 'image');
        equal(state.assets[0].fileName, 'pasted.png');
        assert(ordered[0].y <= ordered[1].y && ordered[1].y <= ordered[2].y,
          'Text blocks should be placed before the image.');
      });
    });
  });

  test('US1 an unsupported pasted image rejects the entire paste', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      var data = new win.DataTransfer();
      data.items.add(svgFile(win, 'icon.svg'));
      data.setData('text/plain', '這段文字不應插入');
      dispatchPaste(win, byId(win, 'canvas'), data);
      return waitFor(function () {
        var alert = byId(win, 'alert-region');
        return alert && alert.textContent.indexOf('icon.svg') !== -1 ? true : null;
      }, 8000).then(function () {
        equal(state.document.blocks.length, 0);
        equal(state.assets.length, 0);
      });
    });
  });

  test('US1 pasting an image while editing keeps the edit active', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      var textBlock = commitComposer(win, 'Edit me');
      var textId = state.document.blocks[0].id;
      blockById(win, textId).querySelector('.block-content')
        .dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      var editorInput = win.document.querySelector('#canvas .block-edit-input');
      assert(editorInput, 'Edit mode did not start.');
      var data = new win.DataTransfer();
      data.items.add(pngFile(win, 'during-edit.png'));
      data.setData('text/plain', '不應中斷編輯');
      dispatchPaste(win, editorInput, data);
      return waitFor(function () {
        return state.assets.length === 1 && state.document.blocks.length === 2;
      }).then(function () {
        equal(state.editingBlockId, textId);
        var active = win.document.activeElement;
        assert(active && active.classList.contains('block-edit-input'),
          'Focus should remain in the text editor.');
        equal(active.value, 'Edit me');
        var ordered = readingOrder(win);
        equal(ordered[0].id, textId);
        equal(ordered[1].type, 'image');
        equal(ordered[1].alt, 'during-edit.png');
        press(win, active, 'Escape');
      });
    });
  });

  test('US1 paste is ignored while a modal dialog is open', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      var settings = byId(win, 'settings-dialog');
      settings.showModal();
      var data = new win.DataTransfer();
      data.setData('text/plain', '不應插入');
      dispatchPaste(win, byId(win, 'canvas'), data);
      equal(state.document.blocks.length, 0);
      closeDialogs(win);
    });
  });

  test('US2 Open converts Markdown and related images into a persisted document', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      selectOpenFiles(win, [
        markdownFile(win, 'prompt.md', [
          '# 標題',
          '',
          '![像素](images/pixel.png)',
          '![遠端](https://example.com/remote.png)',
          '![缺少](not-selected.png)',
          ''
        ].join('\n')),
        pngFile(win, 'pixel.png')
      ]);
      return waitFor(function () {
        return state.document && state.document.title === 'prompt' ? state.document : null;
      }, 8000).then(function (document) {
        equal(document.blocks.length, 4);
        equal(document.blocks[0].type, 'text');
        equal(document.blocks[0].marker, '#');
        equal(document.blocks[0].text, '標題');
        equal(document.blocks[1].type, 'image');
        equal(document.blocks[1].alt, '像素');
        equal(state.assets.length, 1);
        equal(state.assets[0].fileName, 'pixel.png');
        equal(document.blocks[2].text, '![遠端](https://example.com/remote.png)');
        equal(document.blocks[3].text, '![缺少](not-selected.png)');
        equal(document.blocks[0].blankLinesAfter, 1);
        document.blocks.forEach(function (block) {
          equal(block.x, win.Prompter.files.COLUMN_X);
        });
        for (var i = 1; i < document.blocks.length; i += 1) {
          assert(document.blocks[i].y > document.blocks[i - 1].y,
            'Opened blocks must start in source-order column order.');
        }
        equal(state.dirty, false);
        equal(state.documentPersisted, true);
        equal(byId(win, 'document-status').textContent, '已儲存');
        equal(byId(win, 'document-title').value, 'prompt');
        assert(byId(win, 'alert-region').textContent.indexOf('not-selected.png') !== -1,
          'Missing image warnings should be announced.');
        return state.storage.getDocuments().then(function (documents) {
          assert(documents.some(function (entry) {
            return entry.id === document.id;
          }), 'Opened documents must be added to the local library.');
          return state.storage.deleteDocument(document.id);
        });
      });
    });
  });

  test('US2 Open errors leave the current document and its changes untouched', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      commitComposer(win, '保留內容');
      var documentId = state.document.id;
      selectOpenFiles(win, [pngFile(win, 'only-image.png')]);
      return waitFor(function () {
        return byId(win, 'alert-region').textContent.indexOf('Markdown') !== -1;
      }, 8000).then(function () {
        equal(state.document.id, documentId);
        equal(state.document.blocks[0].text, '保留內容');
        equal(state.dirty, true);
        equal(byId(win, 'document-status').textContent, '尚未儲存的變更');
        assert(!state.fileBusy, 'Open failures must clear the busy state.');
      });
    });
  });

  test('US2 New opens a new tab and preserves the dirty document', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = freshDocument(win);
      commitComposer(win, '未儲存');
      var originalId = state.document.id;
      var originalTab = app.findTab(originalId);
      assert(originalTab, 'The original document tab is missing.');

      return app.requestNewDocument().then(function (proceed) {
        equal(proceed, true);
        equal(state.tabs.length, 2, 'New must open a second tab.');
        assert(state.document.id !== originalId, 'The new tab must become active.');
        equal(state.document.blocks.length, 0);
        equal(state.dirty, false);
        equal(byId(win, 'document-status').textContent, '新文件');
        equal(originalTab.dirty, true, 'The first tab must keep its unsaved state.');
        equal(originalTab.document.blocks.length, 1);
        assert(composerInput(win), 'The blank document composer is missing.');
        return app.activateTab(originalId);
      }).then(function () {
        equal(state.document.id, originalId, 'The first tab must be restorable.');
        equal(state.dirty, true);
        equal(state.document.blocks[0].text, '未儲存');
        equal(byId(win, 'document-status').textContent, '尚未儲存的變更');
      });
    });
  });

  test('US2 Open keeps the dirty document while the picker opens', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = freshDocument(win);
      commitComposer(win, '保持開啟');
      var originalId = state.document.id;
      return app.requestOpenPicker().then(function (result) {
        assert(result && result.ok, 'Opening the file picker must be allowed.');
        equal(result.pickerOpened, true);
        equal(byId(win, 'unsaved-dialog').open, false,
          'Open must not discard or prompt for the dirty tab.');
        equal(state.document.id, originalId);
        equal(state.dirty, true);
        equal(state.tabs.length, 1);
      });
    });
  });

  test('US2 Save As downloads Markdown with images and later Save reuses the target', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = freshDocument(win);
      commitComposer(win, '下載測試');
      var imageInput = byId(win, 'image-input');
      var data = new win.DataTransfer();
      data.items.add(pngFile(win, 'picker.png'));
      imageInput.files = data.files;
      imageInput.dispatchEvent(new win.Event('change', { bubbles: true }));

      var downloads = [];
      var blobs = {};
      var proto = win.HTMLAnchorElement.prototype;
      var originalClick = proto.click;
      var originalCreate = win.URL.createObjectURL;
      proto.click = function () {
        downloads.push({ name: this.download, blob: blobs[this.href] || null });
      };
      win.URL.createObjectURL = function (blob) {
        var url = originalCreate.call(win.URL, blob);
        blobs[url] = blob;
        return url;
      };
      function restore() {
        proto.click = originalClick;
        win.URL.createObjectURL = originalCreate;
      }

      return waitFor(function () {
        return state.assets.length === 1 ? true : null;
      }, 8000).then(function () {
        var saving = win.Prompter.files.saveCurrentDocument({
          saveAs: true,
          forceDownload: true
        });
        return waitFor(function () {
          return byId(win, 'filename-dialog').open;
        }, 5000).then(function () {
          var input = byId(win, 'filename-input');
          setValue(win, input, '我的 提示詞');
          byId(win, 'filename-confirm').click();
          return waitFor(function () {
            return downloads.length === 2;
          }, 10000);
        }).then(function () {
          return saving;
        }).then(function (result) {
          assert(result.ok, 'Save As failed: ' +
            (result.error && result.error.message ? result.error.message : 'unknown') +
            ' / alert: ' + byId(win, 'alert-region').textContent);
          equal(downloads[0].name, 'picker.png');
          equal(downloads[1].name, '我的-提示詞.md');
          equal(state.document.title, '我的-提示詞');
          equal(state.document.fileName, '我的-提示詞.md');
          equal(state.documentPersisted, true);
          equal(state.fileTarget.mode, 'download');
          equal(state.dirty, false);
          equal(byId(win, 'document-status').textContent, '已儲存');
          return downloads[1].blob.text();
        }).then(function (markdown) {
          equal(markdown, '下載測試\n![picker.png](picker.png)\n');
          state.document.blocks[0].text = '更新後';
          app.setDirty(true);
          var before = downloads.length;
          var savingAgain = win.Prompter.files.saveCurrentDocument({ forceDownload: true });
          return waitFor(function () {
            return downloads.length === before + 2;
          }, 10000).then(function () {
            return savingAgain;
          }).then(function (again) {
            equal(again.ok, true);
            assert(!byId(win, 'filename-dialog').open,
              'A saved document should not prompt for a name again.');
            equal(downloads[before + 1].name, '我的-提示詞.md');
            return downloads[before + 1].blob.text();
          });
        }).then(function (markdown) {
          equal(markdown, '更新後\n![picker.png](picker.png)\n');
          restore();
        }, function (error) {
          restore();
          throw error;
        });
      });
    });
  });

  test('US2 direct Save As writes images first and later Save reuses the directory', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = freshDocument(win);
      commitComposer(win, '直接寫入');
      var imageInput = byId(win, 'image-input');
      var data = new win.DataTransfer();
      data.items.add(pngFile(win, 'picker.png'));
      imageInput.files = data.files;
      imageInput.dispatchEvent(new win.Event('change', { bubbles: true }));

      return waitFor(function () {
        return state.assets.length === 1 ? true : null;
      }, 8000).then(function () {
        var original = state.document;
        var originalId = original.id;
        return state.storage.saveDocument(original, state.assets).then(function () {
          var directory = fakeDirectory(win);
          var pickerCalls = 0;
          var originalPicker = win.showDirectoryPicker;
          win.showDirectoryPicker = function () {
            pickerCalls += 1;
            return Promise.resolve(directory);
          };
          function restore() {
            win.showDirectoryPicker = originalPicker;
          }
          var saving = win.Prompter.files.saveCurrentDocument({ saveAs: true });
          var restoreOnError = function (error) {
            restore();
            throw error;
          };
          return submitFilename(win, 'direct-test').then(function () {
            return saving;
          }).then(function (result) {
            assert(result.ok, 'Direct Save As failed: ' +
              (result.error && result.error.message ? result.error.message : 'unknown'));
            equal(pickerCalls, 1);
            equal(state.fileTarget.mode, 'direct');
            equal(state.fileTarget.fileName, 'direct-test.md');
            assert(state.document.id !== originalId,
              'Save As must create a new document id.');
            equal(state.document.fileName, 'direct-test.md');
            equal(state.documentPersisted, true);
            equal(state.dirty, false);
            equal(state.assets[0].documentId, state.document.id);
            assert(directory.files['picker.png'] instanceof win.Blob,
              'The image file was not written.');
            assert(directory.files['direct-test.md'] instanceof win.Blob,
              'The Markdown file was not written.');
            equal(directory.writes.join(','), 'picker.png,direct-test.md');
            return directory.files['direct-test.md'].text().then(function (markdown) {
              equal(markdown, '直接寫入\n![picker.png](picker.png)\n');
            });
          }).then(function () {
            return state.storage.getDocument(originalId);
          }).then(function (loaded) {
            assert(loaded && loaded.document, 'The original document must remain saved.');
            equal(loaded.document.title, 'Untitled');
            equal(loaded.document.fileName, 'untitled.md');
            equal(loaded.document.blocks.length, 2);
            equal(loaded.document.blocks[0].text, '直接寫入');

            state.document.blocks[0].text = '更新';
            app.setDirty(true);
            var savingAgain = win.Prompter.files.saveCurrentDocument({});
            return savingAgain.then(function (again) {
              assert(again.ok, 'Saving to the existing directory failed: ' +
                (again.error && again.error.message ? again.error.message : 'unknown'));
              equal(pickerCalls, 1,
                'A saved document must reuse its directory without asking again.');
              equal(state.documentPersisted, true);
              equal(state.dirty, false);
              equal(directory.writes[directory.writes.length - 1], 'direct-test.md');
              return directory.files['direct-test.md'].text();
            }).then(function (markdown) {
              equal(markdown, '更新\n![picker.png](picker.png)\n');
              equal(byId(win, 'document-status').textContent, '已儲存');
            });
          }).then(function () {
            restore();
            return state.storage.deleteDocument(state.document.id);
          }, restoreOnError);
        });
      });
    });
  });

  test('US2 conflicts block writes until the user cancels or allows overwrite', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      commitComposer(win, '衝突測試');
      var directory = fakeDirectory(win, ['conflict.md']);
      var originalPicker = win.showDirectoryPicker;
      var pickerCalls = 0;
      win.showDirectoryPicker = function () {
        pickerCalls += 1;
        return Promise.resolve(directory);
      };
      function restore() {
        win.showDirectoryPicker = originalPicker;
      }
      function restoreOnError(error) {
        restore();
        throw error;
      }

      var saving = win.Prompter.files.saveCurrentDocument({ saveAs: true });
      return submitFilename(win, 'conflict').then(function () {
        return waitFor(function () {
          return byId(win, 'conflict-dialog').open ? true : null;
        }, 5000);
      }).then(function () {
        equal(byId(win, 'conflict-list').textContent, 'conflict.md');
        equal(directory.writes.length, 0, 'No files may be written before the choice.');
        byId(win, 'conflict-cancel').click();
        return saving;
      }).then(function (result) {
        equal(result.ok, false);
        equal(result.canceled, true);
        equal(directory.writes.length, 0);
        equal(directory.files['conflict.md'].type, 'text/plain');
        equal(state.document.fileName, 'untitled.md');
        equal(state.documentPersisted, false);
        equal(state.dirty, true);
        equal(byId(win, 'document-status').textContent, '尚未儲存的變更');

        var retry = win.Prompter.files.saveCurrentDocument({ saveAs: true });
        return submitFilename(win, 'conflict').then(function () {
          return waitFor(function () {
            return byId(win, 'conflict-dialog').open ? true : null;
          }, 5000);
        }).then(function () {
          byId(win, 'conflict-overwrite').click();
          return retry;
        });
      }).then(function (result) {
        assert(result.ok, 'Overwrite Save As failed: ' +
          (result.error && result.error.message ? result.error.message : 'unknown'));
        equal(pickerCalls, 2);
        equal(directory.writes.join(','), 'conflict.md');
        equal(directory.files['conflict.md'].type, 'text/markdown;charset=utf-8');
        equal(state.document.fileName, 'conflict.md');
        equal(state.documentPersisted, true);
        equal(state.dirty, false);
        return directory.files['conflict.md'].text();
      }).then(function (markdown) {
        equal(markdown, '衝突測試\n');
        restore();
        return state.storage.deleteDocument(state.document.id);
      }, restoreOnError);
    });
  });

  test('US2 canceling the filename dialog leaves the new document unsaved', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      commitComposer(win, '取消儲存');
      var documentId = state.document.id;
      var saving = win.Prompter.files.saveCurrentDocument({
        saveAs: true,
        forceDownload: true
      });
      return waitFor(function () {
        return byId(win, 'filename-dialog').open ? true : null;
      }, 5000).then(function () {
        byId(win, 'filename-cancel').click();
        return saving;
      }).then(function (result) {
        equal(result.ok, false);
        equal(result.canceled, true);
        equal(state.document.id, documentId);
        equal(state.document.fileName, 'untitled.md');
        equal(state.documentPersisted, false);
        equal(state.dirty, true);
        equal(byId(win, 'document-status').textContent, '尚未儲存的變更');
        assert(!state.fileBusy, 'Canceling must clear the busy state.');
      });
    });
  });

  test('US2 direct-write failures keep the document dirty and name the file', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      commitComposer(win, '寫入失敗');
      var documentId = state.document.id;
      var directory = fakeDirectory(win, [], { failWrites: ['fail.md'] });
      var originalPicker = win.showDirectoryPicker;
      win.showDirectoryPicker = function () {
        return Promise.resolve(directory);
      };
      function restore() {
        win.showDirectoryPicker = originalPicker;
      }
      function restoreOnError(error) {
        restore();
        throw error;
      }
      var saving = win.Prompter.files.saveCurrentDocument({ saveAs: true });
      return submitFilename(win, 'fail').then(function () {
        return saving;
      }).then(function (result) {
        equal(result.ok, false);
        assert(result.error && result.error.message.indexOf('fail.md') !== -1,
          'The failure must name the Markdown file.');
        equal(state.document.id, documentId);
        equal(state.document.fileName, 'untitled.md');
        equal(state.documentPersisted, false);
        equal(state.dirty, true);
        equal(byId(win, 'document-status').textContent, '尚未儲存的變更');
        assert(!directory.files['fail.md'], 'No Markdown file should be recorded.');
        assert(!state.fileBusy, 'Write failures must clear the busy state.');
        restore();
      }, restoreOnError);
    });
  });

  test('US2 closing a dirty tab can save before closing', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = freshDocument(win);
      commitComposer(win, '儲存後關閉');
      var originalId = state.document.id;
      var directory = fakeDirectory(win);
      var originalPicker = win.showDirectoryPicker;
      win.showDirectoryPicker = function () {
        return Promise.resolve(directory);
      };
      function restore() {
        win.showDirectoryPicker = originalPicker;
      }
      function restoreOnError(error) {
        restore();
        throw error;
      }

      var pending = app.closeTab(originalId);
      return waitFor(function () {
        return byId(win, 'unsaved-dialog').open ? true : null;
      }, 5000).then(function () {
        byId(win, 'unsaved-save').click();
        return submitFilename(win, 'guard-save');
      }).then(function () {
        return pending;
      }).then(function (proceed) {
        equal(proceed, true);
        assert(directory.files['guard-save.md'] instanceof win.Blob,
          'The guarded save must write the Markdown file.');
        equal(state.tabs.length, 0, 'The saved tab must close.');
        equal(state.document, null);
        equal(state.dirty, false);
        equal(byId(win, 'unsaved-dialog').open, false);
        return state.storage.getDocument(originalId);
      }).then(function (loaded) {
        assert(loaded && loaded.document, 'The saved document must stay in the library.');
        equal(loaded.document.blocks[0].text, '儲存後關閉');
        equal(loaded.document.fileName, 'guard-save.md');
        restore();
        return state.storage.deleteDocument(originalId);
      }, restoreOnError);
    });
  });

  test('US2 a failed guarded tab-close save keeps the tab open', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = freshDocument(win);
      commitComposer(win, '失敗保留');
      var originalId = state.document.id;
      var directory = fakeDirectory(win, [], { failWrites: ['guarded-fail.md'] });
      var originalPicker = win.showDirectoryPicker;
      win.showDirectoryPicker = function () {
        return Promise.resolve(directory);
      };
      function restore() {
        win.showDirectoryPicker = originalPicker;
      }
      function restoreOnError(error) {
        restore();
        throw error;
      }

      var pending = app.closeTab(originalId);
      return waitFor(function () {
        return byId(win, 'unsaved-dialog').open ? true : null;
      }, 5000).then(function () {
        byId(win, 'unsaved-save').click();
        return submitFilename(win, 'guarded-fail');
      }).then(function () {
        return waitFor(function () {
          return byId(win, 'unsaved-dialog').open ? true : null;
        }, 5000);
      }).then(function () {
        equal(state.document.id, originalId);
        equal(state.document.blocks[0].text, '失敗保留');
        equal(state.dirty, true);
        equal(state.tabs.length, 1, 'A failed save must keep the tab open.');
        equal(byId(win, 'document-status').textContent, '尚未儲存的變更');
        byId(win, 'unsaved-cancel').click();
        return pending;
      }).then(function (proceed) {
        equal(proceed, false);
        equal(state.document.id, originalId);
        equal(state.dirty, true);
        equal(state.tabs.length, 1);
        equal(byId(win, 'unsaved-dialog').open, false);
        restore();
      }, restoreOnError);
    });
  });

  test('US2 File menu items follow document and busy state', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var menu = byId(win, 'file-menu');
      freshDocument(win);
      closeDialogs(win);
      app.clearDocument();
      equal(byId(win, 'document-status').textContent, '尚未開啟文件');
      ['save', 'save-as', 'insert-image'].forEach(function (action) {
        assert(menu.querySelector('[data-action="' + action + '"]').disabled,
          action + ' must be disabled without a document.');
      });
      ['new', 'open'].forEach(function (action) {
        assert(!menu.querySelector('[data-action="' + action + '"]').disabled,
          action + ' must stay enabled without a document.');
      });
      app.newDocument();
      assert(!menu.querySelector('[data-action="save"]').disabled,
        'Save must be enabled for a blank document.');
      app.setFileBusy(true, '儲存中…');
      equal(byId(win, 'document-status').textContent, '儲存中…');
      assert(menu.querySelector('[data-action="save"]').disabled,
        'Save must be disabled while saving.');
      assert(menu.querySelector('[data-action="new"]').disabled,
        'New must be disabled while a file operation is running.');
      app.setFileBusy(false);
      equal(byId(win, 'document-status').textContent, '新文件');
    });
  });

  test('US3 Preview renders canonical content live in the right pane', function () {
    return appReady().then(function (win) {
      freshDocument(win);
      var heading = commitComposer(win, '# 預覽標題');
      var quote = addBelow(win, heading, '> 引言 <script>alert(1)</script>');
      addBelow(win, quote, '![遠端](https://example.com/remote.png)', 'none');
      return addPickerImage(win, 'preview.png').then(function () {
        var button = byId(win, 'preview-button');
        button.focus();
        button.click();
        return waitFor(function () {
          var content = byId(win, 'preview-content');
          return !byId(win, 'preview-view').hidden &&
            content.querySelector('h1') ? content : null;
        }, 8000);
      }).then(function (content) {
        equal(content.querySelector('h1').textContent, '預覽標題');
        equal(byId(win, 'canvas').hidden, false,
          'The editor canvas must stay visible beside the preview.');
        equal(byId(win, 'workspace').classList.contains('preview-open'), true,
          'The workspace must show the right preview pane.');
        var paneRect = byId(win, 'preview-view').getBoundingClientRect();
        var editorRect = byId(win, 'editor-pane').getBoundingClientRect();
        assert(paneRect.left >= editorRect.right - 1,
          'The preview pane must sit to the right of the editor.');
        equal(byId(win, 'preview-button').getAttribute('aria-pressed'), 'true');
        equal(byId(win, 'preview-button').getAttribute('aria-label'), '關閉即時預覽');
        assert(!byId(win, 'preview-button').querySelector('.edit-icon'),
          'The preview toggle must stay an eye icon.');
        assert(!byId(win, 'preview-dialog'), 'Preview must not use a dialog.');
        var quoteElement = content.querySelector('blockquote');
        assert(quoteElement, 'Quote lines must render as a blockquote.');
        assert(quoteElement.textContent.indexOf('引言 <script>alert(1)</script>') !== -1,
          'Quote text must stay literal inside the preview.');
        equal(content.innerHTML.indexOf('<script>alert(1)</script>'), -1,
          'Preview must not emit raw HTML from block text.');
        var image = content.querySelector('img[alt="preview.png"]');
        assert(image, 'The local image must render in Preview.');
        assert(/^data:image\/png;base64,/.test(image.getAttribute('src')),
          'Preview images must use a local data URL.');
        var placeholder = content.querySelector('.missing-image');
        assert(placeholder && placeholder.textContent.indexOf('遠端') !== -1,
          'Remote images must use a placeholder.');
        equal(content.innerHTML.indexOf('src="https://example.com/remote.png"'), -1,
          'Remote URLs must never become image sources.');
        var warning = content.querySelector('.preview-warning');
        assert(warning && warning.textContent.indexOf('https://example.com/remote.png') !== -1,
          'Preview must list images that could not be displayed.');

        var headingId = heading.dataset.blockId;
        var headingElement = blockById(win, headingId);
        headingElement.querySelector('.block-content')
          .dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        var editInput = blockById(win, headingId).querySelector('.block-edit-input');
        assert(editInput, 'The heading must enter edit mode.');
        setValue(win, editInput, '即時標題');
        press(win, editInput, 'Enter');
        return waitFor(function () {
          var title = byId(win, 'preview-content').querySelector('h1');
          return title && title.textContent === '即時標題' ? true : null;
        }, 5000);
      }).then(function () {
        byId(win, 'preview-button').click();
        return waitFor(function () {
          return byId(win, 'preview-view').hidden &&
            !byId(win, 'workspace').classList.contains('preview-open') &&
            !byId(win, 'canvas').hidden ? true : null;
        }, 5000);
      }).then(function () {
        equal(win.document.activeElement, byId(win, 'preview-button'),
          'Closing the preview must keep focus on the eye toggle.');
        equal(byId(win, 'preview-button').getAttribute('aria-pressed'), 'false');
        equal(byId(win, 'preview-button').getAttribute('aria-label'), '即時預覽');
        equal(byId(win, 'preview-content').textContent, '');
      });
    });
  });

  test('US3 Preview shows an empty state for a blank document', function () {
    return appReady().then(function (win) {
      freshDocument(win);
      var button = byId(win, 'preview-button');
      button.focus();
      button.click();
      return waitFor(function () {
        var content = byId(win, 'preview-content');
        return !byId(win, 'preview-view').hidden &&
          content.querySelector('.preview-empty') ? content : null;
      }, 5000).then(function (content) {
        equal(content.querySelector('.preview-empty').textContent,
          '目前沒有可預覽的內容。');
        byId(win, 'preview-button').click();
        return waitFor(function () {
          return byId(win, 'preview-view').hidden &&
            !byId(win, 'canvas').hidden &&
            win.document.activeElement === byId(win, 'preview-button');
        }, 5000);
      }).then(function () {
        equal(win.document.activeElement, byId(win, 'preview-button'),
          'Returning to edit must restore focus to the toggle.');
      });
    });
  });

  test('T072 Preview renders five hundred blocks within one second', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var Model = win.Prompter.model;
      var markers = ['none', '#', '##', '###', '-', '1.', '>', '.'];
      var list = [];
      for (var index = 0; index < 500; index += 1) {
        list.push(Model.createTextBlock({
          id: 'perf-text-' + index,
          text: '第 ' + index + ' 個區塊內容',
          marker: markers[index % markers.length],
          x: 12 + (index % 4) * 220,
          y: Math.floor(index / 4) * 24,
          seq: index + 1
        }));
      }
      app.setDocument(Model.createPromptDocument({
        id: 'perf-preview-document',
        title: '五百區塊預覽',
        fileName: 'perf-preview.md',
        blocks: list
      }), [], { persisted: false, dirty: true });
      var started = win.performance.now();
      byId(win, 'preview-button').click();
      return waitFor(function () {
        var content = byId(win, 'preview-content');
        return !byId(win, 'preview-view').hidden &&
          content.textContent.indexOf('第 499 個區塊內容') !== -1
          ? content
          : null;
      }, 10000).then(function (content) {
        var elapsed = win.performance.now() - started;
        assert(elapsed < 1000,
          'Rendering a 500-block Preview took ' + Math.round(elapsed) + ' ms.');
        assert(content.querySelectorAll('h1, h2, h3, blockquote, pre, table, p, li').length >= 300,
          'The 500-block Preview must render the document content.');
        byId(win, 'preview-button').click();
        return waitFor(function () {
          return byId(win, 'preview-view').hidden ? true : null;
        }, 5000);
      });
    });
  });

  test('T072 an inserted image becomes visible within one second', function () {
    return appReady().then(function (win) {
      freshDocument(win);
      var state = win.Prompter.app.state;
      var input = byId(win, 'image-input');
      var data = new win.DataTransfer();
      data.items.add(pngFile(win, 'perf-image.png'));
      input.files = data.files;
      var started = win.performance.now();
      input.dispatchEvent(new win.Event('change', { bubbles: true }));
      return waitFor(function () {
        var image = win.document.querySelector('#canvas .block-image-block img.block-image');
        return image && image.complete && image.naturalWidth > 0 ? image : null;
      }, 8000).then(function (image) {
        var elapsed = win.performance.now() - started;
        assert(elapsed < 1000,
          'Making an inserted image visible took ' + Math.round(elapsed) + ' ms.');
        assert(/^(?:data:|blob:)/.test(image.getAttribute('src')),
          'The visible image must use a local data or blob URL.');
        equal(state.assets.length, 1);
        equal(state.document.blocks.length, 1);
        equal(state.document.blocks[0].type, 'image');
      });
    });
  });

  test('US3 Copy is disabled for blank documents and enabled with content', function () {
    return appReady().then(function (win) {
      freshDocument(win);
      var button = byId(win, 'copy-button');
      equal(button.disabled, true, 'Copy must be disabled for a blank document.');
      commitComposer(win, '可複製內容');
      equal(button.disabled, false, 'Copy must be enabled after adding content.');
    });
  });

  test('US3 Copy writes exact Markdown and rich HTML through the async clipboard', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      var heading = commitComposer(win, '# 複製標題');
      addBelow(win, heading, '第二行 & <b>', 'none');
      return addPickerImage(win, 'copied.png').then(function () {
        var written = null;
        return withClipboardStub(win, {
          asyncWrite: function (items) {
            written = items;
            return Promise.resolve();
          }
        }, function () {
          var button = byId(win, 'copy-button');
          button.focus();
          button.click();
          return waitFor(function () {
            return written && byId(win, 'toast-region').textContent
              .indexOf('已複製') !== -1;
          }, 8000).then(function () {
            equal(written.length, 1);
            var item = written[0].items;
            assert(item['text/plain'] && item['text/html'],
              'Copy must provide plain-text and HTML flavors.');
            return Promise.all([
              item['text/plain'].text(),
              item['text/html'].text()
            ]);
          });
        });
      }).then(function (flavors) {
        equal(flavors[0],
          '# 複製標題\n第二行 & <b>\n![copied.png](copied.png)\n');
        assert(flavors[1].indexOf('<h1>複製標題</h1>') !== -1,
          'Rich HTML must render headings.');
        assert(flavors[1].indexOf('第二行 &amp; &lt;b&gt;') !== -1,
          'Rich HTML must escape literal block text.');
        assert(/<img src="data:image\/png;base64,[^"]+" alt="copied\.png"/
          .test(flavors[1]), 'Rich HTML must embed the local image.');
        assert(byId(win, 'toast-region').textContent
          .indexOf('已複製 Markdown 與圖片。') !== -1,
        'Copy must confirm what was copied.');
        equal(state.dirty, true, 'Copying must not change the dirty state.');
      });
    });
  });

  test('US3 Copy includes markers chosen through the block flyout', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      commitComposer(win, 'Flyout copy');
      var block = state.document.blocks[0];
      var marker = blockById(win, block.id).querySelector('.block-marker');
      marker.dispatchEvent(new win.PointerEvent('pointerenter', {
        pointerId: 16,
        pointerType: 'mouse',
        bubbles: false
      }));
      var menu = win.document.querySelector('.marker-menu');
      assert(menu, 'The block Marker flyout did not open.');
      menu.querySelector('[data-marker="##"]').click();

      var written = null;
      return withClipboardStub(win, {
        asyncWrite: function (items) {
          written = items;
          return Promise.resolve();
        }
      }, function () {
        byId(win, 'copy-button').click();
        return waitFor(function () {
          return written ? true : null;
        }, 5000).then(function () {
          equal(written[0].items['text/html'], undefined,
            'Text-only documents must not offer HTML that would discard Markdown Markers.');
          return written[0].items['text/plain'].text();
        });
      }).then(function (markdown) {
        equal(markdown, '## Flyout copy\n',
          'Copy must serialize the Marker applied through the flyout.');
      });
    });
  });

  test('US3 Copy keeps exact Markdown but reports images missing from rich HTML', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      var first = commitComposer(win, '缺圖測試');
      addBelow(win, first, '![遠端](https://example.com/remote.png)');
      equal(state.document.blocks.length, 2);
      var written = null;
      return withClipboardStub(win, {
        asyncWrite: function (items) {
          written = items;
          return Promise.resolve();
        }
      }, function () {
        byId(win, 'copy-button').click();
        return waitFor(function () {
          return written && byId(win, 'alert-region').textContent
            .indexOf('已複製 Markdown，但圖片無法包含。') !== -1;
        }, 8000).then(function () {
          return Promise.all([
            written[0].items['text/plain'].text(),
            written[0].items['text/html'].text()
          ]);
        });
      }).then(function (flavors) {
        equal(flavors[0], '缺圖測試\n![遠端](https://example.com/remote.png)\n');
        assert(flavors[1].indexOf('missing-image') !== -1,
          'Missing images must render as placeholders in rich HTML.');
        equal(flavors[1].indexOf('src="https://example.com/remote.png"'), -1,
          'Remote URLs must stay out of rich HTML image sources.');
        assert(byId(win, 'toast-region').textContent
          .indexOf('已複製 Markdown，但圖片無法包含。') !== -1,
        'Copy must warn when images were omitted.');
        assert(byId(win, 'alert-region').textContent
          .indexOf('https://example.com/remote.png') !== -1,
        'Copy feedback must list the images that were omitted.');
      });
    });
  });

  test('US3 Copy falls back to execCommand when the async clipboard fails', function () {
    return appReady().then(function (win) {
      freshDocument(win);
      commitComposer(win, '備援複製');
      var captured = {};
      var result = null;
      return withClipboardStub(win, {
        asyncWrite: function () {
          return Promise.reject(new Error('Async clipboard blocked.'));
        },
        execCommand: function (command) {
          if (command !== 'copy') {
            return false;
          }
          var event = new win.Event('copy', { bubbles: true, cancelable: true });
          win.Object.defineProperty(event, 'clipboardData', {
            value: {
              setData: function (type, data) {
                captured[type] = data;
              }
            }
          });
          win.document.dispatchEvent(event);
          return true;
        }
      }, function () {
        return win.Prompter.clipboard.copy().then(function (value) {
          result = value;
        });
      }).then(function () {
        assert(result && result.ok, 'The execCommand fallback must succeed.');
        equal(result.method, 'execCommand');
        equal(captured['text/plain'], '備援複製\n');
        equal(captured['text/html'], undefined,
          'Text-only fallback copies must not add an HTML flavor.');
      });
    });
  });

  test('US3 Copy fallback keeps rich HTML when images are present', function () {
    return appReady().then(function (win) {
      freshDocument(win);
      commitComposer(win, '# 備援圖片');
      return addPickerImage(win, 'fallback.png').then(function () {
        var captured = {};
        var result = null;
        return withClipboardStub(win, {
          asyncWrite: function () {
            return Promise.reject(new Error('Async clipboard blocked.'));
          },
          execCommand: function (command) {
            if (command !== 'copy') {
              return false;
            }
            var event = new win.Event('copy', { bubbles: true, cancelable: true });
            win.Object.defineProperty(event, 'clipboardData', {
              value: {
                setData: function (type, data) {
                  captured[type] = data;
                }
              }
            });
            win.document.dispatchEvent(event);
            return true;
          }
        }, function () {
          return win.Prompter.clipboard.copy().then(function (value) {
            result = value;
          });
        }).then(function () {
          assert(result && result.ok, 'The execCommand fallback must succeed.');
          equal(result.method, 'execCommand');
          equal(captured['text/plain'], '# 備援圖片\n![fallback.png](fallback.png)\n');
          assert(captured['text/html'].indexOf('<h1>備援圖片</h1>') !== -1,
            'Rich fallback HTML must render headings.');
          assert(/<img src="data:image\/png;base64,[^"]+" alt="fallback\.png"/
            .test(captured['text/html']),
          'Rich fallback HTML must embed local images.');
        });
      });
    });
  });

  test('US3 Copy opens the manual dialog when both clipboard paths fail', function () {
    return appReady().then(function (win) {
      freshDocument(win);
      commitComposer(win, '手動複製');
      var copyButton = byId(win, 'copy-button');
      var result = null;
      copyButton.focus();
      return withClipboardStub(win, {
        execCommand: function () {
          return false;
        }
      }, function () {
        return win.Prompter.clipboard.copy().then(function (value) {
          result = value;
        });
      }).then(function () {
        equal(result.ok, false);
        equal(result.manual, true);
        var dialog = byId(win, 'manual-copy-dialog');
        assert(dialog.open, 'The manual-copy dialog must open.');
        var textarea = byId(win, 'manual-copy-text');
        equal(textarea.value, '手動複製\n');
        equal(win.document.activeElement, textarea,
          'The manual-copy content must be focused.');
        equal(textarea.selectionStart, 0);
        equal(textarea.selectionEnd, textarea.value.length);
        byId(win, 'manual-copy-close').click();
        return waitFor(function () {
          return !dialog.open &&
            win.document.activeElement === copyButton;
        }, 5000);
      }).then(function () {
        equal(win.document.activeElement, copyButton,
          'Closing the manual dialog must return focus to Copy.');
      });
    });
  });

  test('US4 the directory lists newest-first and searches titles, content and image names', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = app.state;
      var Model = win.Prompter.model;
      var newest = Model.createPromptDocument({
        id: 'doc-newest',
        title: '最新提示詞',
        fileName: 'newest.md',
        updatedAt: '2026-10-28T03:00:00.000Z',
        blocks: [
          Model.createTextBlock({
            id: 'newest-block',
            text: '包含 Alpha 關鍵字',
            y: 0,
            seq: 1
          })
        ]
      });
      var middle = Model.createPromptDocument({
        id: 'doc-middle',
        title: 'Middle 文件',
        fileName: 'middle.md',
        updatedAt: '2026-10-28T02:00:00.000Z',
        blocks: [
          Model.createTextBlock({
            id: 'middle-block',
            text: 'Beta 內容',
            y: 0,
            seq: 1
          })
        ]
      });
      var imageAsset = {
        id: 'asset-receipt',
        documentId: 'doc-oldest',
        fileName: 'receipt-scan.png',
        originalName: '收據掃描.png',
        mimeType: 'image/png',
        width: 1,
        height: 1,
        size: 68,
        createdAt: '2026-10-28T01:00:00.000Z',
        dataUrl: 'data:image/png;base64,' + PNG_BASE64
      };
      var oldest = Model.createPromptDocument({
        id: 'doc-oldest',
        title: 'Old 提示詞',
        fileName: 'oldest.md',
        updatedAt: '2026-10-28T01:00:00.000Z',
        blocks: [
          Model.createTextBlock({
            id: 'oldest-text',
            text: 'Gamma 內容',
            y: 0,
            seq: 1
          }),
          Model.createImageBlock({
            id: 'oldest-image',
            assetId: imageAsset.id,
            alt: '收據掃描',
            y: 24,
            seq: 2
          })
        ]
      });

      return withCleanLibrary(win, function () {
        return saveStoredDocument(win, middle)
          .then(function () {
            return saveStoredDocument(win, newest);
          })
          .then(function () {
            return saveStoredDocument(win, oldest, [imageAsset]);
          })
          .then(function () {
            return app.refreshDirectory();
          })
          .then(function () {
            return waitFor(function () {
              return directoryItems(win).length === 3 ? true : null;
            }, 8000);
          })
          .then(function () {
            assert(directoryTitles(win).join('|') === '最新提示詞|Middle 文件|Old 提示詞',
              'Directory order must be newest-first: ' + directoryTitles(win).join('|'));
            equal(byId(win, 'result-count').textContent, '3 個文件');
            equal(byId(win, 'directory-empty').hidden, true);
            return waitFor(function () {
              var titles = directoryTitles(win);
              return titles.length === 3 &&
                byId(win, 'result-count').textContent === '3 個文件';
            }, 3000);
          })
          .then(function () {
            var search = byId(win, 'search-input');
            setValue(win, search, 'ALPHA');
            return waitFor(function () {
              return directoryItems(win).length === 1 &&
                byId(win, 'result-count').textContent === '1 個結果';
            }, 5000).then(function () {
              equal(directoryTitles(win)[0], '最新提示詞');
              equal(byId(win, 'clear-search').hidden, false);
            });
          })
          .then(function () {
            setValue(win, byId(win, 'search-input'), 'MIDDLE');
            return waitFor(function () {
              var titles = directoryTitles(win);
              return titles.length === 1 && titles[0] === 'Middle 文件';
            }, 5000).then(function () {
              equal(directoryTitles(win)[0], 'Middle 文件');
            });
          })
          .then(function () {
            setValue(win, byId(win, 'search-input'), 'gamma');
            return waitFor(function () {
              var titles = directoryTitles(win);
              return titles.length === 1 && titles[0] === 'Old 提示詞';
            }, 5000).then(function () {
              equal(directoryTitles(win)[0], 'Old 提示詞');
            });
          })
          .then(function () {
            setValue(win, byId(win, 'search-input'), 'receipt-scan');
            return waitFor(function () {
              var titles = directoryTitles(win);
              return titles.length === 1 && titles[0] === 'Old 提示詞';
            }, 5000).then(function () {
              equal(directoryTitles(win)[0], 'Old 提示詞');
            });
          })
          .then(function () {
            setValue(win, byId(win, 'search-input'), 'not-found');
            return waitFor(function () {
              return byId(win, 'directory-no-results').hidden === false;
            }, 5000).then(function () {
              equal(byId(win, 'result-count').textContent, '0 個結果');
              equal(byId(win, 'document-list').hidden, true);
              equal(directoryItems(win).length, 0);
              byId(win, 'no-results-clear').click();
              return waitFor(function () {
                return directoryItems(win).length === 3 &&
                  byId(win, 'search-input').value === '' &&
                  byId(win, 'result-count').textContent === '3 個文件';
              }, 5000);
            });
          })
          .then(function () {
            equal(byId(win, 'clear-search').hidden, true);
            equal(byId(win, 'directory-no-results').hidden, true);
            equal(state.document, null,
              'The directory test must not open or depend on a document.');
            equal(win.document.querySelectorAll(
              '#document-list .document-item[aria-current="true"]').length, 0,
            'No directory item should be current without an open document.');
          });
      });
    });
  });

  test('US4 selecting documents opens tabs and preserves dirty content', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = app.state;
      var Model = win.Prompter.model;
      var first = Model.createPromptDocument({
        id: 'layout-first',
        title: '甲文件',
        fileName: 'first.md',
        updatedAt: '2026-10-28T02:00:00.000Z',
        blocks: [
          Model.createTextBlock({
            id: 'first-block',
            text: '甲內容',
            x: 12,
            y: 24,
            seq: 1
          })
        ]
      });
      var second = Model.createPromptDocument({
        id: 'layout-second',
        title: '乙文件',
        fileName: 'second.md',
        updatedAt: '2026-10-28T01:00:00.000Z',
        blocks: [
          Model.createTextBlock({
            id: 'second-block',
            text: '乙內容',
            x: 320,
            y: 48,
            seq: 1
          })
        ]
      });

      return withCleanLibrary(win, function () {
        return saveStoredDocument(win, first)
          .then(function () {
            return saveStoredDocument(win, second);
          })
          .then(function () {
            return app.refreshDirectory();
          })
          .then(function () {
            return waitFor(function () {
              return directoryItems(win).length === 2 ? true : null;
            }, 5000);
          })
          .then(function () {
            directoryButton(win, first.id).click();
            return waitFor(function () {
              return state.document && state.document.id === first.id &&
                state.documentPersisted && !state.dirty ? state.document : null;
            }, 8000);
          })
          .then(function (loaded) {
            equal(byId(win, 'document-title').value, '甲文件');
            equal(byId(win, 'document-status').textContent, '已儲存');
            equal(directoryButton(win, first.id).getAttribute('aria-current'), 'true');
            equal(loaded.blocks[0].x, win.Prompter.files.COLUMN_X);
            equal(loaded.blocks[0].y, win.Prompter.files.COLUMN_START_Y);
            var element = blockById(win, 'first-block');
            assert(element, 'The opened block must render.');
            equal(element.style.left, win.Prompter.files.COLUMN_X + 'px');
            equal(element.style.top, win.Prompter.files.COLUMN_START_Y + 'px');
            state.document.blocks[0].text = '未儲存變更';
            app.setDirty(true);
            directoryButton(win, second.id).click();
            return waitFor(function () {
              return state.document && state.document.id === second.id &&
                !state.dirty ? state.document : null;
            }, 8000);
          })
          .then(function (loaded) {
            equal(byId(win, 'unsaved-dialog').open, false,
              'Opening another document must not prompt; it opens a tab.');
            equal(state.tabs.length, 2, 'Both opened documents must remain in tabs.');
            equal(byId(win, 'document-title').value, '乙文件');
            equal(byId(win, 'document-status').textContent, '已儲存');
            equal(directoryButton(win, second.id).getAttribute('aria-current'), 'true');
            equal(directoryButton(win, first.id).getAttribute('aria-current'), null);
            equal(loaded.blocks[0].x, win.Prompter.files.COLUMN_X);
            equal(loaded.blocks[0].y, win.Prompter.files.COLUMN_START_Y);
            var element = blockById(win, 'second-block');
            assert(element, 'The second opened block must render.');
            directoryButton(win, first.id).click();
            return waitFor(function () {
              return state.document && state.document.id === first.id &&
                state.dirty ? state.document : null;
            }, 8000);
          })
          .then(function (loaded) {
            equal(byId(win, 'unsaved-dialog').open, false,
              'Returning to an open tab must not prompt.');
            equal(byId(win, 'document-title').value, '甲文件');
            equal(byId(win, 'document-status').textContent, '尚未儲存的變更');
            equal(directoryButton(win, first.id).getAttribute('aria-current'), 'true');
            equal(loaded.blocks[0].text, '未儲存變更',
              'The dirty tab content must be preserved.');
            var element = blockById(win, 'first-block');
            assert(element, 'The preserved block must render.');
            equal(element.querySelector('.block-content').textContent, '未儲存變更');
          });
      });
    });
  });

  test('US4 New clears the search and an unsaved document is not listed', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = app.state;
      var Model = win.Prompter.model;
      var first = Model.createPromptDocument({
        id: 'new-search-first',
        title: '搜尋文件',
        fileName: 'search-first.md',
        updatedAt: '2026-10-28T02:00:00.000Z',
        blocks: [Model.createTextBlock({ id: 'search-first-block', text: '內容', seq: 1 })]
      });
      var second = Model.createPromptDocument({
        id: 'new-search-second',
        title: '另一份',
        fileName: 'search-second.md',
        updatedAt: '2026-10-28T01:00:00.000Z',
        blocks: [Model.createTextBlock({ id: 'search-second-block', text: '其他', seq: 1 })]
      });

      return withCleanLibrary(win, function () {
        return saveStoredDocument(win, first)
          .then(function () {
            return saveStoredDocument(win, second);
          })
          .then(function () {
            return app.refreshDirectory();
          })
          .then(function () {
            return waitFor(function () {
              return directoryItems(win).length === 2 ? true : null;
            }, 5000);
          })
          .then(function () {
            setValue(win, byId(win, 'search-input'), '搜尋');
            return waitFor(function () {
              return directoryItems(win).length === 1 ? true : null;
            }, 5000);
          })
          .then(function () {
            return app.requestNewDocument();
          })
          .then(function () {
            return waitFor(function () {
              return state.document && state.document.blocks.length === 0 &&
                state.searchQuery === '' ? state.document : null;
            }, 5000);
          })
          .then(function (document) {
            equal(byId(win, 'search-input').value, '');
            equal(byId(win, 'result-count').textContent, '2 個文件');
            equal(directoryItems(win).length, 2);
            equal(document.title, 'Untitled');
            equal(directoryButton(win, document.id), null);
            equal(win.document.querySelectorAll(
              '#document-list .document-item[aria-current="true"]').length, 0);
            return state.storage.getDocuments().then(function (documents) {
              equal(documents.length, 2,
                'An unsaved new document must not enter the local directory.');
            });
          });
      });
    });
  });

  test('US4 restores the last readable document without marking it dirty', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = app.state;
      var Model = win.Prompter.model;
      var document = Model.createPromptDocument({
        id: 'restore-document',
        title: '上次開啟',
        fileName: 'restore.md',
        updatedAt: '2026-10-28T04:00:00.000Z',
        blocks: [
          Model.createTextBlock({
            id: 'restore-first',
            text: '還原內容',
            x: 40,
            y: 72,
            seq: 1
          })
        ]
      });

      return withCleanLibrary(win, function () {
        return saveStoredDocument(win, document)
          .then(function () {
            return app.refreshDirectory();
          })
          .then(function () {
            try {
              var result = state.storage.setLastDocumentId(document.id);
              return Promise.resolve(result);
            } catch (error) {
              throw error;
            }
          })
          .then(function () {
            app.clearDocument();
            return app.restoreLastDocument();
          })
          .then(function (loaded) {
            assert(loaded && loaded.document, 'The last document must be restored.');
            equal(state.document.id, document.id);
            equal(state.dirty, false);
            equal(state.documentPersisted, true);
            equal(byId(win, 'document-title').value, '上次開啟');
            equal(byId(win, 'document-status').textContent, '已儲存');
            equal(state.document.blocks[0].x, win.Prompter.files.COLUMN_X);
            equal(state.document.blocks[0].y, win.Prompter.files.COLUMN_START_Y);
            equal(directoryButton(win, document.id).getAttribute('aria-current'), 'true');
            var element = blockById(win, 'restore-first');
            assert(element, 'The restored block must render.');
            equal(element.style.left, win.Prompter.files.COLUMN_X + 'px');
            equal(element.style.top, win.Prompter.files.COLUMN_START_Y + 'px');
            state.storage.setLastDocumentId('missing-document');
            app.clearDocument();
            return app.restoreLastDocument();
          })
          .then(function (loaded) {
            equal(loaded, null);
            equal(state.document, null);
            equal(state.storage.getLastDocumentId(), null,
              'A missing last document must be forgotten.');
          });
      });
    });
  });

  test('US4 the directory drawer toggles and closes with Escape', function () {
    return appReady().then(function (win) {
      var toggle = byId(win, 'directory-toggle');
      var directory = byId(win, 'directory');
      var overlay = byId(win, 'directory-overlay');
      frame.style.width = '360px';
      return waitFor(function () {
        return toggle.offsetParent !== null ? true : null;
      }, 5000).then(function () {
        assert(win.document.documentElement.scrollWidth <= win.innerWidth + 1,
          'The 360 px layout must not scroll horizontally: ' +
          win.document.documentElement.scrollWidth + ' > ' + win.innerWidth);
        if (directory.classList.contains('open')) {
          overlay.click();
        }
        toggle.click();
        equal(directory.classList.contains('open'), true);
        equal(toggle.getAttribute('aria-expanded'), 'true');
        equal(overlay.hidden, false);
        press(win, win.document, 'Escape');
        return waitFor(function () {
          return !directory.classList.contains('open') &&
            toggle.getAttribute('aria-expanded') === 'false' &&
            overlay.hidden && win.document.activeElement === toggle;
        }, 5000);
      }).then(function () {
        frame.style.width = '';
      }, function (error) {
        frame.style.width = '';
        throw error;
      });
    });
  });

  test('US4 five- and fifty-document libraries sort and filter literally', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = app.state;
      var Model = win.Prompter.model;
      var base = Date.parse('2026-10-20T00:00:00.000Z');

      function makeDocument(id, title, text, index) {
        return Model.createPromptDocument({
          id: id,
          title: title,
          fileName: id + '.md',
          updatedAt: new Date(base + index * 1000).toISOString(),
          blocks: [
            Model.createTextBlock({
              id: id + '-block',
              text: text,
              y: 0,
              seq: 1
            })
          ]
        });
      }

      function saveBatch(documents, start) {
        if (start >= documents.length) {
          return Promise.resolve();
        }
        return Promise.all(documents.slice(start, start + 10).map(function (document) {
          return saveStoredDocument(win, document);
        })).then(function () {
          return saveBatch(documents, start + 10);
        });
      }

      var five = [
        makeDocument('five-newest', '最新 Alpha 提示詞', '包含 SECURITY 檢查', 4),
        makeDocument('five-marketing', '行銷文案', '請用 English 語氣', 3),
        makeDocument('five-punctuation', 'C++? 範例', '使用 C++? 與 JSON。', 2),
        makeDocument('five-fourth', '第四份', '一般內容', 1),
        makeDocument('five-fifth', '第五份', '其他內容', 0)
      ];

      return withCleanLibrary(win, function () {
        return saveBatch(five, 0)
          .then(function () {
            return app.refreshDirectory();
          })
          .then(function () {
            return waitFor(function () {
              return directoryItems(win).length === 5 ? true : null;
            }, 5000);
          })
          .then(function () {
            equal(directoryTitles(win).join('|'),
              '最新 Alpha 提示詞|行銷文案|C++? 範例|第四份|第五份');
            assert(directoryItems(win).every(function (item) {
              return item.querySelector('.document-item-time').textContent.length > 0;
            }), 'Every directory entry must show a last-modified time.');
          })
          .then(function () {
            setValue(win, byId(win, 'search-input'), '  alpha  ');
            return waitFor(function () {
              var titles = directoryTitles(win);
              return titles.length === 1 && titles[0] === '最新 Alpha 提示詞';
            }, 5000);
          })
          .then(function () {
            setValue(win, byId(win, 'search-input'), 'english 語氣');
            return waitFor(function () {
              var titles = directoryTitles(win);
              return titles.length === 1 && titles[0] === '行銷文案';
            }, 5000);
          })
          .then(function () {
            setValue(win, byId(win, 'search-input'), 'C++?');
            return waitFor(function () {
              var titles = directoryTitles(win);
              return titles.length === 1 && titles[0] === 'C++? 範例';
            }, 5000);
          })
          .then(function () {
            setValue(win, byId(win, 'search-input'), '不存在');
            return waitFor(function () {
              return byId(win, 'directory-no-results').hidden === false;
            }, 5000);
          })
          .then(function () {
            byId(win, 'no-results-clear').click();
            return waitFor(function () {
              return directoryItems(win).length === 5 ? true : null;
            }, 5000);
          })
          .then(function () {
            var fifty = five.slice();
            for (var index = 5; index < 50; index += 1) {
              fifty.push(makeDocument(
                'fifty-' + index,
                '文件 ' + index,
                index === 47 ? 'needle 目標' : '提示詞 ' + index,
                index
              ));
            }
            return saveBatch(fifty.slice(5), 0).then(function () {
              return app.refreshDirectory();
            }).then(function () {
              return waitFor(function () {
                return directoryItems(win).length === 50 ? true : null;
              }, 10000);
            }).then(function () {
              var started = Date.now();
              setValue(win, byId(win, 'search-input'), '文件 47');
              return waitFor(function () {
                var titles = directoryTitles(win);
                return titles.length === 1 && titles[0] === '文件 47';
              }, 5000).then(function () {
                var elapsed = Date.now() - started;
                assert(elapsed < 1000,
                  'Searching 50 documents took ' + elapsed + ' ms.');
                return state.storage.getDocuments().then(function (stored) {
                  equal(stored.length, 50);
                });
              });
            });
          });
      });
    });
  });

  test('US4 five hundred documents render and filter within the directory budget', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = app.state;
      var Model = win.Prompter.model;
      var documents = [];
      var base = Date.parse('2026-10-01T00:00:00.000Z');
      for (var index = 0; index < 500; index += 1) {
        documents.push(Model.createPromptDocument({
          id: 'bulk-' + index,
          title: '文件 ' + index,
          fileName: 'bulk-' + index + '.md',
          updatedAt: new Date(base + index * 1000).toISOString(),
          blocks: [
            Model.createTextBlock({
              id: 'bulk-block-' + index,
              text: index === 250 ? 'needle 目標' : '提示詞 ' + index,
              y: 0,
              seq: 1
            })
          ]
        }));
      }

      function saveBatch(start) {
        if (start >= documents.length) {
          return Promise.resolve();
        }
        return Promise.all(documents.slice(start, start + 25).map(function (document) {
          return saveStoredDocument(win, document);
        })).then(function () {
          return saveBatch(start + 25);
        });
      }

      return withCleanLibrary(win, function () {
        return saveBatch(0).then(function () {
          var started = Date.now();
          return app.refreshDirectory().then(function () {
            return waitFor(function () {
              return directoryItems(win).length === 500 ? true : null;
            }, 20000).then(function () {
              var renderElapsed = Date.now() - started;
              assert(renderElapsed < 1000,
                'Rendering 500 documents took ' + renderElapsed + ' ms.');
              equal(directoryTitles(win)[0], '文件 499');
              var searchStarted = Date.now();
              setValue(win, byId(win, 'search-input'), 'needle');
              return waitFor(function () {
                var titles = directoryTitles(win);
                return titles.length === 1 && titles[0] === '文件 250';
              }, 10000).then(function () {
                var searchElapsed = Date.now() - searchStarted;
                assert(searchElapsed < 300,
                  'Searching 500 documents took ' + searchElapsed + ' ms.');
                return state.storage.getDocuments().then(function (stored) {
                  equal(stored.length, 500);
                });
              });
            });
          });
        });
      });
    });
  });

  test('US5 settings apply the default Marker and grid, persist, and show version information', function () {
    return appReady().then(function (win) {
      return withPreferences(win, {
        style: 'apple',
        theme: 'light',
        defaultMarker: 'none',
        showGrid: false,
        lastDocumentId: null
      }, function () {
        return withCleanLibrary(win, function () {
          var app = win.Prompter.app;
          var state = app.state;
          var settingsButton = byId(win, 'settings-button');
          var dialog = byId(win, 'settings-dialog');
          settingsButton.focus();
          settingsButton.click();
          assert(dialog.open, 'The settings dialog must open.');
          equal(byId(win, 'app-version').textContent, '1.0.0');
          equal(byId(win, 'schema-version').textContent, '1');
          assert(byId(win, 'storage-mode-label').textContent.length > 0 &&
            byId(win, 'storage-mode-label').textContent !== '—',
          'The active storage mode must be shown.');

          var marker = byId(win, 'default-marker');
          equal(marker.value, 'none');
          changeSelect(win, marker, '##');
          equal(state.preferences.defaultMarker, '##');
          equal(state.storage.getPreferences().defaultMarker, '##');

          var grid = byId(win, 'show-grid');
          equal(grid.checked, false);
          toggleCheckbox(win, grid, true);
          equal(state.preferences.showGrid, true);
          equal(state.storage.getPreferences().showGrid, true);
          equal(byId(win, 'canvas').classList.contains('grid-hidden'), false);
          assert(win.getComputedStyle(byId(win, 'canvas')).backgroundImage !== 'none',
            'Enabling the grid must show its background lines.');

          byId(win, 'settings-close').click();
          return waitFor(function () {
            return !dialog.open && win.document.activeElement === settingsButton;
          }, 5000).then(function () {
            return app.requestNewDocument();
          }).then(function () {
            return waitFor(function () {
              return win.document.querySelector('#canvas .composer-marker');
            }, 5000);
          }).then(function (composerMarker) {
            equal(composerMarker.textContent, '##',
              'A new composer must use the saved default Marker.');
            byId(win, 'settings-button').click();
            return waitFor(function () {
              return dialog.open ? true : null;
            }, 5000);
          }).then(function () {
            toggleCheckbox(win, byId(win, 'show-grid'), false);
            equal(byId(win, 'canvas').classList.contains('grid-hidden'), true);
            equal(win.getComputedStyle(byId(win, 'canvas')).backgroundImage, 'none');
            equal(state.storage.getPreferences().showGrid, false);
            byId(win, 'settings-close').click();
            return waitFor(function () {
              return !dialog.open ? true : null;
            }, 5000);
          });
        });
      });
    });
  });

  test('US5 theme and style apply immediately, persist, follow the system and preflight', function () {
    return appReady().then(function (win) {
      return withPreferences(win, {
        style: 'apple',
        theme: 'light',
        showGrid: false,
        lastDocumentId: null
      }, function () {
        var app = win.Prompter.app;
        var state = app.state;
        var root = win.document.documentElement;
        app.clearDocument();
        equal(root.getAttribute('data-theme'), 'light');
        equal(root.getAttribute('data-style'), 'apple');
        var toggle = byId(win, 'theme-toggle');
        equal(toggle.getAttribute('aria-pressed'), 'false');
        toggle.click();
        equal(root.getAttribute('data-theme'), 'dark');
        equal(toggle.getAttribute('aria-pressed'), 'true');
        equal(toggle.getAttribute('aria-label'), '切換為淺色');
        equal(state.preferences.theme, 'dark');
        equal(state.storage.getPreferences().theme, 'dark');

        changeSelect(win, byId(win, 'style-select'), 'spotify');
        equal(root.getAttribute('data-style'), 'spotify');
        equal(state.preferences.style, 'spotify');
        equal(state.storage.getPreferences().style, 'spotify');

        return withProbeFrame(win, function (probe) {
          equal(probe.contentDocument.documentElement.getAttribute('data-theme'), 'dark',
            'The preflight must apply the saved dark theme before storage initializes.');
          equal(probe.contentDocument.documentElement.getAttribute('data-style'), 'spotify',
            'The preflight must apply the saved Spotify-inspired style.');
        }).then(function () {
          byId(win, 'settings-button').click();
          return waitFor(function () {
            return byId(win, 'settings-dialog').open ? true : null;
          }, 5000);
        }).then(function () {
          byId(win, 'follow-system-button').click();
          equal(state.preferences.theme, 'system');
          equal(state.storage.getPreferences().theme, 'system');
          var expected = win.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
          equal(root.getAttribute('data-theme'), expected,
            'Following the system must use the current media preference.');
          equal(root.getAttribute('data-style'), 'spotify',
            'The style must remain independent of the theme.');
          byId(win, 'settings-close').click();
          return waitFor(function () {
            return byId(win, 'settings-dialog').open ? null : true;
          }, 5000);
        });
      });
    });
  });

  test('US5 offers ten styles and applies each without touching content', function () {
    return appReady().then(function (win) {
      var styles = [
        'apple', 'nvidia', 'meta', 'ibm', 'stripe', 'vercel',
        'notion', 'figma', 'spacex', 'spotify'
      ];
      return withPreferences(win, {
        style: 'apple',
        theme: 'light',
        showGrid: false,
        lastDocumentId: null
      }, function () {
        var root = win.document.documentElement;
        var select = byId(win, 'style-select');
        var options = Array.prototype.map.call(
          select.querySelectorAll('option'),
          function (option) { return option.value; }
        );
        equal(options.length, 10, 'The style selector must offer ten styles.');
        equal(options.join(','), styles.join(','),
          'The style selector order must start with Apple.');
        equal(select.value, 'apple');
        equal(root.getAttribute('data-style'), 'apple',
          'Apple must be the default style.');

        var state = freshDocument(win);
        commitComposer(win, '外觀切換不應改動內容');
        var before = JSON.stringify(state.document);
        styles.forEach(function (style) {
          changeSelect(win, select, style);
          equal(root.getAttribute('data-style'), style,
            'Selecting ' + style + ' must apply that style immediately.');
          equal(state.preferences.style, style);
          equal(state.storage.getPreferences().style, style);
        });
        equal(JSON.stringify(state.document), before,
          'Switching styles must not change document content or order.');
        changeSelect(win, select, 'apple');
      });
    });
  });

  test('US5 clear library confirms, keeps preferences, and removes local records and targets', function () {
    return appReady().then(function (win) {
      return withPreferences(win, {
        style: 'spotify',
        theme: 'dark',
        defaultMarker: '##',
        showGrid: true,
        lastDocumentId: null
      }, function () {
        return withCleanLibrary(win, function () {
          var app = win.Prompter.app;
          var state = app.state;
          var Model = win.Prompter.model;
          var documentId = 'clear-library-document';
          var asset = {
            id: 'clear-library-asset',
            documentId: documentId,
            fileName: 'clear-library.png',
            originalName: '清除測試.png',
            mimeType: 'image/png',
            width: 1,
            height: 1,
            size: 68,
            createdAt: '2026-10-28T00:00:00.000Z',
            dataUrl: 'data:image/png;base64,' + PNG_BASE64
          };
          var document = Model.createPromptDocument({
            id: documentId,
            title: '清除測試文件',
            fileName: 'clear-library.md',
            updatedAt: '2026-10-28T05:00:00.000Z',
            blocks: [
              Model.createTextBlock({
                id: 'clear-library-text',
                text: '本機內容',
                y: 0,
                seq: 1
              }),
              Model.createImageBlock({
                id: 'clear-library-image',
                assetId: asset.id,
                alt: '清除測試',
                y: 24,
                seq: 2
              })
            ]
          });

          return saveStoredDocument(win, document, [asset])
            .then(function () {
              return app.refreshDirectory();
            })
            .then(function () {
              return waitFor(function () {
                return directoryButton(win, documentId);
              }, 5000);
            })
            .then(function () {
              directoryButton(win, documentId).click();
              return waitFor(function () {
                return state.document && state.document.id === documentId &&
                  state.documentPersisted ? state.document : null;
              }, 8000);
            })
            .then(function () {
              return state.storage.setFileTarget(documentId, { name: '測試資料夾' });
            })
            .then(function () {
              equal(state.storage.getLastDocumentId(), documentId);
              byId(win, 'settings-button').click();
              return waitFor(function () {
                return byId(win, 'settings-dialog').open ? true : null;
              }, 5000);
            })
            .then(function () {
              var confirmation = byId(win, 'clear-dialog').textContent;
              assert(confirmation.indexOf('磁碟') !== -1,
                'Clear confirmation must state that disk files are untouched.');
              assert(confirmation.indexOf('偏好設定') !== -1,
                'Clear confirmation must state that preferences are kept.');
              byId(win, 'clear-library-button').click();
              return waitFor(function () {
                return byId(win, 'clear-dialog').open ? true : null;
              }, 5000);
            })
            .then(function () {
              byId(win, 'clear-cancel').click();
              return waitFor(function () {
                return byId(win, 'clear-dialog').open ? null : true;
              }, 5000);
            })
            .then(function () {
              return state.storage.getDocuments();
            })
            .then(function (stored) {
              equal(stored.length, 1, 'Canceling must keep the local library.');
              equal(state.document.id, documentId);
              byId(win, 'clear-library-button').click();
              return waitFor(function () {
                return byId(win, 'clear-dialog').open ? true : null;
              }, 5000);
            })
            .then(function () {
              byId(win, 'clear-confirm').click();
              return waitFor(function () {
                return !byId(win, 'clear-dialog').open &&
                  !byId(win, 'settings-dialog').open &&
                  state.document === null;
              }, 8000);
            })
            .then(function () {
              equal(directoryItems(win).length, 0);
              equal(byId(win, 'directory-empty').hidden, false);
              equal(state.storage.getLastDocumentId(), null,
                'Clear library must forget the removed last document.');
              var preferences = state.storage.getPreferences();
              equal(preferences.style, 'spotify');
              equal(preferences.theme, 'dark');
              equal(preferences.defaultMarker, '##');
              equal(preferences.showGrid, true);
              equal(win.document.documentElement.getAttribute('data-style'), 'spotify');
              assert(byId(win, 'toast-region').textContent
                .indexOf('本機資料庫已清除，磁碟上的檔案不受影響。') !== -1,
              'Clear library must confirm that disk files were untouched.');
              return state.storage.getDocuments();
            })
            .then(function (stored) {
              equal(stored.length, 0);
              return state.storage.getAllAssets();
            })
            .then(function (assets) {
              equal(assets.length, 0);
              return state.storage.getFileTarget(documentId);
            })
            .then(function (target) {
              equal(target, null);
            });
        });
      });
    });
  });

  test('US5 clear library reports failures without discarding the current document', function () {
    return appReady().then(function (win) {
      return withCleanLibrary(win, function () {
        var app = win.Prompter.app;
        var state = app.state;
        var Model = win.Prompter.model;
        var document = Model.createPromptDocument({
          id: 'clear-failure-document',
          title: '清除失敗測試',
          fileName: 'clear-failure.md',
          blocks: [Model.createTextBlock({
            id: 'clear-failure-text',
            text: '保留內容',
            y: 0,
            seq: 1
          })]
        });
        var originalClear = state.storage.clearLibrary;

        return saveStoredDocument(win, document)
          .then(function () {
            return app.refreshDirectory();
          })
          .then(function () {
            return waitFor(function () {
              return directoryButton(win, document.id);
            }, 5000);
          })
          .then(function () {
            directoryButton(win, document.id).click();
            return waitFor(function () {
              return state.document && state.document.id === document.id
                ? state.document
                : null;
            }, 8000);
          })
          .then(function () {
            state.storage.clearLibrary = function () {
              return Promise.reject(new Error('模擬清除失敗'));
            };
            byId(win, 'settings-button').click();
            return waitFor(function () {
              return byId(win, 'settings-dialog').open ? true : null;
            }, 5000);
          })
          .then(function () {
            byId(win, 'clear-library-button').click();
            return waitFor(function () {
              return byId(win, 'clear-dialog').open ? true : null;
            }, 5000);
          })
          .then(function () {
            byId(win, 'clear-confirm').click();
            return waitFor(function () {
              return byId(win, 'alert-region').textContent
                .indexOf('模擬清除失敗') !== -1;
            }, 5000);
          })
          .then(function () {
            equal(state.document && state.document.id, document.id,
              'A failed clear must keep the current document open.');
            byId(win, 'clear-cancel').click();
            return waitFor(function () {
              return byId(win, 'clear-dialog').open ? null : true;
            }, 5000);
          })
          .then(function () {
            return state.storage.getDocuments();
          })
          .then(function (stored) {
            equal(stored.length, 1, 'A failed clear must keep local records.');
          })
          .then(function () {
            state.storage.clearLibrary = originalClear;
          }, function (error) {
            state.storage.clearLibrary = originalClear;
            throw error;
          });
      });
    });
  });

  test('T073 interactive controls expose accessible names and dialogs are labelled', function () {
    return appReady().then(function (win) {
      var document = win.document;
      var seenIds = {};
      Array.prototype.forEach.call(document.querySelectorAll('[id]'), function (element) {
        assert(!seenIds[element.id], 'Duplicate id: ' + element.id);
        seenIds[element.id] = true;
      });

      var labels = Array.prototype.slice.call(document.querySelectorAll('label[for]'));
      function labelTextFor(element) {
        var direct = '';
        labels.forEach(function (label) {
          if (label.getAttribute('for') === element.id) {
            direct += ' ' + label.textContent;
          }
        });
        if (element.labels && element.labels.length) {
          Array.prototype.forEach.call(element.labels, function (label) {
            direct += ' ' + label.textContent;
          });
        }
        return direct.trim();
      }

      Array.prototype.forEach.call(
        document.querySelectorAll('button, select, input, textarea'),
        function (element) {
          if (element.classList.contains('visually-hidden') ||
              element.closest('[hidden]') ||
              element.type === 'hidden') {
            return;
          }
          var name = (element.getAttribute('aria-label') || '').trim();
          if (!name) {
            name = labelTextFor(element);
          }
          if (!name) {
            name = (element.textContent || '').trim();
          }
          if (!name) {
            name = (element.getAttribute('title') || '').trim();
          }
          assert(name.length > 0,
            'Interactive element needs an accessible name: ' +
            (element.id || element.className || element.tagName));
        });

      Array.prototype.forEach.call(document.querySelectorAll('dialog'), function (dialog) {
        var labelledBy = dialog.getAttribute('aria-labelledby');
        assert(labelledBy, 'Dialog must use aria-labelledby: ' + dialog.id);
        var title = document.getElementById(labelledBy);
        assert(title && title.textContent.trim().length > 0,
          'Dialog label target must have text: ' + dialog.id);
      });

      var skip = document.querySelector('.skip-link');
      equal(skip.getAttribute('href'), '#canvas');
      assert(document.getElementById('canvas'), 'The skip link target must exist.');
      assert(document.getElementById('toast-region').getAttribute('aria-live') === 'polite',
        'Toasts must use a polite live region.');
      assert(document.getElementById('alert-region').getAttribute('role') === 'alert',
        'Errors must use an alert region.');
      assert(document.getElementById('move-announcer').getAttribute('aria-live') === 'polite',
        'Keyboard movement must have a polite announcement region.');

      var reducedMotion = false;
      Array.prototype.forEach.call(document.styleSheets, function (sheet) {
        var rules;
        try {
          rules = sheet.cssRules;
        } catch (error) {
          return;
        }
        Array.prototype.forEach.call(rules || [], function (rule) {
          if (rule.cssText && rule.cssText.indexOf('prefers-reduced-motion') !== -1) {
            reducedMotion = true;
          }
        });
      });
      assert(reducedMotion, 'The styles must honor prefers-reduced-motion.');
    });
  });

  test('T074 the 768 px layout keeps the header reachable and the drawer usable', function () {
    return appReady().then(function (win) {
      frame.style.width = '768px';
      frame.style.height = '1024px';
      function restoreSize() {
        frame.style.width = '';
        frame.style.height = '';
      }
      return waitFor(function () {
        return win.innerWidth === 768 &&
          byId(win, 'directory-toggle').offsetParent !== null
          ? true
          : null;
      }, 5000).then(function () {
        var app = win.Prompter.app;
        var toggle = byId(win, 'directory-toggle');
        var directory = byId(win, 'directory');
        var overlay = byId(win, 'directory-overlay');
        freshDocument(win);
        if (directory.classList.contains('open')) {
          overlay.click();
          return waitFor(function () {
            return !directory.classList.contains('open') ? true : null;
          }, 5000).then(afterClose);
        }
        return afterClose();

        function afterClose() {
          assert(win.document.documentElement.scrollWidth <= win.innerWidth + 1,
            'The 768 px layout must not scroll horizontally.');
          ['file-menu-button', 'directory-toggle', 'preview-button', 'copy-button',
            'style-select', 'theme-toggle', 'settings-button'].forEach(function (id) {
            var rect = byId(win, id).getBoundingClientRect();
            assert(rect.width > 0 && rect.height > 0, id + ' must stay visible at 768 px.');
            assert(rect.left >= 0 && rect.right <= win.innerWidth + 1,
              id + ' must stay inside the 768 px viewport.');
          });
          assert(directory.getBoundingClientRect().right <= 0 ||
            !directory.classList.contains('open'),
          'The directory drawer must start off-screen at 768 px.');
          return waitFor(function () {
            return directory.getBoundingClientRect().right <= 0 ? true : null;
          }, 5000).then(function () {
            toggle.click();
            return waitFor(function () {
              return directory.classList.contains('open') ? true : null;
            }, 5000).then(function () {
              equal(toggle.getAttribute('aria-expanded'), 'true');
              equal(overlay.hidden, false);
              return waitFor(function () {
                return directory.getBoundingClientRect().left >= 0 ? true : null;
              }, 5000);
            }).then(function () {
              var rect = directory.getBoundingClientRect();
              assert(rect.left >= 0 && rect.right <= win.innerWidth + 1,
                'The open drawer must fit inside the 768 px viewport.');
              var longText = '長'.repeat(120) + 'word'.repeat(40);
              var block = commitComposer(win, longText);
              var blockRect = block.getBoundingClientRect();
              assert(blockRect.right <= win.innerWidth + 1,
                'Long block text must wrap inside the 768 px viewport.');
              assert(win.document.documentElement.scrollWidth <= win.innerWidth + 1,
                'Long block text must not create horizontal scrolling.');
              press(win, win.document, 'Escape');
              return waitFor(function () {
                return !directory.classList.contains('open') &&
                  toggle.getAttribute('aria-expanded') === 'false' &&
                  overlay.hidden && win.document.activeElement === toggle;
              }, 5000);
            });
          });
        }
      }).then(function () {
        restoreSize();
      }, function (error) {
        restoreSize();
        throw error;
      });
    });
  });

  test('US5 the compact header keeps every action reachable at 360 px', function () {
    return appReady().then(function (win) {
      frame.style.width = '1280px';
      frame.style.height = '720px';
      function restoreWidth() {
        frame.style.width = '';
        frame.style.height = '';
      }
      var toggle = byId(win, 'directory-toggle');
      var directory = byId(win, 'directory');
      return waitFor(function () {
        return win.innerWidth === 1280 && toggle.offsetParent !== null
          ? true
          : null;
      }, 5000).then(function () {
        assert(win.document.documentElement.scrollWidth <= win.innerWidth + 1,
          'The 1280 px layout must not scroll horizontally.');
        var header = win.document.querySelector('.app-header');
        var tabs = byId(win, 'document-tabs');
        var title = byId(win, 'document-title');
        assert(tabs.contains(title), 'The document title must sit inside the tab bar.');
        var titleRect = title.getBoundingClientRect();
        assert(titleRect.width > 0 && titleRect.height > 0,
          'The document title must be visible in the tab bar.');
        var rightOrder = Array.prototype.map.call(
          header.querySelectorAll('.header-right > *'),
          function (element) { return element.id; }
        ).filter(Boolean);
        equal(rightOrder.join(','),
          'preview-button,copy-button,style-select,theme-toggle,settings-button',
          'Preview and Copy must precede Style in the header.');
        assert(byId(win, 'app-main').contains(toggle),
          'The directory toggle must sit in the far-left body rail.');
        assert(!header.contains(toggle),
          'The directory toggle must not remain in the header.');
        equal(toggle.getAttribute('aria-expanded'), 'false');
        assert(directory.getBoundingClientRect().width === 0,
          'The directory must start collapsed at 1280 px.');
        toggle.click();
        return waitFor(function () {
          return directory.getBoundingClientRect().width > 0 ? true : null;
        }, 5000);
      }).then(function () {
        equal(toggle.getAttribute('aria-expanded'), 'true',
          'The directory toggle must expand the sidebar.');
        toggle.click();
        return waitFor(function () {
          return directory.getBoundingClientRect().width === 0 ? true : null;
        }, 5000);
      }).then(function () {
        equal(toggle.getAttribute('aria-expanded'), 'false');
        frame.style.width = '360px';
        frame.style.height = '800px';
        return waitFor(function () {
          return win.innerWidth === 360 && toggle.offsetParent !== null ? true : null;
        }, 5000);
      }).then(function () {
        assert(win.document.documentElement.scrollWidth <= win.innerWidth + 1,
          'The 360 px header must not scroll horizontally: ' +
          win.document.documentElement.scrollWidth + ' > ' + win.innerWidth);
        var compactTabs = byId(win, 'document-tabs');
        var compactTitle = byId(win, 'document-title');
        var compactTitleRect = compactTitle.getBoundingClientRect();
        assert(compactTabs.contains(compactTitle) &&
          compactTitleRect.width > 0 && compactTitleRect.height > 0,
          'The document title must remain visible in the compact tab bar.');
        assert(compactTitleRect.left >= 0 && compactTitleRect.right <= win.innerWidth + 1,
          'The document title must stay inside the 360 px viewport.');
        ['file-menu-button', 'directory-toggle', 'preview-button', 'copy-button',
          'theme-toggle', 'settings-button'].forEach(function (id) {
          var element = byId(win, id);
          var rect = element.getBoundingClientRect();
          assert(rect.width >= 44 && rect.height >= 44,
            id + ' must provide a 44 px touch target.');
          assert(rect.left >= 0 && rect.right <= win.innerWidth + 1,
            id + ' must stay inside the 360 px viewport.');
          var icon = element.querySelector('.button-icon');
          assert(icon && icon.getBoundingClientRect().width > 0,
            id + ' must show a compact icon.');
          var label = element.querySelector('.button-label');
          if (label) {
            assert(label.getBoundingClientRect().width <= 1,
              id + ' must hide its non-essential text label.');
          }
        });
        var styleSelect = byId(win, 'style-select');
        var styleRect = styleSelect.getBoundingClientRect();
        assert(styleRect.height >= 44 && styleRect.right <= win.innerWidth + 1,
          'The style selector must be compact and remain inside the viewport.');
        var railIcon = toggle.querySelector('.button-icon');
        assert(railIcon && railIcon.getBoundingClientRect().width >= 36,
          'The directory rail icon must fill the rail button.');
        equal(byId(win, 'file-menu-button').getAttribute('aria-haspopup'), 'menu');
        equal(byId(win, 'preview-button').getAttribute('aria-label'), '即時預覽');
        equal(byId(win, 'preview-button').textContent.trim(), '');
        equal(byId(win, 'copy-button').textContent.trim(), '複製');
        equal(byId(win, 'settings-button').textContent.trim(), '設定');

        byId(win, 'file-menu-button').click();
        var menu = byId(win, 'file-menu');
        assert(!menu.hidden, 'The File menu must open in the compact header.');
        var menuRect = menu.getBoundingClientRect();
        assert(menuRect.left >= 0 && menuRect.right <= win.innerWidth + 1,
          'The File menu must stay inside the 360 px viewport.');
        press(win, win.document, 'Escape');
        restoreWidth();
      }, function (error) {
        restoreWidth();
        throw error;
      });
    });
  });

  test('storage saves and reloads a document without leaking session state', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      createSequence(win, ['A', 'B', 'C']);
      var ids = state.document.blocks.map(function (block) { return block.id; });
      press(win, blockById(win, ids[0]), 'ArrowDown', { altKey: true });
      var document = win.Prompter.utils.deepClone(state.document);
      return state.storage.saveDocument(document, state.assets).then(function () {
        return state.storage.getDocument(document.id);
      }).then(function (loaded) {
        assert(loaded, 'The saved document could not be reloaded.');
        equal(loaded.document.title, 'Untitled');
        equal(loaded.document.blocks.length, 3);
        equal(loaded.document.layoutVersion, 2);
        equal(loaded.document.blocks.map(function (block) { return block.id; }).join(','),
          [ids[1], ids[0], ids[2]].join(','),
          'The reordered sequence must survive storage.');
        equal(loaded.document.blocks.map(function (block) { return block.seq; }).join(','),
          '1,2,3');
        equal(win.Prompter.markdown.serializeDocument(loaded.document), 'B\nA\nC\n');
        return state.storage.deleteDocument(document.id);
      });
    });
  });

  test('preferences normalize unknown values', function () {
    return appReady().then(function (win) {
      var Model = win.Prompter.model;
      var preferences = Model.normalizePreferences({
        style: 'neon',
        theme: 'dim',
        defaultMarker: '####',
        showGrid: 'yes'
      });
      equal(preferences.style, 'apple');
      equal(preferences.theme, 'system');
      equal(preferences.defaultMarker, 'none');
      equal(preferences.showGrid, false);
    });
  });

  function render(results) {
    var list = document.getElementById('results');
    var summary = document.getElementById('summary');
    var passed = 0;
    var failed = 0;
    list.textContent = '';
    results.forEach(function (result) {
      var item = document.createElement('li');
      item.className = result.pass ? 'pass' : 'fail';
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = (result.pass ? 'PASS ' : 'FAIL ') + result.name;
      item.appendChild(name);
      if (result.error) {
        var detail = document.createElement('span');
        detail.className = 'detail';
        detail.textContent = result.error.stack || result.error.message || String(result.error);
        item.appendChild(detail);
      }
      list.appendChild(item);
      if (result.pass) {
        passed += 1;
      } else {
        failed += 1;
      }
    });
    var status = failed === 0 ? 'PASS' : 'FAIL';
    summary.setAttribute('data-status', status);
    summary.textContent = status + ' — ' + passed + ' passed, ' + failed + ' failed';
    document.body.setAttribute('data-status', status);
    if (window.console && window.console.log) {
      window.console.log('[Prompter harness] ' + summary.textContent);
    }
  }

  function run() {
    var results = [];
    var chain = Promise.resolve();
    tests.forEach(function (entry) {
      chain = chain.then(function () {
        return Promise.resolve().then(entry.fn).then(function () {
          results.push({ name: entry.name, pass: true });
        }).catch(function (error) {
          results.push({ name: entry.name, pass: false, error: error });
        });
      });
    });
    return chain.then(function () {
      render(results);
      return results;
    });
  }

  window.PrompterHarness = { run: run, tests: tests };
  var started = false;
  function start() {
    if (started) {
      return;
    }
    started = true;
    run();
  }
  if (document.readyState === 'complete') {
    start();
  } else {
    window.addEventListener('load', start);
  }
}());
