# Assignment 1 evaluator (TypeScript, versions A–F)

Grades student `.ts` submissions out of 100 using the TypeScript compiler (strict mode), AST checks, and by
running the code in a `vm` sandbox with behavioural tests.

## Setup
```
npm install        # installs typescript
```

## Run
```
node evaluate.js a path/to/student.ts          # one file, version A
node evaluate.js submissions/c                 # whole folder (version inferred from a folder named a..f)
node evaluate.js c submissions/all_c --quiet   # explicit version, summary only
```
Grading a folder writes `results.csv` (file, version, score, lost checks). Use `--csv out.csv` to choose the path.

Suggested layout: `submissions/a/*.ts … submissions/f/*.ts` (one file per student, e.g. `submissions/a/ali.ts`).
