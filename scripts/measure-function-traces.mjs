#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const buildDirectory = path.resolve(process.argv[2] ?? '.next');

function findManifests(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findManifests(entryPath);
    return entry.isFile() && entry.name.endsWith('.nft.json') ? [entryPath] : [];
  });
}

function formatBytes(bytes) {
  return `${bytes.toLocaleString('en-US')} bytes (${(bytes / 1024 / 1024).toFixed(2)} MiB)`;
}

function routeName(manifestPath) {
  return path.relative(buildDirectory, manifestPath).replace(/\.js\.nft\.json$/, '');
}

function isRouteManifest(manifestPath) {
  const relativePath = path.relative(buildDirectory, manifestPath).split(path.sep).join('/');
  return relativePath.startsWith('server/app/') || relativePath.startsWith('server/pages/');
}

function sharpVariant(filePath) {
  const normalizedPath = filePath.split(path.sep).join('/');
  const match = normalizedPath.match(/@img\/(sharp(?:-libvips)?-[^/]+|sharp-wasm32)/);
  return match?.[1] ?? null;
}

const manifests = findManifests(buildDirectory);
const uniqueFiles = new Map();
const sharpVariants = new Map();
let missingEntries = 0;
let summedTraceBytes = 0;
let largestRoute = null;

for (const manifestPath of manifests) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.files)) {
    throw new Error(`Invalid NFT manifest: ${routeName(manifestPath)}`);
  }

  let routeBytes = 0;
  for (const entry of manifest.files) {
    if (typeof entry !== 'string') {
      throw new Error(`Invalid file entry in NFT manifest: ${routeName(manifestPath)}`);
    }

    const resolvedPath = path.resolve(path.dirname(manifestPath), entry);
    let size;
    try {
      size = fs.statSync(resolvedPath).size;
    } catch (error) {
      if (error?.code === 'ENOENT') {
        missingEntries += 1;
        continue;
      }
      throw error;
    }

    routeBytes += size;
    uniqueFiles.set(resolvedPath, size);

    const variant = sharpVariant(resolvedPath);
    if (variant) {
      sharpVariants.set(variant, (sharpVariants.get(variant) ?? 0) + size);
    }
  }

  summedTraceBytes += routeBytes;
  if (isRouteManifest(manifestPath) && (!largestRoute || routeBytes > largestRoute.bytes)) {
    largestRoute = { name: routeName(manifestPath), bytes: routeBytes };
  }
}

const uniqueBytes = [...uniqueFiles.values()].reduce((sum, size) => sum + size, 0);
console.log(`Build directory: ${path.basename(buildDirectory)}`);
console.log(`NFT manifests: ${manifests.length}`);
console.log(`Unique traced files: ${uniqueFiles.size}`);
console.log(`Unique traced bytes: ${formatBytes(uniqueBytes)}`);
console.log(
  `Summed trace bytes (repeated files counted per manifest): ${formatBytes(summedTraceBytes)}`,
);
console.log(
  largestRoute
    ? `Largest route manifest: ${largestRoute.name} (${formatBytes(largestRoute.bytes)})`
    : 'Largest route manifest: none',
);
console.log(`Missing trace entries: ${missingEntries}`);
console.log('Sharp variants (trace references, before deduplication):');
if (sharpVariants.size === 0) console.log('  none');
for (const [variant, bytes] of [...sharpVariants].sort(([left], [right]) =>
  left.localeCompare(right),
)) {
  console.log(`  ${variant}: ${formatBytes(bytes)}`);
}
console.log('These local trace sizes are not Vercel billed storage measurements.');

if (missingEntries > 0 || manifests.length === 0) {
  process.exitCode = 1;
}
