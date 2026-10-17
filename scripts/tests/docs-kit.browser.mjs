import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';

// Run after npm run build. Set CHROME_PATH for a locally installed browser.
const root = resolve('dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    let path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (path !== root && !path.startsWith(root + sep)) throw new Error('Invalid path');
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    response.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});

test('static export: D2, source drawer and docs-kit components work in the browser', { timeout: 120_000 }, async t => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  const sourceRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/source-examples/')) sourceRequests.push(request.url()); });

  await page.goto(`${origin}/04-tenant-identity/`);
  await page.locator('.d2-interactive').first().getByRole('button', { name: /Explore diagram/ }).waitFor();
  assert.equal(sourceRequests.length, 0, 'source assets should be lazy');
  const firstDiagram = page.locator('.d2-interactive').first();
  await firstDiagram.getByRole('button', { name: /Explore diagram/ }).click();
  await firstDiagram.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await firstDiagram.getByRole('button', { name: 'Fit', exact: true }).click();
  assert.ok(await firstDiagram.locator('.d2-viewport svg').count());

  await page.locator('.source-ref--button').first().click();
  await page.locator('.source-drawer .source-code .line[data-line="1"]').waitFor();
  assert.ok(sourceRequests.some(url => url.endsWith('manifest.json')));
  assert.ok(sourceRequests.some(url => url.includes('tenant-identity-guide.json')));
  assert.match(page.url(), /source=tenant-identity/);
  assert.ok(await page.locator('.source-files button').count() > 2);
  await page.locator('.source-files button').filter({ hasText: 'TenantContextHolder.java' }).click();
  await page.waitForURL(/file=src%2Fcontext%2FTenantContextHolder.java/);
  await page.getByRole('button', { name: 'Đóng source explorer' }).click();
  await page.locator('.source-drawer').waitFor({ state: 'detached' });

  const walkthrough = page.locator('.code-walkthrough');
  await walkthrough.getByRole('button', { name: 'Bước sau', exact: true }).click();
  await walkthrough.locator('.code-walkthrough-note').filter({ hasText: 'Worker nhận đúng tenant' }).waitFor();
  // A query-only link in an SVG must open the drawer, not navigate away from the article.
  await page.locator('svg a').filter({ visible: true }).first().click();
  await page.locator('.source-drawer .source-code').waitFor();
  assert.ok(page.url().includes('/04-tenant-identity/'));
  await page.locator('a[href="/10-observability/"]').first().click();
  await page.waitForURL('**/10-observability/');
  await page.locator('.source-drawer').waitFor({ state: 'detached' });

  const waterfall = page.locator('.span-waterfall');
  await waterfall.locator('.span-waterfall-label').filter({ hasText: 'Order Service' }).click();
  assert.equal(await waterfall.locator('.span-waterfall-details details[open]').count(), 1);
  await page.goto(`${origin}/02-isolation-models/isolation-techniques/`);
  await page.locator('.code-diff').getByRole('button', { name: 'Inline', exact: true }).click();
  assert.ok(await page.locator('.code-diff-row').count());
  await page.goto(`${origin}/06-compute-isolation/`);
  assert.equal(await page.locator('.terminal-session').count(), 1);
  await page.locator('.terminal-session').getByRole('button', { name: /Sao chép/ }).first().click();
  await page.goto(`${origin}/04-tenant-identity/?source=tenant-identity&file=src/context/TenantContextHolder.java&lines=1-3`);
  await page.locator('.source-drawer .source-code .line[data-line="1"]').waitFor();
  assert.ok(await page.locator('.source-drawer .source-code').textContent());
  await page.getByRole('button', { name: 'Đóng source explorer' }).click();
  assert.equal(await page.locator('.protocol-exchange').count(), 1);
  await page.locator('.protocol-exchange details').last().locator('summary').click();
  assert.match(await page.locator('.protocol-exchange').textContent(), /tenant_mismatch/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.evaluate(() => { document.documentElement.classList.add('dark'); document.documentElement.classList.remove('light'); });
  assert.ok(await page.locator('.d2-diagram-dark svg').count());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page should not overflow on mobile');
  await page.locator('.source-ref--button').first().click();
  await page.locator('.source-drawer .source-code').waitFor();
  await page.getByRole('button', { name: 'Đóng source explorer' }).click();
  assert.deepEqual(errors, []);

  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const fallback = await noJs.newPage();
  await fallback.goto(`${origin}/04-tenant-identity/`);
  assert.ok(await fallback.locator('.d2-diagram-light svg').count());
  assert.ok(await fallback.locator('.code-walkthrough-code').textContent());
  assert.ok(await fallback.locator('.protocol-exchange').textContent());
  await noJs.close();
  await page.goto(`${origin}/13-cloud-deployment/`);
  const images = page.locator('.d2-interactive svg image');
  assert.ok(await images.count() > 10, 'infrastructure diagrams should contain icons');
  for (const href of await images.evaluateAll(nodes => nodes.map(node => node.getAttribute('href') ?? node.getAttribute('xlink:href')))) {
    assert.ok(href?.startsWith('data:'), 'icons must be embedded, not fetched from a third-party host');
  }
  const largeDiagram = page.locator('.d2-interactive').first();
  await largeDiagram.getByRole('button', { name: /Explore/ }).click();
  await largeDiagram.locator('.d2-breadcrumb select').selectOption('layers.topology');
  await largeDiagram.getByRole('button', { name: 'Fit', exact: true }).click();
  assert.equal(await largeDiagram.locator('.d2-breadcrumb select').inputValue(), 'layers.topology');
  await largeDiagram.locator('.d2-breadcrumb select').selectOption('');
  if (process.env.DOCS_SCREENSHOTS) {
    await mkdir(process.env.DOCS_SCREENSHOTS, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('.d2-interactive').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(process.env.DOCS_SCREENSHOTS, 'cloud-d2.png') });
    await page.goto(`${origin}/04-tenant-identity/`);
    await page.locator('.source-ref--button').first().click();
    await page.locator('.source-drawer .source-code').waitFor();
    await page.screenshot({ path: resolve(process.env.DOCS_SCREENSHOTS, 'source-explorer.png') });
  }
});
