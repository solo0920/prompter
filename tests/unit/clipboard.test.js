'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Clipboard = require('../../assets/js/clipboard.js');
const Files = require('../../assets/js/files.js');
const Markdown = require('../../assets/js/markdown.js');
const Model = require('../../assets/js/model.js');

function imageAsset(overrides) {
  return Object.assign({
    id: 'asset-1',
    documentId: 'doc-1',
    fileName: 'pixel.png',
    originalName: 'pixel.png',
    mimeType: 'image/png',
    width: 1,
    height: 1,
    size: 4,
    createdAt: '2026-10-28T00:00:00.000Z',
    dataUrl: 'data:image/png;base64,AAAA'
  }, overrides || {});
}

function documentWith(blocks, overrides) {
  return Model.createPromptDocument(Object.assign({
    id: 'doc-1',
    title: 'Copy test',
    fileName: 'copy-test.md',
    blocks: blocks
  }, overrides || {}));
}

test('builds exact Markdown and self-contained HTML with embedded images', async function () {
  const document = documentWith([
    Model.createTextBlock({ id: 'h', marker: '#', text: '角色 <script>', y: 0, seq: 1 }),
    Model.createTextBlock({ id: 'p', text: '第一行 & 第二行', y: 24, seq: 2, blankLinesAfter: 1 }),
    Model.createImageBlock({ id: 'i', assetId: 'asset-1', alt: '像素', y: 48, seq: 3 })
  ]);
  const assets = [imageAsset()];
  const payload = await Clipboard.buildClipboardPayload(document, assets);
  assert.equal(payload.markdown, Markdown.serializeDocument(document, { assets: assets }));
  assert.equal(payload.markdown,
    '# 角色 <script>\n第一行 & 第二行\n\n![像素](pixel.png)\n');
  assert.match(payload.html, /<h1>角色 &lt;script&gt;<\/h1>/);
  assert.match(payload.html,
    /<img src="data:image\/png;base64,AAAA" alt="像素"[^>]*>/);
  assert.equal(payload.html.includes('<script>'), false);
  assert.equal(payload.hasImages, true);
  assert.deepEqual(payload.omittedImages, []);
});

test('uses self-contained MathML for math in rich HTML copy', async function () {
  const document = documentWith([
    Model.createTextBlock({ id: 'm', text: '公式 $E=mc^2$', y: 0, seq: 1 }),
    Model.createImageBlock({ id: 'i', assetId: 'asset-1', alt: '像素', y: 24, seq: 2 })
  ]);
  const payload = await Clipboard.buildClipboardPayload(document, [imageAsset()]);
  assert.match(payload.markdown, /\$E=mc\^2\$/);
  assert.match(payload.html, /<math /);
  assert.equal(payload.html.includes('katex-html'), false);
  assert.equal(payload.html.includes('<script>'), false);
});

test('detects image references on later lines of a multi-line text block', async function () {
  const document = documentWith([
    Model.createTextBlock({
      id: 'multi',
      text: '第一行\n![像素](pixel.png)',
      y: 0,
      seq: 1
    })
  ]);
  const payload = await Clipboard.buildClipboardPayload(document, [imageAsset()]);
  assert.equal(payload.hasImages, true);
  assert.match(payload.html, /<img src="data:image\/png;base64,AAAA" alt="像素"[^>]*>/);
  assert.match(payload.markdown, /第一行\n!\[像素\]\(pixel\.png\)/);
});

test('marks text-only documents so Copy can avoid a rich HTML flavor', async function () {
  const textOnly = documentWith([
    Model.createTextBlock({ id: 'h', marker: '##', text: '標題', y: 0, seq: 1 })
  ]);
  const plainPayload = await Clipboard.buildClipboardPayload(textOnly, []);
  assert.equal(plainPayload.hasImages, false);
  assert.equal(plainPayload.markdown, '## 標題\n');

  const remoteImage = documentWith([
    Model.createTextBlock({
      id: 'remote',
      text: '![遠端](https://example.com/remote.png)',
      y: 0,
      seq: 1
    })
  ]);
  const remotePayload = await Clipboard.buildClipboardPayload(remoteImage, []);
  assert.equal(remotePayload.hasImages, true);
});

test('uses placeholders and reports remote or missing images', async function () {
  const document = documentWith([
    Model.createTextBlock({
      id: 'remote',
      text: '![遠端](https://example.com/remote.png)',
      y: 0,
      seq: 1
    }),
    Model.createImageBlock({
      id: 'missing',
      assetId: 'gone',
      alt: '缺少',
      y: 24,
      seq: 2
    })
  ]);
  const payload = await Clipboard.buildClipboardPayload(document, []);
  assert.equal(payload.markdown,
    '![遠端](https://example.com/remote.png)\n![缺少](missing-image.png)\n');
  assert.match(payload.html, /class="missing-image"/);
  assert.equal(payload.html.includes('src="https://example.com/remote.png"'), false);
  assert.deepEqual(payload.omittedImages, [
    'https://example.com/remote.png',
    'missing-image.png'
  ]);
});

test('omits oversized image data from the rich HTML but keeps exact text', async function () {
  const document = documentWith([
    Model.createTextBlock({ id: 'p', text: '圖片：', y: 0, seq: 1 }),
    Model.createImageBlock({ id: 'i', assetId: 'asset-1', alt: '大圖', y: 24, seq: 2 })
  ]);
  const assets = [imageAsset({
    dataUrl: 'data:image/png;base64,' + 'A'.repeat(200)
  })];
  const payload = await Clipboard.buildClipboardPayload(document, assets, {
    maxDataUrlLength: 50
  });
  assert.equal(payload.markdown, '圖片：\n![大圖](pixel.png)\n');
  assert.match(payload.html, /class="missing-image"/);
  assert.equal(payload.html.includes('data:image/png'), false);
  assert.deepEqual(payload.omittedImages, ['pixel.png']);
});

test('clipboard Markdown is byte-identical to the Save plan', async function () {
  const document = documentWith([
    Model.createTextBlock({ id: 'h', marker: '##', text: '角色', y: 0, seq: 1, blankLinesAfter: 1 }),
    Model.createTextBlock({ id: 'p', text: '限制一', y: 24, seq: 2 }),
    Model.createImageBlock({ id: 'i', assetId: 'asset-1', alt: '像素', y: 48, seq: 3 })
  ]);
  const assets = [imageAsset()];
  const payload = await Clipboard.buildClipboardPayload(document, assets);
  const plan = await Files.buildSavePlan(document, assets, { fileName: 'copy-test.md' });
  assert.equal(payload.markdown, plan.markdown);
  assert.equal(payload.markdown,
    '## 角色\n\n限制一\n![像素](pixel.png)\n');
});

test('rejects empty documents', async function () {
  await assert.rejects(
    Clipboard.buildClipboardPayload(documentWith([]), []),
    function (error) {
      assert.equal(error.code, 'EMPTY_DOCUMENT');
      return true;
    }
  );
});
