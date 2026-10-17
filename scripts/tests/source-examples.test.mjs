import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glob, readFile } from 'node:fs/promises';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { createHighlighter } from 'shiki';
import { visit } from 'unist-util-visit';
import { createHash } from 'node:crypto';
import {
  collectSourceExamples, highlightSourceFile, remarkSourceReferences, sourceMetadata,
} from '../lib/source-examples.mjs';

const document = content => [{ path: 'content/docs/demo.md', content }];
const source = '```typescript source="demo" file="src/main.ts"\nconst tenant = "acme";\nconsole.log(tenant);\n```';

test('metadata supports quoted/unquoted values and leaves normal fences unchanged', () => {
  assert.deepEqual(sourceMetadata('title="Ví dụ" source=demo file="src/main.ts"'), { project: 'demo', file: 'src/main.ts' });
  assert.deepEqual(sourceMetadata("source='demo' file='src/main.ts'"), { project: 'demo', file: 'src/main.ts' });
  assert.equal(sourceMetadata('title="source example"'), null);
  assert.equal(sourceMetadata('title="SQL source=example"'), null);
});

test('rejects incomplete metadata, duplicate keys and traversal paths', () => {
  for (const meta of ['source=demo', 'source=demo file=../secret', 'source=demo file=/secret', 'source=demo file=a//b', 'source=demo file=a source=again']) {
    assert.throws(() => sourceMetadata(meta));
  }
});

test('extracts code exactly and groups related files without copying source', () => {
  const [project] = collectSourceExamples(document('---\ntitle: "Ví dụ tenant"\n---\n\n' + source));
  assert.equal(project.title, 'Ví dụ tenant');
  const snapshot = project.snapshots.get('guide');
  assert.equal(snapshot.defaultFile, 'src/main.ts');
  assert.equal(snapshot.files[0].code, 'const tenant = "acme";\nconsole.log(tenant);');
  assert.deepEqual(snapshot.files[0].regions, {});
});

test('rejects duplicate project/snapshot/file rather than silently overwriting', () => {
  assert.throws(() => collectSourceExamples(document(source + '\n\n' + source)), /duplicate source file/);
});

test('validates explicit MDX references and inclusive line ranges', () => {
  const ref = '<SourceRef project="demo" file="src/main.ts" lines="1-2">Xem code</SourceRef>';
  assert.doesNotThrow(() => collectSourceExamples(document(source + '\n\n' + ref)));
  for (const lines of ['0', '2-1', '1-3']) {
    assert.throws(() => collectSourceExamples(document(source + '\n\n' + ref.replace('1-2', lines))), /line.*range/);
  }
  assert.throws(() => collectSourceExamples(document(ref)), /unknown project/);
  assert.throws(() => collectSourceExamples(document(source + '\n\n' + ref.replace('src/main.ts', 'missing.ts'))), /unknown file/);
  assert.throws(() => collectSourceExamples(document(source + '\n\n' + ref.replace('lines="1-2"', 'region="missing"'))), /unknown region/);
  assert.throws(() => collectSourceExamples(document('<SourceRef project={"demo"} />')), /static strings/);
});

test('validates D2 source links, ignores external navigation', () => {
  const d2 = '\n\n```d2\napi: API {link: "./?source=demo&file=src/main.ts&lines=2"}\n```';
  assert.doesNotThrow(() => collectSourceExamples(document(source + d2)));
  assert.throws(() => collectSourceExamples(document(source + d2.replace('src/main.ts', 'missing.ts'))), /unknown file/);
  assert.throws(() => collectSourceExamples(document(source + d2.replace('source=demo', 'source='))), /empty D2 source/);
  assert.doesNotThrow(() => collectSourceExamples(document(source + d2.replace('./?source=demo', 'https://external.example/?source=unknown'))));
});

test('publishes the exact displayed code from walkthrough/diff adapters', () => {
  const content = '```code-diff\ntitle: Ví dụ\nlanguage: sql\nbefore:\n  code: SELECT 1;\n  source: { project: demo, file: before.sql }\nafter:\n  code: SELECT 2;\n  source: { project: demo, file: after.sql }\n```';
  const [project] = collectSourceExamples(document(content));
  assert.deepEqual(project.snapshots.get('guide').files.map(f => f.code), ['SELECT 1;', 'SELECT 2;']);
});

test('named snapshot defaults resolve consistently when guide is absent', () => {
  const content = '```code-walkthrough\ntitle: Ví dụ\nlanguage: sql\nsnapshots:\n  - id: stage\n    code: SELECT 1;\n    source: { project: demo, snapshot: stage, file: main.sql }\n```\n\n<SourceRef project="demo" file="main.sql" />';
  assert.doesNotThrow(() => collectSourceExamples(document(content)));
});

test('remark inserts one reference per opted-in fence and does not skip adjacent code', () => {
  const tree = unified().use(remarkParse).parse(source + '\n\n' + source.replace('main.ts', 'other.ts'));
  remarkSourceReferences()(tree);
  assert.deepEqual(tree.children.map(node => node.type), ['mdxJsxFlowElement', 'code', 'mdxJsxFlowElement', 'code']);
  assert.equal(tree.children[0].attributes.find(attr => attr.name === 'project').value, 'demo');
});

test('highlighter escapes HTML and adds one-based line anchors; unknown grammar falls back to text', async () => {
  const highlighter = await createHighlighter({ themes: ['github-light', 'github-dark'], langs: ['typescript'] });
  try {
    const result = await highlightSourceFile({ path: 'demo.txt', language: 'unknown-grammar', code: '<script>\nalert(1);', regions: {} }, highlighter);
    assert.match(result.html, /(&lt;|&#x3C;)script/);
    assert.doesNotMatch(result.html, /<script>/);
    assert.match(result.html, /data-line="1"/);
    assert.match(result.html, /data-line="2"/);
    assert.match(result.html, /shiki-dark/);
  } finally { highlighter.dispose(); }
});

test('all repository references resolve and headings are not swallowed by unclosed code fences', async () => {
  const documents = [];
  for await (const path of glob('content/docs/**/*.{md,mdx}')) documents.push({ path, content: await readFile(path, 'utf8') });
  assert.ok(collectSourceExamples(documents).length >= 1);
  for (const { path, content } of documents) {
    const tree = unified().use(remarkParse).parse(content);
    visit(tree, 'code', node => {
      if (['java', 'typescript', 'sql', null].includes(node.lang)) {
        assert.doesNotMatch(node.value, /^#{2,4} /m, `${path}:${node.position.start.line}: possible missing closing fence`);
      }
    });
  }
});

test('vendored D2 icons match recorded hashes and contain no active or remote content', async () => {
  const icons = JSON.parse(await readFile('content/assets/d2/sources.json', 'utf8'));
  for (const icon of icons) {
    assert.ok(icon.url.startsWith('https://icons.d2lang.com/'));
    const data = await readFile(`content/assets/d2/icons/${icon.file}`);
    assert.equal(createHash('sha256').update(data).digest('hex'), icon.sha256);
    assert.doesNotMatch(data.toString(), /<script\b|<foreignObject\b|\bonload=|(?:href|src)=["'](?:https?:|javascript:)/i);
  }
});
