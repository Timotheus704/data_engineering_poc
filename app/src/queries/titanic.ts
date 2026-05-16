import { query } from '../db/client';
import type { TitanicRow, TitanicSurvivorySummary } from '../db/types';

/** Fetch paginated rows from staging.titanic */
export async function getTitanicPassengers(
  limit = 20,
  offset = 0
): Promise<TitanicRow[]> {
  return query<TitanicRow>(
    `SELECT * FROM staging.titanic ORDER BY passenger_id LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
}

/** Fetch a single passenger by their Titanic passenger_id */
export async function getTitanicPassengerById(
  passengerId: number
): Promise<TitanicRow | null> {
  const rows = await query<TitanicRow>(
    `SELECT * FROM staging.titanic WHERE passenger_id = $1`,
    [passengerId]
  );
  return rows[0] ?? null;
}

/** Survival rate breakdown from the analytics view */
export async function getTitanicSurvivorySummary(): Promise<TitanicSurvivorySummary[]> {
  return query<TitanicSurvivorySummary>(
    `SELECT * FROM analytics.titanic_survival_summary`
  );
}

/** Count total rows in staging.titanic */
export async function getTitanicCount(): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM staging.titanic`
  );
  return parseInt(rows[0].count, 10);
}
