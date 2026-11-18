// One rubric per assignment version. Each rubric sums to 100 points.
// Edit the point values / checks here to change the grading scheme.
const { ts } = require('./core');
const K = ts.SyntaxKind;

const TS_READONLY_ASSIGN = 2540; // Cannot assign to 'x' because it is a read-only property
const TS_ARG_TYPE_MISMATCH = 2345; // Argument of type 'x' is not assignable to parameter of type 'y'

const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-6;
const clean = (diags, allowedCodes = []) => diags.filter((d) => !allowedCodes.includes(d.code));
const cleanResult = (diags, allowed) => {
  const bad = clean(diags, allowed);
  return bad.length === 0
    ? { pass: true }
    : { fraction: 0, note: bad.slice(0, 3).map((d) => `line ${d.line}: TS${d.code} ${d.message}`).join(' | ') };
};
// A "must fail to compile" demonstration is satisfied by the compiler error OR by @ts-expect-error / @ts-ignore.
const suppressed = (source) => (source.match(/@ts-(expect-error|ignore)/g) || []).length;

const sig = (ast, fn) => ({
  params: fn.parameters.map((p) => ({
    name: p.name.getText(ast.sf),
    type: ast.text(p.type),
    optional: !!p.questionToken,
    init: ast.text(p.initializer),
  })),
  ret: ast.text(fn.type),
});

// ---------------- A: readonly + ?? ----------------
function A({ diags, sandbox, ast, source }, check) {
  const student = ast.iface('Student');
  const prop = (n) => student && student.members.find((m) => ts.isPropertySignature(m) && m.name.getText(ast.sf) === n);
  const fn = ast.callable('generateReport');
  const run = (obj) =>
    sandbox.evalIn('generateReport(__t.s)', { s: new Proxy(obj, { set: () => true, defineProperty: () => true }) });

  check('interface Student: readonly id: string', 10, () => {
    const p = prop('id');
    return !!p && ast.isReadonly(p) && ast.text(p.type) === 'string';
  });
  check('interface Student: name: string', 5, () => ast.text(prop('name')?.type) === 'string');
  check('interface Student: optional projectScore?: number', 10, () => {
    const p = prop('projectScore');
    return !!p && !!p.questionToken && ast.text(p.type) === 'number';
  });
  check('generateReport(student: Student): string signature', 10, () => {
    const s = sig(ast, fn);
    return s.params.length === 1 && s.params[0].type === 'Student' && s.ret === 'string';
  });
  check('uses ?? inside generateReport', 10, () =>
    ast.all((n) => ts.isBinaryExpression(n) && n.operatorToken.kind === K.QuestionQuestionToken, fn).length > 0,
  );
  check('missing score defaults to 0, given score is kept', 10, () => {
    const a = run({ id: 'S1', name: 'Ali' });
    const b = run({ id: 'S1', name: 'Ali', projectScore: 85 });
    return { fraction: (/scored 0\b/.test(a) ? 0.5 : 0) + (/scored 85\b/.test(b) ? 0.5 : 0), note: `${a} | ${b}` };
  });
  check('output format "Student [name] (ID: [id]) scored [score]."', 15, () => {
    const out = run({ id: 'S7', name: 'Sara', projectScore: 90 });
    const exact = out === 'Student Sara (ID: S7) scored 90.' || out === 'Student Sara (ID: S7) scored 90';
    const partial = ['Sara', 'S7', '90'].every((x) => out.includes(x));
    return { fraction: exact ? 1 : partial ? 0.5 : 0, note: `got: ${out}` };
  });
  check('attempts to reassign id inside the function (readonly error)', 15, () => {
    const inFn = diags.some((d) => d.code === TS_READONLY_ASSIGN);
    if (inFn) return true;
    const ignored = suppressed(source) > 0 && /\.id\s*=[^=]/.test(source);
    return { fraction: ignored ? 1 : 0, note: ignored ? 'reassignment present but suppressed' : 'no TS2540 error found' };
  });
  check('no other compile errors (strict mode)', 15, () => cleanResult(diags, [TS_READONLY_ASSIGN]));
}

// ---------------- B: classes + dependency injection ----------------
function B({ diags, sandbox, ast }, check) {
  const proc = ast.cls('PaymentProcessor');
  const svc = ast.cls('CheckoutService');
  const pay = ast.method(proc, 'pay');

  check('class PaymentProcessor with pay(amount: number)', 15, () => {
    if (!pay) return false;
    const s = sig(ast, pay);
    return s.params.length >= 1 && s.params[0].type === 'number';
  });
  check('pay() logs the transaction', 15, () => {
    const before = sandbox.output.length;
    sandbox.evalIn('new PaymentProcessor().pay(50)');
    return sandbox.output.slice(before).some((l) => l.includes('50'));
  });
  check('class CheckoutService exists', 10, () => !!svc);
  check('constructor injection (parameter typed PaymentProcessor)', 15, () => {
    const c = ast.ctor(svc);
    return !!c && c.parameters.some((p) => ast.text(p.type) === 'PaymentProcessor');
  });
  check('CheckoutService does not create PaymentProcessor itself', 10, () =>
    !!svc && ast.all((n) => ts.isNewExpression(n) && ast.text(n.expression) === 'PaymentProcessor', svc).length === 0,
  );
  check('CheckoutService really uses the injected processor', 15, () => {
    const calls = [];
    const svcObj = sandbox.evalIn(
      '(() => { const p = new PaymentProcessor(); p.pay = (...a) => { __t.calls.push(a); }; return new CheckoutService(p); })()',
      { calls },
    );
    const proto = Object.getPrototypeOf(svcObj);
    for (const m of Object.getOwnPropertyNames(proto)) {
      if (m === 'constructor' || typeof svcObj[m] !== 'function') continue;
      try {
        svcObj[m](100, 100);
      } catch {}
    }
    return { pass: calls.length > 0, note: calls.length ? '' : 'no method of CheckoutService called pay()' };
  });
  check('instantiates both classes and runs a test transaction', 10, () => {
    const news = (n) => ast.all((x) => ts.isNewExpression(x) && ast.text(x.expression) === n && ast.isTopLevel(x));
    return news('PaymentProcessor').length > 0 && news('CheckoutService').length > 0 && !sandbox.runtimeError;
  });
  check('no compile errors (strict mode)', 10, () => cleanResult(diags));
}

// ---------------- C: generic store ----------------
function C({ diags, sandbox, ast, source }, check) {
  const cls = ast.cls('CacheStore');
  const items = cls && cls.members.find((m) => ts.isPropertyDeclaration(m) && m.name.getText(ast.sf) === 'items');
  const add = ast.method(cls, 'add');
  const getAll = ast.method(cls, 'getAll');

  check('generic class CacheStore<T>', 15, () => !!cls && !!cls.typeParameters && cls.typeParameters.length === 1);
  check('items is private', 5, () => !!items && ast.isPrivate(items));
  check('items typed T[]', 5, () => !!items && /^T\s*\[\]$|^Array<\s*T\s*>$/.test(ast.text(items.type) || ''));
  check('items initialized to []', 5, () =>
    !!items && !!items.initializer && ts.isArrayLiteralExpression(items.initializer) && items.initializer.elements.length === 0,
  );
  check('add(item: T): void', 10, () => {
    if (!add) return false;
    const s = sig(ast, add);
    return s.params.length === 1 && s.params[0].type === 'T' && (s.ret === 'void' || s.ret === undefined);
  });
  check('getAll(): T[]', 10, () => !!getAll && /^T\s*\[\]$|^Array<\s*T\s*>$/.test(ast.text(getAll.type) || ''));
  check('add/getAll behave correctly', 10, () => {
    const r = sandbox.evalIn('(() => { const s = new CacheStore(); s.add(1); s.add(2); return JSON.stringify(s.getAll()); })()');
    return r === '[1,2]';
  });
  check('instances do not share state', 5, () => {
    const r = sandbox.evalIn(
      '(() => { const a = new CacheStore(); const b = new CacheStore(); a.add("x"); return b.getAll().length; })()',
    );
    return r === 0;
  });
  check('creates CacheStore<string> and CacheStore<number> instances', 10, () => {
    const s = /CacheStore\s*<\s*string\s*>/.test(source);
    const n = /CacheStore\s*<\s*number\s*>/.test(source);
    return { fraction: (s ? 0.5 : 0) + (n ? 0.5 : 0), note: `string:${s} number:${n}` };
  });
  check('invalid data pushed to both stores (compiler errors shown)', 15, () => {
    const count = diags.filter((d) => d.code === TS_ARG_TYPE_MISMATCH).length + suppressed(source);
    return { fraction: Math.min(count, 2) / 2, note: `${count} type-mismatch demonstration(s)` };
  });
  check('no other compile errors (strict mode)', 10, () => cleanResult(diags, [TS_ARG_TYPE_MISMATCH]));
}

// ---------------- D: union types + narrowing ----------------
function D({ diags, sandbox, ast }, check) {
  const alias = ast.alias('Identifier');
  const fn = ast.callable('processID');
  const call = (v) => sandbox.evalIn('processID(__t.v)', { v });

  check('type Identifier = string | number', 15, () => {
    if (!alias || !ts.isUnionTypeNode(alias.type)) return false;
    const kinds = alias.type.types.map((t) => t.kind);
    return kinds.length === 2 && kinds.includes(K.StringKeyword) && kinds.includes(K.NumberKeyword);
  });
  check('processID is an arrow function', 10, () => !!fn && ts.isArrowFunction(fn));
  check('signature (id: Identifier): number', 10, () => {
    const s = sig(ast, fn);
    return s.params.length === 1 && s.params[0].type === 'Identifier' && s.ret === 'number';
  });
  check('string -> its length', 15, () => {
    const ok = [call('StudentA') === 8, call('') === 0, call('ab') === 2];
    return ok.filter(Boolean).length / ok.length;
  });
  check('number -> squared', 15, () => {
    const ok = [call(12) === 144, call(-3) === 9, call(0) === 0, near(call(1.5), 2.25)];
    return ok.filter(Boolean).length / ok.length;
  });
  check('type narrowing (typeof)', 10, () => ast.all((n) => ts.isTypeOfExpression(n), fn).length > 0);
  check("logs outputs of processID('StudentA') and processID(12)", 10, () => {
    const lines = sandbox.output.join('\n');
    return { fraction: (/\b8\b/.test(lines) ? 0.5 : 0) + (/\b144\b/.test(lines) ? 0.5 : 0), note: lines.slice(0, 80) };
  });
  check('no compile errors (strict mode)', 15, () => cleanResult(diags));
}

// ---------------- E: inheritance + interfaces ----------------
function E({ diags, sandbox, ast }, check) {
  const iface = ast.iface('Loggable');
  const device = ast.cls('Device');
  const laptop = ast.cls('Laptop');
  const heritage = (cls, kind, name) =>
    !!cls && (cls.heritageClauses || []).some((h) => h.token === kind && h.types.some((t) => ast.text(t.expression) === name));
  const logInfo = ast.method(laptop, 'logInfo');
  const brand = ast.member(device, 'brand');
  const price = ast.member(device, 'price');

  check('interface Loggable { logInfo(): void }', 10, () => {
    const m = iface && iface.members.find((x) => x.name && x.name.getText(ast.sf) === 'logInfo');
    if (!m) return false;
    const ret = ts.isMethodSignature(m) ? ast.text(m.type) : ts.isPropertySignature(m) && m.type && ts.isFunctionTypeNode(m.type) ? ast.text(m.type.type) : undefined;
    return ret === 'void';
  });
  check('Device: protected brand', 10, () => !!brand && ast.isProtected(brand));
  check('Device: public price', 10, () => !!price && !ast.isPrivate(price) && !ast.isProtected(price));
  check('Laptop extends Device', 10, () => heritage(laptop, K.ExtendsKeyword, 'Device'));
  check('Laptop implements Loggable', 10, () => heritage(laptop, K.ImplementsKeyword, 'Loggable'));
  check('Laptop implements logInfo()', 10, () => !!logInfo);
  check('logInfo() accesses this.brand', 10, () =>
    !!logInfo && ast.all((n) => ts.isPropertyAccessExpression(n) && n.expression.kind === K.ThisKeyword && n.name.text === 'brand', logInfo).length > 0,
  );

  const instance = () => {
    const c = ast.ctor(laptop) || ast.ctor(device);
    const args = (c ? c.parameters : []).map((p) => {
      const name = p.name.getText(ast.sf).toLowerCase();
      const type = ast.text(p.type);
      if (name.includes('brand')) return 'ZXBrand';
      if (name.includes('price')) return 4321;
      return type === 'number' ? 7 : type === 'boolean' ? true : 'extra';
    });
    return sandbox.evalIn('new Laptop(...__t.args)', { args });
  };
  check('logInfo() prints brand and price', 15, () => {
    const l = instance();
    const before = sandbox.output.length;
    l.logInfo();
    const out = sandbox.output.slice(before).join('\n');
    const b = l.brand !== undefined && out.includes(String(l.brand));
    const p = l.price !== undefined && out.includes(String(l.price));
    return { fraction: (b ? 10 : 0) / 15 + (p ? 5 : 0) / 15, note: `output: ${out.slice(0, 80)}` };
  });
  check('no compile errors (strict mode)', 15, () => cleanResult(diags));
}

// ---------------- F: default + optional params ----------------
function F({ diags, sandbox, ast }, check) {
  const fn = ast.callable('calculateFinalPrice');
  const p = fn ? sig(ast, fn) : { params: [], ret: undefined };
  const call = (...a) => sandbox.evalIn('calculateFinalPrice(...__t.a)', { a });

  check('price: number', 5, () => p.params[0]?.name === 'price' && p.params[0].type === 'number');
  check('discount: number = 0 (default value)', 10, () => {
    const d = p.params[1];
    return d?.name === 'discount' && d.init === '0' && (d.type === 'number' || d.type === undefined);
  });
  check('taxRate?: number (optional)', 10, () => p.params[2]?.name === 'taxRate' && p.params[2].optional && p.params[2].type === 'number');
  check('return type number', 5, () => p.ret === 'number');
  check('only price -> price', 10, () => near(call(100), 100));
  check('price + discount -> price - discount', 15, () => near(call(100, 10), 90) && near(call(250, 50), 200));
  check('all three -> (price - discount) * (1 + taxRate)', 20, () => near(call(100, 10, 0.1), 99) && near(call(100, 0, 0.2), 120));
  check('taxRate explicitly undefined / 0 handled', 5, () => near(call(100, 10, undefined), 90) && near(call(100, 10, 0), 90));
  check('demonstrates calls with 1, 2 and 3 arguments', 10, () => {
    const arities = new Set(
      ast
        .all((n) => ts.isCallExpression(n) && ast.text(n.expression) === 'calculateFinalPrice' && ast.isTopLevel(n))
        .map((n) => n.arguments.length),
    );
    const hit = [1, 2, 3].filter((x) => arities.has(x)).length;
    return { fraction: hit / 3, note: `argument counts used: ${[...arities].join(',')}` };
  });
  check('no compile errors (strict mode)', 10, () => cleanResult(diags));
}

module.exports = { a: A, b: B, c: C, d: D, e: E, f: F };
