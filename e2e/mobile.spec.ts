import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const shot = (p: Page, name: string) => {
  fs.mkdirSync('e2e/shots', { recursive: true });
  return p.screenshot({ path: path.join('e2e/shots', `${name}.png`) });
};

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto('/');
  await expect(page.getByTestId('node-text')).toBeVisible();
});

test('starter graph loads, fits on a phone, no horizontal scroll', async ({ page }) => {
  await expect(page.getByTestId('node-image')).toBeVisible();
  await expect(page.getByTestId('node-video')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByTestId('mode-chip')).toHaveText('Demo mode');
  await shot(page, '01-starter');
});

test('tap image node, generate in demo mode, result appears on the card', async ({ page }) => {
  await page.getByTestId('node-image').tap();
  const sheet = page.getByTestId('inspector');
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('mode-hint')).toContainText('Text to image');
  await expect(page.getByTestId('mode-hint')).toContainText('fal-ai/nano-banana-pro');
  await page.getByTestId('generate').tap();
  await expect(page.locator('.card.k-image img')).toBeVisible({ timeout: 10_000 });
  await expect(sheet.getByRole('button', { name: 'Result 1' })).toBeVisible();
  await sheet.getByText('Last request').tap();
  await expect(sheet.locator('pre')).toContainText('"num_images": 1');
  await shot(page, '02-image-result');
});

test('video node runs the pending upstream image first, then image-to-video', async ({ page }) => {
  await page.getByTestId('node-video').tap();
  await expect(page.getByTestId('mode-hint')).toContainText('Image to video');
  await expect(page.getByTestId('mode-hint')).toContainText('bytedance/seedance-2.0/image-to-video');
  await expect(page.getByTestId('generate')).toContainText('runs 1 upstream first');
  await page.getByTestId('generate').tap();
  await expect(page.locator('.card.k-video video')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.card.k-image img')).toBeVisible();
  await page.getByText('Last request').tap();
  const req = await page.locator('.sheet pre').innerText();
  expect(req).toContain('bytedance/seedance-2.0/image-to-video');
  expect(req).toContain('"image_url"');
  expect(req).toContain('"generate_audio": true');
  await shot(page, '03-video-result');
});

test('add nodes from the toolbar, connect via chips, switch model', async ({ page }) => {
  await page.getByRole('button', { name: '+ Prompt' }).tap();
  const sheet = page.getByTestId('inspector');
  await sheet.getByPlaceholder('Describe what you want').fill('a red fox in snow');
  await sheet.getByRole('button', { name: 'Done' }).tap();

  await page.getByRole('button', { name: '+ Image' }).tap();
  await sheet.getByLabel('Node name').fill('Fox');
  await sheet.locator('select').first().selectOption('gpt-image-2');
  await expect(sheet.getByTestId('mode-hint')).toContainText('openai/gpt-image-2');
  await sheet.getByRole('button', { name: /Prompt/ }).last().tap();
  await sheet.getByTestId('generate').tap();
  await expect(page.locator('.card.k-image', { hasText: 'Fox' }).locator('img')).toBeVisible({ timeout: 10_000 });
  await shot(page, '04-new-nodes');
});

test('upload a photo and use it as a reference', async ({ page }) => {
  await page.getByRole('button', { name: '+ Photo' }).tap();
  const sheet = page.getByTestId('inspector');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await sheet.getByTestId('file-input').setInputFiles({ name: 'ref.png', mimeType: 'image/png', buffer: png });
  await expect(sheet.locator('img.preview')).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await page.getByTestId('node-image').tap();
  await page.getByRole('button', { name: /Upload/ }).tap();
  await expect(page.getByTestId('mode-hint')).toContainText('Edit with 1 reference image');
  await expect(page.getByTestId('mode-hint')).toContainText('fal-ai/nano-banana-pro/edit');
});

test('gallery, persistence across reload, settings and live-mode guard', async ({ page }) => {
  await page.getByTestId('node-image').tap();
  await page.getByTestId('generate').tap();
  await expect(page.locator('.card.k-image img')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('inspector').getByRole('button', { name: 'Done' }).tap();

  await page.getByRole('button', { name: 'Gallery' }).tap();
  await expect(page.getByTestId('gallery')).toContainText('Gallery (1)');
  await page.getByTestId('gallery').getByRole('button', { name: /image from/ }).tap();
  await page.getByRole('button', { name: 'Add to canvas' }).tap();
  await expect(page.getByTestId('node-upload')).toBeVisible();

  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('.card.k-image img')).toBeVisible();
  await expect(page.getByTestId('node-upload')).toBeVisible();

  // Live mode without a key must fail clearly, not silently.
  await page.getByTestId('mode-chip').tap();
  await page.getByRole('button', { name: 'fal.ai (real)' }).tap();
  await page.getByTestId('settings').getByRole('button', { name: 'Done' }).tap();
  await expect(page.getByTestId('mode-chip')).toHaveText('fal.ai live');
  await page.locator('.card.k-image').first().tap();
  await page.getByTestId('generate').tap();
  await expect(page.getByRole('alert')).toContainText('fal.ai key', { timeout: 10_000 });
  await shot(page, '05-live-no-key');
});

test('live mode sends the right request to fal (network stubbed)', async ({ page }) => {
  const seen: { url: string; auth: string | undefined; body: string }[] = [];
  await page.route(/fal\.(run|ai)/, async (route) => {
    const req = route.request();
    seen.push({ url: req.url(), auth: req.headers()['authorization'], body: req.postData() ?? '' });
    const u = req.url();
    if (req.method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          request_id: 'r1',
          status: 'IN_QUEUE',
          status_url: 'https://queue.fal.run/fal-ai/nano-banana-pro/requests/r1/status',
          response_url: 'https://queue.fal.run/fal-ai/nano-banana-pro/requests/r1',
        }),
      });
    }
    if (u.endsWith('/status')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'COMPLETED', request_id: 'r1' }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ images: [{ url: 'https://example.invalid/out.png' }], description: '' }),
    });
  });

  await page.getByTestId('mode-chip').tap();
  await page.getByRole('button', { name: 'fal.ai (real)' }).tap();
  await page.getByTestId('fal-key').fill('test-id:test-secret');
  await page.getByTestId('settings').getByRole('button', { name: 'Done' }).tap();
  await page.getByTestId('node-image').tap();
  await page.getByTestId('generate').tap();
  await expect.poll(() => seen.length, { timeout: 15_000 }).toBeGreaterThan(0);
  const first = seen[0];
  expect(first.url).toContain('fal-ai/nano-banana-pro');
  expect(first.auth).toBe('Key test-id:test-secret');
  const body = JSON.parse(first.body);
  expect(body).toMatchObject({ aspect_ratio: '1:1', resolution: '1K', num_images: 1 });
  expect(body.prompt).toContain('ramen shop');
});

test('fal rejection shows a readable reason, not a blank error', async ({ page }) => {
  await page.route(/fal\.(run|ai)/, (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'User is locked. Reason: Exhausted balance.' }),
    }),
  );
  await page.getByTestId('mode-chip').tap();
  await page.getByRole('button', { name: 'fal.ai (real)' }).tap();
  await page.getByTestId('fal-key').fill('test-id:test-secret');
  await page.getByTestId('settings').getByRole('button', { name: 'Done' }).tap();
  await page.getByTestId('node-image').tap();
  await page.getByTestId('generate').tap();
  await expect(page.getByRole('alert')).toContainText('Exhausted balance', { timeout: 15_000 });
  await shot(page, '06-fal-403');
});

const goLive = async (page: Page) => {
  await page.getByTestId('mode-chip').tap();
  await page.getByRole('button', { name: 'fal.ai (real)' }).tap();
  await page.getByTestId('fal-key').fill('test-id:test-secret');
  await page.getByTestId('settings').getByRole('button', { name: 'Done' }).tap();
};

test('a fal job survives a page reload and its image still arrives', async ({ page }) => {
  let done = false;
  const seen: string[] = [];
  await page.route(/fal\.(run|ai)/, (route) => {
    const req = route.request();
    const u = req.url();
    seen.push(`${req.method()} ${u}`);
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() === 'POST')
      return json({
        request_id: 'r9',
        status: 'IN_QUEUE',
        status_url: 'https://queue.fal.run/fal-ai/nano-banana-pro/requests/r9/status',
        response_url: 'https://queue.fal.run/fal-ai/nano-banana-pro/requests/r9',
      });
    if (u.includes('/status')) return json({ status: done ? 'COMPLETED' : 'IN_PROGRESS', request_id: 'r9', logs: [] });
    return json({ images: [{ url: 'https://example.invalid/resumed.png' }], description: '' });
  });
  await goLive(page);
  await page.getByTestId('node-image').tap();
  await page.getByTestId('generate').tap();
  await expect(page.getByTestId('generate')).toHaveText('Generating', { timeout: 15_000 });
  await page.getByTestId('last-request').tap();
  await expect(page.getByTestId('inspector')).toContainText('fal request id: r9');

  // Phone discards the background tab, user comes back.
  await page.reload();
  done = true;
  await expect(page.getByTestId('node-image').locator('img')).toHaveAttribute('src', /resumed\.png/, { timeout: 15_000 });
  expect(seen.filter((s) => s.startsWith('POST'))).toHaveLength(1); // resumed, not re-submitted (billed once)
  await shot(page, '07-fal-resumed');
});

test('a reload before fal queues the job shows Interrupted, not a blank node', async ({ page }) => {
  await page.route(/fal\.(run|ai)/, () => {
    /* never answer: the submit is still in flight when the page reloads */
  });
  await goLive(page);
  await page.getByTestId('node-image').tap();
  await page.getByTestId('generate').tap();
  await expect(page.getByTestId('generate')).toHaveText('Sending to fal', { timeout: 15_000 });
  await page.reload();
  await expect(page.getByTestId('node-image')).toContainText('Interrupted', { timeout: 15_000 });
});

test('fal 401 tells the user to replace the key; a half key is flagged in Settings', async ({ page }) => {
  await page.route(/fal\.(run|ai)/, (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Cannot access application "fal-ai/nano-banana-pro". Authentication is required to access this application.' }),
    }),
  );
  await page.getByTestId('mode-chip').tap();
  await page.getByRole('button', { name: 'fal.ai (real)' }).tap();
  await page.getByTestId('fal-key').fill('onlyonepart');
  await expect(page.getByTestId('key-problem')).toContainText('id:secret');
  await page.getByTestId('fal-key').fill(' Key test-id:test-secret ');
  await expect(page.getByTestId('key-problem')).toHaveCount(0);
  await page.getByTestId('settings').getByRole('button', { name: 'Done' }).tap();
  await page.getByTestId('node-image').tap();
  await page.getByTestId('generate').tap();
  await expect(page.getByRole('alert')).toContainText('fal.ai/dashboard/keys', { timeout: 15_000 });
});
