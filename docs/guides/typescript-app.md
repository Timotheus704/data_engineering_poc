# TypeScript App Guide

This document explains how the TypeScript CLI application works, how the code is organised, and how to extend it.

---

## What the app does

The app is a command-line interface (CLI) that connects to the Postgres database and lets you query, explore, and present data from the terminal. It is the TypeScript layer of the stack — the place where database results become typed, manipulable data in code.

---

## Project structure

```
app/
├── src/
│   ├── index.ts              ← CLI entrypoint; all commands are registered here
│   ├── db/
│   │   ├── client.ts         ← Database connection pool and query helpers
│   │   └── types.ts          ← TypeScript interfaces for every DB row type
│   └── queries/
│       ├── titanic.ts        ← Query functions for the Titanic dataset
│       ├── nyc_taxi.ts       ← Query functions for the NYC Taxi dataset
│       └── utils.ts          ← General-purpose DB utilities (list tables, ping, raw query)
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## How the layers connect

```
index.ts (CLI commands)
    │
    │  calls
    ▼
queries/titanic.ts (typed query functions)
    │
    │  calls
    ▼
db/client.ts (query<T>() helper)
    │
    │  pg.Pool.query()
    ▼
Postgres (localhost:5432 or Docker service "postgres")
```

Each layer has one responsibility. The CLI layer handles user input and output formatting. The query layer knows which SQL to run and what shape the results have. The client layer handles the connection pool and error handling.

---

## `db/client.ts` — the database client

This file sets up the connection pool and exports helper functions.

### What is a connection pool?

Opening a database connection is slow — it involves a network handshake, authentication, and setup. A **connection pool** maintains a set of already-open connections and hands them out on demand, returning them when done.

```
First request → opens a connection → adds to pool
Second request → reuses connection from pool  (fast!)
Third request → reuses connection from pool  (fast!)
Pool full → new request waits briefly → uses connection when one frees up
```

The pool is configured with:
```typescript
const pool = new Pool({
  max: 10,                       // up to 10 concurrent connections
  idleTimeoutMillis: 30_000,     // close connections unused for 30s
  connectionTimeoutMillis: 5_000 // fail after 5s if can't connect
});
```

### `query<T>(sql, params)` — the main helper

```typescript
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]>
```

This wraps `pool.query()` and returns typed results. The `<T>` generic parameter tells TypeScript what shape each row has:

```typescript
// Untyped — rows are Record<string, unknown>
const rows = await query('SELECT * FROM staging.titanic');

// Typed — rows are TitanicRow[]
const rows = await query<TitanicRow>('SELECT * FROM staging.titanic');
rows[0].passenger_id  // TypeScript knows this is a number ✅
rows[0].invented_col  // TypeScript error: property doesn't exist ✅
```

### Parameterised queries — SQL injection prevention

Never build SQL by string concatenation. Instead, use parameterised queries:

```typescript
// ❌ NEVER do this — SQL injection risk
const sql = `SELECT * FROM staging.titanic WHERE pclass = ${userInput}`;

// ✅ Always do this — $1 is a placeholder, value is sent separately
const sql = `SELECT * FROM staging.titanic WHERE pclass = $1`;
const rows = await query<TitanicRow>(sql, [userInput]);
```

The Postgres driver sends the SQL and the parameters separately, so the database treats parameters as data, never as SQL code.

### `withTransaction(fn)` — multi-statement transactions

```typescript
await withTransaction(async (client) => {
  await client.query('INSERT INTO staging.titanic ...', [...]);
  await client.query('UPDATE analytics.some_table ...', [...]);
  // If either fails, both are rolled back automatically
});
```

A transaction groups multiple statements so they either all succeed or all fail together. The `withTransaction` helper handles `BEGIN`, `COMMIT`, and `ROLLBACK` automatically.

---

## `db/types.ts` — TypeScript interfaces

Every table and view has a corresponding TypeScript interface:

```typescript
export interface TitanicRow {
  id: number;
  passenger_id: number;
  survived: number;       // 0 or 1 (Postgres SMALLINT)
  pclass: number;
  name: string;
  sex: string;
  age: number | null;     // nullable — many passengers have no age
  // ...
}
```

The `| null` union type captures database NULLs. TypeScript will force you to handle the null case before using the value:

```typescript
const passenger = await getTitanicPassengerById(1);
console.log(passenger.age.toFixed(1));      // ❌ TypeScript error: age could be null
console.log(passenger.age?.toFixed(1));     // ✅ optional chaining — safe
console.log(passenger.age ?? 'unknown');    // ✅ nullish coalescing — provides default
```

---

## `queries/` — typed query functions

Each dataset has a file with functions that encapsulate the SQL for that domain:

```typescript
// queries/titanic.ts

export async function getTitanicPassengers(
  limit = 20,
  offset = 0
): Promise<TitanicRow[]> {
  return query<TitanicRow>(
    `SELECT * FROM staging.titanic ORDER BY passenger_id LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
}
```

**Why functions instead of raw SQL in the CLI?**
- SQL is centralised and reusable — the same function works in the CLI, tests, and any future API
- TypeScript enforces the return type — you can't accidentally use the wrong shape
- Parameters are explicit — the function signature documents what inputs it needs
- Easier to test — you can mock `query()` in unit tests

---

## `index.ts` — the CLI entrypoint

The CLI is built with [Commander.js](https://github.com/tj/commander.js), a popular Node.js library for building command-line interfaces.

### How Commander works

```typescript
const program = new Command();

program
  .command('ping')               // subcommand name
  .description('Check DB')      // help text
  .action(async () => {          // function to run
    const version = await pingDatabase();
    console.log('Connected:', version);
  });

program.parseAsync(process.argv); // parses what the user typed
```

When you run `npx ts-node src/index.ts ping`, Commander:
1. Parses `['ping']` from `process.argv`
2. Finds the matching `.command('ping')`
3. Calls the `.action()` function

### Subcommand groups

Commander supports nested subcommands for organisation:

```typescript
const titanic = program.command('titanic').description('Titanic commands');

titanic.command('list').action(async () => { ... });
titanic.command('summary').action(async () => { ... });
```

This gives you commands like `titanic list` and `titanic summary` under a parent namespace.

### Options

```typescript
titanic
  .command('list')
  .option('-l, --limit <n>', 'number of rows', '10')   // default: '10'
  .action(async (opts) => {
    const rows = await getTitanicPassengers(parseInt(opts.limit));
  });
```

Options are accessed via `opts` in the action. The third argument to `.option()` is the default value.

---

## Running the app

```bash
# From the app/ directory
npx ts-node src/index.ts <command>

# Examples
npx ts-node src/index.ts ping
npx ts-node src/index.ts tables
npx ts-node src/index.ts titanic list --limit 5
npx ts-node src/index.ts titanic list --limit 20 --offset 40
npx ts-node src/index.ts titanic summary
npx ts-node src/index.ts taxi list --min-fare 10
npx ts-node src/index.ts taxi hourly
npx ts-node src/index.ts query "SELECT COUNT(*) FROM staging.titanic"
npx ts-node src/index.ts seed
```

See the full [CLI Reference](../reference/cli.md) for all commands.

---

## Adding a new command

### 1. Add a query function

Create or update a file in `app/src/queries/`:

```typescript
// app/src/queries/titanic.ts

export async function getTitanicByEmbarked(
  port: string
): Promise<TitanicRow[]> {
  return query<TitanicRow>(
    `SELECT * FROM staging.titanic WHERE embarked = $1 ORDER BY passenger_id`,
    [port.toUpperCase()]
  );
}
```

### 2. Add a CLI command in `index.ts`

```typescript
titanic
  .command('by-port <port>')
  .description('List passengers by embarkation port (C, Q, or S)')
  .action(async (port: string) => {
    const rows = await getTitanicByEmbarked(port);
    if (rows.length === 0) {
      console.log(`No passengers found for port: ${port}`);
      return;
    }
    console.log(`\n${rows.length} passengers from port ${port}\n`);
    for (const r of rows) {
      console.log(`  [${r.passenger_id}] ${r.name}`);
    }
  });
```

### 3. Test it

```bash
npx ts-node src/index.ts titanic by-port S
```

---

## Building for production

The `dev` workflow uses `ts-node` which compiles TypeScript on the fly. For production, compile to JavaScript first:

```bash
npm run build      # runs tsc → outputs to dist/
npm start          # runs node dist/index.js
```

The compiled output in `dist/` runs faster and doesn't require TypeScript to be installed in the runtime environment.

---

## Local vs Docker

The app reads its DB connection from environment variables. The host changes depending on where you run it:

| Where you run the app | `POSTGRES_HOST` |
|---|---|
| Terminal on your Mac (outside Docker) | `localhost` |
| Inside a Docker container | `postgres` (the service name) |

In your `.env` file:
```bash
POSTGRES_HOST=postgres    # used by Docker services
# DB_HOST=localhost       # uncomment and use this for local runs
```

When running locally with `npx ts-node`, the app reads `POSTGRES_HOST=postgres` and tries to connect to a hostname called `postgres` — which doesn't exist on your Mac. To fix this, either:

```bash
# Option A: Temporarily override in your shell
POSTGRES_HOST=localhost npx ts-node src/index.ts ping

# Option B: Edit .env and uncomment DB_HOST=localhost
```

The `client.ts` file checks both variable names:
```typescript
host: process.env.POSTGRES_HOST ?? process.env.DB_HOST ?? 'localhost',
```
