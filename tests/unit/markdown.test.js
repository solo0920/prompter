'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Markdown = require('../../assets/js/markdown.js');
const Model = require('../../assets/js/model.js');

const FIXTURES = path.join(__dirname, '..', 'fixtures');

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

function textBlock(overrides) {
  return Model.createTextBlock(Object.assign({
    id: 'block-' + Math.random().toString(36).slice(2),
    x: 0,
    y: 0,
    z: 1,
    seq: 1,
    blankLinesAfter: 0,
    text: 'text',
    marker: 'none'
  }, overrides || {}));
}

function imageBlock(overrides) {
  return Model.createImageBlock(Object.assign({
    id: 'image-' + Math.random().toString(36).slice(2),
    x: 0,
    y: 0,
    z: 1,
    seq: 1,
    blankLinesAfter: 0,
    assetId: 'asset-1',
    alt: 'pixel'
  }, overrides || {}));
}

function serialize(parsed) {
  return Markdown.serializeDocument(Model.createPromptDocument({
    leadingBlankLines: parsed.leadingBlankLines,
    trailingBlankLines: parsed.trailingBlankLines,
    trailingNewline: parsed.trailingNewline,
    blocks: parsed.lines.map(function (line, index) {
      if (line.kind === 'image') {
        return imageBlock({
          id: 'id-' + index,
          seq: index,
          text: undefined
        });
      }
      return textBlock({
        id: 'id-' + index,
        seq: index,
        text: line.text,
        marker: line.marker,
        blankLinesAfter: line.blankLinesAfter
      });
    })
  }));
}

test('detectMarker requires exactly one space and a non-empty remainder', function () {
  assert.deepEqual(Markdown.detectMarker('# Heading'), { marker: '#', text: 'Heading' });
  assert.deepEqual(Markdown.detectMarker('##  Two spaces'), { marker: '##', text: ' Two spaces' });
  assert.deepEqual(Markdown.detectMarker('### Heading'), { marker: '###', text: 'Heading' });
  assert.deepEqual(Markdown.detectMarker('- Item'), { marker: '-', text: 'Item' });
  assert.deepEqual(Markdown.detectMarker('1. First'), { marker: '1.', text: 'First' });
  assert.deepEqual(Markdown.detectMarker('2. Item'), { marker: '2.', text: 'Item' });
  assert.deepEqual(Markdown.detectMarker('12. Twelfth'), { marker: '12.', text: 'Twelfth' });
  assert.deepEqual(Markdown.detectMarker('> Quote'), { marker: '>', text: 'Quote' });
  assert.deepEqual(Markdown.detectMarker('. Dot'), { marker: '.', text: 'Dot' });
  assert.deepEqual(Markdown.detectMarker('#Heading'), { marker: 'none', text: '#Heading' });
  assert.deepEqual(Markdown.detectMarker('#### Heading'), { marker: 'none', text: '#### Heading' });
  assert.deepEqual(Markdown.detectMarker(' - Item'), { marker: 'none', text: ' - Item' });
  assert.deepEqual(Markdown.detectMarker('#'), { marker: 'none', text: '#' });
  assert.deepEqual(Markdown.detectMarker('- '), { marker: 'none', text: '- ' });
  assert.deepEqual(Markdown.detectMarker('#   '), { marker: 'none', text: '#   ' });
});

test('markerRank orders headings, lists, quotes and plain content', function () {
  var markers = ['#', '##', '###', '-', '1.', '>', '.'];
  assert.deepEqual(
    markers.concat(['none', 'unknown']).map(Markdown.markerRank),
    [0, 1, 2, 3, 4, 5, 6, 7, 7]
  );
  for (var i = 1; i < markers.length; i += 1) {
    assert.ok(Markdown.markerRank(markers[i - 1]) < Markdown.markerRank(markers[i]),
      markers[i - 1] + ' must rank above ' + markers[i]);
  }
  assert.equal(Markdown.markerRank('none'), 7);
  assert.equal(Markdown.markerRank('unknown'), 7);
  assert.equal(Markdown.markerRank('2.'), 4);
  assert.equal(Markdown.markerRank('12.'), 4);
});

test('splitComposerItems separates obvious Markdown lines and keeps prose grouped', function () {
  const items = Markdown.splitComposerItems(
    '# 標題\n' +
    '第一段第一行\n' +
    '第一段第二行\n' +
    '\n' +
    '- 項目一\n' +
    '- 項目二\n' +
    '> 引言\n' +
    '1. 有序\n' +
    '2. 第二項\n' +
    '3. 第三項\n' +
    '. 點\n' +
    '### 小標題\n'
  );
  assert.deepEqual(items, [
    { marker: '#', text: '標題', blankLinesAfter: 0 },
    { marker: 'none', text: '第一段第一行\n第一段第二行', blankLinesAfter: 1 },
    { marker: '-', text: '項目一', blankLinesAfter: 0 },
    { marker: '-', text: '項目二', blankLinesAfter: 0 },
    { marker: '>', text: '引言', blankLinesAfter: 0 },
    { marker: '1.', text: '有序', blankLinesAfter: 0 },
    { marker: '2.', text: '第二項', blankLinesAfter: 0 },
    { marker: '3.', text: '第三項', blankLinesAfter: 0 },
    { marker: '.', text: '點', blankLinesAfter: 0 },
    { marker: '###', text: '小標題', blankLinesAfter: 0 }
  ]);
});

test('splitComposerItems keeps plain multiline text and fenced code intact', function () {
  assert.equal(Markdown.splitComposerItems('第一行\n第二行'), null);
  assert.equal(Markdown.splitComposerItems('# 單行標題'), null);
  const items = Markdown.splitComposerItems(
    '# 安裝\n' +
    '\n' +
    '```sh\n' +
    '# 這是註解\n' +
    '- 不是項目\n' +
    '\n' +
    'npm install\n' +
    '```\n' +
    '- 完成\n'
  );
  assert.deepEqual(items, [
    { marker: '#', text: '安裝', blankLinesAfter: 1 },
    {
      marker: 'none',
      text: '```sh\n# 這是註解\n- 不是項目\n\nnpm install\n```',
      blankLinesAfter: 0
    },
    { marker: '-', text: '完成', blankLinesAfter: 0 }
  ]);
});

test('splitComposerItems attaches indented continuations to the preceding item', function () {
  const items = Markdown.splitComposerItems(
    '- 第一行很長的項目\n' +
    '  續行內容\n' +
    '- 第二個項目\n'
  );
  assert.deepEqual(items, [
    { marker: '-', text: '第一行很長的項目\n  續行內容', blankLinesAfter: 0 },
    { marker: '-', text: '第二個項目', blankLinesAfter: 0 }
  ]);
});

test('marker-only source lines stay literal text blocks', function () {
  const parsed = Markdown.parseMarkdown('#\n- \n# Heading\n');
  assert.equal(parsed.lines.length, 3);
  assert.equal(parsed.lines[0].kind, 'text');
  assert.equal(parsed.lines[0].marker, 'none');
  assert.equal(parsed.lines[0].text, '#');
  assert.equal(parsed.lines[1].marker, 'none');
  assert.equal(parsed.lines[1].text, '- ');
  assert.equal(parsed.lines[2].marker, '#');
  assert.equal(parsed.lines[2].text, 'Heading');
});

test('serializes the marker matrix exactly', function () {
  const blocks = [
    textBlock({ id: 'a', marker: '#', text: 'One', y: 0, seq: 1 }),
    textBlock({ id: 'b', marker: '##', text: 'Two', y: 24, seq: 2 }),
    textBlock({ id: 'c', marker: '###', text: 'Three', y: 48, seq: 3 }),
    textBlock({ id: 'd', marker: '-', text: 'Bullet', y: 72, seq: 4 }),
    textBlock({ id: 'e', marker: '1.', text: 'Ordered', y: 96, seq: 5 }),
    textBlock({ id: 'f', marker: '>', text: 'Quote', y: 120, seq: 6 }),
    textBlock({ id: 'g', marker: '.', text: 'Dot', y: 144, seq: 7 }),
    textBlock({ id: 'h', marker: 'none', text: 'Plain', y: 168, seq: 8 })
  ];
  const document = Model.createPromptDocument({ blocks: blocks });
  assert.equal(
    Markdown.serializeDocument(document),
    '# One\n## Two\n### Three\n- Bullet\n1. Ordered\n> Quote\n. Dot\nPlain\n'
  );
});

test('serializes image blocks with escaped alt text', function () {
  const document = Model.createPromptDocument({
    blocks: [imageBlock({ alt: 'a[b]\\c' })]
  });
  const assets = [{ id: 'asset-1', fileName: 'pixel.png' }];
  assert.equal(Markdown.serializeDocument(document, { assets: assets }), '![a\\[b\\]\\\\c](pixel.png)\n');
});

test('preserves leading, inter-block and trailing blank lines plus final newline', function () {
  const document = Model.createPromptDocument({
    leadingBlankLines: 2,
    trailingBlankLines: 2,
    trailingNewline: true,
    blocks: [
      textBlock({ id: 'a', text: 'A', y: 0, blankLinesAfter: 2, seq: 1 }),
      textBlock({ id: 'b', text: 'B', y: 96, blankLinesAfter: 0, seq: 2 })
    ]
  });
  assert.equal(Markdown.serializeDocument(document), '\n\nA\n\n\nB\n\n\n');
});

test('document without final newline stays without one', function () {
  const document = Model.createPromptDocument({
    trailingNewline: false,
    blocks: [textBlock({ text: 'No final newline' })]
  });
  assert.equal(Markdown.serializeDocument(document), 'No final newline');
});

test('produces an empty string for an empty document', function () {
  const document = Model.createPromptDocument({ blocks: [] });
  assert.equal(Markdown.serializeDocument(document), '');
});

test('round-trips the marker corpus byte-for-byte after normalization', function () {
  ['markers', 'blank-lines', 'no-final-newline', 'mixed'].forEach(function (name) {
    const source = readFixture(name + '.md');
    const expected = readFixture(name + '.expected.md');
    const parsed = Markdown.parseMarkdown(source);
    assert.equal(Markdown.serializeDocument(Model.createPromptDocument({
      leadingBlankLines: parsed.leadingBlankLines,
      trailingBlankLines: parsed.trailingBlankLines,
      trailingNewline: parsed.trailingNewline,
      blocks: parsed.lines.map(function (line, index) {
        if (line.kind === 'image') {
          return textBlock({
            id: 'id-' + index,
            seq: index,
            text: line.raw,
            blankLinesAfter: line.blankLinesAfter
          });
        }
        return textBlock({
          id: 'id-' + index,
          seq: index,
          text: line.text,
          marker: line.marker,
          blankLinesAfter: line.blankLinesAfter
        });
      })
    })), expected, name);
  });
});

test('normalizes BOM, CRLF and lone CR to LF', function () {
  const source = '\ufeff# Title\r\n\r\nLine\rLine\r\n';
  const parsed = Markdown.parseMarkdown(source);
  assert.equal(parsed.leadingBlankLines, 0);
  assert.equal(parsed.lines[0].text, 'Title');
  assert.equal(serialize(parsed), '# Title\n\nLine\nLine\n');
  assert.equal(
    Markdown.serializeDocument(Model.createPromptDocument({
      leadingBlankLines: parsed.leadingBlankLines,
      trailingBlankLines: parsed.trailingBlankLines,
      trailingNewline: parsed.trailingNewline,
      blocks: parsed.lines.map(function (line, index) {
        return textBlock({
          id: 'id-' + index,
          text: line.text,
          marker: line.marker,
          seq: index,
          blankLinesAfter: line.blankLinesAfter
        });
      })
    })),
    '# Title\n\nLine\nLine\n'
  );
});

test('row buckets use round(y / 24) and same-band x order', function () {
  const blocks = [
    textBlock({ id: 'right', x: 300, y: 20, seq: 1 }),
    textBlock({ id: 'left', x: 10, y: 0, seq: 2 }),
    textBlock({ id: 'below', x: 0, y: 24, seq: 3 })
  ];
  assert.deepEqual(Markdown.blocksInReadingOrder(blocks).map(function (block) { return block.id; }),
    ['left', 'below', 'right']);
});

test('reading order tie-breaks by seq then id', function () {
  const blocks = [
    textBlock({ id: 'b', x: 10, y: 0, seq: 2 }),
    textBlock({ id: 'a', x: 10, y: 0, seq: 1 }),
    textBlock({ id: 'd', x: 10, y: 0, seq: 3 }),
    textBlock({ id: 'c', x: 10, y: 0, seq: 3 })
  ];
  assert.deepEqual(Markdown.blocksInReadingOrder(blocks).map(function (block) { return block.id; }),
    ['a', 'b', 'c', 'd']);
});

test('serializer sorts by reading order and ignores array order', function () {
  const document = Model.createPromptDocument({
    blocks: [
      textBlock({ id: 'second', x: 0, y: 48, seq: 2, text: 'Second' }),
      textBlock({ id: 'first', x: 0, y: 0, seq: 1, text: 'First' })
    ]
  });
  assert.equal(Markdown.serializeDocument(document), 'First\nSecond\n');
});

test('code fences, tables and raw HTML-looking text stay literal lines', function () {
  const source = '```js\nconst x = 1;\n  <div>not html</div>\n```\n\n| a | b |\n| --- | --- |\n';
  const parsed = Markdown.parseMarkdown(source);
  assert.equal(parsed.lines.length, 6);
  parsed.lines.forEach(function (line) {
    assert.equal(line.kind, 'text');
    assert.equal(line.marker, 'none');
  });
  const document = Model.createPromptDocument({
    leadingBlankLines: parsed.leadingBlankLines,
    trailingBlankLines: parsed.trailingBlankLines,
    trailingNewline: parsed.trailingNewline,
    blocks: parsed.lines.map(function (line, index) {
      return textBlock({
        id: 'id-' + index,
        seq: index,
        text: line.text,
        marker: line.marker,
        blankLinesAfter: line.blankLinesAfter
      });
    })
  });
  assert.equal(Markdown.serializeDocument(document), source);
});

test('parses image lines and leaves malformed image syntax as text', function () {
  const parsed = Markdown.parseMarkdown('![alt](pixel.png)\n![broken](pixel.png\n');
  assert.equal(parsed.lines[0].kind, 'image');
  assert.equal(parsed.lines[0].alt, 'alt');
  assert.equal(parsed.lines[0].target, 'pixel.png');
  assert.equal(parsed.lines[1].kind, 'text');
});

test('preserves newlines in multi-line block text and detects a leading marker', function () {
  const plain = textBlock({ marker: 'none', text: '第一行\n第二行' });
  assert.equal(Markdown.serializeBlockLine(plain), '第一行\n第二行');

  const document = Model.createPromptDocument({ blocks: [plain] });
  assert.equal(Markdown.serializeDocument(document), '第一行\n第二行\n');

  const marked = textBlock({ marker: '#', text: '標題\n內容' });
  assert.equal(Markdown.serializeBlockLine(marked), '# 標題\n內容');

  const detected = Markdown.detectMarker('# 標題\n內容');
  assert.equal(detected.marker, '#');
  assert.equal(detected.text, '標題\n內容');
});

test('serializes a blank-only document exactly', function () {
  const source = '\n\n';
  const parsed = Markdown.parseMarkdown(source);
  assert.equal(parsed.lines.length, 0);
  const document = Model.createPromptDocument({
    leadingBlankLines: parsed.leadingBlankLines,
    trailingBlankLines: parsed.trailingBlankLines,
    trailingNewline: parsed.trailingNewline,
    blocks: []
  });
  assert.equal(Markdown.serializeDocument(document), source);
});
