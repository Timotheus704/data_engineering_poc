/** Raw row from staging.titanic */
export interface TitanicRow {
  id: number;
  passenger_id: number;
  survived: number;
  pclass: number;
  name: string;
  sex: string;
  age: number | null;
  sib_sp: number;
  parch: number;
  ticket: string;
  fare: number;
  cabin: string | null;
  embarked: string | null;
  loaded_at: Date;
}

/** Row from analytics.titanic_survival_summary view */
export interface TitanicSurvivorySummary {
  pclass: number;
  sex: string;
  total_passengers: number;
  survivors: number;
  survival_rate_pct: number;
  avg_age: number;
  avg_fare: number;
}

/** Raw row from staging.nyc_taxi */
export interface NycTaxiRow {
  id: number;
  vendor_id: number;
  pickup_datetime: Date;
  dropoff_datetime: Date;
  passenger_count: number;
  trip_distance: number;
  fare_amount: number;
  tip_amount: number;
  total_amount: number;
  loaded_at: Date;
}

/** Row from analytics.nyc_taxi_hourly view */
export interface NycTaxiHourly {
  hour: Date;
  total_trips: number;
  avg_distance_miles: number;
  avg_fare_usd: number;
  avg_tip_usd: number;
  total_passengers: number;
}

/** Generic table info row */
export interface TableInfo {
  schema_name: string;
  table_name: string;
  row_count: number;
}
