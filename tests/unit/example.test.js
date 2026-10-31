'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Example = require('../../assets/js/example.js');
const Files = require('../../assets/js/files.js');
const Markdown = require('../../assets/js/markdown.js');
const Model = require('../../assets/js/model.js');

const ROOT = path.join(__dirname, '..', '..');

test('bundled example matches example.md and covers all seven sections', function () {
  const source = fs.readFileSync(path.join(ROOT, 'example.md'), 'utf8');
  assert.equal(Example.markdown, source);
  assert.equal(Example.fileName, 'example.md');
  assert.equal(Example.title, 'Markdown 七種語法範例');

  [
    '## 1. 標題（Headings）',
    '## 2. 無序清單（Unordered List）',
    '## 3. 有序清單（Ordered List）',
    '## 4. 引用（Blockquote）',
    '## 5. 程式碼（Code）',
    '## 6. 數學公式（LaTeX / KaTeX）',
    '## 7. 表格（Table）'
  ].forEach(function (heading) {
    assert.ok(source.indexOf(heading) !== -1, 'Missing example section: ' + heading);
  });

  assert.match(source, /^###### H6 第六層標題$/m);
  assert.match(source, /^  - 子項目 A$/m);
  assert.match(source, /^    - 子項目 C$/m);
  assert.match(source, /^   1\. 分析財務報表$/m);
  assert.match(source, /^> > 也可以進行巢狀引用。$/m);
  assert.match(source, /^```python$/m);
  assert.match(source, /\$R = \\frac\{P_1-P_0\}\{P_0\}\$/);
  assert.match(source, /^NPV = \\sum_\{t=1\}\^\{n\} \\frac\{CF_t\}\{\(1\+r\)\^t\} - C_0$/m);
  assert.match(source, /^\| 報酬率 \| 20% \| 投資報酬／本金 \|$/m);
});

test('bundled example parses into a valid document without losing lines', async function () {
  const parsed = await Files.parseMarkdownDocument(Example.markdown, {
    documentId: 'prompter-example',
    fileName: Example.fileName,
    title: Example.title
  });

  assert.equal(parsed.document.id, 'prompter-example');
  assert.equal(parsed.document.fileName, 'example.md');
  assert.equal(parsed.document.title, 'Markdown 七種語法範例');
  assert.equal(parsed.assets.length, 0);
  assert.equal(Model.validateDocument(parsed.document).valid, true);

  const parsedSource = Markdown.parseMarkdown(Example.markdown);
  assert.equal(parsedSource.leadingBlankLines, 0);
  assert.equal(parsedSource.trailingBlankLines, 0);
  assert.equal(parsedSource.trailingNewline, true);
  assert.equal(parsed.document.blocks.length, parsedSource.lines.length);

  const first = parsed.document.blocks[0];
  assert.equal(first.marker, '#');
  assert.equal(first.text, 'Markdown 七種語法範例');
  assert.equal(parsed.document.blocks[1].marker, '##');
  assert.equal(parsed.document.blocks[1].text, '1. 標題（Headings）');

  const texts = parsed.document.blocks.map(function (block) {
    return block.text;
  });
  assert.ok(texts.indexOf('#### H4 第四層標題') !== -1);
  assert.ok(texts.indexOf('    - 子項目 C') !== -1);
  assert.ok(texts.indexOf('> 也可以進行巢狀引用。') !== -1);
  assert.ok(texts.indexOf('print("Hello World")') === -1,
    'Inline code belongs to its surrounding line, not a separate block.');
  assert.ok(texts.some(function (text) {
    return text.indexOf('print("Hello World")') !== -1;
  }));
  assert.ok(texts.indexOf('NPV = \\sum_{t=1}^{n} \\frac{CF_t}{(1+r)^t} - C_0') !== -1);
  assert.equal(texts[texts.length - 1], '| 報酬率 | 20% | 投資報酬／本金 |');
});
