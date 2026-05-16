import { Pool, PoolClient, QueryResultRow } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host:     process.env.POSTGRES_HOST     ?? process.env.DB_HOST ?? 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT ?? process.env.DB_PORT ?? '5432'),
  user:     process.env.POSTGRES_USER     ?? 'poc_user',
  password: process.env.POSTGRES_PASSWORD ?? 'poc_password',
  database: process.env.POSTGRES_DB       ?? 'poc_db',
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err.message);
});

/** Run a query and return all rows. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const { rows } = await pool.query<T>(sql, params);
  return rows;
}

/** Run multiple statements in a single transaction. */
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

/** Gracefully shut down the pool. */
export async function closePool(): Promise<void> {
  await pool.end();
}

export default pool;
