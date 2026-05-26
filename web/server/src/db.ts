import { Pool, PoolClient, QueryResultRow } from 'pg';
import * as dotenv from 'dotenv';
import { validateReadOnlySql } from '@data-engineering-poc/read-only-sql';

dotenv.config();

export const pool = new Pool({
  host:     process.env.POSTGRES_HOST     ?? 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT ?? '5432'),
  user:     process.env.POSTGRES_USER     ?? 'poc_user',
  password: process.env.POSTGRES_PASSWORD ?? 'poc_password',
  database: process.env.POSTGRES_DB       ?? 'poc_db',
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const readOnlyPool = new Pool({
  host:     process.env.POSTGRES_HOST     ?? 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT ?? '5432'),
  user:     process.env.POSTGRES_READONLY_USER     ?? process.env.POSTGRES_USER     ?? 'poc_user',
  password: process.env.POSTGRES_READONLY_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? 'poc_password',
  database: process.env.POSTGRES_DB       ?? 'poc_db',
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

readOnlyPool.on('error', (err) => {
  console.error('[db] Unexpected read-only pool error:', err.message);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const { rows } = await pool.query<T>(sql, params);
  return rows;
}

export async function runReadOnlyQuery(
  sql: string
): Promise<Record<string, unknown>[]> {
  const validated = validateReadOnlySql(sql);
  const client = await readOnlyPool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '5s'");
    const { rows } = await client.query(validated.sql);
    await client.query('COMMIT');
    return rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
