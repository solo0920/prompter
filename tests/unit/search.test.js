'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Search = require('../../assets/js/search.js');
const Model = require('../../assets/js/model.js');

function makeDocument(id, title, texts, updatedAt) {
  return Model.createPromptDocument({
    id,
    title,
    fileName: id + '.md',
    updatedAt: updatedAt || '2026-10-28T00:00:00.000Z',
    blocks: texts.map(function (text, index) {
      return Model.createTextBlock({
        id: id + '-block-' + index,
        text,
        y: index * 24,
        seq: index + 1
      });
    })
  });
}

test('matches title and block text case-insensitively', function () {
  const documents = [
    makeDocument('a', 'Code Reviewer', ['Find SECURITY risks']),
    makeDocument('b', 'Writer', ['Draft a story'])
  ];
  assert.deepEqual(
    Search.searchDocuments(documents, 'reviewer').map((document) => document.id),
    ['a']
  );
  assert.deepEqual(
    Search.searchDocuments(documents, 'security').map((document) => document.id),
    ['a']
  );
  assert.deepEqual(
    Search.searchDocuments(documents, 'WRITER').map((document) => document.id),
    ['b']
  );
});

test('trims query whitespace and treats punctuation literally', function () {
  const documents = [
    makeDocument('a', '提示詞：角色', ['輸出 JSON。']),
    makeDocument('b', '一般文件', ['沒有標點'])
  ];
  assert.deepEqual(
    Search.searchDocuments(documents, '  提示詞：角色  ').map((document) => document.id),
    ['a']
  );
  assert.deepEqual(
    Search.searchDocuments(documents, 'JSON。').map((document) => document.id),
    ['a']
  );
  assert.deepEqual(
    Search.searchDocuments(documents, 'JSON').map((document) => document.id),
    ['a']
  );
  assert.deepEqual(
    Search.searchDocuments(documents, 'json。').map((document) => document.id),
    ['a']
  );
  assert.deepEqual(Search.searchDocuments(documents, 'JSON!'), []);
});

test('returns every document for an empty query and none for no match', function () {
  const documents = [
    makeDocument('a', 'One', ['First']),
    makeDocument('b', 'Two', ['Second'])
  ];
  assert.deepEqual(
    Search.searchDocuments(documents, '').map((document) => document.id),
    ['a', 'b']
  );
  assert.deepEqual(
    Search.searchDocuments(documents, '   ').map((document) => document.id),
    ['a', 'b']
  );
  assert.deepEqual(Search.searchDocuments(documents, 'missing'), []);
});

test('matches Traditional Chinese, English, mixed text and emoji', function () {
  const documents = [
    makeDocument('a', '行銷文案', ['請用 English 語氣，加入 🚀。']),
    makeDocument('b', '技術文件', ['API 錯誤處理'])
  ];
  assert.deepEqual(
    Search.searchDocuments(documents, 'english 語氣').map((document) => document.id),
    ['a']
  );
  assert.deepEqual(
    Search.searchDocuments(documents, '🚀').map((document) => document.id),
    ['a']
  );
  assert.deepEqual(
    Search.searchDocuments(documents, 'api 錯誤').map((document) => document.id),
    ['b']
  );
});

test('matches image alternative text and image file names', function () {
  const documents = [
    Model.createPromptDocument({
      id: 'a',
      title: '圖片文件',
      fileName: 'images.md',
      blocks: [
        Model.createImageBlock({
          id: 'image-block',
          assetId: 'asset-a',
          alt: '登入流程圖',
          y: 0,
          seq: 1
        })
      ]
    })
  ];
  const assets = [{
    id: 'asset-a',
    documentId: 'a',
    fileName: 'login-flow.png',
    originalName: '登入 流程.png'
  }];
  assert.deepEqual(
    Search.searchDocuments(documents, '登入流程圖', assets).map((document) => document.id),
    ['a']
  );
  assert.deepEqual(
    Search.searchDocuments(documents, 'login-flow', assets).map((document) => document.id),
    ['a']
  );
  assert.deepEqual(
    Search.searchDocuments(documents, '登入 流程', assets).map((document) => document.id),
    ['a']
  );
});

test('builds a reusable index that can be queried repeatedly', function () {
  const documents = [
    makeDocument('a', 'Alpha', ['First prompt']),
    makeDocument('b', 'Beta', ['Second prompt'])
  ];
  const index = Search.buildIndex(documents, []);
  assert.equal(Search.normalizeQuery('  Alpha  '), 'Alpha');
  assert.deepEqual(
    Search.searchIndex(index, 'prompt').map((document) => document.id),
    ['a', 'b']
  );
  assert.deepEqual(
    Search.searchIndex(index, 'beta').map((document) => document.id),
    ['b']
  );
  assert.deepEqual(Search.searchIndex(index, '').length, 2);
});
