import { query } from '../db/client';
import type { TableInfo } from '../db/types';

/** List all tables in staging and analytics schemas with row counts */
export async function listTables(): Promise<TableInfo[]> {
  return query<TableInfo>(`
    SELECT
      n.nspname                                   AS schema_name,
      c.relname                                   AS table_name,
      COALESCE(p.n_live_tup, 0)::bigint          AS row_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables p
      ON p.schemaname = n.nspname AND p.relname = c.relname
    WHERE n.nspname IN ('staging', 'analytics')
      AND c.relkind = 'r'
    ORDER BY n.nspname, c.relname
  `);
}

/** Check DB connectivity and return server version */
export async function pingDatabase(): Promise<string> {
  const rows = await query<{ version: string }>('SELECT version()');
  return rows[0].version;
}

/** Run an arbitrary read-only SQL statement (SELECT only) */
export async function runRawQuery(sql: string): Promise<Record<string, unknown>[]> {
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
    throw new Error('runRawQuery only accepts SELECT or WITH (CTE) statements for safety.');
  }
  return query(sql);
}
