import { query } from '../db/client';
import type { NycTaxiRow, NycTaxiHourly } from '../db/types';

/** Fetch recent taxi trips, optionally filtered by min fare */
export async function getNycTaxiTrips(
  limit = 20,
  minFare = 0
): Promise<NycTaxiRow[]> {
  return query<NycTaxiRow>(
    `SELECT * FROM staging.nyc_taxi
     WHERE fare_amount >= $1
     ORDER BY pickup_datetime DESC
     LIMIT $2`,
    [minFare, limit]
  );
}

/** Hourly aggregation from analytics view */
export async function getNycTaxiHourly(
  startDate?: string,
  endDate?: string
): Promise<NycTaxiHourly[]> {
  if (startDate && endDate) {
    return query<NycTaxiHourly>(
      `SELECT * FROM analytics.nyc_taxi_hourly
       WHERE hour BETWEEN $1 AND $2`,
      [startDate, endDate]
    );
  }
  return query<NycTaxiHourly>(
    `SELECT * FROM analytics.nyc_taxi_hourly LIMIT 24`
  );
}

/** Count total rows in staging.nyc_taxi */
export async function getNycTaxiCount(): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM staging.nyc_taxi`
  );
  return parseInt(rows[0].count, 10);
}
