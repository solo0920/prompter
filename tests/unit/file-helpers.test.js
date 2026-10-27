'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Files = require('../../assets/js/files.js');
const Markdown = require('../../assets/js/markdown.js');
const Model = require('../../assets/js/model.js');
const Utils = require('../../assets/js/utils.js');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const IMAGES = path.join(FIXTURES, 'images');

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name));
}

function fixtureFile(name) {
  const bytes = fs.readFileSync(path.join(IMAGES, name));
  return {
    name: name,
    type: Utils.extensionToMime(Utils.splitExtension(name).extension),
    arrayBuffer: function () {
      return Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    }
  };
}

test('sanitizes file names without traversal or reserved characters', function () {
  assert.equal(Utils.sanitizeFileName('../../etc/passwd'), 'etcpasswd');
  assert.equal(Utils.sanitizeFileName('My Prompt.md'), 'My-Prompt.md');
  assert.equal(Utils.sanitizeFileName('..'), 'untitled');
  assert.equal(Utils.sanitizeFileName('   '), 'untitled');
  assert.equal(Utils.sanitizeFileName('a/b:c*?"<>|d'), 'abcd');
  assert.equal(Utils.sanitizeFileName('.hidden'), 'hidden');
  assert.equal(Utils.isSafeFileName('pixel.png'), true);
  assert.equal(Utils.isSafeFileName('../pixel.png'), false);
  assert.equal(Utils.isSafeFileName('pixel/../pixel.png'), false);
  assert.equal(Utils.isSafeFileName('..'), false);
  assert.equal(Utils.isSafeRelativeImageName('pixel.png'), true);
  assert.equal(Utils.isSafeRelativeImageName('../pixel.png'), false);
  assert.equal(Utils.isSafeRelativeImageName('https://example.com/pixel.png'), false);
});

test('adds the Markdown extension once and falls back safely', function () {
  assert.equal(Utils.ensureMarkdownExtension('Prompt'), 'Prompt.md');
  assert.equal(Utils.ensureMarkdownExtension('Prompt.md'), 'Prompt.md');
  assert.equal(Utils.ensureMarkdownExtension('Prompt.MD'), 'Prompt.md');
  assert.equal(Utils.ensureMarkdownExtension('..'), 'untitled.md');
  assert.equal(Utils.deriveTitleFromFileName('/tmp/我的提示詞.md'), '我的提示詞');
  assert.equal(Utils.deriveTitleFromFileName('.md'), 'Untitled');
});

test('unique image names append -2 and -3 before the extension', function () {
  assert.equal(Utils.uniqueFileName('pixel.png', ['pixel.png']), 'pixel-2.png');
  assert.equal(Utils.uniqueFileName('pixel.png', ['pixel.png', 'pixel-2.png']), 'pixel-3.png');
  assert.equal(Utils.uniqueFileName('pixel.png', ['PIXEL.PNG']), 'pixel-2.png');
  assert.equal(Files.imageFileNameFor('images/pixel.png', 'pixel.png', 'image/png', []), 'pixel.png');
  assert.equal(Files.imageFileNameFor('images/pixel.png', 'pixel.png', 'image/png', ['pixel.png']), 'pixel-2.png');
  assert.equal(Files.imageFileNameFor('my photo.png', 'my photo.png', 'image/png', []), 'my-photo.png');
  assert.equal(Files.imageFileNameFor('', 'image-01', 'image/png', []), 'image-01.png');
});

test('supports only the four image MIME types', function () {
  assert.equal(Utils.isSupportedImageMime('image/png'), true);
  assert.equal(Utils.isSupportedImageMime('image/jpeg'), true);
  assert.equal(Utils.isSupportedImageMime('image/gif'), true);
  assert.equal(Utils.isSupportedImageMime('image/webp'), true);
  assert.equal(Utils.isSupportedImageMime('image/svg+xml'), false);
  assert.equal(Utils.isSupportedImageMime('application/pdf'), false);
  assert.equal(Utils.mimeToExtension('image/jpeg'), 'jpg');
  assert.equal(Utils.extensionToMime('jpeg'), 'image/jpeg');
});

test('reads natural dimensions from each fixture format', function () {
  ['pixel.png', 'pixel.jpg', 'pixel.gif', 'pixel.webp'].forEach(function (name) {
    const bytes = new Uint8Array(readFixture(path.join('images', name)));
    const inspected = Files.inspectImageBytes(bytes, '');
    assert.equal(inspected.valid, true, name);
    assert.equal(inspected.width, 1, name);
    assert.equal(inspected.height, 1, name);
    assert.equal(inspected.size, bytes.byteLength, name);
  });
  assert.equal(Files.sniffMimeType(new Uint8Array(readFixture('images/pixel.png'))), 'image/png');
  assert.equal(Files.sniffMimeType(new Uint8Array(readFixture('images/pixel.jpg'))), 'image/jpeg');
  assert.equal(Files.sniffMimeType(new Uint8Array(readFixture('images/pixel.gif'))), 'image/gif');
  assert.equal(Files.sniffMimeType(new Uint8Array(readFixture('images/pixel.webp'))), 'image/webp');
});

test('rejects unsupported, corrupt and SVG data', function () {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.equal(Files.inspectImageBytes(svg).valid, false);
  assert.equal(Files.inspectImageBytes(new Uint8Array([1, 2, 3, 4])).valid, false);
  assert.equal(Files.inspectImageBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])).valid, false);
});

test('creates assets with safe unique names and default alt names', function () {
  const bytes = new Uint8Array(readFixture('images/pixel.png'));
  const asset = Files.createAssetFromBytes({
    bytes: bytes,
    originalName: 'pixel.png',
    documentId: 'doc-1',
    usedNames: []
  });
  assert.equal(asset.fileName, 'pixel.png');
  assert.equal(asset.originalName, 'pixel.png');
  assert.equal(asset.mimeType, 'image/png');
  assert.equal(asset.width, 1);
  assert.equal(asset.height, 1);
  assert.equal(asset.size, bytes.byteLength);
  assert.equal(Model.validateImageAsset(asset).valid, true);

  const second = Files.createAssetFromBytes({
    bytes: bytes,
    originalName: 'pixel.png',
    documentId: 'doc-1',
    usedNames: ['pixel.png']
  });
  assert.equal(second.fileName, 'pixel-2.png');
});

test('decodes data URLs into image bytes', function () {
  const source = readFixture('images/pixel.png');
  const dataUrl = 'data:image/png;base64,' + Utils.bytesToBase64(new Uint8Array(source));
  const decoded = Files.decodeDataUrl(dataUrl);
  assert.ok(decoded);
  assert.equal(decoded.mimeType, 'image/png');
  assert.equal(Files.inspectImageBytes(decoded.bytes).width, 1);
  assert.equal(Files.decodeDataUrl('not-a-data-url'), null);
  assert.equal(Files.decodeDataUrl('data:image/png;base64,%%%'), null);
});

test('matches relative references by path, basename, URL encoding and case', function () {
  const file = fixtureFile('pixel.png');
  assert.equal(Files.matchImageReference('images/pixel.png', [file]), file);
  assert.equal(Files.matchImageReference('./pixel.png', [file]), file);
  assert.equal(Files.matchImageReference('images/pixel%2Epng', [file]), file);
  assert.equal(Files.matchImageReference('PIXEL.PNG', [file]), file);
  assert.equal(Files.matchImageReference('https://example.com/pixel.png', [file]), null);
  assert.equal(Files.matchImageReference('/absolute/pixel.png', [file]), null);
  assert.equal(Files.matchImageReference('file:///pixel.png', [file]), null);
});

test('parses a Markdown fixture with a selected image into source-order blocks', async function () {
  const source = fs.readFileSync(path.join(FIXTURES, 'images.md'), 'utf8');
  const expected = fs.readFileSync(path.join(FIXTURES, 'images.expected.md'), 'utf8');
  const parsed = await Files.parseMarkdownDocument(source, {
    fileName: 'images.md',
    imageFiles: [fixtureFile('pixel.png')]
  });
  assert.equal(parsed.document.title, 'images');
  assert.equal(parsed.document.fileName, 'images.md');
  assert.equal(parsed.assets.length, 1);
  assert.equal(parsed.assets[0].fileName, 'pixel.png');
  assert.equal(parsed.document.blocks.length, 4);
  assert.equal(parsed.document.blocks[0].type, 'text');
  assert.equal(parsed.document.blocks[0].marker, '#');
  assert.equal(parsed.document.blocks[0].blankLinesAfter, 1);
  assert.equal(parsed.document.blocks[1].type, 'image');
  assert.equal(parsed.document.blocks[1].alt, '像素');
  assert.equal(parsed.document.blocks[2].type, 'text');
  assert.equal(parsed.document.blocks[2].text, '![未選圖片](not-selected.png)');
  assert.equal(parsed.document.blocks[3].text, '![遠端](https://example.com/remote.png)');
  assert.ok(parsed.document.blocks[0].y < parsed.document.blocks[1].y);
  assert.ok(parsed.document.blocks[1].y < parsed.document.blocks[2].y);
  assert.equal(Markdown.serializeDocument(parsed.document, { assets: parsed.assets }), expected);
});

test('decodes data-URL images during parse and emits a relative reference', async function () {
  const source = fs.readFileSync(path.join(FIXTURES, 'data-url.md'), 'utf8');
  const expected = fs.readFileSync(path.join(FIXTURES, 'data-url.expected.md'), 'utf8');
  const parsed = await Files.parseMarkdownDocument(source, { fileName: 'data-url.md' });
  assert.equal(parsed.assets.length, 1);
  assert.equal(parsed.assets[0].fileName, 'image-01.png');
  assert.equal(parsed.document.blocks[0].type, 'image');
  assert.equal(parsed.document.blocks[0].alt, 'pixel');
  assert.equal(Markdown.serializeDocument(parsed.document, { assets: parsed.assets }), expected);
});

test('keeps remote, absolute, file and unmatched references as literal text', async function () {
  const source = [
    '![remote](https://example.com/remote.png)',
    '![absolute](/images/absolute.png)',
    '![file](file:///tmp/file.png)',
    '![missing](missing.png)',
    ''
  ].join('\n');
  const parsed = await Files.parseMarkdownDocument(source, { fileName: 'mixed.md' });
  assert.equal(parsed.assets.length, 0);
  assert.equal(parsed.document.blocks.length, 4);
  parsed.document.blocks.forEach(function (block) {
    assert.equal(block.type, 'text');
  });
  assert.equal(Markdown.serializeDocument(parsed.document, { assets: [] }), source);
});

test('rejects an archived SVG during asset creation', function () {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.throws(function () {
    Files.createAssetFromBytes({
      bytes: svg,
      originalName: 'icon.svg',
      documentId: 'doc-1',
      usedNames: []
    });
  }, function (error) {
    return error.code === 'UNSUPPORTED_IMAGE';
  });
});

test('serializes only referenced assets and reports missing images', function () {
  const document = Model.createPromptDocument({
    blocks: [
      Model.createTextBlock({ id: 'a', text: 'Text', seq: 1 }),
      Model.createImageBlock({ id: 'b', assetId: 'asset-1', alt: 'pixel', y: 48, seq: 2 }),
      Model.createImageBlock({ id: 'c', assetId: 'missing', alt: 'lost', y: 96, seq: 3 })
    ]
  });
  const asset = {
    id: 'asset-1',
    documentId: document.id,
    fileName: 'pixel.png',
    originalName: 'pixel.png',
    mimeType: 'image/png',
    width: 1,
    height: 1,
    size: 69,
    createdAt: Utils.nowIso(),
    bytes: new Uint8Array(readFixture('images/pixel.png'))
  };
  const result = Files.serializeDocumentWithAssets(document, [asset]);
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].fileName, 'pixel.png');
  assert.deepEqual(result.missingImages, ['lost']);
  assert.match(result.markdown, /!\[pixel\]\(pixel\.png\)/);
  assert.match(result.markdown, /!\[lost\]\(missing-image\.png\)/);
});
