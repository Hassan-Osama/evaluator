#!/usr/bin/env node
// Usage:
//   node evaluate.js <version a-f> <file.ts | folder>     grade one file or every .ts in a folder
//   node evaluate.js <file.ts | folder>                   version inferred from a parent folder named a..f
// Options: --csv <out.csv> (default results.csv in cwd when grading a folder), --quiet (summary only)
const fs = require('fs');
const path = require('path');
const { evaluateFile } = require('./lib/core');
const rubrics = require('./lib/rubrics');

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  return args.splice(i, 2)[1];
};
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const csvPath = opt('--csv');
const quiet = flag('--quiet');

let version;
if (args[0] && /^[a-f]$/i.test(args[0])) version = args.shift().toLowerCase();
const target = args[0];
if (!target) {
  console.error('Usage: node evaluate.js [a-f] <file.ts | folder> [--csv out.csv] [--quiet]');
  process.exit(2);
}

function listTs(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return [p];
  return fs
    .readdirSync(p, { withFileTypes: true })
    .flatMap((e) => (e.name.startsWith('.') || e.name === 'node_modules' ? [] : listTs(path.join(p, e.name))))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
}
const inferVersion = (file) => {
  for (const seg of path.resolve(file).split(path.sep).reverse().slice(1)) {
    const m = seg.match(/^(?:version[ _-]?)?([a-f])$/i);
    if (m) return m[1].toLowerCase();
  }
};

const files = listTs(target);
if (!files.length) {
  console.error('No .ts files found in ' + target);
  process.exit(2);
}

const results = [];
for (const file of files) {
  const v = version || inferVersion(file);
  if (!v) {
    console.error(`Cannot infer version for ${file}; pass a version (a-f) as first argument.`);
    process.exit(2);
  }
  let r;
  try {
    r = { ...evaluateFile(file, rubrics[v]), version: v.toUpperCase() };
  } catch (e) {
    r = { file, version: v.toUpperCase(), score: 0, max: 100, items: [], runtimeError: 'evaluator crash: ' + e.message };
  }
  results.push(r);
  if (!quiet) {
    console.log(`\n=== ${path.relative(process.cwd(), file)}  [Version ${r.version}]  ${r.score}/${r.max}`);
    for (const i of r.items) {
      const mark = i.earned === i.points ? '✔' : i.earned > 0 ? '◐' : '✘';
      console.log(`  ${mark} ${String(i.earned).padStart(5)}/${String(i.points).padEnd(3)} ${i.name}${i.note ? '   — ' + i.note : ''}`);
    }
    if (r.runtimeError) console.log(`  ! runtime error while running the program: ${r.runtimeError}`);
  }
}

console.log('\nSummary');
for (const r of results) console.log(`  ${String(r.score).padStart(6)}/${r.max}  V${r.version}  ${path.relative(process.cwd(), r.file)}`);

const out = csvPath || (fs.statSync(target).isDirectory() ? 'results.csv' : undefined);
if (out) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [['file', 'version', 'score', 'max', 'failed_or_partial_checks', 'runtime_error'].join(',')];
  for (const r of results) {
    const lost = r.items.filter((i) => i.earned < i.points).map((i) => `${i.name} (${i.earned}/${i.points})`).join('; ');
    rows.push([q(path.relative(process.cwd(), r.file)), r.version, r.score, r.max, q(lost), q(r.runtimeError || '')].join(','));
  }
  fs.writeFileSync(out, rows.join('\n') + '\n');
  console.log(`\nWrote ${out}`);
}
