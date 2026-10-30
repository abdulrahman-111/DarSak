import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const PUBLIC_AUTH_ACTIONS = new Map([
  [
    'src/features/auth/actions.ts',
    new Set([
      'loginAction',
      'signupAction',
      'googleSignInAction',
      'forgotPasswordAction',
      'resendConfirmationAction',
      'verifySignupCodeAction',
      'logoutAction',
    ]),
  ],
  ['apps/admin/src/app/[locale]/login/actions.ts', new Set(['loginAction', 'logoutAction'])],
]);

// These are reviewed helpers whose implementations establish a signed-in identity
// before returning it (or reject the call). Keep contracts tied to their source file.
const AUTH_GUARD_CONTRACTS = new Map([
  ['src/features/platform/request-viewer', new Map([['getRequestViewer', 'checkedUser']])],
  ['src/components/platform/access', new Map([['requireTeachingAccess', 'required']])],
  ['src/features/student/data', new Map([['viewer', 'checkedResult']])],
  ['src/features/teacher/data', new Map([['teacherViewer', 'required']])],
  [
    'src/lib/supabase/server',
    new Map([
      ['getVerifiedUser', 'checkedResult'],
      ['getVerifiedRecoveryUser', 'checkedResult'],
    ]),
  ],
  [
    'apps/admin/src/lib/access',
    new Map([
      ['getAdminActor', 'checkedResult'],
      ['requireAdminActor', 'required'],
    ]),
  ],
]);

const DATABASE_READ_METHODS = new Set(['from', 'rpc']);
const DATABASE_MUTATION_METHODS = new Set(['insert', 'update', 'delete', 'upsert']);
const AUTH_STATE_METHODS = new Set([
  'signInWithPassword',
  'signUp',
  'signInWithOAuth',
  'updateUser',
  'resetPasswordForEmail',
  'resend',
  'verifyOtp',
  'signOut',
]);

function propertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression))
    return node.argumentExpression.text;
  return undefined;
}

function callName(node) {
  if (!ts.isCallExpression(node)) return undefined;
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  return propertyName(node.expression);
}

function isExported(node) {
  return (node.modifiers ?? []).some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function actionDeclarations(sourceFile) {
  const actions = [];
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && isExported(statement) && statement.body) {
      actions.push({ name: statement.name?.text ?? '<anonymous>', node: statement });
    } else if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        let value = declaration.initializer;
        if (ts.isAsExpression(value) || ts.isParenthesizedExpression(value))
          value = value.expression;
        if (ts.isArrowFunction(value) || ts.isFunctionExpression(value))
          actions.push({ name: declaration.name.text, node: value });
      }
    }
  }
  return actions;
}

function normalizedModulePath(filePath, moduleSpecifier) {
  if (moduleSpecifier.startsWith('@admin/'))
    return path.posix.normalize(`apps/admin/src/${moduleSpecifier.slice('@admin/'.length)}`);
  if (moduleSpecifier.startsWith('@/'))
    return path.posix.normalize(`src/${moduleSpecifier.slice(2)}`);
  if (moduleSpecifier.startsWith('~/'))
    return path.posix.normalize(`src/${moduleSpecifier.slice(2)}`);
  const relative = path.posix.normalize(
    path.posix.join(path.posix.dirname(filePath), moduleSpecifier),
  );
  return relative.replace(/\.(?:[cm]?tsx?)$/, '');
}

function importedGuardNames(sourceFile, filePath) {
  const names = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    const modulePath = normalizedModulePath(filePath, statement.moduleSpecifier.text);
    const contracts = AUTH_GUARD_CONTRACTS.get(modulePath);
    if (
      !contracts ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    )
      continue;
    for (const element of statement.importClause.namedBindings.elements) {
      const contract = contracts.get(element.propertyName?.text ?? element.name.text);
      if (contract) names.set(element.name.text, contract);
    }
  }
  return names;
}

function unwrapExpression(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current))
  )
    current = current.expression;
  return current;
}

function awaitedCall(node) {
  const expression = unwrapExpression(node);
  return ts.isAwaitExpression(expression) ? unwrapExpression(expression.expression) : expression;
}

function visitActionBody(body, visitor) {
  const visit = (node, root = false) => {
    if (!root && ts.isFunctionLike(node)) return;
    visitor(node);
    ts.forEachChild(node, child => visit(child));
  };
  visit(body, true);
}

function isAwaited(call) {
  let expression = call;
  while (expression.parent && unwrapExpression(expression.parent) === expression)
    expression = expression.parent;
  return Boolean(expression.parent && ts.isAwaitExpression(expression.parent));
}

function isCaughtByTry(call) {
  let current = call;
  while (current?.parent) {
    const parent = current.parent;
    if (ts.isTryStatement(parent) && parent.catchClause && current === parent.tryBlock) return true;
    current = parent;
  }
  return false;
}

function isDirectGetUserCall(call) {
  return (
    ts.isPropertyAccessExpression(call.expression) &&
    call.expression.name.text === 'getUser' &&
    ts.isPropertyAccessExpression(call.expression.expression) &&
    call.expression.expression.name.text === 'auth'
  );
}

function propertyKey(element) {
  if (element.propertyName && ts.isIdentifier(element.propertyName))
    return element.propertyName.text;
  if (element.propertyName && ts.isStringLiteral(element.propertyName))
    return element.propertyName.text;
  return ts.isIdentifier(element.name) ? element.name.text : undefined;
}

function getUserIdentityPaths(binding, prefix = '') {
  const paths = new Set();
  if (ts.isIdentifier(binding)) {
    if (prefix === 'data') paths.add(binding.text);
    else if (!prefix) paths.add(`${binding.text}.data.user`);
    return paths;
  }
  if (!ts.isObjectBindingPattern(binding)) return paths;
  for (const element of binding.elements) {
    const key = propertyKey(element);
    if (!key) continue;
    if (key === 'user' && ts.isIdentifier(element.name)) paths.add(element.name.text);
    else if (key === 'data' && ts.isObjectBindingPattern(element.name))
      for (const name of getUserIdentityPaths(element.name, 'data')) paths.add(name);
    else if (key === 'data' && ts.isIdentifier(element.name))
      paths.add(`${element.name.text}.user`);
  }
  return paths;
}

function callResultPaths(call, body, contract) {
  const paths = new Set();
  const inspect = node => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (awaitedCall(node.initializer) === call) {
        if (contract === 'checkedUser' && ts.isObjectBindingPattern(node.name)) {
          for (const name of getUserIdentityPaths(node.name, 'result')) paths.add(name);
        } else if (ts.isIdentifier(node.name)) {
          paths.add(contract === 'checkedUser' ? `${node.name.text}.user` : node.name.text);
        }
      }
    }
  };
  visitActionBody(body, inspect);
  return paths;
}

function accessPath(node) {
  const expression = unwrapExpression(node);
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const parent = accessPath(expression.expression);
    return parent ? `${parent}.${expression.name.text}` : undefined;
  }
  return undefined;
}

function isLooseNullishValue(node) {
  const expression = unwrapExpression(node);
  return (
    expression.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(expression) && expression.text === 'undefined') ||
    (ts.isVoidExpression(expression) && expression.expression.kind === ts.SyntaxKind.NumericLiteral)
  );
}

function isStrictNullValue(node) {
  return unwrapExpression(node).kind === ts.SyntaxKind.NullKeyword;
}

function isMissingIdentityTest(expression, identityPaths) {
  const node = unwrapExpression(expression);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.ExclamationToken &&
    identityPaths.has(accessPath(node.operand))
  )
    return true;
  if (!ts.isBinaryExpression(node)) return false;
  const operator = node.operatorToken.kind;
  if (
    operator !== ts.SyntaxKind.EqualsEqualsToken &&
    operator !== ts.SyntaxKind.EqualsEqualsEqualsToken
  )
    return false;
  const isNullComparison =
    operator === ts.SyntaxKind.EqualsEqualsToken ? isLooseNullishValue : isStrictNullValue;
  return (
    (identityPaths.has(accessPath(node.left)) && isNullComparison(node.right)) ||
    (identityPaths.has(accessPath(node.right)) && isNullComparison(node.left))
  );
}

function rejectsMissingIdentity(expression, identityPaths) {
  const node = unwrapExpression(expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    return (
      rejectsMissingIdentity(node.left, identityPaths) ||
      rejectsMissingIdentity(node.right, identityPaths)
    );
  return isMissingIdentityTest(node, identityPaths);
}

function directlyRejects(statement) {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (!ts.isBlock(statement)) return false;
  return statement.statements.some(
    child => ts.isReturnStatement(child) || ts.isThrowStatement(child),
  );
}

function checkedResultGuardPositions(body, call, contract) {
  if (!isAwaited(call) || isCaughtByTry(call)) return [];
  const identityPaths = callResultPaths(call, body, contract);
  if (identityPaths.size === 0) return [];
  const guards = [];
  const inspect = node => {
    if (
      ts.isIfStatement(node) &&
      node.getStart() > call.getStart() &&
      rejectsMissingIdentity(node.expression, identityPaths) &&
      directlyRejects(node.thenStatement)
    )
      guards.push(node.end);
  };
  visitActionBody(body, inspect);
  return guards;
}

function directGetUserGuardPositions(functionNode) {
  const guards = [];
  const calls = [];
  const collectCalls = node => {
    if (
      ts.isCallExpression(node) &&
      isDirectGetUserCall(node) &&
      isAwaited(node) &&
      !isCaughtByTry(node)
    )
      calls.push(node);
  };
  visitActionBody(functionNode.body, collectCalls);
  for (const call of calls) {
    const identityPaths = new Set();
    const inspectBinding = node => {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        awaitedCall(node.initializer) === call
      )
        for (const name of getUserIdentityPaths(node.name)) identityPaths.add(name);
    };
    visitActionBody(functionNode.body, inspectBinding);
    if (identityPaths.size === 0) continue;
    const inspectGuard = node => {
      if (
        ts.isIfStatement(node) &&
        node.getStart() > call.getStart() &&
        rejectsMissingIdentity(node.expression, identityPaths) &&
        directlyRejects(node.thenStatement)
      )
        guards.push(node.end);
    };
    visitActionBody(functionNode.body, inspectGuard);
  }
  return guards;
}

function authGuardPositions(node, importedNames) {
  const positions = directGetUserGuardPositions(node);
  const inspect = child => {
    if (ts.isCallExpression(child) && isAwaited(child) && !isCaughtByTry(child)) {
      const name = callName(child);
      if (name && importedNames.has(name)) {
        const contract = importedNames.get(name);
        if (contract === 'required') positions.push(child.getStart());
        else positions.push(...checkedResultGuardPositions(node.body, child, contract));
      }
    }
  };
  visitActionBody(node.body, inspect);
  return positions;
}

function callsIn(node) {
  const calls = [];
  const visit = child => {
    if (ts.isCallExpression(child)) calls.push(child);
    ts.forEachChild(child, visit);
  };
  if (node.body) visit(node.body);
  return calls;
}

function dbMethod(call) {
  const method = propertyName(call.expression);
  if (method && (DATABASE_READ_METHODS.has(method) || DATABASE_MUTATION_METHODS.has(method)))
    return method;
  if (
    ts.isPropertyAccessExpression(call.expression) &&
    AUTH_STATE_METHODS.has(call.expression.name.text) &&
    ts.isPropertyAccessExpression(call.expression.expression) &&
    call.expression.expression.name.text === 'auth'
  )
    return call.expression.name.text;
  return undefined;
}

function isDirectTableMutation(call) {
  if (!ts.isCallExpression(call) || !DATABASE_MUTATION_METHODS.has(propertyName(call.expression)))
    return false;
  const receiver = call.expression.expression;
  return ts.isCallExpression(receiver) && propertyName(receiver.expression) === 'from';
}

function isSchemaParse(call) {
  const method = propertyName(call.expression);
  if (method !== 'parse' && method !== 'safeParse') return false;
  const receiver = ts.isPropertyAccessExpression(call.expression)
    ? call.expression.expression.getText()
    : '';
  return receiver !== 'JSON' && receiver !== 'Date' && receiver !== 'Number';
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/** Analyze exported actions in a source file. This is intentionally syntactic, not a proof of control flow. */
export function analyzeActionSource(sourceText, filePath, { actionNames } = {}) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const exported = actionDeclarations(sourceFile).filter(
    action => actionNames === undefined || actionNames.has(action.name),
  );
  const importedNames = importedGuardNames(sourceFile, filePath);
  const publicActions = PUBLIC_AUTH_ACTIONS.get(path.posix.normalize(filePath));
  const findings = [];

  for (const action of exported) {
    const calls = callsIn(action.node);
    const accesses = calls.filter(call => dbMethod(call));
    const mutations = calls.filter(isDirectTableMutation);
    if (accesses.length > 0 && !publicActions?.has(action.name)) {
      const firstAccess = accesses.reduce((first, call) => (call.pos < first.pos ? call : first));
      const guardPositions = authGuardPositions(action.node, importedNames);
      if (!guardPositions.some(position => position < firstAccess.getStart(sourceFile))) {
        findings.push({
          file: filePath,
          action: action.name,
          line: lineOf(sourceFile, action.node),
          rule: 'authorization-before-database',
          detail: `No recognized authentication guard precedes database access at line ${lineOf(sourceFile, firstAccess)}.`,
        });
      }
    }
    if (mutations.length > 0) {
      const firstMutation = mutations.reduce((first, call) =>
        call.pos < first.pos ? call : first,
      );
      let hasSchema = false;
      visitActionBody(action.node.body, call => {
        if (ts.isCallExpression(call) && isSchemaParse(call) && call.pos < firstMutation.pos)
          hasSchema = true;
      });
      if (!hasSchema) {
        findings.push({
          file: filePath,
          action: action.name,
          line: lineOf(sourceFile, action.node),
          rule: 'schema-before-mutation',
          detail: `No .parse() or .safeParse() call precedes direct database mutation at line ${lineOf(sourceFile, firstMutation)}.`,
        });
      }
    }
  }
  return findings;
}

export function analyzeNewOrChangedActionSource(sourceText, baselineText, filePath) {
  const changedNames = changedActionNames(sourceText, baselineText, filePath);
  return analyzeActionSource(sourceText, filePath, { actionNames: changedNames });
}

function actionFiles(root) {
  const found = [];
  const walk = directory => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name === 'actions.ts') found.push(fullPath);
    }
  };
  walk(path.join(root, 'src/features'));
  walk(path.join(root, 'apps/admin/src'));
  return found.sort();
}

function readAtRef(root, ref, relativePath) {
  try {
    return execFileSync('git', ['show', `${ref}:${relativePath}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined;
  }
}

function actionTextByName(sourceText, filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  return new Map(
    actionDeclarations(sourceFile).map(action => [action.name, action.node.getText(sourceFile)]),
  );
}

function actionNodeByName(sourceText, filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  return new Map(actionDeclarations(sourceFile).map(action => [action.name, action.node]));
}

function importedBindings(sourceText, filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const bindings = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    const moduleSpecifier = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) bindings.set(clause.name.text, `${moduleSpecifier}#default`);
    if (!clause.namedBindings) continue;
    if (ts.isNamespaceImport(clause.namedBindings)) {
      bindings.set(clause.namedBindings.name.text, `${moduleSpecifier}#*`);
    } else {
      for (const element of clause.namedBindings.elements) {
        bindings.set(
          element.name.text,
          `${moduleSpecifier}#${element.propertyName?.text ?? element.name.text}`,
        );
      }
    }
  }
  return bindings;
}

function identifiersIn(node) {
  const identifiers = new Set();
  const visit = child => {
    if (ts.isIdentifier(child)) identifiers.add(child.text);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return identifiers;
}

function changedActionNames(currentText, baselineText, filePath) {
  const currentTexts = actionTextByName(currentText, filePath);
  const baselineTexts =
    baselineText === undefined ? new Map() : actionTextByName(baselineText, filePath);
  const currentNodes = actionNodeByName(currentText, filePath);
  const baselineNodes =
    baselineText === undefined ? new Map() : actionNodeByName(baselineText, filePath);
  const currentImports = importedBindings(currentText, filePath);
  const baselineImports =
    baselineText === undefined ? new Map() : importedBindings(baselineText, filePath);

  return new Set(
    [...currentTexts]
      .filter(([name, source]) => {
        if (baselineTexts.get(name) !== source) return true;
        const referencedImports = identifiersIn(currentNodes.get(name));
        return [...referencedImports].some(
          localName => currentImports.get(localName) !== baselineImports.get(localName),
        );
      })
      .map(([name]) => name),
  );
}

export function scanRepository(root = process.cwd(), baseRef = 'origin/main') {
  const files = actionFiles(root);
  let totalActions = 0;
  let checkedActions = 0;
  const findings = [];
  for (const filePath of files) {
    const relative = path.relative(root, filePath).split(path.sep).join('/');
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const exports = actionTextByName(sourceText, relative);
    totalActions += exports.size;
    const baselineText = readAtRef(root, baseRef, relative);
    const changedNames = changedActionNames(sourceText, baselineText, relative);
    checkedActions += changedNames.size;
    findings.push(...analyzeActionSource(sourceText, relative, { actionNames: changedNames }));
  }
  return { findings, files: files.length, totalActions, checkedActions, baseRef };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
) {
  const baseIndex = process.argv.indexOf('--base');
  const configuredBase = baseIndex >= 0 ? process.argv[baseIndex + 1] : process.env.GITHUB_BASE_REF;
  const baseRef = configuredBase
    ? configuredBase.startsWith('origin/')
      ? configuredBase
      : `origin/${configuredBase}`
    : 'origin/main';
  const result = scanRepository(process.cwd(), baseRef);
  if (result.findings.length === 0) {
    console.log(
      `Server action guard scan passed: inventoried ${result.totalActions} exports in ${result.files} files; checked ${result.checkedActions} new or changed actions against ${baseRef}.`,
    );
    process.exit(0);
  }
  console.error(
    `Checked ${result.checkedActions} new or changed actions out of ${result.totalActions} exports in ${result.files} files against ${baseRef}.`,
  );
  for (const finding of result.findings) {
    console.error(
      `${finding.file}:${finding.line} ${finding.action} [${finding.rule}] ${finding.detail}`,
    );
  }
  process.exitCode = 1;
}
