# Branch protection for `main`

The CI workflow (`.github/workflows/ci.yml`) only *reports* status until the
repository is configured to *require* it. Without this, a developer can still
merge a red build. A repo admin must apply these settings once, **after the CI
workflow has run at least once** (the check name only appears in the dropdown
after its first run):

1. **Settings → Branches → Add branch ruleset** (or *Add rule*) targeting `main`.
2. Enable **Require a pull request before merging**.
3. Enable **Require status checks to pass before merging**.
4. In the status-checks search box, select the **`verify`** job from the CI
   workflow.
5. (Recommended) Enable **Require branches to be up to date before merging**.
6. Save.

After this, PRs to `main` cannot merge until `lint`, tests, and `build` pass.

## What CI runs (and why)

The `verify` job runs, in order:

| Step | Catches |
|------|---------|
| `npm run lint` | Type-unsafe `any`, in-render component creation, hook violations, unused code |
| `npm run test:run` | Behavioral regressions in the data core (parsing + merge/overwrite + KPI math) |
| `npm run build` | TypeScript/compile breaks and prerender failures |

### Why the workflow sets dummy Supabase env vars

`src/lib/supabase.ts` calls `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, …)`
at module load. `@supabase/supabase-js` throws `Error: supabaseUrl is required`
when the URL is empty, which fails `next build` while prerendering pages such as
`/login`. Locally the build works because `.env.local` is auto-loaded by Next.js,
but `.env.local` is gitignored and absent in CI. The workflow therefore sets
non-secret placeholder values so the build can complete:

```yaml
env:
  NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-placeholder-anon-key
```

These are intentionally fake — CI never talks to a real Supabase instance; it only
needs a syntactically valid URL so client construction doesn't throw. If CI ever
needs to run code that actually queries Supabase (e.g. integration tests), replace
these with real values stored as encrypted repository secrets.
