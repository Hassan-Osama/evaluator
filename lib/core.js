const fs = require('fs');
const vm = require('vm');
const util = require('util');
const ts = require('typescript');

const COMPILER_OPTIONS = {
  strict: true,
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  // Treat every file as a module so top-level names never clash with lib.dom globals.
  moduleDetection: ts.ModuleDetectionKind.Force,
  noEmit: true,
  skipLibCheck: true,
  types: [],
};

function getDiagnostics(file) {
  const program = ts.createProgram([file], COMPILER_OPTIONS);
  const sf = program.getSourceFile(file);
  return [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)].map((d) => ({
    code: d.code,
    line: d.start === undefined ? 0 : sf.getLineAndCharacterOfPosition(d.start).line + 1,
    message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
  }));
}

// Runs the student's code (type errors are ignored, TS still emits JS) in an isolated vm context.
function createSandbox(source) {
  const output = [];
  const log = (...a) => output.push(util.format(...a));
  const context = vm.createContext({
    console: { log, info: log, warn: log, error: log, debug: log },
    __t: {},
  });
  const js = ts
    .transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } })
    .outputText.replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '')
    .replace(/^(\s*)export\s+(default\s+)?/gm, '$1');

  let runtimeError = null;
  try {
    new vm.Script(js).runInContext(context, { timeout: 2000 });
  } catch (e) {
    runtimeError = String(e && e.message ? e.message : e);
  }
  return {
    output,
    runtimeError,
    // Evaluate an expression inside the student's global scope; `vars` is available as __t.
    evalIn(expr, vars = {}) {
      context.__t = vars;
      return new vm.Script(expr).runInContext(context, { timeout: 2000 });
    },
  };
}

// ---------- AST helpers ----------
function createAst(source, fileName) {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS);
  const text = (n) => (n ? n.getText(sf) : undefined);
  const walk = (node, cb) => {
    cb(node);
    ts.forEachChild(node, (c) => walk(c, cb));
  };
  const all = (pred, root = sf) => {
    const out = [];
    walk(root, (n) => pred(n) && out.push(n));
    return out;
  };
  const hasMod = (n, kind) => !!(n.modifiers && n.modifiers.some((m) => m.kind === kind));
  const isTopLevel = (n) => {
    for (let p = n.parent; p && p !== sf; p = p.parent) {
      if (ts.isFunctionLike(p) || ts.isClassLike(p)) return false;
    }
    return true;
  };

  const ast = {
    ts,
    sf,
    text,
    all,
    hasMod,
    isTopLevel,
    cls: (name) => all((n) => ts.isClassDeclaration(n) && n.name && n.name.text === name)[0],
    iface: (name) => all((n) => ts.isInterfaceDeclaration(n) && n.name.text === name)[0],
    alias: (name) => all((n) => ts.isTypeAliasDeclaration(n) && n.name.text === name)[0],
    // function declaration or `const f = (...) => ...` / function expression
    callable: (name) => {
      const fd = all((n) => ts.isFunctionDeclaration(n) && n.name && n.name.text === name)[0];
      if (fd) return fd;
      const vd = all(
        (n) =>
          ts.isVariableDeclaration(n) &&
          ts.isIdentifier(n.name) &&
          n.name.text === name &&
          n.initializer &&
          (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)),
      )[0];
      return vd && vd.initializer;
    },
    method: (cls, name) =>
      cls && cls.members.find((m) => ts.isMethodDeclaration(m) && m.name.getText(sf) === name),
    ctor: (cls) => cls && cls.members.find((m) => ts.isConstructorDeclaration(m)),
    // property declared as a class field or as a constructor parameter property
    member: (cls, name) => {
      if (!cls) return undefined;
      const prop = cls.members.find((m) => ts.isPropertyDeclaration(m) && m.name.getText(sf) === name);
      if (prop) return prop;
      const c = ast.ctor(cls);
      return c && c.parameters.find((p) => p.name.getText(sf) === name && p.modifiers && p.modifiers.length);
    },
    isPrivate: (n) => hasMod(n, ts.SyntaxKind.PrivateKeyword) || (n.name && ts.isPrivateIdentifier(n.name)),
    isProtected: (n) => hasMod(n, ts.SyntaxKind.ProtectedKeyword),
    isReadonly: (n) => hasMod(n, ts.SyntaxKind.ReadonlyKeyword),
    inside: (node, container) => container && node.pos >= container.pos && node.end <= container.end,
    comments: () => source,
  };
  return ast;
}

// ---------- scoring ----------
class Scorer {
  constructor() {
    this.items = [];
  }
  // fn returns boolean | number (0..1) | { pass?: boolean, fraction?: number, note?: string }
  check(name, points, fn) {
    let r;
    try {
      r = fn();
    } catch (e) {
      r = { fraction: 0, note: 'error: ' + (e && e.message) };
    }
    if (typeof r === 'boolean') r = { fraction: r ? 1 : 0 };
    else if (typeof r === 'number') r = { fraction: r };
    else if (r && r.pass !== undefined) r = { fraction: r.pass ? 1 : 0, note: r.note };
    r = r || { fraction: 0 };
    const fraction = Math.max(0, Math.min(1, r.fraction));
    this.items.push({ name, points, earned: Math.round(points * fraction * 100) / 100, note: r.note || '' });
  }
  get score() {
    return Math.round(this.items.reduce((s, i) => s + i.earned, 0) * 100) / 100;
  }
  get max() {
    return this.items.reduce((s, i) => s + i.points, 0);
  }
}

function evaluateFile(file, rubric) {
  const source = fs.readFileSync(file, 'utf8');
  const diags = getDiagnostics(file);
  const sandbox = createSandbox(source);
  const ast = createAst(source, file);
  const scorer = new Scorer();
  rubric({ source, diags, sandbox, ast }, scorer.check.bind(scorer));
  return { file, score: scorer.score, max: scorer.max, items: scorer.items, runtimeError: sandbox.runtimeError };
}

module.exports = { evaluateFile, ts };
