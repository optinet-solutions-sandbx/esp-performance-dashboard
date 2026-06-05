# Contributing

This repo has CI and branch protection on `main`. Read this before your first push — it will save you a rejected push and a red check.

## TL;DR

```bash
git fetch origin               # always start from the latest main
git switch main && git pull
git switch -c your-feature     # work on a branch, never on main directly

# ...make changes...

npm run lint                   # must be 0 errors
npm run test:run               # must be 28+ passing
npm run build                  # must compile

git push -u origin your-feature   # push the BRANCH, then open a PR on GitHub
```

You **cannot push directly to `main`** — it's protected. All changes go through a Pull Request whose CI check (`verify`) must pass before it can merge.

## The golden rule: run the checks locally first

CI runs exactly three things, in this order. Run them yourself before pushing — a green local run means a green PR:

| Command | What it guards |
|---------|----------------|
| `npm run lint` | Type-unsafe `any`, in-render component creation, React hook violations, dead code. **Must be 0 errors** (warnings are allowed). |
| `npm run test:run` | Behavioral regressions in the data core — CSV/XLSX parsing, the merge/overwrite upload logic, KPI math. **Must pass.** |
| `npm run build` | TypeScript/compile breaks and Next.js prerender failures. **Must succeed.** |

If any of these fails locally, it will fail in CI. Fix it before pushing.

## Tests are required for the data layer

The regression suite lives in `src/lib/__tests__/`. It exists because silent
data bugs (wrong KPI numbers, doubled upload data) used to slip through. **If you
change anything in `src/lib/parsers.ts` or `src/lib/utils.ts`, add or update a
test.** A green build is not enough — the build stays green while the numbers are
wrong; only a test catches that.

Run a single file while iterating:

```bash
npx vitest run src/lib/__tests__/utils.test.ts
npm test            # watch mode
```

## Workflow, step by step

1. **Start current.** `git fetch && git switch main && git pull`. The local clone
   tends to fall behind — branching off a stale `main` causes avoidable conflicts.
2. **Branch.** `git switch -c short-descriptive-name`. Never commit on `main`.
3. **Work in small commits.** Conventional prefixes are used here: `feat:`,
   `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`.
4. **Verify locally** (the three commands above).
5. **Push the branch** and open a PR against `main` on GitHub.
6. **Wait for the `verify` check** to go green, get a review if required, then merge.

## Dependencies and the lockfile

- Install with `npm install`; commit **both** `package.json` and `package-lock.json`.
- CI uses `npm ci`, which is strict: it fails if `package-lock.json` is out of sync
  with `package.json`. If CI fails at the `npm ci` step, run `npm install` locally,
  commit the updated lockfile, and push.
- **Do not hand-edit `package-lock.json`.**
- The lint toolchain (`eslint`, `eslint-plugin-react-hooks`) is **pinned to exact
  versions** on purpose — the React-Compiler lint rules change between releases.
  Don't loosen those pins or bump them casually; a bump can surface new lint errors
  for everyone. If you intend to upgrade them, do it deliberately in its own PR and
  fix the fallout there.

## Environment

Copy `.env.local` settings from a teammate (it's gitignored). The app needs:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

CI builds with throwaway placeholder values (it never talks to a real Supabase),
so you don't need real secrets for the build to pass — only for running the app.

## If your PR's CI is red

Click the failed **`verify`** check → open the failing step's logs. The step name
tells you which gate broke:

- **`npm ci`** → lockfile out of sync. `npm install`, commit the lockfile, push.
- **`npm run lint`** → 0-error rule broke. Run `npm run lint` locally to see it.
- **`npm run test:run`** → a regression. Run `npm run test:run` and read the diff.
- **`npm run build`** → a type/compile/prerender error. Run `npm run build` locally.

Reproduce locally, fix, push to the same branch — CI re-runs automatically.
