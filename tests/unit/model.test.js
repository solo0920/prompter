'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Model = require('../../assets/js/model.js');
const Utils = require('../../assets/js/utils.js');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('prompt document factory provides the documented defaults', function () {
  const document = Model.createPromptDocument();
  assert.match(document.id, UUID_PATTERN);
  assert.equal(document.title, 'Untitled');
  assert.equal(document.fileName, 'untitled.md');
  assert.deepEqual(document.blocks, []);
  assert.equal(document.leadingBlankLines, 0);
  assert.equal(document.trailingBlankLines, 0);
  assert.equal(document.trailingNewline, true);
  assert.ok(!isNaN(new Date(document.createdAt).getTime()));
  assert.ok(!isNaN(new Date(document.updatedAt).getTime()));
  assert.equal(Model.validateDocument(document).valid, true);
});

test('block factories provide defaults and preserve supplied geometry', function () {
  const text = Model.createTextBlock({ text: 'Hello', x: 12, y: 24, seq: 3, z: 4, blankLinesAfter: 2 });
  assert.equal(text.type, 'text');
  assert.equal(text.marker, 'none');
  assert.equal(text.x, 12);
  assert.equal(text.y, 24);
  assert.equal(text.seq, 3);
  assert.equal(text.z, 4);
  assert.equal(text.blankLinesAfter, 2);

  const image = Model.createImageBlock({ assetId: 'asset-1', alt: 'pixel' });
  assert.equal(image.type, 'image');
  assert.equal(image.assetId, 'asset-1');
  assert.equal(image.alt, 'pixel');
  assert.equal(Model.validateBlock(image).length, 0);
});

test('library, preferences, composer and asset factories provide defaults', function () {
  const library = Model.createLibrary();
  assert.equal(library.schemaVersion, 1);
  assert.deepEqual(library.documents, []);
  assert.ok(!isNaN(new Date(library.updatedAt).getTime()));

  const preferences = Model.createPreferences();
  assert.deepEqual(preferences, {
    schemaVersion: 1,
    style: 'apple',
    theme: 'system',
    defaultMarker: 'none',
    showGrid: false,
    lastDocumentId: null
  });

  const composer = Model.createComposer({ marker: '#', text: 'Draft' });
  assert.equal(composer.mode, 'initial');
  assert.equal(composer.anchorBlockId, null);
  assert.equal(composer.marker, '#');
  assert.equal(composer.text, 'Draft');

  const asset = Model.createImageAsset({
    documentId: 'doc-1',
    fileName: 'pixel.png',
    originalName: 'pixel.png',
    mimeType: 'image/png',
    width: 1,
    height: 1,
    size: 69
  });
  assert.match(asset.id, UUID_PATTERN);
  assert.equal(Model.validateImageAsset(asset).valid, true);
});

test('generated ids are v4 UUIDs and unique', function () {
  const ids = new Set();
  for (let index = 0; index < 250; index += 1) {
    const id = Utils.randomUUID();
    assert.match(id, UUID_PATTERN);
    ids.add(id);
  }
  assert.equal(ids.size, 250);
});

test('title validation accepts 200 characters and rejects 201', function () {
  const base = Model.createPromptDocument();
  const atLimit = Object.assign({}, base, { title: '字'.repeat(200) });
  const overLimit = Object.assign({}, base, { title: '字'.repeat(201) });
  assert.equal(Model.validateDocument(atLimit).valid, true);
  assert.equal(Model.validateDocument(overLimit).valid, false);
  assert.ok(Model.validateDocument(overLimit).errors.some(function (error) {
    return error.indexOf('200') !== -1;
  }));

  const emojiAtLimit = Object.assign({}, base, { title: '🚀'.repeat(200) });
  assert.equal(Model.validateDocument(emojiAtLimit).valid, true);
});

test('block validation rejects invalid geometry, markers, MIME types and duplicates', function () {
  const document = Model.createPromptDocument({
    blocks: [
      Model.createTextBlock({ id: 'block-1', text: 'One' }),
      Model.createTextBlock({ id: 'block-1', text: 'Duplicate' })
    ]
  });
  const duplicate = Model.validateDocument(document);
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.errors.some(function (error) { return error.indexOf('duplicate') !== -1; }));

  const negative = Model.createTextBlock({ id: 'block-2', text: 'Negative', x: -1 });
  assert.equal(Model.validateBlock(negative).length > 0, true);

  const infinite = Model.createTextBlock({ id: 'block-3', text: 'Infinite', y: Infinity });
  assert.equal(Model.validateBlock(infinite).length > 0, true);

  const badBlanks = Model.createTextBlock({ id: 'block-4', text: 'Blanks', blankLinesAfter: -1 });
  assert.equal(Model.validateBlock(badBlanks).length > 0, true);

  const badMarker = Object.assign(
    Model.createTextBlock({ id: 'block-5', text: 'Marker' }),
    { marker: '####' }
  );
  assert.equal(Model.validateBlock(badMarker).length > 0, true);

  const emptyText = Model.createTextBlock({ id: 'block-6', text: '   ' });
  assert.equal(Model.validateBlock(emptyText).length > 0, true);

  const badAsset = Model.createImageAsset({
    documentId: 'doc-1',
    fileName: 'pixel.svg',
    originalName: 'pixel.svg',
    mimeType: 'image/svg+xml',
    width: 10,
    height: 10,
    size: 100
  });
  assert.equal(Model.validateImageAsset(badAsset).valid, false);

  const badName = Model.createImageAsset({
    documentId: 'doc-1',
    fileName: '../pixel.png',
    originalName: 'pixel.png',
    mimeType: 'image/png',
    width: 1,
    height: 1,
    size: 69
  });
  assert.equal(Model.validateImageAsset(badName).valid, false);
});

test('fileName validation rejects traversal and accepts .md basenames', function () {
  const base = Model.createPromptDocument();
  const traversal = Object.assign({}, base, { fileName: '../escape.md' });
  assert.equal(Model.validateDocument(traversal).valid, false);
  const noExtension = Object.assign({}, base, { fileName: 'notes' });
  assert.equal(Model.validateDocument(noExtension).valid, false);
});

test('preferences normalize invalid values and validate valid values', function () {
  const normalized = Model.normalizePreferences({
    style: 'neon',
    theme: 'dim',
    defaultMarker: '####',
    showGrid: 'yes',
    lastDocumentId: 42
  });
  assert.equal(normalized.style, 'apple');
  assert.equal(normalized.theme, 'system');
  assert.equal(normalized.defaultMarker, 'none');
  assert.equal(normalized.showGrid, false);
  assert.equal(normalized.lastDocumentId, null);
  assert.equal(Model.validatePreferences(normalized).valid, true);

  const invalid = {
    schemaVersion: 2,
    style: 'neon',
    theme: 'dim',
    defaultMarker: '####',
    showGrid: 'yes',
    lastDocumentId: 42
  };
  assert.equal(Model.validatePreferences(invalid).valid, false);
});

test('dirty tracker reports transitions', function () {
  const changes = [];
  const tracker = Model.createDirtyTracker(function (dirty) { changes.push(dirty); });
  assert.equal(tracker.dirty, false);
  tracker.markDirty();
  assert.equal(tracker.dirty, true);
  tracker.markDirty();
  assert.deepEqual(changes, [true]);
  tracker.markClean();
  assert.equal(tracker.dirty, false);
  assert.deepEqual(changes, [true, false]);
});

test('removing a block transfers its blank lines to the previous reading-order block', function () {
  const document = Model.createPromptDocument({
    blocks: [
      Model.createTextBlock({ id: 'a', text: 'A', y: 0, seq: 1, blankLinesAfter: 0 }),
      Model.createTextBlock({ id: 'b', text: 'B', y: 48, seq: 2, blankLinesAfter: 3 }),
      Model.createTextBlock({ id: 'c', text: 'C', y: 96, seq: 3, blankLinesAfter: 0 })
    ]
  });
  const removed = Model.removeBlock(document, 'b');
  assert.equal(removed.id, 'b');
  assert.equal(document.blocks.length, 2);
  assert.equal(document.blocks[0].blankLinesAfter, 3);
  assert.equal(document.blocks[1].id, 'c');
});

test('removing the first block transfers blank lines to the document', function () {
  const document = Model.createPromptDocument({
    leadingBlankLines: 1,
    blocks: [
      Model.createTextBlock({ id: 'a', text: 'A', y: 0, seq: 1, blankLinesAfter: 2 }),
      Model.createTextBlock({ id: 'b', text: 'B', y: 48, seq: 2 })
    ]
  });
  Model.removeBlock(document, 'a');
  assert.equal(document.leadingBlankLines, 3);
  assert.equal(document.blocks.length, 1);
});

test('empty documents are valid and Save As clones ids', function () {
  const document = Model.createPromptDocument({ title: 'Original', blocks: [] });
  assert.equal(Model.validateDocument(document).valid, true);

  const withBlocks = Model.createPromptDocument({
    title: 'Original',
    blocks: [Model.createTextBlock({ id: 'a', text: 'A' })]
  });
  const copy = Model.cloneDocumentForSaveAs(withBlocks, { title: 'Copy' });
  assert.notEqual(copy.id, withBlocks.id);
  assert.notEqual(copy.blocks[0].id, withBlocks.blocks[0].id);
  assert.equal(copy.title, 'Copy');
  assert.equal(withBlocks.title, 'Original');
  assert.equal(copy.blocks[0].text, 'A');
});

test('nextSeq and nextZ use the highest existing values', function () {
  const document = Model.createPromptDocument({
    blocks: [
      Model.createTextBlock({ id: 'a', text: 'A', seq: 2, z: 5 }),
      Model.createTextBlock({ id: 'b', text: 'B', seq: 7, z: 1 })
    ]
  });
  assert.equal(Model.nextSeq(document), 8);
  assert.equal(Model.nextZ(document), 6);
  assert.equal(Model.createPromptDocument().nextSeq, undefined);
  assert.equal(Model.nextSeq(Model.createPromptDocument()), 1);
});
