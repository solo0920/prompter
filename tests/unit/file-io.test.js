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

function readText(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

function fixtureFile(name, asName, type) {
  const bytes = fs.readFileSync(path.join(IMAGES, name));
  return {
    name: asName || name,
    type: type === undefined ? Utils.extensionToMime(Utils.splitExtension(name).extension) : type,
    arrayBuffer: function () {
      return Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    }
  };
}

function markdownFile(name, source) {
  const bytes = Buffer.from(source, 'utf8');
  return {
    name: name,
    type: 'text/markdown',
    arrayBuffer: function () {
      return Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    },
    text: function () {
      return Promise.resolve(source);
    }
  };
}

function imageAsset(name, bytes, documentId) {
  return Files.createAssetFromBytes({
    bytes: new Uint8Array(bytes),
    originalName: name,
    documentId: documentId || 'doc-1',
    usedNames: []
  });
}

test('Open selection requires exactly one Markdown file and classifies images', function () {
  const markdown = markdownFile('prompt.md', '# Prompt\n');
  const image = fixtureFile('pixel.png');
  const unsupported = fixtureFile('vector.svg', 'vector.svg', 'image/svg+xml');
  const classified = Files.analyzeOpenSelection([markdown, image, unsupported]);
  assert.equal(classified.markdownFiles.length, 1);
  assert.equal(classified.markdownFiles[0], markdown);
  assert.equal(classified.imageFiles.length, 1);
  assert.equal(classified.imageFiles[0], image);
  assert.equal(classified.ignoredFiles.length, 1);
  assert.equal(classified.ignoredFiles[0], unsupported);
  assert.ok(classified.warnings.some(function (warning) {
    return warning.indexOf('vector.svg') !== -1;
  }));

  const empty = Files.analyzeOpenSelection([image]);
  assert.equal(empty.errors.length, 1);
  assert.equal(empty.errors[0].code, 'NO_MARKDOWN');

  const multiple = Files.analyzeOpenSelection([
    markdown,
    markdownFile('second.markdown', '# Second\n')
  ]);
  assert.equal(multiple.errors.length, 1);
  assert.equal(multiple.errors[0].code, 'MULTIPLE_MARKDOWN');
});

test('Open round-trips every fixture and keeps source-order placement', async function () {
  const fixtures = [
    ['markers.md', 'markers.expected.md', []],
    ['blank-lines.md', 'blank-lines.expected.md', []],
    ['no-final-newline.md', 'no-final-newline.expected.md', []],
    ['crlf-bom.md', 'crlf-bom.expected.md', []],
    ['mixed.md', 'mixed.expected.md', [fixtureFile('pixel.png')]]
  ];
  for (const entry of fixtures) {
    const parsed = await Files.parseMarkdownDocument(readText(entry[0]), {
      fileName: entry[0],
      imageFiles: entry[2]
    });
    const serialized = Markdown.serializeDocument(parsed.document, { assets: parsed.assets });
    let expected = readText(entry[1]);
    if (entry[0] === 'mixed.md') {
      expected = expected.replace(
        /!\[內嵌\]\(data:image\/png;base64,[^)]+\)/,
        '![內嵌](image-01.png)'
      );
    }
    assert.equal(serialized, expected, entry[0]);
    const blocks = parsed.document.blocks;
    blocks.forEach(function (block) {
      assert.equal(block.x, Files.COLUMN_X, entry[0] + ' x');
    });
    for (let i = 1; i < blocks.length; i += 1) {
      assert.ok(blocks[i].y > blocks[i - 1].y, entry[0] + ' y order');
    }
    assert.equal(Model.validateDocument(parsed.document).valid, true, entry[0]);
  }
});

test('Open resolves ./ and URL-encoded image references and leaves remote/absolute text', async function () {
  const source = [
    '![one](./images/pixel.png)',
    '![two](images/pixel%2Epng)',
    '![absolute](/tmp/pixel.png)',
    '![remote](https://example.com/pixel.png)',
    '![file](file:///tmp/pixel.png)',
    '![missing](not-selected.png)',
    ''
  ].join('\n');
  const parsed = await Files.parseMarkdownDocument(source, {
    fileName: 'references.md',
    imageFiles: [fixtureFile('pixel.png')]
  });
  assert.equal(parsed.assets.length, 2);
  assert.equal(parsed.assets[0].fileName, 'pixel.png');
  assert.equal(parsed.assets[1].fileName, 'pixel-2.png');
  assert.equal(parsed.document.blocks[0].type, 'image');
  assert.equal(parsed.document.blocks[1].type, 'image');
  assert.equal(parsed.document.blocks[2].type, 'text');
  assert.equal(parsed.document.blocks[2].text, '![absolute](/tmp/pixel.png)');
  assert.equal(parsed.document.blocks[3].text, '![remote](https://example.com/pixel.png)');
  assert.equal(parsed.document.blocks[4].text, '![file](file:///tmp/pixel.png)');
  assert.equal(parsed.document.blocks[5].text, '![missing](not-selected.png)');
  assert.ok(parsed.warnings.some(function (warning) {
    return warning.indexOf('not-selected.png') !== -1;
  }));
});

test('Open decodes data-URL images and rejects unsupported embedded data', async function () {
  const source = readText('data-url.md');
  const parsed = await Files.parseMarkdownDocument(source, { fileName: 'data-url.md' });
  assert.equal(parsed.assets.length, 1);
  assert.equal(parsed.assets[0].fileName, 'image-01.png');
  assert.equal(parsed.document.blocks[0].type, 'image');
  assert.equal(parsed.assets[0].mimeType, 'image/png');

  const bad = await Files.parseMarkdownDocument(
    '![bad](data:image/svg+xml;base64,PHN2Zy8+)\n',
    { fileName: 'bad.md' }
  );
  assert.equal(bad.assets.length, 0);
  assert.equal(bad.document.blocks[0].text, '![bad](data:image/svg+xml;base64,PHN2Zy8+)');
  assert.ok(bad.warnings.length > 0);
});

test('Open titles keep the original file name wording while saving safely', async function () {
  const parsed = await Files.parseMarkdownDocument('# 標題\n', {
    fileName: '我的 提示詞.markdown'
  });
  assert.equal(parsed.document.title, '我的 提示詞');
  assert.equal(parsed.document.fileName, '我的-提示詞.md');
});

test('file naming sanitizes Markdown and image names without traversal', function () {
  assert.equal(Utils.ensureMarkdownExtension('我的 提示詞'), '我的-提示詞.md');
  assert.equal(Utils.ensureMarkdownExtension('Prompt.MD'), 'Prompt.md');
  assert.equal(Utils.ensureMarkdownExtension('../../etc/passwd'), 'etcpasswd.md');
  assert.equal(Utils.ensureMarkdownExtension('..'), 'untitled.md');
  assert.equal(Files.markdownFileNameFor(''), 'untitled.md');
  assert.equal(Files.markdownFileNameFor('a/b:c*?"<>|d'), 'abcd.md');
  assert.equal(Files.imageFileNameFor('../../secret.png', 'secret.png', 'image/png', []), 'secret.png');
  assert.equal(Files.imageFileNameFor('', 'photo', 'image/jpeg', []), 'photo.jpg');
});

test('save plans use canonical Markdown, unique images and a safe file name', async function () {
  const png = fs.readFileSync(path.join(IMAGES, 'pixel.png'));
  const jpg = fs.readFileSync(path.join(IMAGES, 'pixel.jpg'));
  const document = Model.createPromptDocument({
    id: 'doc-save',
    title: 'Saved prompt',
    fileName: 'Saved-prompt.md',
    blocks: [
      Model.createTextBlock({ id: 'b1', text: 'Hello', y: 0, seq: 1, blankLinesAfter: 1 }),
      Model.createImageBlock({
        id: 'b2',
        assetId: 'asset-a',
        alt: 'pixel',
        y: 24,
        seq: 2
      }),
      Model.createImageBlock({
        id: 'b3',
        assetId: 'asset-b',
        alt: 'photo',
        y: 48,
        seq: 3
      })
    ]
  });
  const assets = [
    imageAsset('pixel.png', png, 'doc-save'),
    imageAsset('photo.jpg', jpg, 'doc-save')
  ];
  assets[0].id = 'asset-a';
  assets[1].id = 'asset-b';
  const plan = await Files.buildSavePlan(document, assets, { fileName: 'My Prompt' });
  assert.equal(plan.fileName, 'My-Prompt.md');
  assert.equal(plan.markdown, Markdown.serializeDocument(document, { assets: assets }));
  assert.deepEqual(plan.images.map(function (image) { return image.fileName; }),
    ['pixel.png', 'photo.jpg']);
  assert.ok(plan.images[0].blob);
  assert.equal(plan.images[0].blob.type, 'image/png');
  assert.equal(plan.missingImages.length, 0);
  assert.deepEqual(plan.outputNames,
    ['pixel.png', 'photo.jpg', 'My-Prompt.md']);
});

test('save plans retain missing image references and report them', async function () {
  const document = Model.createPromptDocument({
    id: 'doc-missing',
    fileName: 'missing.md',
    blocks: [
      Model.createImageBlock({
        id: 'b1',
        assetId: 'gone',
        alt: 'gone',
        y: 0,
        seq: 1
      })
    ]
  });
  const plan = await Files.buildSavePlan(document, [], { fileName: 'missing.md' });
  assert.equal(plan.images.length, 0);
  assert.equal(plan.missingImages.length, 1);
  assert.match(plan.markdown, /!\[gone\]\(missing-image\.png\)/);
});

test('conflict checks never ask to overwrite files the document owns', function () {
  assert.deepEqual(
    Files.conflictingFileNames(
      ['prompt.md', 'pixel.png', 'new.png', 'unrelated.txt'],
      ['prompt.md', 'PIXEL.PNG'],
      ['prompt.md', 'pixel.png', 'new.png']
    ),
    ['new.png']
  );
  assert.deepEqual(
    Files.conflictingFileNames(['a.md', 'b.md'], [], ['a.md', 'b.md']),
    ['a.md', 'b.md']
  );
});

test('Save As clones the document, blocks and assets with new ids', function () {
  const document = Model.createPromptDocument({
    id: 'original-doc',
    title: 'Original',
    fileName: 'original.md',
    blocks: [
      Model.createTextBlock({ id: 'text-1', text: 'Text', marker: '#', y: 0, seq: 1 }),
      Model.createImageBlock({ id: 'image-1', assetId: 'asset-1', alt: 'pixel', y: 24, seq: 2 })
    ]
  });
  const assets = [{
    id: 'asset-1',
    documentId: 'original-doc',
    fileName: 'pixel.png',
    originalName: 'pixel.png',
    mimeType: 'image/png',
    width: 1,
    height: 1,
    size: 1,
    createdAt: Utils.nowIso()
  }];
  const clone = Files.cloneDocumentWithAssets(document, assets, {
    fileName: 'copy.md'
  });
  assert.notEqual(clone.document.id, document.id);
  assert.notEqual(clone.document.blocks[0].id, document.blocks[0].id);
  assert.notEqual(clone.document.blocks[1].id, document.blocks[1].id);
  assert.equal(clone.document.title, 'Original');
  assert.equal(clone.document.fileName, 'copy.md');
  assert.equal(clone.assets.length, 1);
  assert.notEqual(clone.assets[0].id, assets[0].id);
  assert.equal(clone.assets[0].documentId, clone.document.id);
  assert.equal(clone.document.blocks[1].assetId, clone.assets[0].id);
  assert.equal(document.blocks[1].assetId, 'asset-1');
  assert.equal(assets[0].documentId, 'original-doc');
});

test('default save names follow the title or keep an existing file name', function () {
  assert.equal(Files.defaultSaveFileName(Model.createPromptDocument({
    title: 'Untitled',
    fileName: 'untitled.md'
  })), 'untitled.md');
  assert.equal(Files.defaultSaveFileName(Model.createPromptDocument({
    title: '我的提示詞',
    fileName: 'old.md'
  })), '我的提示詞.md');
});
