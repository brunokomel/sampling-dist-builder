# CLAUDE.md — Sampling Distribution Builder

This file provides guidance for AI assistants working on this codebase.

## Project Overview

An interactive educational visualization tool that demonstrates the **Central Limit Theorem (CLT)**. Users configure a population distribution, draw repeated samples, and watch the sampling distribution of the sample mean emerge in real time through SVG-based animation.

The app is purely client-side — no backend, no database, no API calls.

## Tech Stack

| Layer | Choice |
|---|---|
| UI Framework | React 19 |
| Language | JavaScript (JSX) — *tsconfig targets TS but source files are `.jsx`* |
| Build Tool | Vite 7 |
| Styling | Plain CSS (`index.css`, inline styles) |
| Charts | Hand-rolled SVG (no D3, Recharts, or Chart.js) |
| Package Manager | npm |
| Linter | ESLint 9 (flat config) with TypeScript-ESLint |

## Repository Layout

```
sampling-dist-builder/
├── index.html              # SPA shell — mounts <div id="root">
├── src/
│   ├── main.jsx            # ReactDOM.createRoot entry point
│   ├── App.jsx             # Entire application (CLTVisualizer + helpers)
│   ├── index.css           # Global dark-theme styles
│   └── App.css             # Legacy file — effectively unused
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── vite.config.ts          # Vite + @vitejs/plugin-react (Babel Fast Refresh)
├── tsconfig.json           # Project references root
├── tsconfig.app.json       # Strict TS config for src/
├── tsconfig.node.json      # TS config for vite.config.ts
└── eslint.config.js        # ESLint flat config
```

All application logic lives in a single file: **`src/App.jsx`**.

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server (localhost:5173, HMR enabled)
npm run build        # Production bundle → dist/
npm run preview      # Serve the production bundle locally
npm run lint         # ESLint across all source files
```

There are no tests configured. The `lint` script is the only automated code-quality gate.

## Architecture & Key Concepts

### Single-File Application

`src/App.jsx` exports one top-level component (`CLTVisualizer`) and contains all:
- Statistical helper functions
- Sub-components (`PlotCard`, `Btn`, `ControlSlider`)
- Animation logic
- SVG rendering

Keep new logic in `App.jsx` unless a clear reason to split (e.g., the file grows unwieldy).

### Data Flow

```
Controls (useState)
    → useMemo: generatePopulation()
    → useMemo: makeHistogram() for each plot
    → useMemo: stackMeans()
    → SVG render
```

State is flat local state in `CLTVisualizer` — no Context, Redux, or external store.

### Statistical Primitives

| Function | Purpose |
|---|---|
| `mulberry32(seed)` | Seeded PRNG — keeps results reproducible across re-renders |
| `generatePopulation(dist, size)` | Produces 30,000-sample population array |
| `sampleFrom(population, n)` | Draws `n` random items without replacement |
| `makeHistogram(data, bins, range)` | Bins data; returns `{x, y, width}[]` |
| `stackMeans(means, bins, range)` | Stacks means for the third plot |
| `computeRange(data)` | Percentile-based axis range (0.5%–99.5%) |
| `scaleX(val, range, width)` / `scaleY(val, maxY, height)` | Map data → SVG pixels |

### Distributions Supported

`exponential`, `uniform`, `normal`, `bimodal`, `beta`, `skewed`

### Animation State Machine

Animation runs via `useEffect` + `setInterval`/`setTimeout`. The token animation has three phases managed through state:
1. **compress** — sample tokens gather on plot 1
2. **fly** — tokens animate toward plot 3
3. **drop** — mean token drops into the sampling distribution

Use `useRef` for timeout handles (not `useState`) to avoid stale closures and unnecessary re-renders.

### SVG Conventions

- Each plot uses a fixed `viewBox` with explicit `width`/`height` props for responsiveness.
- `<clipPath>` elements bound bar rectangles within the plot area.
- Coordinate helpers (`scaleX`, `scaleY`) convert data values to pixel positions.
- Hover highlighting is implemented via inline SVG event handlers.

## Coding Conventions

- **Components** — PascalCase (`CLTVisualizer`, `PlotCard`, `Btn`, `ControlSlider`)
- **Functions/variables** — camelCase
- **No TypeScript `any`** — strict mode is enabled; keep inferred types clean
- **New JSX transform** — do not add `import React from 'react'` (not needed with `react-jsx`)
- **Memoization** — wrap expensive derived values in `useMemo`; use `useRef` for values that should not trigger re-renders
- **No unused variables** — `noUnusedLocals` and `noUnusedParameters` are enforced by TS

## Styling Conventions

Dark color scheme defined in `index.css` CSS custom properties:

| Variable / Value | Role |
|---|---|
| `#1C2739` | Page background |
| `#0f172a` / `#1e293b` | Card backgrounds |
| `#e2e8f0` | Primary text |
| `#94a3b8` | Muted / secondary text |
| `#f59e0b` | Accent (gold) — sample highlight |
| `#3b82f6` | Primary blue — population bars |
| `#334155` / `#475569` | Borders |

Font: `'Courier New', monospace` throughout the app.

Layout is Flexbox-based. Prefer CSS classes in `index.css` over inline styles for layout; use inline styles only for dynamic values (e.g., bar heights, positions computed from data).

## What Not to Do

- **Do not add a charting library** (D3, Recharts, etc.) — the SVG approach is intentional.
- **Do not add a state management library** — local state is sufficient.
- **Do not split into many small files** without strong justification — the single-file design is deliberate for this educational tool's scope.
- **Do not remove the seeded RNG** (`mulberry32`) — reproducibility is a feature.
- **Do not change `App.css`** — it is legacy and effectively unused; prefer `index.css`.

## Known Gaps (Potential Improvements)

- No automated tests (unit or integration) — consider Vitest for statistical helpers.
- ESLint is the only CI gate — no GitHub Actions workflow exists.
- Source files are `.jsx` despite TypeScript tooling being configured; migrating to `.tsx` would unlock full type checking on component props.
