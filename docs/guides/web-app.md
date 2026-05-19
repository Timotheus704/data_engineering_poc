# Web App Guide

This document explains how the Fastify REST API and React dashboard work, how the code is organised, and how to extend them.

---

## Overview

The web layer lives in `web/` and has two parts that work together:

```
web/
├── server/    ← Fastify REST API (TypeScript, Node.js)
└── client/    ← React dashboard (TypeScript, Vite)
```

The API reads from and writes to Postgres. The React app reads from and writes to the API. They never talk to each other directly — the API is the only thing that touches the database.

---

## Running the web app

**Option A — Docker (production-like, recommended for demos)**
```bash
docker compose up -d postgres
docker compose --profile web up --build
```
- UI: http://localhost:3000
- API: http://localhost:3001
- Swagger docs: http://localhost:3001/docs

**Option B — Local dev mode (hot reload, faster iteration)**
```bash
./dev.sh
```
This script starts Postgres in Docker, then runs the Fastify server and Vite dev server on your Mac with hot reload. Changes to TypeScript or React files update instantly.

**Option C — Start each piece manually**
```bash
# Terminal 1 — Postgres
docker compose up -d postgres

# Terminal 2 — API server
cd web/server && npm install
POSTGRES_HOST=localhost npm run dev      # → http://localhost:3001

# Terminal 3 — React client
cd web/client && npm install
npm run dev                              # → http://localhost:3000
```

---

## The Fastify API (`web/server/`)

### Structure

```
web/server/
├── src/
│   ├── index.ts            ← Server bootstrap: registers plugins, routes, starts listening
│   ├── db.ts               ← pg connection pool + query<T>() and withTransaction() helpers
│   ├── plugins/
│   │   └── db-plugin.ts    ← Fastify plugin that closes the pool on server shutdown
│   └── routes/
│       ├── health.ts       ← GET /health — DB connectivity check
│       ├── titanic.ts      ← Full CRUD for staging.titanic
│       ├── nyc_taxi.ts     ← Full CRUD for staging.nyc_taxi
│       └── admin.ts        ← Table browser, column inspector, SQL runner
├── Dockerfile              ← Multi-stage: tsc build → slim production image
├── package.json
└── tsconfig.json
```

### How Fastify routes work

Each route file exports a `FastifyPluginAsync` function. Routes are registered in `index.ts` with a URL prefix:

```typescript
// index.ts
await fastify.register(titanicRoutes, { prefix: '/api' });

// titanic.ts
fastify.get('/titanic', async (req, reply) => { ... });
// → combined: GET /api/titanic
```

Each route handler is an async function. Return a value to send it as JSON:

```typescript
fastify.get<{ Querystring: { limit?: number } }>('/titanic', async (req, reply) => {
  const { limit = 20 } = req.query;
  const rows = await query<TitanicRow>('SELECT * FROM staging.titanic LIMIT $1', [limit]);
  return reply.send({ data: rows, total: rows.length });
});
```

The `<{ Querystring: ... }>` generic tells TypeScript the shape of the query string — `req.query` is then fully typed.

### The `query<T>()` helper

All database access goes through `db.ts`:

```typescript
import { query, withTransaction } from '../db';

// Returns T[] — fully typed
const rows = await query<TitanicRow>(
  'SELECT * FROM staging.titanic WHERE id = $1',
  [id]
);
```

This is the same pattern as the CLI app. `$1`, `$2` etc. are parameterised placeholders — the values are passed separately, preventing SQL injection.

### API response shape

All endpoints follow a consistent shape:

```json
// Collections
{ "data": [...], "total": 891, "limit": 20, "offset": 0 }

// Single record
{ "data": { "id": 1, "name": "..." } }

// Mutations (create/update/delete)
{ "data": { ... }, "message": "Passenger deleted" }

// Errors
{ "error": "Passenger not found" }
```

### Swagger / OpenAPI docs

The API auto-generates interactive documentation at `http://localhost:3001/docs`. You can try every endpoint directly from the browser — no Postman or curl needed.

### Adding a new route

1. Create `web/server/src/routes/my_dataset.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { query } from '../db';

const myRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/my-dataset', async (req, reply) => {
    const rows = await query('SELECT * FROM staging.my_table LIMIT 20');
    return reply.send({ data: rows });
  });
};

export default myRoutes;
```

2. Register it in `web/server/src/index.ts`:

```typescript
import myRoutes from './routes/my_dataset';
await fastify.register(myRoutes, { prefix: '/api' });
```

---

## The React Dashboard (`web/client/`)

### Structure

```
web/client/
├── src/
│   ├── main.tsx            ← React root: wraps App in BrowserRouter
│   ├── App.tsx             ← Sidebar layout + React Router routes
│   ├── lib/
│   │   └── api.ts          ← All fetch() calls to the API; typed request wrappers
│   ├── components/
│   │   ├── DataTable.tsx   ← Reusable paginated table with Edit/Delete actions
│   │   ├── Modal.tsx       ← Accessible modal (Esc to close, click-outside to dismiss)
│   │   └── StatCard.tsx    ← Dashboard stat card (label, big number, optional subtext)
│   └── pages/
│       ├── Dashboard.tsx   ← Overview: stat cards + Recharts bar and line charts
│       ├── TitanicPage.tsx ← Full CRUD: list, create, edit, delete passengers
│       ├── TaxiPage.tsx    ← Full CRUD: list, create, edit, delete trips
│       └── AdminPage.tsx   ← Table browser + column inspector + SQL runner
├── index.html
├── vite.config.ts          ← Dev server config; proxies /api/* to localhost:3001
├── nginx.conf              ← Docker config; proxies /api/* to web_server container
├── Dockerfile
├── package.json
└── tsconfig.json
```

### `src/lib/api.ts` — the API client

All HTTP calls go through this file. Never use raw `fetch()` in page components.

```typescript
// Typed request helper
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

// Dataset-specific API objects
export const titanicApi = {
  list: (params) => request('/titanic?' + new URLSearchParams(params)),
  get:  (id)    => request(`/titanic/${id}`),
  create: (body) => request('/titanic', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/titanic/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id)  => request(`/titanic/${id}`, { method: 'DELETE' }),
};
```

**Why centralise API calls?** If the API URL or shape changes, you update one file. Page components stay clean and focused on rendering.

### `DataTable` component

The reusable table accepts a columns definition and handles pagination, loading state, and action buttons:

```tsx
<DataTable
  columns={[
    { key: 'name',     label: 'Name' },
    { key: 'survived', label: 'Survived',
      render: (v) => <span style={{ color: v ? 'green' : 'red' }}>{v ? 'Yes' : 'No'}</span>
    },
  ]}
  data={rows}
  total={total}
  page={page}
  pageSize={20}
  onPageChange={setPage}
  onEdit={openEditModal}
  onDelete={openDeleteModal}
/>
```

The `render` function lets you customise how a cell is displayed without changing the component itself.

### CRUD flow pattern

All CRUD pages follow the same state pattern:

```
data[]        ← current page of rows from the API
total         ← total row count for pagination
page          ← current page number
modal         ← 'create' | 'edit' | 'delete' | null
selected      ← the row being edited or deleted
form          ← controlled form state (mirrors the row shape)
error         ← error string from the API
saving        ← loading state during API calls
```

The flow:

1. Page loads → `useEffect` calls `api.list()` → sets `data` and `total`
2. User clicks Edit → `openEdit(row)` → sets `modal='edit'`, `selected=row`, `form={...row}`
3. User edits fields → `setForm(f => ({...f, [key]: value}))` updates controlled inputs
4. User clicks Save → `api.update(selected.id, form)` → on success: close modal, reload data
5. User clicks Delete → `openDelete(row)` → confirmation modal → `api.delete(row.id)` → reload

### Admin panel

The Admin page (`AdminPage.tsx`) has three sections:

**Table browser** — lists all tables in `staging` and `analytics` schemas, with row counts and sizes. Clicking a table pre-fills the SQL runner with `SELECT * FROM schema.table LIMIT 20`.

**Column inspector** — shows the column names, types, and nullability for the selected table.

**SQL runner** — a textarea where you type any `SELECT` statement and click Run (or press ⌘↵ / Ctrl↵). Results display as a table below. Only `SELECT` and `WITH` (CTE) statements are permitted — the server rejects anything else.

### Styling conventions

The app uses a dark theme with inline styles. No CSS framework is used. Key design tokens:

| Token | Value | Used for |
|---|---|---|
| Background | `#0f1117` | Page background |
| Card background | `#161b27` | Panels, tables, modals |
| Border | `#1e2a3a` | Card borders, table dividers |
| Text primary | `#e2e8f0` | Headings, important values |
| Text secondary | `#94a3b8` | Labels, descriptions |
| Text muted | `#64748b` | Metadata, counts |
| Accent blue | `#3b82f6` | Links, active nav, primary buttons |
| Success green | `#22c55e` | Survivors, positive values |
| Danger red | `#ef4444` | Delete buttons, negative values |

### Adding a new page

1. Create `web/client/src/pages/MyPage.tsx`
2. Add a route in `App.tsx`:

```tsx
import MyPage from './pages/MyPage';

// In the nav array:
{ to: '/my-page', label: 'My Dataset', Icon: SomeIcon },

// In the Routes:
<Route path="/my-page" element={<MyPage />} />
```

3. Add API functions to `src/lib/api.ts`
4. Build the page using `DataTable`, `Modal`, and `StatCard` components

---

## The nginx reverse proxy (`web/client/nginx.conf`)

In Docker, nginx does two things:

1. **Serves the React app** — all routes that don't match `/api/*` return `index.html`, letting React Router handle navigation client-side
2. **Proxies API calls** — `/api/*` is forwarded to the `web_server` container so the browser only ever talks to one origin

```nginx
location /api/ {
    proxy_pass http://web_server:3001;
}

location / {
    try_files $uri $uri/ /index.html;   # SPA fallback
}
```

`try_files ... /index.html` is what makes client-side routing work. Without it, refreshing `/titanic` would return a 404 because nginx would look for a file called `titanic` that doesn't exist.
