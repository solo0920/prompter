'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Preview = require('../../assets/js/preview.js');

function render(markdown, options) {
  return Preview.renderMarkdown(markdown, options);
}

test('renders heading levels 1 to 3 and leaves unsupported headings literal', function () {
  const result = render('# 標題一\n## 標題二\n### 標題三\n#### 第四層\n');
  assert.match(result.html, /<h1>標題一<\/h1>/);
  assert.match(result.html, /<h2>標題二<\/h2>/);
  assert.match(result.html, /<h3>標題三<\/h3>/);
  assert.match(result.html, /<p>#### 第四層<\/p>/);
  assert.equal(result.html.includes('<h4>'), false);
});

test('groups consecutive bullet and ordered list lines with literal values', function () {
  const result = render('- 第一項\n- 第二項\n\n1. 第一\n3. 第三\n10. 第十\n');
  assert.match(result.html, /<ul>\s*<li>第一項<\/li>\s*<li>第二項<\/li>\s*<\/ul>/);
  assert.match(result.html, /<ol>\s*<li value="1">第一<\/li>\s*<li value="3">第三<\/li>\s*<li value="10">第十<\/li>\s*<\/ol>/);
  assert.equal((result.html.match(/<ul>/g) || []).length, 1);
  assert.equal((result.html.match(/<ol>/g) || []).length, 1);
});

test('groups consecutive quote lines and separates groups at blank lines', function () {
  const result = render('> 第一句\n> 第二句\n\n> 另一段\n');
  assert.match(result.html, /<blockquote>[\s\S]*第一句[\s\S]*第二句[\s\S]*<\/blockquote>/);
  assert.equal((result.html.match(/<blockquote>/g) || []).length, 2);
});

test('resolves local image assets and shows placeholders for remote or missing images', function () {
  const result = render(
    '![像素](pixel.png)\n![遠端](https://example.com/remote.png)\n![缺少](missing.png)\n',
    { imageUrls: { 'pixel.png': 'data:image/png;base64,AAAA' } }
  );
  assert.match(result.html,
    /<img src="data:image\/png;base64,AAAA" alt="像素"[^>]*>/);
  assert.match(result.html, /class="missing-image"[\s\S]*遠端/);
  assert.match(result.html, /class="missing-image"[\s\S]*缺少/);
  assert.equal(result.html.includes('src="https://example.com/remote.png"'), false);
  assert.deepEqual(result.missingImages, [
    'https://example.com/remote.png',
    'missing.png'
  ]);
});

test('escapes fenced code and preserves its language class', function () {
  const result = render('```js\nconst x = "<tag>";\nif (x) { x += 1; }\n```\n');
  assert.match(result.html, /<pre><code class="language-js">/);
  assert.match(result.html, /const x = &quot;&lt;tag&gt;&quot;;/);
  assert.equal(result.html.includes('<tag>'), false);
});

test('renders basic pipe tables with escaped cells', function () {
  const result = render('| 欄位 | 值 |\n| --- | --- |\n| A | <b>1</b> |\n');
  assert.match(result.html, /<table>/);
  assert.match(result.html, /<th>欄位<\/th>/);
  assert.match(result.html, /<td>A<\/td>/);
  assert.match(result.html, /<td>&lt;b&gt;1&lt;\/b&gt;<\/td>/);
});

test('renders plain text as paragraphs and never emits raw HTML', function () {
  const result = render('一般 <b>文字</b> & 符號\n第二行\n');
  assert.match(result.html, /<p>一般 &lt;b&gt;文字&lt;\/b&gt; &amp; 符號<\/p>/);
  assert.match(result.html, /<p>第二行<\/p>/);
  assert.equal(result.html.includes('<b>'), false);
  assert.equal(result.html.includes('<script>'), false);
});

test('renders KaTeX inline and display math in Markdown contexts', function () {
  const result = render([
    '# 公式 $a^2$',
    '- 項目 $x_1$',
    '> 引言 $\\frac{1}{2}$',
    '| 公式 | 值 |',
    '| --- | --- |',
    '| $x^2$ | 4 |',
    '$$\\int_0^1 x^2 dx$$',
    ''
  ].join('\n'));
  assert.match(result.html, /<h1>公式 <span class="katex">/);
  assert.match(result.html, /<li>項目 <span class="katex">/);
  assert.match(result.html, /<blockquote>[\s\S]*<span class="katex">/);
  assert.match(result.html, /<td><span class="katex">/);
  assert.match(result.html, /<div class="preview-math-display"><span class="katex-display">/);
  assert.match(result.html, /<annotation encoding="application\/x-tex">\\int_0\^1 x\^2 dx<\/annotation>/);
});

test('supports LaTeX delimiters and multi-line display math', function () {
  const inline = render('這是 \\(a^2+b^2=c^2\\) 定理\n');
  assert.match(inline.html, /<span class="katex">/);

  const display = render('\\[\na^2+b^2=c^2\n\\]\n');
  assert.match(display.html, /<div class="preview-math-display"><span class="katex-display">/);

  const environment = render('\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}\n');
  assert.match(environment.html, /<div class="preview-math-display"><span class="katex-display">/);
  assert.match(environment.html, /<annotation encoding="application\/x-tex">\\begin\{align\}/);
});

test('does not render math inside code fences, currency, or escaped dollars', function () {
  const code = render('```tex\n$E=mc^2$\n```\n');
  assert.equal(code.html.includes('class="katex"'), false);
  assert.match(code.html, /\$E=mc\^2\$/);

  const currency = render('價格 $100 到 $200 元\n');
  assert.equal(currency.html.includes('class="katex"'), false);
  assert.match(currency.html, /價格 \$100 到 \$200 元/);

  const escaped = render('價格 \\$100 元\n');
  assert.equal(escaped.html.includes('class="katex"'), false);
  assert.match(escaped.html, /價格 \$100 元/);
});

test('keeps KaTeX output safe and escapes surrounding raw HTML', function () {
  const result = render([
    '$x$ <script>alert(1)</script>',
    '$\\text{<script>alert(2)</script>}$',
    '$\\href{javascript:alert(1)}{x}$',
    ''
  ].join('\n'));
  assert.match(result.html, /<span class="katex">/);
  assert.equal(result.html.includes('<script>'), false);
  assert.match(result.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(result.html.includes('href="javascript:'), false);
});

test('can render math as MathML-only for rich clipboard HTML', function () {
  const result = render('公式 $E=mc^2$\n$$\\int_0^1 x^2 dx$$\n', {
    mathOutput: 'mathml'
  });
  assert.match(result.html, /<span class="katex"><math /);
  assert.match(result.html, /<math [^>]*display="block"/);
  assert.equal(result.html.includes('katex-html'), false);
  assert.match(result.html, /<annotation encoding="application\/x-tex">E=mc\^2<\/annotation>/);
});

test('returns an empty result for empty Markdown', function () {
  const result = render('');
  assert.equal(result.html, '');
  assert.deepEqual(result.missingImages, []);
});
