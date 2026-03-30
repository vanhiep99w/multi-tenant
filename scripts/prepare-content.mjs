#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DOCS_BASE = join(ROOT, 'content', 'docs');

console.log('Preparing content for Fumadocs...');

const metaPath = join(DOCS_BASE, 'meta.json');
if (!existsSync(metaPath)) {
  writeFileSync(metaPath, JSON.stringify({ title: 'Multi-Tenant Architecture' }, null, 2), 'utf8');
  console.log('  ✓ docs/meta.json (created)');
} else {
  console.log('  ✓ docs/meta.json (exists)');
}

console.log('\nDone!');
