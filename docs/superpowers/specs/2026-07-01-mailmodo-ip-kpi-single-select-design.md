# Single-IP selector for Mailmodo KPI charts

**Date:** 2026-07-01
**Origin:** Sunil's feedback on the per-IP trend line change (PR #22). He wants
the "By IP" KPI charts to show the line for **one IP at a time**, chosen via a
filter — not all IPs at once (3 lines in the screenshot he sent).

## Problem

In the Mailmodo deep-dive, the KPI Charts card has a `BY DATE / BY IP` toggle.
Under **By IP** (`embedView === 'provider'`) the charts render one trend line
per entity simultaneously — every IP (or sending domain) at once. Sunil wants a
selector so only the chosen entity's line is drawn.

## Solution

Add a single-entity selector to the KPI Charts card, applied to **both** the
IP Address and Sending Domain tabs.

### Behavior
- A `CustomSelect` dropdown sits next to the `BY DATE / BY IP` toggle, visible
  **only** when `embedView === 'provider'`.
- Options come from `entityData` (already sorted by volume). Default = the
  highest-volume entity (`entityData[0]`).
- Under By IP / By Domain, the KPI line charts render a **single dataset** for
  the selected entity instead of mapping over all of `entityData`.
- **By Date mode is unchanged** — still one Overall aggregate line.

### State
- New state `kpiEntity: string` (selected entity name).
- Reset to the top entity when ESP or tab changes (same spot as `filterIp`
  reset). If the current `kpiEntity` is not present in `entityData` (e.g. after
  a tab switch), fall back to `entityData[0]`.
- Independent from the Daily KPIs table's `filterIp` — the table is untouched.

### Touch points (`src/components/views/MailmodoView.tsx`)
1. Add `kpiEntity` state near the other filter state.
2. Reset `kpiEntity` alongside `filterIp` on ESP/tab change.
3. Derive `selectedEntity = entityData.find(e => e.name === kpiEntity) ?? entityData[0]`.
4. KPI chart effect (`embedView === 'provider'` branch): render one dataset for
   `selectedEntity`; add `kpiEntity` to the dependency array.
5. Card header: add the `CustomSelect` (only in provider mode).
6. Legend: in provider mode show only the selected entity's swatch/name (+ its
   sub-domains for the IP tab).

### Reuse
- Existing `CustomSelect` component (same as the table filter).
- Entity colors from `IP_COLOR_PALETTE` / `DOMAIN_COLORS` — the selected line
  keeps its established color.

## Out of scope
- No change to the Daily KPIs table, pies, rate trend chart, or By Date view.
- No new data plumbing — `entityData` already carries per-entity `byDate`.
