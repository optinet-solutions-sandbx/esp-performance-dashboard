# CLAUDE.md — ESP Performance Dashboard

## Project Overview
A multi-ESP email analytics dashboard. Users upload CSV/XLSX activity reports from ESPs (Mailmodo, Mailgun, etc.), data is parsed and stored in Supabase, and rendered as charts, KPI cards, heatmaps, and tables.

---

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.1 (App Router) |
| UI | React 19, TypeScript 5, Tailwind CSS 4 |
| Charts | Chart.js 4.5 + react-chartjs-2 |
| State | Zustand 5 (persist to localStorage) |
| Database | Supabase (PostgreSQL + JSONB) |
| File parsing | xlsx 0.18.5 + native File API |
| Theming | next-themes 0.4.6 |

---

## Directory Structure
```
src/
├── app/
│   ├── page.tsx          # App shell: sidebar, view routing, Supabase load-on-mount
│   ├── layout.tsx        # Root HTML layout + metadata
│   └── globals.css       # Global styles
├── components/
│   ├── layout/
│   │   └── Sidebar.tsx   # Nav sidebar, ESP list, theme toggle, status pills
│   ├── ui/
│   │   ├── KpiCard.tsx
│   │   ├── ChartCard.tsx
│   │   ├── CalendarPicker.tsx
│   │   └── StatusPill.tsx
│   └── views/
│       ├── HomeView.tsx        # Aggregate overview: volume bar, ESP doughnut, activity
│       ├── DashboardView.tsx   # ESP list with KPI cards, filter/search/sort
│       ├── MailmodoView.tsx    # Deep-dive: IP/provider/domain tabs, heatmaps, trends
│       ├── UploadView.tsx      # File upload wizard, parse log, Supabase save, history
│       ├── MatrixView.tsx      # Provider × Domain delivery rate heatmap
│       ├── IPMatrixView.tsx    # IP registry CRUD + CSV import
│       ├── DataMgmtView.tsx    # Partner roster CSV (PIN: 1234), charts
│       ├── PerformanceView.tsx # Performance trends
│       └── DailyView.tsx      # 7-day rolling daily report
└── lib/
    ├── types.ts      # All TypeScript interfaces
    ├── store.ts      # Zustand store (15+ slices)
    ├── supabase.ts   # Supabase client init
    ├── parsers.ts    # CSV/XLSX parsing + metric aggregation
    ├── data.ts       # Seed data, ESP/provider color maps
    └── utils.ts      # Formatting, aggregation, data merging, CSV export
```

---

## Key Conventions

### Path Alias
`@/*` maps to `./src/*`. Always use `@/lib/...`, `@/components/...`.

### State Management
- **Zustand store** (`src/lib/store.ts`) is the single source of truth for UI state and data
- `espData: Record<string, MmData>` — parsed data keyed by ESP name
- `uploadHistory` — in-memory, also rendered from Supabase `uploads` table
- Persisted to localStorage: `isLight`, `ipmData`, `dmData`
- Other state syncs from Supabase on mount (`page.tsx`)

### Data Types (src/lib/types.ts)
```typescript
// Core metric struct used everywhere
interface DateMetrics {
  sent, delivered, opened, clicked, bounced, unsubscribed, complained,
  deliveryRate, openRate, clickRate, bounceRate, unsubRate, complaintRate
}

// Per-provider or per-domain time-series
interface ProviderData {
  overall: DateMetrics
  byDate: Record<string, DateMetrics>   // key = "Mar 10", "Apr 3", etc.
}

// Full ESP dataset
interface MmData {
  dates: string[]                        // ["Mar 10", "Mar 11", ...]
  datesFull: { label, year, iso }[]
  providers: Record<string, ProviderData>   // recipient email domains
  domains: Record<string, ProviderData>     // sending from-domains
  overallByDate: Record<string, DateMetrics>
  providerDomains: Record<string, Record<string, DateMetrics>>
}
```

### Date Format
Dates are always stored as short labels: `"Mar 10"`, `"Apr 3"` etc. (no year in the key — year lives in `datesFull`). Never use ISO strings as map keys.

### Status Thresholds (src/lib/utils.ts → getEspStatus)
- `healthy`: delivery > 95% AND bounce < 2%
- `warn`: delivery 70–95% OR bounce 2–10%
- `critical`: delivery < 70% OR bounce > 10%

---

## Supabase Schema

### `uploads` table
```
id           uuid (PK, auto)
esp          text              -- "Mailmodo", "Mailgun", etc.
category     text              -- "mailmodo" | "mailgun"
filename     text
rows         integer
dates        text[]            -- ["Mar 10", "Mar 11", ...]
new_dates    integer
solo_data    jsonb             -- MmData for this single upload only
uploaded_at  timestamptz (auto)
```

### Upload / Rebuild Flow
1. Parse file → `solo_data` (MmData for this file only)
2. **INSERT** to `uploads` — never DELETE previous uploads (immutable history)
3. Query all uploads for the ESP ordered `uploaded_at ASC`
4. Rebuild merged MmData using **`overwriteMmData()`** (last-write-wins per date)
5. Update Zustand store

> **Critical:** Use `overwriteMmData` (not `mergeMmData`) when rebuilding from multiple uploads. `mergeMmData` accumulates metrics and will double-count if the same dates appear in multiple uploads. `overwriteMmData` replaces a date's data with the latest upload's version.

### On App Mount (page.tsx)
Same rebuild flow: query all uploads → group by ESP → `overwriteMmData` → store.

---

## Data Merging Rules (src/lib/utils.ts)

| Function | Behavior | When to use |
|----------|----------|-------------|
| `mergeMmData(a, b)` | Accumulates metrics for duplicate dates | Combining truly separate date ranges |
| `overwriteMmData(base, override)` | Latest-wins per date: wipes that date in base, writes from override | Rebuilding from upload history |
| `aggDates(byDate, dates[])` | Aggregates a date range into a single DateMetrics | Chart rendering, KPI computation |
| `syncEspFromData(espRecord, mmData)` | Computes EspRecord KPIs from MmData | After any data change |

---

## File Parsing (src/lib/parsers.ts)

### Supported Formats
| Format | Detection | Date Column | Key Fields |
|--------|-----------|-------------|------------|
| Mailmodo | Has `campaign-name` + `opens-html` | `sent-time` (dd/mm/yyyy) | `opens-html`, `opens-amp`, `clicks-html`, `clicks-amp` |
| Generic/Mailgun | Default | `date` or `sent-time` | `sent`, `delivered`, `opened`, `clicked` |

### CSV Edge Cases
- Multiline quoted fields: handled by `splitCsvRows()` — respects `"..."` wrapping
- Excel date serials: converted via `(serial - 25569) * 86400 * 1000`
- Date formats tried in order: Excel serial → `dd/mm/yyyy` → ISO `yyyy-mm-dd` → `Date()` constructor

### What Gets Extracted Per Row
- **Recipient provider**: `email.split('@')[1]` → groups into `providers`
- **Sending domain**: from `campaign-name` prefix (e.g. `"domain.com - Campaign Name"`) → groups into `domains`
- Metrics: sent=1 per row, delivered/opened/clicked/bounced/unsubscribed from boolean/numeric fields

---

## UI Patterns

### Colors
```
--accent-teal:   #00e5c3   (primary action, success)
--accent-red:    #ff4757   (danger, bounce rate)
--accent-yellow: #ffd166   (warn, CTR)
--accent-purple: #7c5cfc   (Mailmodo brand)
--accent-orange: #ff6b35   (upload/history)
```

### Light/Dark Mode
- Toggled via `isLight` in Zustand store
- Applied as `document.body.classList.toggle('light', isLight)` in `page.tsx`
- Always pass `isLight` from store into component logic — do not read from DOM directly

### Responsive
- Sidebar: fixed drawer on mobile (`isSidebarOpen`), sticky on `lg+`
- Use Tailwind breakpoints: `sm:`, `md:`, `lg:`

### Component Patterns
- Views are self-contained — they read from store via `useDashboardStore()`
- Chart.js instances: always destroy on re-render (use `useEffect` cleanup or Chart.js `key` prop)
- Loading states: use `processing` boolean local state during async ops

---

## Development

### Commands
```bash
npm run dev     # Start dev server (http://localhost:3000)
npm run build   # Production build
npm run lint    # ESLint
```

### Environment Variables (required)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Adding a New ESP
1. Add name to `ESP_LIST` in `UploadView.tsx`
2. Add color to `ESP_COLORS` in `src/lib/data.ts`
3. If it needs a custom parser, add format detection + field mapping in `parsers.ts`
4. Add to the sidebar nav in `Sidebar.tsx` if it needs its own review view

### Adding a New View
1. Create `src/components/views/MyView.tsx`
2. Add the view name to `View` type in `src/lib/types.ts`
3. Add nav entry in `Sidebar.tsx`
4. Add `case 'myview': return <MyView />` in `page.tsx`

---

## Known Patterns to Follow

- **Never accumulate upload data**: always use `overwriteMmData` when stacking multiple uploads
- **Upload history is append-only**: never delete previous uploads when uploading a new file
- **Date keys are short labels** (`"Mar 10"`), not ISO strings — be consistent
- **`overall` must stay in sync**: after modifying any `byDate`, recalculate `overall` from all `byDate` values
- **DataMgmt PIN**: `1234` — used for export/reset of partner roster data

<!-- gitnexus:start -->
# GitNexus MCP

This project is indexed by GitNexus as **ESP-Performance-Dashboard** (337 symbols, 812 relationships, 20 execution flows).

GitNexus provides a knowledge graph over this codebase — call chains, blast radius, execution flows, and semantic search.

## Always Start Here

For any task involving code understanding, debugging, impact analysis, or refactoring, you must:

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/refactoring/SKILL.md` |

## Tools Reference

| Tool | What it gives you |
|------|-------------------|
| `query` | Process-grouped code intelligence — execution flows related to a concept |
| `context` | 360-degree symbol view — categorized refs, processes it participates in |
| `impact` | Symbol blast radius — what breaks at depth 1/2/3 with confidence |
| `detect_changes` | Git-diff impact — what do your current changes affect |
| `rename` | Multi-file coordinated rename with confidence-tagged edits |
| `cypher` | Raw graph queries (read `gitnexus://repo/{name}/schema` first) |
| `list_repos` | Discover indexed repos |

## Resources Reference

Lightweight reads (~100-500 tokens) for navigation:

| Resource | Content |
|----------|---------|
| `gitnexus://repo/{name}/context` | Stats, staleness check |
| `gitnexus://repo/{name}/clusters` | All functional areas with cohesion scores |
| `gitnexus://repo/{name}/cluster/{clusterName}` | Area members |
| `gitnexus://repo/{name}/processes` | All execution flows |
| `gitnexus://repo/{name}/process/{processName}` | Step-by-step trace |
| `gitnexus://repo/{name}/schema` | Graph schema for Cypher |

## Graph Schema

**Nodes:** File, Function, Class, Interface, Method, Community, Process
**Edges (via CodeRelation.type):** CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```

<!-- gitnexus:end -->
