#!/usr/bin/env node

/** Generate the screenshot gallery and route coverage report from capture manifests. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const screenshotsRoot = path.join(repoRoot, 'docs/screenshots');
const inventoryPath = path.join(screenshotsRoot, 'route-inventory.json');
const readmePath = path.join(screenshotsRoot, 'README.md');
const contactSheetPath = path.join(screenshotsRoot, 'index.html');
const contactAssetRoot = path.join(screenshotsRoot, 'contact-sheet-assets');
const contactAssetMap = new Map();
const locales = ['en', 'ar'];
const viewports = ['desktop', 'mobile'];
const matrixOrder = ['en-desktop', 'ar-desktop', 'en-mobile', 'ar-mobile'];

function relativeLink(fromFile, artifactPath) {
  const resolved = path.resolve(repoRoot, artifactPath);
  if (resolved !== repoRoot && !resolved.startsWith(`${repoRoot}${path.sep}`)) return null;
  return path.relative(path.dirname(fromFile), resolved).split(path.sep).join('/');
}

function safeImageTarget(artifactPath) {
  const resolved = path.resolve(repoRoot, artifactPath);
  return contactAssetMap.get(resolved) ?? artifactPath;
}

async function walk(directory) {
  const found = [];
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(fullPath)));
    else if (entry.isFile()) found.push(fullPath);
  }
  return found;
}

function environmentForManifest(manifestPath) {
  const relative = path.relative(screenshotsRoot, manifestPath).split(path.sep).join('/');
  if (/campaign/i.test(relative)) return 'campaign';
  if (/staging/i.test(relative)) return 'staging';
  return 'production';
}

function normalizeLocale(record) {
  if (locales.includes(record.locale)) return record.locale;
  const route = String(record.logicalRoute ?? '');
  return route.match(/^\/(en|ar)(?:\/|$)/)?.[1] ?? null;
}

function normalizeViewport(record) {
  if (viewports.includes(record.viewport)) return record.viewport;
  const dimensions = record.dimensions;
  if (dimensions?.width === 1440 || dimensions?.width === 2880) return 'desktop';
  if (dimensions?.width === 390 || dimensions?.width === 780) return 'mobile';
  return null;
}

function routeParts(record, environment) {
  const raw = String(record.logicalRoute ?? '');
  const prefixed = raw.match(/^(public|admin|staging):(.+)$/);
  if (prefixed) return { app: prefixed[1], route: prefixed[2] };
  const localePath = raw.replace(/^\/(?:en|ar)(?=\/|$)/, '') || '/';
  if (environment === 'staging') return { app: 'staging', route: localePath };
  if (environment === 'campaign') return { app: record.app ?? 'public', route: localePath };
  if (
    record.role === 'admin' ||
    record.feature === 'admin sign in' ||
    localePath.startsWith('/admin') ||
    (localePath === '/notifications' && record.feature === 'notifications')
  ) {
    return { app: 'admin', route: localePath };
  }
  return { app: 'public', route: localePath };
}

function routePatternMatches(pattern, actual) {
  const expectedSegments = pattern.split('/').filter(Boolean);
  const actualSegments = actual.split('/').filter(Boolean);
  let actualIndex = 0;
  for (let index = 0; index < expectedSegments.length; index += 1) {
    const segment = expectedSegments[index];
    if (segment === '[...segments]') return index === expectedSegments.length - 1;
    if (actualIndex >= actualSegments.length) return false;
    if (
      !(segment.startsWith('[') && segment.endsWith(']')) &&
      segment !== actualSegments[actualIndex]
    )
      return false;
    actualIndex += 1;
  }
  return actualIndex === actualSegments.length;
}

function inventoryId(record, environment, inventoryEntries = []) {
  const { app, route: unfilteredRoute } = routeParts(record, environment);
  const route = unfilteredRoute.split('?')[0];
  const exact = `${app}:${route}`;
  if (inventoryEntries.some(entry => entry.id === exact)) return exact;
  const matches = inventoryEntries
    .filter(
      entry =>
        entry.id.startsWith(`${app}:`) &&
        routePatternMatches(entry.id.slice(app.length + 1), route),
    )
    .sort((left, right) => {
      const score = id =>
        id.split('/').filter(part => part && !(part.startsWith('[') && part.endsWith(']'))).length;
      return score(right.id) - score(left.id);
    });
  return matches[0]?.id ?? exact.replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '[id]');
}

function sectionFor(record, environment) {
  if (environment === 'campaign') return 'Campaign high resolution';
  if (environment === 'staging') return 'Staging pilots';
  const { app, route } = routeParts(record, environment);
  if (app === 'admin' || record.role === 'admin') return 'Admin';
  if (route === '/account' || route.startsWith('/account/')) return 'Account';
  if (record.role === 'student' || route.startsWith('/student/')) return 'Student';
  if (record.role === 'teacher' || route.startsWith('/teacher/')) return 'Teacher';
  if (
    record.role === 'authenticated' &&
    ['/notifications', '/reports', '/timetable'].includes(route)
  )
    return 'Account';
  return 'Public';
}

function cellKey(locale, viewport) {
  return `${locale}-${viewport}`;
}

function prettyFeature(record, inventoryEntry, environment) {
  if (environment === 'campaign' && record.title) return safeLabel(record.title);
  const feature = String(record.feature ?? 'default');
  const label =
    feature !== 'default'
      ? feature
      : (inventoryEntry?.title ??
        String(record.logicalRoute ?? 'View').replace(/^(public|admin|staging):/, ''));
  if (environment !== 'staging' || !record.state) return label;
  const providerLimited = stagingFeatureFamily(record) ? ' (provider-limited)' : '';
  return `${label} — ${record.state}${providerLimited}`;
}

function stagingFeatureFamily(record) {
  const label = `${record.feature ?? ''} ${record.state ?? ''}`.toLowerCase();
  if (/\bsandak\b/.test(label)) return 'staging:sandak';
  if (/\bgoogle\s*meet\b|\bmeet\b/.test(label)) return 'staging:meet';
  return null;
}

async function loadManifestFiles() {
  const files = (await walk(screenshotsRoot)).filter(file => {
    if (!file.endsWith('.json') || file === inventoryPath) return false;
    const name = path.basename(file).toLowerCase();
    return name.includes('capture') || name.includes('manifest');
  });
  const manifests = [];
  for (const file of files.sort()) {
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!Array.isArray(parsed)) continue;
      manifests.push({ path: file, environment: environmentForManifest(file), entries: parsed });
    } catch (error) {
      console.warn(
        `Skipping unreadable capture manifest ${path.relative(repoRoot, file)}: ${error.message}`,
      );
    }
  }
  return manifests;
}

async function recordArtifact(record) {
  if (record.status !== 'captured' || typeof record.path !== 'string') return false;
  const resolved = path.resolve(repoRoot, record.path);
  if (resolved !== repoRoot && !resolved.startsWith(`${repoRoot}${path.sep}`)) return false;
  try {
    return (await fs.stat(resolved)).isFile();
  } catch {
    return false;
  }
}

function isChooseRoleFallback(record) {
  const route = String(record.logicalRoute ?? '');
  return route.endsWith(':/choose-role') && String(record.finalURL ?? '').includes('/login');
}

function specialRouteNote(entry, manifestRecords, fileStates) {
  if (entry.id === 'public:/choose-role') {
    const successful = manifestRecords.some(
      ({ record }) =>
        record.status === 'captured' &&
        record.feature === 'synthetic-google-identity' &&
        record.path &&
        fileStates.get(path.resolve(repoRoot, record.path)) === true,
    );
    if (successful)
      return 'Captured using a synthetic Google identity; live Google OAuth was not exercised.';
    const fallback = manifestRecords.find(({ record }) => isChooseRoleFallback(record))?.record;
    if (fallback)
      return (
        fallback.error ??
        'No verified Google identity was available; the chooser state was not captured.'
      );
  }
  if (entry.id === 'public:/reset-password') {
    const successful = manifestRecords.some(
      ({ record }) =>
        record.status === 'captured' &&
        record.feature === 'verified-recovery' &&
        record.path &&
        fileStates.get(path.resolve(repoRoot, record.path)) === true,
    );
    if (successful)
      return 'Captured with a verified synthetic recovery context; no real password reset was submitted.';
    const record = manifestRecords.find(({ record }) => record.status === 'blocked')?.record;
    const reason = record?.reason ?? record?.error;
    return (
      reason || 'Requires a verified recovery session; none was available in the local fixtures.'
    );
  }
  return null;
}

function renderLink(record, exists, readmePath, { fallback = false } = {}) {
  if (!record?.path) return '—';
  const href = relativeLink(readmePath, safeImageTarget(record.path));
  if (!href) return '—';
  if (!exists) return `Missing file: ${record.path}`;
  const label = fallback ? 'Observed login fallback' : 'Open';
  return `[${label}](${href})`;
}

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '&#124;')
    .replaceAll('\n', ' ');
}

function markdownTable(headers, rows) {
  if (rows.length === 0) return '_No manifest-backed captures are available yet._\n';
  return (
    [
      `| ${headers.join(' | ')} |`,
      `| ${headers.map(() => '---').join(' | ')} |`,
      ...rows.map(row => `| ${row.map(htmlEscape).join(' | ')} |`),
    ].join('\n') + '\n'
  );
}

function safeLabel(value, fallback = '—') {
  const cleaned = String(value ?? '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b(password|token|secret|api[_ -]?key)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '[id]')
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .slice(0, 160);
  return cleaned || fallback;
}

function contactSheetData(manifests, inventory) {
  const entries = [];
  for (const manifest of manifests) {
    for (const record of manifest.entries) {
      if (record.status !== 'captured' || typeof record.path !== 'string') continue;
      if (
        !/^docs\/screenshots\/[A-Za-z0-9._/-]+\.(?:webp|png|jpe?g)$/i.test(record.path) ||
        /(?:^|\/)\.\.(?:\/|$)/.test(record.path)
      )
        continue;
      const resolved = path.resolve(repoRoot, record.path);
      if (resolved !== repoRoot && !resolved.startsWith(`${repoRoot}${path.sep}`)) continue;
      if (!resolved.startsWith(`${screenshotsRoot}${path.sep}`)) continue;
      const sourceRouteId = inventoryId(record, manifest.environment, inventory.entries);
      const inventoryEntry = inventory.entries.find(entry => entry.id === sourceRouteId);
      const sanitizedRouteId = safeLabel(sourceRouteId);
      const pixelDimensions = record.pixelDimensions ?? record.dimensions;
      const dimensions =
        pixelDimensions &&
        Number.isFinite(pixelDimensions.width) &&
        Number.isFinite(pixelDimensions.height)
          ? { width: pixelDimensions.width, height: pixelDimensions.height }
          : null;
      const cssDimensions =
        record.cssDimensions &&
        Number.isFinite(record.cssDimensions.width) &&
        Number.isFinite(record.cssDimensions.height)
          ? { width: record.cssDimensions.width, height: record.cssDimensions.height }
          : null;
      const downloadSlug =
        sanitizedRouteId
          .replace(/^[^:]+:/, '')
          .replace(/\[[^\]]+\]/g, 'item')
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 72) || 'view';
      entries.push({
        route: sanitizedRouteId,
        feature: safeLabel(prettyFeature(record, inventoryEntry, manifest.environment)),
        role: safeLabel(record.role ?? inventoryEntry?.role),
        sourceEnvironment: manifest.environment,
        captureEnvironment: /\blocal\b/i.test(String(record.actualEnvironment ?? ''))
          ? 'local synthetic capture'
          : 'environment not recorded',
        locale: locales.includes(record.locale) ? record.locale : 'en',
        viewport: normalizeViewport(record) ?? 'other',
        dimensions,
        cssDimensions,
        image: path
          .relative(
            path.dirname(contactSheetPath),
            path.resolve(repoRoot, safeImageTarget(path.relative(repoRoot, resolved))),
          )
          .split(path.sep)
          .join('/'),
        sourceImage: path.relative(repoRoot, resolved),
        filename: `darsak-${downloadSlug}-${record.locale ?? 'en'}-${normalizeViewport(record) ?? 'view'}${path.extname(resolved)}`,
        sourceRevision: safeLabel(record.sourceRevision, 'unknown'),
        capturedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(record.capturedAt ?? ''))
          ? record.capturedAt
          : 'time not recorded',
      });
    }
  }
  const unique = new Map(
    entries.map(entry => [`${entry.image}\u0000${entry.locale}\u0000${entry.viewport}`, entry]),
  );
  return [...unique.values()].sort(
    (a, b) =>
      a.sourceEnvironment.localeCompare(b.sourceEnvironment) ||
      a.route.localeCompare(b.route) ||
      a.locale.localeCompare(b.locale) ||
      a.viewport.localeCompare(b.viewport),
  );
}

async function renderContactSheet(manifests, inventory, fileStates) {
  const entries = contactSheetData(manifests, inventory).filter(
    entry => fileStates.get(path.resolve(repoRoot, entry.sourceImage)) === true,
  );
  for (const entry of entries) delete entry.sourceImage;
  const embeddedData = JSON.stringify(entries).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Offline screenshot library for local synthetic DarSak UI captures.">
  <title>DarSak Screenshot Library</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f1e7; color: #183d3c; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; }
    header { padding: 2.5rem max(1rem, calc((100vw - 1440px) / 2)); background: #163e3c; color: #fffaf0; }
    header h1 { margin: 0; font-size: clamp(1.8rem, 4vw, 3.1rem); letter-spacing: -.04em; }
    header p { max-width: 70rem; color: #d7e6dd; line-height: 1.6; }
    main { max-width: 1440px; margin: auto; padding: 1.25rem; }
    .notice { border-left: 4px solid #df7a42; background: #fffaf0; padding: .9rem 1rem; line-height: 1.5; border-radius: .4rem; }
    .filters { display: grid; grid-template-columns: minmax(15rem, 2fr) repeat(4, minmax(9rem, 1fr)) auto; gap: .7rem; margin: 1rem 0; }
    input, select, button { min-height: 2.8rem; border: 1px solid #c9d2ca; border-radius: .55rem; padding: .55rem .7rem; background: white; color: #183d3c; font: inherit; }
    button { cursor: pointer; font-weight: 700; }
    .summary { display: flex; justify-content: space-between; gap: 1rem; align-items: center; margin: 1rem 0; color: #536c68; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 1rem; }
    .card { overflow: hidden; border: 1px solid #d9ded7; border-radius: .8rem; background: white; box-shadow: 0 3px 14px #163e3c12; }
    .preview { display: block; aspect-ratio: 16 / 10; background: #e9e5da; overflow: hidden; }
    .preview img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top center; }
    .body { padding: .9rem; }
    .body h2 { margin: 0 0 .45rem; font-size: 1.05rem; line-height: 1.3; overflow-wrap: anywhere; }
    .route { color: #5f7671; font-size: .84rem; overflow-wrap: anywhere; }
    .chips { display: flex; flex-wrap: wrap; gap: .35rem; margin: .75rem 0; }
    .chip { border-radius: 999px; background: #edf3ef; padding: .25rem .55rem; font-size: .75rem; }
    .meta { color: #61746e; font-size: .76rem; line-height: 1.5; overflow-wrap: anywhere; }
    .actions { display: flex; gap: .7rem; margin-top: .75rem; }
    a { color: #075d59; font-weight: 700; }
    a.button { display: inline-block; border-radius: .45rem; background: #08655e; color: white; padding: .55rem .7rem; text-decoration: none; font-size: .85rem; }
    a.download { padding: .55rem .15rem; font-size: .85rem; }
    .empty { padding: 2rem; text-align: center; color: #61746e; background: white; border-radius: .8rem; }
    footer { margin: 2rem 0 1rem; color: #61746e; font-size: .85rem; }
    @media (max-width: 900px) { .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } .filters input { grid-column: 1 / -1; } }
    @media (max-width: 500px) { main { padding: .8rem; } .filters { grid-template-columns: 1fr; } .filters input { grid-column: auto; } .summary { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body>
  <header>
    <h1>DarSak screenshot library</h1>
    <p>Browse and download successful, manifest-backed UI captures from local synthetic builds. The source revision identifies the code represented; it does not indicate a live production or staging capture.</p>
  </header>
  <main>
    <p class="notice"><strong>Offline use:</strong> open this file from a downloaded or cloned repository. The filters work without a server or network connection. GitHub shows this HTML as source and does not run the interactive gallery.</p>
    <div class="filters" aria-label="Screenshot filters">
      <input id="search" type="search" placeholder="Search route or feature" aria-label="Search route or feature">
      <select id="role" aria-label="Filter by role"><option value="">All roles</option></select>
      <select id="environment" aria-label="Filter by source environment"><option value="">All source environments</option></select>
      <select id="locale" aria-label="Filter by language"><option value="">All languages</option></select>
      <select id="device" aria-label="Filter by device"><option value="">All devices</option></select>
      <button id="clear" type="button">Clear filters</button>
    </div>
    <div class="summary"><strong id="count" aria-live="polite"></strong><span>Choose “Open full image” or “Download” for the original capture.</span></div>
    <section id="grid" class="grid" aria-label="Screenshot captures"></section>
    <footer>Full-page WebP captures show page layout and scroll context. Campaign PNG exports should be authored at their listed native 2× dimensions; a full-page WebP is not a substitute for a high-resolution campaign source. See README.md for provenance and coverage details.</footer>
  </main>
  <script id="capture-data" type="application/json">${embeddedData}</script>
  <script>
    (() => {
      const captures = JSON.parse(document.getElementById('capture-data').textContent);
      const labels = { locale: { en: 'English', ar: 'Arabic' }, device: { desktop: 'Desktop', mobile: 'Mobile', other: 'Other' }, environment: { production: 'Production code', staging: 'Staging code', campaign: 'Campaign asset' } };
      const controls = { search: document.getElementById('search'), role: document.getElementById('role'), environment: document.getElementById('environment'), locale: document.getElementById('locale'), device: document.getElementById('device') };
      const grid = document.getElementById('grid');
      const count = document.getElementById('count');
      const fill = (control, values, labelMap = {}) => values.forEach((value) => { const option = document.createElement('option'); option.value = value; option.textContent = labelMap[value] || value; control.append(option); });
      fill(controls.role, [...new Set(captures.map((item) => item.role))].sort());
      fill(controls.environment, [...new Set(captures.map((item) => item.sourceEnvironment))].sort(), labels.environment);
      fill(controls.locale, [...new Set(captures.map((item) => item.locale))].sort(), labels.locale);
      fill(controls.device, [...new Set(captures.map((item) => item.viewport))].sort(), labels.device);
      const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
      const render = () => {
        const query = controls.search.value.trim().toLowerCase();
        const visible = captures.filter((item) => (!controls.role.value || item.role === controls.role.value)
          && (!controls.environment.value || item.sourceEnvironment === controls.environment.value)
          && (!controls.locale.value || item.locale === controls.locale.value)
          && (!controls.device.value || item.viewport === controls.device.value)
          && (!query || [item.route, item.feature, item.role, item.sourceEnvironment, item.sourceRevision].join(' ').toLowerCase().includes(query)));
        grid.replaceChildren();
        count.textContent = visible.length + (visible.length === 1 ? ' capture' : ' captures');
        if (!visible.length) { grid.append(element('p', 'empty', 'No captures match these filters.')); return; }
        for (const item of visible) {
          const card = element('article', 'card');
          const previewLink = element('a', 'preview'); previewLink.href = item.image; previewLink.setAttribute('aria-label', 'Open full image for ' + item.feature);
          const image = document.createElement('img'); image.src = item.image; image.alt = item.feature + ' — ' + item.route; image.loading = 'lazy'; image.decoding = 'async'; previewLink.append(image);
          const body = element('div', 'body'); body.append(element('h2', '', item.feature), element('div', 'route', item.route));
          const chips = element('div', 'chips');
          for (const tag of [item.role, labels.environment[item.sourceEnvironment] || item.sourceEnvironment, labels.locale[item.locale] || item.locale, labels.device[item.viewport] || item.viewport, item.captureEnvironment]) chips.append(element('span', 'chip', tag));
          body.append(chips);
          const dimensions = item.dimensions ? item.dimensions.width + ' × ' + item.dimensions.height + ' px' : 'Dimensions not recorded';
          const cssDimensions = item.cssDimensions ? ' · CSS ' + item.cssDimensions.width + ' × ' + item.cssDimensions.height + (item.dimensions && item.dimensions.width === item.cssDimensions.width * 2 ? ' (2×)' : '') : '';
          body.append(element('div', 'meta', dimensions + cssDimensions + ' · Source ' + item.sourceRevision + ' · Captured ' + item.capturedAt));
          const actions = element('div', 'actions'); const open = element('a', 'button', 'Open full image'); open.href = item.image; open.target = '_blank'; open.rel = 'noopener';
          const download = element('a', 'download', 'Download'); download.href = item.image; download.download = item.filename;
          actions.append(open, download); body.append(actions); card.append(previewLink, body); grid.append(card);
        }
      };
      Object.values(controls).forEach((control) => control.addEventListener('input', render));
      Object.values(controls).filter((control) => control.tagName === 'SELECT').forEach((control) => control.addEventListener('change', render));
      document.getElementById('clear').addEventListener('click', () => { controls.search.value = ''; for (const key of ['role', 'environment', 'locale', 'device']) controls[key].value = ''; render(); });
      render();
    })();
  </script>
</body>
</html>
`;
}

function makeGalleryGroups(manifests, inventoryById, inventoryEntries) {
  const groups = new Map();
  for (const manifest of manifests) {
    for (const record of manifest.entries) {
      if (record.status === 'alias' || record.status === 'nonvisual') continue;
      const section = sectionFor(record, manifest.environment);
      const routeId = inventoryId(record, manifest.environment, inventoryEntries);
      const inventoryEntry = inventoryById.get(routeId);
      const feature = prettyFeature(record, inventoryEntry, manifest.environment);
      const role = record.role ?? inventoryEntry?.role ?? '—';
      const campaignAsset =
        manifest.environment === 'campaign' ? (record.assetName ?? record.path ?? '') : '';
      const key = [section, role, routeId, feature, campaignAsset].join('\u0000');
      if (!groups.has(key))
        groups.set(key, {
          section,
          role,
          routeId,
          feature,
          records: new Map(),
          artifacts: [],
          manifestPaths: new Set(),
        });
      const group = groups.get(key);
      group.manifestPaths.add(path.relative(repoRoot, manifest.path).split(path.sep).join('/'));
      group.artifacts.push({ record, environment: manifest.environment });
      const locale = normalizeLocale(record);
      const viewport = normalizeViewport(record);
      if (locale && viewport)
        group.records.set(cellKey(locale, viewport), { record, environment: manifest.environment });
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.section.localeCompare(b.section) ||
      a.routeId.localeCompare(b.routeId) ||
      a.feature.localeCompare(b.feature),
  );
}

function routeCoverage(inventory, manifests, fileStates) {
  const coverage = [];
  for (const entry of inventory.entries ?? []) {
    const expected = entry.capture_matrix ?? [];
    const records = manifests.flatMap(manifest =>
      manifest.entries
        .filter(
          record =>
            manifest.environment !== 'campaign' &&
            inventoryId(record, manifest.environment, inventory.entries) === entry.id,
        )
        .map(record => ({ manifest, record })),
    );
    if (entry.classification === 'redirect') {
      const observed = records.find(({ record }) => record.status === 'alias');
      coverage.push({
        entry,
        status: 'alias',
        detail: observed?.record.target
          ? `Alias to ${observed.record.target}`
          : (entry.target ?? 'Redirect alias; no duplicate image expected.'),
      });
      continue;
    }
    if (entry.classification === 'nonvisual_api') {
      coverage.push({
        entry,
        status: 'nonvisual',
        detail: 'API route; no browser screenshot expected.',
      });
      continue;
    }
    if (entry.classification === 'not_found') {
      coverage.push({
        entry,
        status: 'not applicable',
        detail: 'Deliberate catch-all 404; excluded from feature gallery.',
      });
      continue;
    }
    if (entry.classification === 'feature_state') {
      const stateRecords = manifests
        .filter(manifest => manifest.environment === 'staging')
        .flatMap(manifest => manifest.entries.map(record => ({ manifest, record })))
        .filter(({ record }) => stagingFeatureFamily(record) === entry.id);
      const verifiedRecords = stateRecords.filter(
        ({ record }) =>
          record.status === 'captured' &&
          record.path &&
          fileStates.get(path.resolve(repoRoot, record.path)) === true,
      );
      const states = [...new Set(stateRecords.map(({ record }) => record.state).filter(Boolean))];
      const providerLimit =
        entry.id === 'staging:meet'
          ? 'Provider-limited: the local pilot gate is closed; connected Google state and manual meeting-link controls were not captured. No meeting creation is claimed.'
          : 'Provider-limited: captures show local UI/templates and provider-unavailable states; no successful AI response is claimed.';
      coverage.push({
        entry,
        status: verifiedRecords.length ? 'provider-limited' : 'not captured',
        detail: verifiedRecords.length
          ? `${verifiedRecords.length} verified UI capture(s); observed states: ${states.join('; ')}. ${providerLimit}`
          : 'No manifest-backed pilot state capture is available yet.',
      });
      continue;
    }
    const routeNote = specialRouteNote(entry, records, fileStates);
    const cells = new Map();
    for (const key of expected) {
      const [locale, viewport] = key.split('-');
      const candidates = records.filter(
        ({ record }) =>
          normalizeLocale(record) === locale && normalizeViewport(record) === viewport,
      );
      const successfulCandidates = candidates.filter(
        ({ record }) =>
          record.status === 'captured' &&
          record.path &&
          fileStates.get(path.resolve(repoRoot, record.path)) === true,
      );
      const match =
        successfulCandidates.find(({ record }) => record.feature === 'default') ??
        successfulCandidates[0] ??
        candidates.find(({ record }) => record.status === 'blocked') ??
        candidates[0];
      const actualFile = match?.record.path
        ? fileStates.get(path.resolve(repoRoot, match.record.path)) === true
        : false;
      if (entry.id === 'public:/choose-role' && match && isChooseRoleFallback(match.record)) {
        cells.set(key, {
          status: 'blocked',
          reason:
            match.record.error ??
            'No verified Google identity was available; the chooser state was not captured.',
          record: match.record,
          actualFile,
        });
      } else if (match?.record.status === 'blocked') {
        cells.set(key, {
          status: 'blocked',
          reason: match.record.reason ?? match.record.error ?? 'Capture was blocked.',
          record: match.record,
          actualFile,
        });
      } else if (match?.record.status === 'captured' && actualFile) {
        cells.set(key, { status: 'captured', record: match.record, actualFile: true });
      } else {
        cells.set(key, {
          status: 'not captured',
          reason: match
            ? 'Manifest record exists, but its screenshot file is missing.'
            : 'No successful capture manifest record exists.',
        });
      }
    }
    const counts = [...cells.values()].reduce(
      (acc, cell) => ((acc[cell.status] = (acc[cell.status] ?? 0) + 1), acc),
      {},
    );
    let status;
    if (!expected.length) status = 'not captured';
    else if (counts.captured === expected.length) status = 'captured';
    else if (counts.captured > 0 || (counts['not captured'] > 0 && counts.blocked > 0))
      status = 'partial';
    else if (counts.blocked) status = 'blocked';
    else status = 'not captured';
    const details = [];
    if (routeNote) details.push(routeNote);
    const missing = counts['not captured'] ?? 0;
    if (missing)
      details.push(`${missing}/${expected.length} expected view(s) have no verified image.`);
    const blocked = counts.blocked ?? 0;
    if (blocked && !routeNote) {
      const reason = [...cells.values()].find(cell => cell.status === 'blocked')?.reason;
      if (reason) details.push(reason);
    }
    coverage.push({
      entry,
      status,
      detail:
        details.join(' ') ||
        `${counts.captured ?? 0}/${expected.length} expected view(s) have verified image files.`,
      cells,
    });
  }
  return coverage;
}

function formatSource(group, manifests) {
  const records = group.artifacts.map(({ record }) => record);
  const revisions = [...new Set(records.map(record => record.sourceRevision).filter(Boolean))];
  const timestamps = [...new Set(records.map(record => record.capturedAt).filter(Boolean))].sort();
  const source = revisions.length
    ? revisions.map(revision => `\`${revision}\``).join(', ')
    : 'source revision not recorded';
  const time = timestamps.length
    ? timestamps.map(timestamp => `\`${timestamp}\``).join(', ')
    : 'capture time not recorded';
  const local = records.some(record => /\blocal\b/i.test(String(record.actualEnvironment ?? '')))
    ? 'local synthetic capture'
    : 'environment not recorded';
  return `${local}; source ${source}; captured ${time} (UTC where marked Z)`;
}

async function renderGallery(manifests, inventory, inventoryById, fileStates) {
  const groups = makeGalleryGroups(manifests, inventoryById, inventory.entries);
  const orphanFiles = await findOrphanImages(manifests);
  const sectionOrder = [
    'Public',
    'Student',
    'Teacher',
    'Account',
    'Admin',
    'Staging pilots',
    'Campaign high resolution',
  ];
  const content = [
    '<!-- Generated by scripts/screenshots/build-gallery.mjs. Re-run after capture manifests change. -->',
    '# Screenshot gallery and coverage',
    '',
    'These images document local builds using synthetic fixtures. The source revision identifies the production or staging code represented; it does not mean the screenshot came from a live deployment. Each listed image is checked for an existing file before it is counted. Redirects, blocked routes, and missing assets remain visible in the coverage report below.',
    '',
    `Inventory: ${inventory.entries.length} route and feature entries. Source revisions: production \`${inventory.revisions?.production ?? 'unknown'}\`; staging \`${inventory.revisions?.staging ?? 'unknown'}\`.`,
    '',
    '## Gallery',
    '',
    'For each feature, links follow this order: English desktop, Arabic desktop, English mobile, Arabic mobile. A dash means that view is not in a successful manifest-backed capture. Source revision and capture time are listed per feature.',
    '',
    'For quick visual browsing, open the [contact sheet](index.html) from a cloned or downloaded repository. If the browser blocks `file://` previews, run `python3 -m http.server 4173 --bind 127.0.0.1 --directory docs/screenshots` from the repository root, then open `http://127.0.0.1:4173/`. GitHub displays the HTML as source; its filters run in a local browser.',
    '',
  ];

  for (const section of sectionOrder) {
    const selected = groups.filter(group => group.section === section);
    if (!selected.length) {
      content.push(`### ${section}`, '');
      const folder =
        section === 'Staging pilots'
          ? 'staging/'
          : section === 'Campaign high resolution'
            ? 'campaign/'
            : null;
      const unmanifested = folder
        ? orphanFiles.filter(file =>
            path.relative(screenshotsRoot, file).split(path.sep).join('/').startsWith(folder),
          )
        : [];
      if (unmanifested.length) {
        content.push(
          'The files below exist but have no capture manifest. Their provenance and state are unverified, so they are not counted in route coverage.',
          '',
        );
        content.push(
          markdownTable(
            ['Unmanifested image', 'Status'],
            unmanifested.map(file => [
              `[${path
                .relative(screenshotsRoot, file)
                .split(path.sep)
                .join('/')
                .replace(
                  /\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi,
                  '[id]',
                )}](${relativeLink(readmePath, safeImageTarget(path.relative(repoRoot, file)))})`,
              'Not counted; manifest required',
            ]),
          ),
        );
      } else {
        content.push(
          '_No manifest-backed captures or unmanifested image files are available yet._',
          '',
        );
      }
      continue;
    }
    content.push(`### ${section}`, '');
    if (section === 'Campaign high resolution') {
      const rows = selected.map(group => {
        const record = group.artifacts.map(item => item.record).find(item => item.path);
        if (!record) return [group.feature, '—', 'No file path in manifest', '—'];
        const exists = fileStates.get(path.resolve(repoRoot, record.path)) === true;
        const link = renderLink(record, exists, readmePath);
        const pixelDimensions = record.pixelDimensions ?? record.dimensions;
        const cssDimensions = record.cssDimensions;
        const dims = pixelDimensions
          ? `${pixelDimensions.width}×${pixelDimensions.height} px${cssDimensions ? ` (2× CSS ${cssDimensions.width}×${cssDimensions.height})` : ''}`
          : '—';
        return [
          group.feature,
          /\blocal\b/i.test(String(record.actualEnvironment ?? ''))
            ? 'Local synthetic'
            : 'Unspecified',
          `${link} (${dims})`,
          formatSource(group, manifests),
        ];
      });
      content.push(
        markdownTable(
          ['Campaign feature', 'Capture source', 'PNG / high resolution asset', 'Provenance'],
          rows,
        ),
      );
      continue;
    }
    const rows = selected.map(group => {
      const cells = matrixOrder.map(key => {
        const cell = group.records.get(key);
        if (!cell) return '—';
        const { record, environment } = cell;
        const exists =
          record.status === 'captured' &&
          fileStates.get(path.resolve(repoRoot, record.path)) === true;
        const chooseRoleFallback = isChooseRoleFallback(record);
        if (record.status === 'blocked' || chooseRoleFallback) {
          const reason =
            record.reason ??
            record.error ??
            (chooseRoleFallback
              ? 'Verified Google identity required; login fallback observed.'
              : 'Blocked');
          const observed =
            record.path && fileStates.get(path.resolve(repoRoot, record.path))
              ? ` ${renderLink(record, true, readmePath, { fallback: true })}.`
              : '';
          return `Blocked: ${reason}${observed}`;
        }
        return renderLink(record, exists, readmePath);
      });
      return [group.routeId, group.role, group.feature, ...cells, formatSource(group, manifests)];
    });
    content.push(
      markdownTable(
        [
          'Route',
          'Role',
          'Feature',
          'EN desktop',
          'AR desktop',
          'EN mobile',
          'AR mobile',
          'Provenance',
        ],
        rows,
      ),
    );
  }

  const campaignGroups = groups.filter(group => group.section === 'Campaign high resolution');
  content.push('## Quick campaign shortlist', '');
  if (campaignGroups.length) {
    const preferred = [/home|landing/i, /teacher.*profile|teacher.*detail/i, /group|discovery/i];
    const shortlist = preferred
      .map(pattern =>
        campaignGroups.find(group => pattern.test(`${group.feature} ${group.routeId}`)),
      )
      .filter(Boolean);
    const chosen = [...new Set(shortlist.length ? shortlist : campaignGroups)].slice(0, 5);
    content.push(
      ...chosen.map(group => {
        const record = group.artifacts
          .map(({ record }) => record)
          .find(item => item.path && fileStates.get(path.resolve(repoRoot, item.path)));
        return `- **${group.feature}** — ${record ? renderLink(record, true, readmePath) : 'No file found'}; suitable for a campaign crop after checking its visible content and locale.`;
      }),
    );
  } else {
    const capturedRoutes = new Set(
      manifests
        .filter(manifest => manifest.environment === 'production')
        .flatMap(manifest =>
          manifest.entries
            .filter(
              record =>
                record.status === 'captured' &&
                record.path &&
                fileStates.get(path.resolve(repoRoot, record.path)),
            )
            .map(record => inventoryId(record, manifest.environment, inventory.entries)),
        ),
    );
    const preferred = [
      'public:/',
      'public:/teachers',
      'public:/teachers/[id]',
      'public:/groups/[id]',
    ];
    const shortlist = preferred.filter(id => capturedRoutes.has(id));
    if (shortlist.length)
      content.push(
        ...shortlist.map(id => {
          const group = groups.find(item => item.routeId === id);
          const record = group?.artifacts
            .map(({ record }) => record)
            .find(
              item =>
                item.status === 'captured' &&
                item.path &&
                fileStates.get(path.resolve(repoRoot, item.path)),
            );
          const link = record ? ` ${renderLink(record, true, readmePath)}.` : '';
          return `- **${id}** —${link} full-page product view; review locale and crop before publishing.`;
        }),
      );
    else
      content.push(
        '_No campaign manifest or approved high-resolution campaign asset is available yet._',
      );
  }
  content.push(
    '',
    'Full-page WebP captures preserve the page layout and scrolling context at the browser viewport width; use them for product walkthroughs and internal review. A 2× PNG campaign export should be authored at its stated native dimensions, then cropped for a specific social placement. Do not treat an upscaled full-page WebP as a 2× source image.',
    '',
  );

  content.push(
    '## Route coverage',
    '',
    'Coverage is calculated from the route inventory and successful manifest records whose image files exist. `Partial` means at least one expected view is missing or blocked. `Not captured` means there is no verified image for an expected view. `Provider-limited` means UI captures exist while an external provider state remains unavailable or unverified. Rows marked blocked describe the observed restriction; they are excluded from successful coverage counts.',
    '',
  );
  const coverage = routeCoverage(inventory, manifests, fileStates);
  const statusCounts = coverage.reduce(
    (counts, item) => ((counts[item.status] = (counts[item.status] ?? 0) + 1), counts),
    {},
  );
  const expectedSlots = coverage.reduce(
    (total, item) => total + (item.entry.capture_matrix?.length ?? 0),
    0,
  );
  const successfulSlots = coverage.reduce(
    (total, item) =>
      total + [...(item.cells?.values() ?? [])].filter(cell => cell.status === 'captured').length,
    0,
  );
  content.push(
    `Route totals: ${coverage.length} inventory entries (${statusCounts.captured ?? 0} captured, ${statusCounts['provider-limited'] ?? 0} provider-limited, ${statusCounts.partial ?? 0} partial, ${statusCounts.blocked ?? 0} blocked, ${statusCounts['not captured'] ?? 0} not captured, ${statusCounts.alias ?? 0} aliases, ${statusCounts.nonvisual ?? 0} nonvisual, ${statusCounts['not applicable'] ?? 0} not applicable). Verified screenshot slots: ${successfulSlots}/${expectedSlots}.`,
    '',
  );
  const coverageRows = coverage.map(({ entry, status, detail }) => [
    entry.id,
    entry.classification,
    status,
    detail,
  ]);
  content.push(
    markdownTable(
      ['Inventory route / state', 'Classification', 'Coverage', 'Detail'],
      coverageRows,
    ),
  );

  content.push('## Image files without manifest records', '');
  if (orphanFiles.length) {
    content.push(
      'These files exist in the screenshot tree but are not counted toward route coverage until a manifest records their provenance and state.',
      '',
    );
    content.push(
      markdownTable(
        ['File', 'Use'],
        orphanFiles.map(file => [
          `[${path.relative(screenshotsRoot, file).split(path.sep).join('/')}](${relativeLink(readmePath, path.relative(repoRoot, file))})`,
          path.relative(screenshotsRoot, file).startsWith('staging/')
            ? 'Unmanifested staging pilot image'
            : 'Unmanifested image',
        ]),
      ),
    );
  } else {
    content.push('_Every screenshot image currently found has a manifest record._', '');
  }
  content.push(
    '## Regenerate',
    '',
    'Run `node scripts/screenshots/build-gallery.mjs` from the repository root after adding or refreshing capture manifests. The generator reads production, admin, staging, and campaign manifests recursively under `docs/screenshots/`, verifies each referenced image on disk, and refreshes this page.',
    'The admin capture runner uses Playwright Core 1.64.0. It imports `playwright-core` by default; set `PLAYWRIGHT_MODULE` to a package specifier or absolute entry path and `PLAYWRIGHT_EXECUTABLE_PATH`, `PLAYWRIGHT_BROWSER_PATH`, or `CHROMIUM_PATH` to use a specific browser binary. No dependency was added to the application package files.',
    '',
  );
  return content.join('\n');
}

async function findOrphanImages(manifests) {
  const referenced = new Set();
  for (const manifest of manifests) {
    for (const record of manifest.entries) {
      if (typeof record.path === 'string') referenced.add(path.resolve(repoRoot, record.path));
    }
  }
  const files = (await walk(screenshotsRoot)).filter(
    file =>
      /\.(png|webp|jpe?g)$/i.test(file) &&
      !path.relative(screenshotsRoot, file).startsWith(`contact-sheet-assets${path.sep}`),
  );
  const orphans = [];
  for (const file of files) {
    if (referenced.has(path.resolve(file))) continue;
    try {
      if ((await fs.stat(file)).isFile()) orphans.push(file);
    } catch {
      // Ignore files that disappear during generation.
    }
  }
  return orphans.sort();
}

async function prepareContactAssets() {
  await fs.rm(contactAssetRoot, { recursive: true, force: true });
  await fs.mkdir(contactAssetRoot, { recursive: true });
  const images = (await walk(screenshotsRoot)).filter(
    file =>
      /\.(png|webp|jpe?g)$/i.test(file) &&
      !path.relative(screenshotsRoot, file).startsWith(`contact-sheet-assets${path.sep}`),
  );
  for (const source of images) {
    const repositoryPath = path.relative(repoRoot, source).split(path.sep).join('/');
    if (!/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(repositoryPath)) continue;
    const digest = createHash('sha256').update(repositoryPath).digest('hex').slice(0, 16);
    const safeName = `capture-${digest}${path.extname(source)}`;
    await fs.copyFile(source, path.join(contactAssetRoot, safeName));
    contactAssetMap.set(path.resolve(source), `docs/screenshots/contact-sheet-assets/${safeName}`);
  }
}

await fs.mkdir(screenshotsRoot, { recursive: true });
const inventory = await fs
  .readFile(inventoryPath, 'utf8')
  .then(contents => JSON.parse(contents))
  .catch(error => {
    throw new Error(
      `Missing ${path.relative(repoRoot, inventoryPath)}. Add the route inventory before generating the gallery.`,
      { cause: error },
    );
  });
const manifestFiles = await loadManifestFiles();
const fileStates = new Map();
for (const manifest of manifestFiles) {
  for (const record of manifest.entries) {
    if (typeof record.path === 'string')
      fileStates.set(path.resolve(repoRoot, record.path), await recordArtifact(record));
  }
}
const inventoryById = new Map((inventory.entries ?? []).map(entry => [entry.id, entry]));
await prepareContactAssets();
await fs.writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
await fs.writeFile(
  readmePath,
  `${await renderGallery(manifestFiles, inventory, inventoryById, fileStates)}\n`,
);
await fs.writeFile(
  contactSheetPath,
  await renderContactSheet(manifestFiles, inventory, fileStates),
);
console.log(
  `Loaded ${manifestFiles.length} capture manifests and ${manifestFiles.reduce((count, manifest) => count + manifest.entries.length, 0)} capture records.`,
);
console.log(
  `Wrote ${path.relative(repoRoot, inventoryPath)}, ${path.relative(repoRoot, readmePath)}, and ${path.relative(repoRoot, contactSheetPath)}.`,
);
