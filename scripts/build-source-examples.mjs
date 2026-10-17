#!/usr/bin/env node
import { glob, readFile, mkdir, writeFile, rm, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHighlighter } from 'shiki';
import { collectSourceExamples, highlightSourceFile } from './lib/source-examples.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = join(root, 'public/source-examples');
const staging = `${output}.tmp`;
const documents = [];
for await (const path of glob('content/docs/**/*.{md,mdx}', { cwd: root })) {
  documents.push({ path, content: await readFile(join(root, path), 'utf8') });
}
documents.sort((a, b) => a.path.localeCompare(b.path));
// Validate every reference before publishing any generated assets.
const projects = collectSourceExamples(documents);
const highlighter = await createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: ['java', 'typescript', 'javascript', 'sql', 'yaml', 'hcl', 'json', 'bash', 'python', 'xml', 'lua', 'jsonc'],
});
try {
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  const manifest = [];
  let count = 0;
  for (const project of projects) {
    const snapshots = [];
    for (const data of project.snapshots.values()) {
      const asset = `${project.id}-${data.snapshot}.json`;
      const files = [];
      for (const file of data.files) files.push(await highlightSourceFile(file, highlighter));
      count += files.length;
      await writeFile(join(staging, asset), JSON.stringify({ ...data, files }));
      snapshots.push({ id: data.snapshot, title: data.snapshot === 'guide' ? 'Ví dụ trong bài' : data.snapshot, asset });
    }
    manifest.push({ id: project.id, title: project.title, defaultSnapshot: snapshots.find(snapshot => snapshot.id === 'guide')?.id ?? snapshots[0].id, snapshots });
  }
  await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
  console.log(`Source Explorer: ${projects.length} projects, ${count} files; references validated.`);
} finally {
  highlighter.dispose();
  await rm(staging, { recursive: true, force: true });
}
