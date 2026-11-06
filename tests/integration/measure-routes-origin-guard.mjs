import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { chromium } from '@playwright/test';
import { installMainFrameOriginGuard } from '../../scripts/measure-routes.mjs';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  );
}

test('blocks an external HTTP redirect before the destination server receives it', async () => {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  assert.ok(executablePath, 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH must select the test browser');
  await access(executablePath, constants.X_OK);

  let destinationRequests = 0;
  const destination = createServer((_request, response) => {
    destinationRequests++;
    response.end('should not be reached');
  });
  const destinationOrigin = await listen(destination);
  const entry = createServer((_request, response) => {
    response.writeHead(302, { location: destinationOrigin });
    response.end();
  });
  const entryOrigin = await listen(entry);
  let browser;
  let context;
  let disableGuard;
  let blocked = false;
  try {
    browser = await chromium.launch({ headless: true, executablePath });
    context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const { frameTree } = await cdp.send('Page.getFrameTree');
    disableGuard = await installMainFrameOriginGuard(cdp, entryOrigin, frameTree.frame.id, () => {
      blocked = true;
    });

    await page.goto(entryOrigin, { waitUntil: 'domcontentloaded' }).catch(() => {});

    assert.equal(blocked, true, 'the cross-origin redirect hop should be intercepted');
    assert.equal(destinationRequests, 0, 'the blocked destination must receive no request');
  } finally {
    await disableGuard?.();
    await context?.close();
    await browser?.close();
    await close(entry);
    await close(destination);
  }
});
