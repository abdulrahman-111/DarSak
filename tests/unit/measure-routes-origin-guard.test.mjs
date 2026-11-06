import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { expect, it } from 'vitest';
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
  return new Promise(resolve => server.close(resolve));
}

it('blocks an external HTTP redirect before the destination server receives it', async ({
  skip,
}) => {
  let destinationRequests = 0;
  const destination = createServer((_request, response) => {
    destinationRequests++;
    response.end('should not be reached');
  });
  let destinationOrigin;
  try {
    destinationOrigin = await listen(destination);
  } catch (error) {
    if (error.code === 'EPERM') skip('This runner does not permit loopback fixture servers.');
    throw error;
  }
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
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const { frameTree } = await cdp.send('Page.getFrameTree');
    disableGuard = await installMainFrameOriginGuard(cdp, entryOrigin, frameTree.frame.id, () => {
      blocked = true;
    });

    await page.goto(entryOrigin, { waitUntil: 'domcontentloaded' }).catch(() => {});

    expect(blocked).toBe(true);
    expect(destinationRequests).toBe(0);
  } finally {
    await disableGuard?.();
    await context?.close();
    await browser?.close();
    await close(entry);
    await close(destination);
  }
}, 20_000);
