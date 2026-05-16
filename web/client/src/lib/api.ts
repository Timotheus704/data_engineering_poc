const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TitanicRow {
  id: number; passenger_id: number | null; survived: number; pclass: number;
  name: string; sex: string; age: number | null; sib_sp: number; parch: number;
  ticket: string; fare: number; cabin: string | null; embarked: string | null; loaded_at: string;
}
export interface TaxiRow {
  id: number; vendor_id: number | null; pickup_datetime: string | null;
  dropoff_datetime: string | null; passenger_count: number | null;
  trip_distance: number | null; fare_amount: number | null;
  tip_amount: number | null; total_amount: number | null; payment_type: number | null; loaded_at: string;
}
export interface TableInfo { schema_name: string; table_name: string; row_count: number; total_size: string; }
export interface DbInfo { pg_version: string; db_size: string; schemas: string[]; }
export interface PagedResponse<T> { data: T[]; total: number; limit: number; offset: number; }

// ── Titanic ───────────────────────────────────────────────────────────────────

export const titanicApi = {
  list: (params: Record<string, unknown> = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<PagedResponse<TitanicRow>>(`/titanic${qs ? '?' + qs : ''}`);
  },
  get:    (id: number) => request<{ data: TitanicRow }>(`/titanic/${id}`),
  stats:  ()           => request<{ totals: Record<string, string>; by_class: Record<string, string>[] }>('/titanic/stats'),
  summary: ()          => request<{ data: Record<string, unknown>[] }>('/titanic/summary'),
  create: (body: Partial<TitanicRow>) =>
    request<{ data: TitanicRow }>('/titanic', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<TitanicRow>) =>
    request<{ data: TitanicRow }>(`/titanic/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: number) =>
    request<{ message: string }>(`/titanic/${id}`, { method: 'DELETE' }),
};

// ── NYC Taxi ──────────────────────────────────────────────────────────────────

export const taxiApi = {
  list: (params: Record<string, unknown> = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<PagedResponse<TaxiRow>>(`/taxi${qs ? '?' + qs : ''}`);
  },
  get:    (id: number) => request<{ data: TaxiRow }>(`/taxi/${id}`),
  stats:  ()           => request<{ data: Record<string, string> }>('/taxi/stats'),
  hourly: ()           => request<{ data: Record<string, unknown>[] }>('/taxi/hourly'),
  create: (body: Partial<TaxiRow>) =>
    request<{ data: TaxiRow }>('/taxi', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<TaxiRow>) =>
    request<{ data: TaxiRow }>(`/taxi/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: number) =>
    request<{ message: string }>(`/taxi/${id}`, { method: 'DELETE' }),
};

// ── Admin ─────────────────────────────────────────────────────────────────────

export const adminApi = {
  tables:  () => request<{ data: TableInfo[] }>('/admin/tables'),
  dbInfo:  () => request<DbInfo>('/admin/db-info'),
  columns: (schema: string, table: string) =>
    request<{ data: Record<string, string>[] }>(`/admin/tables/${schema}/${table}/columns`),
  runQuery: (sql: string) =>
    request<{ data: Record<string, unknown>[]; row_count: number }>('/admin/query', {
      method: 'POST', body: JSON.stringify({ sql }),
    }),
};
