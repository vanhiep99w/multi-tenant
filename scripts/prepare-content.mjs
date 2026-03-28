#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DOCS_BASE = join(ROOT, 'content', 'docs');

const CATEGORY_MAP = {
  'multi-tenancy': 'Multi-Tenant Architecture',
};

console.log('Preparing content for Fumadocs...');

for (const [dir, title] of Object.entries(CATEGORY_MAP)) {
  const categoryDir = join(DOCS_BASE, dir);
  if (!existsSync(categoryDir)) {
    console.warn(`  SKIP (not found): ${dir}/`);
    continue;
  }

  const metaPath = join(categoryDir, 'meta.json');
  if (!existsSync(metaPath)) {
    console.warn(`  SKIP (no meta.json): ${dir}/`);
    continue;
  }

  writeFileSync(metaPath, JSON.stringify({ title }, null, 2), 'utf8');
  console.log(`  ✓ ${dir}/meta.json`);
}

console.log('\nDone!');
