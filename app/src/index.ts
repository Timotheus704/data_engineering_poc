#!/usr/bin/env ts-node
import { Command } from 'commander';
import { closePool } from './db/client';
import { getTitanicPassengers, getTitanicSurvivorySummary, getTitanicCount } from './queries/titanic';
import { getNycTaxiTrips, getNycTaxiHourly, getNycTaxiCount } from './queries/nyc_taxi';
import { listTables, pingDatabase, runRawQuery } from './queries/utils';

const program = new Command();

program
  .name('poc-app')
  .description('CLI to interact with the PoC Postgres database')
  .version('1.0.0');

// ── ping ────────────────────────────────────────────────────────────────────
program
  .command('ping')
  .description('Check database connectivity')
  .action(async () => {
    const version = await pingDatabase();
    console.log('✅ Connected to:', version);
  });

// ── tables ──────────────────────────────────────────────────────────────────
program
  .command('tables')
  .description('List all tables in staging and analytics schemas')
  .action(async () => {
    const tables = await listTables();
    if (tables.length === 0) {
      console.log('No tables found. Run migrations first.');
      return;
    }
    console.log('\nSchema          Table                     Rows');
    console.log('─'.repeat(55));
    for (const t of tables) {
      console.log(
        `${t.schema_name.padEnd(16)}${t.table_name.padEnd(26)}${t.row_count}`
      );
    }
  });

// ── titanic ──────────────────────────────────────────────────────────────────
const titanic = program.command('titanic').description('Titanic dataset commands');

titanic
  .command('list')
  .description('List passengers')
  .option('-l, --limit <n>', 'number of rows', '10')
  .option('-o, --offset <n>', 'offset', '0')
  .action(async (opts) => {
    const rows = await getTitanicPassengers(parseInt(opts.limit), parseInt(opts.offset));
    const total = await getTitanicCount();
    console.log(`\nTitanic passengers (${total} total)\n`);
    for (const r of rows) {
      const survived = r.survived ? '✅' : '❌';
      console.log(`  ${survived} [${r.passenger_id}] ${r.name} — Class ${r.pclass}, Age ${r.age ?? 'N/A'}`);
    }
  });

titanic
  .command('summary')
  .description('Survival rate by class and sex')
  .action(async () => {
    const rows = await getTitanicSurvivorySummary();
    console.log('\nSurvival summary\n');
    console.log('Class  Sex       Total  Survived  Rate     Avg Age  Avg Fare');
    console.log('─'.repeat(65));
    for (const r of rows) {
      console.log(
        `${String(r.pclass).padEnd(7)}${r.sex.padEnd(10)}${String(r.total_passengers).padEnd(7)}` +
        `${String(r.survivors).padEnd(10)}${String(r.survival_rate_pct).padEnd(9)}` +
        `${String(r.avg_age).padEnd(9)}$${r.avg_fare}`
      );
    }
  });

// ── nyc-taxi ─────────────────────────────────────────────────────────────────
const taxi = program.command('taxi').description('NYC Taxi dataset commands');

taxi
  .command('list')
  .description('List recent taxi trips')
  .option('-l, --limit <n>', 'number of rows', '10')
  .option('--min-fare <n>', 'minimum fare filter', '0')
  .action(async (opts) => {
    const rows = await getNycTaxiTrips(parseInt(opts.limit), parseFloat(opts.minFare));
    const total = await getNycTaxiCount();
    console.log(`\nNYC Taxi trips (${total} total)\n`);
    for (const r of rows) {
      const dt = r.pickup_datetime ? new Date(r.pickup_datetime).toISOString().slice(0, 16) : 'N/A';
      console.log(`  ${dt}  ${r.passenger_count} pax  ${r.trip_distance}mi  $${r.total_amount}`);
    }
  });

taxi
  .command('hourly')
  .description('Hourly trip aggregations from analytics view')
  .action(async () => {
    const rows = await getNycTaxiHourly();
    console.log('\nNYC Taxi — hourly summary\n');
    console.log('Hour                 Trips   Avg Dist  Avg Fare  Avg Tip');
    console.log('─'.repeat(60));
    for (const r of rows) {
      const hour = new Date(r.hour).toISOString().slice(0, 13);
      console.log(
        `${hour.padEnd(21)}${String(r.total_trips).padEnd(8)}` +
        `${String(r.avg_distance_miles).padEnd(10)}$${String(r.avg_fare_usd).padEnd(10)}$${r.avg_tip_usd}`
      );
    }
  });

// ── query ────────────────────────────────────────────────────────────────────
program
  .command('query <sql>')
  .description('Run a raw SELECT query against the database')
  .action(async (sql: string) => {
    const rows = await runRawQuery(sql);
    if (rows.length === 0) {
      console.log('No rows returned.');
      return;
    }
    console.log(`\n${rows.length} row(s)\n`);
    console.table(rows);
  });

// ── seed ─────────────────────────────────────────────────────────────────────
program
  .command('seed')
  .description('Load the sample seed data from db/seeds/')
  .action(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { query: runQuery } = await import('./db/client');
    const seedDir = path.resolve(__dirname, '../../db/seeds');
    if (!fs.existsSync(seedDir)) {
      console.error(`Seed directory not found: ${seedDir}`);
      process.exit(1);
    }
    const files = fs.readdirSync(seedDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(seedDir, file), 'utf8');
      console.log(`Running seed: ${file}`);
      await runQuery(sql);
    }
    console.log('✅ Seed complete.');
  });

// ── run ───────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await program.parseAsync(process.argv);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error:', msg);
    process.exit(1);
  } finally {
    await closePool();
  }
})();
