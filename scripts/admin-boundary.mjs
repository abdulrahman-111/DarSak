import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const web = path.join(root, 'src');
const admin = path.join(root, 'apps/admin/src');
const slash = value => value.split(path.sep).join('/');
const sourceFiles = directory => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(?:ts|tsx|mts|cts)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [full] : [];
  });
};
const fail = message => {
  console.error(`Admin boundary check failed: ${message}`);
  process.exitCode = 1;
};

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!packageJson.workspaces?.includes('apps/admin'))
  fail('root npm workspaces must include apps/admin');

const routeFiles = appRoot =>
  sourceFiles(appRoot).filter(file => /(?:^|\/)(?:page|route)\.(?:ts|tsx)$/.test(slash(file)));
const webRoutes = routeFiles(path.join(web, 'app'));
if (webRoutes.some(file => slash(file).includes('/app/[locale]/admin/'))) {
  fail('public app still has a localized administrator route');
}

const adminRoutes = routeFiles(path.join(admin, 'app'));
const forbiddenAdminSegments = new Set([
  'register',
  'registration',
  'choose-role',
  'student',
  'teacher',
  'assistant',
  'api',
  'cron',
  'integrations',
  'callback',
]);
for (const file of adminRoutes) {
  const relative = slash(path.relative(path.join(admin, 'app'), file));
  const segments = relative
    .split('/')
    .slice(0, -1)
    .filter(part => !/^\[.*\]$/.test(part));
  const disallowed = segments.find(segment => forbiddenAdminSegments.has(segment));
  if (disallowed) fail(`admin route includes forbidden ${disallowed} surface: ${relative}`);
  if (
    segments.length &&
    segments[0] !== 'admin' &&
    !['login', 'notifications'].includes(segments.join('/'))
  ) {
    fail(`admin route is outside the root, login, and administrator allowlist: ${relative}`);
  }
}
if (!adminRoutes.some(file => slash(file).includes('/app/[locale]/admin/'))) {
  fail('admin app has no localized administrator routes');
}

const options = {
  allowJs: false,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX,
  baseUrl: root,
  paths: { '@/*': ['src/*'], '@admin/*': ['apps/admin/src/*'] },
};
const resolveLocal = (specifier, containingFile) => {
  let base;
  if (specifier.startsWith('@admin/')) base = path.join(admin, specifier.slice('@admin/'.length));
  else if (specifier.startsWith('@/')) base = path.join(web, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(containingFile), specifier);
  else return undefined;
  const resolved = ts.resolveModuleName(base, containingFile, options, ts.sys).resolvedModule
    ?.resolvedFileName;
  return resolved && fs.existsSync(resolved) && !resolved.endsWith('.d.ts')
    ? path.resolve(resolved)
    : undefined;
};
const importsFrom = file => {
  const text = fs.readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found = [];
  const add = node => {
    if (ts.isStringLiteralLike(node)) {
      const resolved = resolveLocal(node.text, file);
      if (resolved) found.push(resolved);
    }
  };
  for (const node of tree.statements) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
      add(node.moduleSpecifier);
  }
  const visit = node => {
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments.length === 1
    )
      add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
};
const graph = entries => {
  const seen = new Set();
  const pending = [...entries];
  while (pending.length) {
    const file = path.resolve(pending.pop());
    if (seen.has(file)) continue;
    seen.add(file);
    pending.push(...importsFrom(file));
  }
  return seen;
};

const webEntries = [...sourceFiles(path.join(web, 'app')), path.join(web, 'proxy.ts')].filter(
  fs.existsSync,
);
const webGraph = graph(webEntries);
for (const file of webGraph) {
  const relative = slash(path.relative(root, file));
  if (relative.startsWith('apps/admin/'))
    fail(`public application imports admin source: ${relative}`);
  const text = fs.readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const visit = node => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'rpc' &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const rpc = node.arguments[0].text;
      if (rpc.startsWith('admin_') || rpc === 'moderate_group_feedback') {
        fail(`public application import graph calls administrator RPC ${rpc} in ${relative}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
}

const adminEntries = [...sourceFiles(path.join(admin, 'app')), path.join(admin, 'proxy.ts')].filter(
  fs.existsSync,
);
const adminGraph = graph(adminEntries);
const forbiddenImports = [
  'src/lib/supabase/admin.ts',
  'src/features/email/worker.ts',
  'src/features/monitoring/server.ts',
  'src/app/api/',
];
for (const file of adminGraph) {
  const relative = slash(path.relative(root, file));
  if (
    forbiddenImports.some(pattern => relative === pattern || relative.startsWith(pattern)) ||
    /^src\/features\/(?:.*\/)?(?:[^/]*actions?[^/]*|worker|server|config)\.(?:ts|tsx)$/.test(
      relative,
    ) ||
    /^src\/features\/(?:assistant|auth)\//.test(relative) ||
    /^src\/lib\/(?:auth|deployment-environment)(?:\/|\.)/.test(relative) ||
    /^src\/lib\/supabase\/(?:browser|server|config)\.ts$/.test(relative)
  ) {
    fail(
      `admin application imports a public action, auth, config, API, worker, or service-role module: ${relative}`,
    );
  }
}

const checkManifest = (label, manifestPath, forbiddenRoute, requiredRoute, allowedRoute) => {
  if (!fs.existsSync(manifestPath)) {
    if (process.argv.includes('--require-manifests'))
      fail(`${label} Next.js app-paths manifest is missing: ${manifestPath}`);
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const routes = Object.keys(manifest);
  const forbidden = routes.find(route => forbiddenRoute.test(route));
  if (forbidden) fail(`${label} build manifest contains forbidden route ${forbidden}`);
  if (allowedRoute) {
    const outsideAllowlist = routes.find(route => !allowedRoute.test(route));
    if (outsideAllowlist)
      fail(`${label} build manifest contains route outside its allowlist: ${outsideAllowlist}`);
  }
  if (!routes.some(route => requiredRoute.test(route)))
    fail(`${label} build manifest lacks required route ${requiredRoute}`);
};
checkManifest(
  'public',
  path.join(root, '.next/server/app-paths-manifest.json'),
  /(?:^|\/)admin(?:\/|$)/,
  /\[locale\]\/page$/,
);
checkManifest(
  'admin',
  path.join(root, 'apps/admin/.next/server/app-paths-manifest.json'),
  /(?:^|\/)(?:student|teacher|register|registration|choose-role|api|cron|integrations)(?:\/|$)/,
  /\[locale\]\/admin\/page$/,
  /^\/(?:_not-found\/page|_global-error\/page|(?:\[locale\]\/)?(?:page|login\/page|notifications\/page|admin\/(?:.+\/)?page))$/,
);

if (process.exitCode) process.exit(process.exitCode);
console.log(
  `Admin boundary check passed (${webRoutes.length} public routes, ${adminRoutes.length} admin routes; ${webGraph.size} public and ${adminGraph.size} admin modules inspected).`,
);
console.log(
  'Scope: static TypeScript import graph and route manifests; this is not a runtime authorization test or a complete security audit.',
);
