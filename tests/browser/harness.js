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

  function addBelow(win, anchorElement, text) {
    var plus = anchorElement.querySelector('.block-plus');
    assert(plus, 'The block "+" control is missing.');
    plus.click();
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
      equal(composerInput(win), null);
      assert(state.dirty, 'Committing a block must mark the document dirty.');
      assert(blockById(win, state.document.blocks[0].id).classList.contains('selected'),
        'The committed block should be selected.');
    });
  });

  test('US1 the Marker menu applies a selected Marker', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      var markerButton = win.document.querySelector('#canvas .composer-marker');
      markerButton.click();
      var menu = win.document.querySelector('.marker-menu');
      assert(menu, 'The Marker menu did not open.');
      var option = menu.querySelector('[data-marker="1."]');
      assert(option, 'The ordered-list Marker option is missing.');
      option.click();
      equal(win.document.querySelector('.marker-menu'), null);
      equal(markerButton.getAttribute('aria-label'), '選擇標記，目前為1.');
      var input = composerInput(win);
      setValue(win, input, '第一項');
      press(win, input, 'Enter');
      equal(state.document.blocks[0].marker, '1.');
      equal(state.document.blocks[0].text, '第一項');
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
      equal(blockById(win, ordered[1].id).classList.contains('selected'), true);
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

  test('US1 keyboard movement uses 24 px and 1 px steps with announcements', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      var block = commitComposer(win, 'Move me');
      var x = state.document.blocks[0].x;
      var y = state.document.blocks[0].y;
      var element = blockById(win, state.document.blocks[0].id);

      press(win, element, 'ArrowDown', { altKey: true });
      equal(state.document.blocks[0].y, y + 24);
      var announcement = byId(win, 'move-announcer').textContent;
      equal(announcement, '區塊已移動到第 3 列，第 1 欄。');

      element = blockById(win, state.document.blocks[0].id);
      press(win, element, 'ArrowRight', { altKey: true, shiftKey: true });
      equal(state.document.blocks[0].x, x + 1);
    });
  });

  test('US1 pointer dragging clamps the full box and only dirties after movement', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      commitComposer(win, 'Drag me');
      var canvas = byId(win, 'canvas');
      var element = blocks(win)[0];
      state.dirty = false;

      function pointer(elementNode, type, x, y) {
        var event = new win.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 7,
          pointerType: 'mouse',
          button: 0,
          clientX: x,
          clientY: y
        });
        elementNode.dispatchEvent(event);
      }

      var rect = element.getBoundingClientRect();
      var content = element.querySelector('.block-content');
      pointer(content, 'pointerdown', rect.left + 10, rect.top + 10);
      win.dispatchEvent(new win.PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', button: 0,
        clientX: rect.left + 10, clientY: rect.top + 10
      }));
      equal(state.dirty, false, 'A click without movement must not mark the document dirty.');

      var block = state.document.blocks[0];
      pointer(content, 'pointerdown', rect.left + 10, rect.top + 10);
      win.dispatchEvent(new win.PointerEvent('pointermove', {
        bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', button: 0,
        clientX: rect.left - 800, clientY: rect.top - 800
      }));
      win.dispatchEvent(new win.PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', button: 0,
        clientX: rect.left - 800, clientY: rect.top - 800
      }));
      equal(block.x, 0);
      equal(block.y, 0);
      equal(state.dirty, true);

      element = blockById(win, block.id);
      rect = element.getBoundingClientRect();
      content = element.querySelector('.block-content');
      var maxX = canvas.clientWidth - element.offsetWidth;
      var maxY = canvas.clientHeight - element.offsetHeight;
      pointer(content, 'pointerdown', rect.left + 10, rect.top + 10);
      win.dispatchEvent(new win.PointerEvent('pointermove', {
        bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', button: 0,
        clientX: rect.left + 5000, clientY: rect.top + 5000
      }));
      win.dispatchEvent(new win.PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', button: 0,
        clientX: rect.left + 5000, clientY: rect.top + 5000
      }));
      equal(block.x, maxX);
      equal(block.y, maxY);
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

  test('US2 the unsaved-changes guard can cancel or discard a pending New', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = freshDocument(win);
      commitComposer(win, '未儲存');
      var originalId = state.document.id;

      var pending = app.requestNewDocument();
      return waitFor(function () {
        return byId(win, 'unsaved-dialog').open;
      }, 5000).then(function () {
        byId(win, 'unsaved-cancel').click();
        return pending;
      }).then(function (proceed) {
        equal(proceed, false);
        equal(state.document.id, originalId);
        equal(state.dirty, true);
        equal(state.document.blocks.length, 1);

        var next = app.requestNewDocument();
        return waitFor(function () {
          return byId(win, 'unsaved-dialog').open;
        }, 5000).then(function () {
          byId(win, 'unsaved-discard').click();
          return next;
        });
      }).then(function (proceed) {
        equal(proceed, true);
        assert(state.document, 'New should create a document after Discard.');
        equal(state.document.blocks.length, 0);
        equal(state.dirty, false);
        equal(byId(win, 'document-status').textContent, '新文件');
        assert(composerInput(win), 'The blank document composer is missing.');
      });
    });
  });

  test('US2 canceling Open from the unsaved guard keeps the document', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = freshDocument(win);
      commitComposer(win, '保持開啟');
      var originalId = state.document.id;
      var pending = app.requestOpenPicker();
      return waitFor(function () {
        return byId(win, 'unsaved-dialog').open;
      }, 5000).then(function () {
        byId(win, 'unsaved-cancel').click();
        return pending;
      }).then(function (result) {
        equal(result.ok, false);
        equal(result.canceled, true);
        equal(state.document.id, originalId);
        equal(state.dirty, true);
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

  test('US2 the unsaved guard saves before continuing to a new document', function () {
    return appReady().then(function (win) {
      var app = win.Prompter.app;
      var state = freshDocument(win);
      commitComposer(win, '儲存後新增');
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

      var pending = app.requestNewDocument();
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
        equal(state.document.id !== originalId, true);
        equal(state.document.title, 'Untitled');
        equal(state.document.blocks.length, 0);
        equal(state.dirty, false);
        equal(byId(win, 'unsaved-dialog').open, false);
        return state.storage.getDocument(originalId);
      }).then(function (loaded) {
        assert(loaded && loaded.document, 'The saved document must stay in the library.');
        equal(loaded.document.blocks[0].text, '儲存後新增');
        equal(loaded.document.fileName, 'guard-save.md');
        restore();
        return state.storage.deleteDocument(originalId);
      }, restoreOnError);
    });
  });

  test('US2 a failed guarded save keeps the unsaved dialog and current content', function () {
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

      var pending = app.requestNewDocument();
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
        equal(byId(win, 'document-status').textContent, '尚未儲存的變更');
        byId(win, 'unsaved-cancel').click();
        return pending;
      }).then(function (proceed) {
        equal(proceed, false);
        equal(state.document.id, originalId);
        equal(state.dirty, true);
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

  test('storage saves and reloads a document without leaking session state', function () {
    return appReady().then(function (win) {
      var state = freshDocument(win);
      commitComposer(win, 'Storage round-trip');
      var document = win.Prompter.utils.deepClone(state.document);
      return state.storage.saveDocument(document, state.assets).then(function () {
        return state.storage.getDocument(document.id);
      }).then(function (loaded) {
        assert(loaded, 'The saved document could not be reloaded.');
        equal(loaded.document.title, 'Untitled');
        equal(loaded.document.blocks.length, 1);
        equal(loaded.document.blocks[0].text, 'Storage round-trip');
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
      equal(preferences.style, 'paper');
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
