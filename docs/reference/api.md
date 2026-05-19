# API Reference

Complete reference for all REST API endpoints. The API server runs at `http://localhost:3001`.

Interactive documentation (try endpoints in the browser) is available at `http://localhost:3001/docs` when the server is running.

---

## Base URL and conventions

All data endpoints are prefixed with `/api`. Responses are JSON.

**Request headers:**
```
Content-Type: application/json
```

**Response shape — collections:**
```json
{ "data": [...], "total": 891, "limit": 20, "offset": 0 }
```

**Response shape — single record:**
```json
{ "data": { "id": 1, ... } }
```

**Response shape — mutations:**
```json
{ "data": { ... }, "message": "Record deleted" }
```

**Error response:**
```json
{ "error": "Passenger not found" }
```

**HTTP status codes used:**
| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Created |
| 400 | Bad request (validation error, or non-SELECT query in SQL runner) |
| 404 | Record not found |
| 503 | Database unreachable (health endpoint only) |

---

## Health

### `GET /health`

Check database connectivity.

**Response:**
```json
{
  "status": "ok",
  "db": "connected",
  "pg_version": "16.3",
  "timestamp": "2025-01-15T10:32:00.000Z"
}
```

**Error (DB down):**
```json
{ "status": "error", "db": "disconnected" }
```

---

## Titanic endpoints

Base path: `/api/titanic`

### `GET /api/titanic`

List passengers with optional filtering and pagination.

**Query parameters:**
| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | 20 | Rows to return |
| `offset` | integer | 0 | Rows to skip |
| `pclass` | integer | — | Filter by passenger class (1, 2, or 3) |
| `survived` | integer | — | Filter by survival (0 or 1) |
| `sex` | string | — | Filter by sex (`male` or `female`) |

**Example:**
```bash
curl "http://localhost:3001/api/titanic?limit=5&pclass=1&survived=1"
```

**Response:**
```json
{
  "data": [
    {
      "id": 2, "passenger_id": 2, "survived": 1, "pclass": 1,
      "name": "Cumings, Mrs. John Bradley", "sex": "female",
      "age": 38, "sib_sp": 1, "parch": 0,
      "ticket": "PC 17599", "fare": 71.2833,
      "cabin": "C85", "embarked": "C",
      "loaded_at": "2025-01-15T10:00:00.000Z"
    }
  ],
  "total": 216,
  "limit": 5,
  "offset": 0
}
```

---

### `GET /api/titanic/stats`

Aggregate statistics across the whole dataset.

**Response:**
```json
{
  "totals": {
    "total": "891",
    "survivors": "342",
    "survival_rate": "38.4"
  },
  "by_class": [
    { "pclass": 1, "total": "216", "survivors": "136" },
    { "pclass": 2, "total": "184", "survivors": "87"  },
    { "pclass": 3, "total": "491", "survivors": "119" }
  ]
}
```

---

### `GET /api/titanic/summary`

Survival breakdown by class and sex from the `analytics.titanic_survival_summary` view.

**Response:**
```json
{
  "data": [
    {
      "pclass": 1, "sex": "female",
      "total_passengers": 85, "survivors": 80,
      "survival_rate_pct": 94.12,
      "avg_age": 34.6, "avg_fare": 106.13
    }
  ]
}
```

---

### `GET /api/titanic/:id`

Get a single passenger by internal database ID.

**Response:** `{ "data": { <TitanicRow> } }` or `404`.

---

### `POST /api/titanic`

Create a new passenger record.

**Required body fields:** `survived`, `pclass`, `name`, `sex`

**Body:**
```json
{
  "survived": 1,
  "pclass": 1,
  "name": "Smith, Mr. John",
  "sex": "male",
  "age": 35,
  "sib_sp": 0,
  "parch": 0,
  "ticket": "A12345",
  "fare": 52.0,
  "cabin": "C101",
  "embarked": "S"
}
```

**Response:** `201` with `{ "data": { <created row> } }`

---

### `PATCH /api/titanic/:id`

Partially update a passenger. Only include fields you want to change.

**Body (any subset of fields):**
```json
{ "survived": 0, "cabin": null }
```

**Response:** `{ "data": { <updated row> } }` or `404`.

---

### `DELETE /api/titanic/:id`

Delete a passenger by ID.

**Response:** `{ "data": { <deleted row> }, "message": "Passenger deleted" }` or `404`.

---

## NYC Taxi endpoints

Base path: `/api/taxi`

### `GET /api/taxi`

List trips with optional filtering and pagination.

**Query parameters:**
| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | 20 | Rows to return |
| `offset` | integer | 0 | Rows to skip |
| `min_fare` | number | — | Minimum fare amount (USD) |
| `max_fare` | number | — | Maximum fare amount (USD) |
| `min_passengers` | integer | — | Minimum passenger count |

**Example:**
```bash
curl "http://localhost:3001/api/taxi?limit=10&min_fare=20&max_fare=50"
```

---

### `GET /api/taxi/stats`

Aggregate statistics across the whole dataset.

**Response:**
```json
{
  "data": {
    "total_trips": "48921",
    "avg_distance": "2.85",
    "avg_fare": "11.36",
    "avg_tip": "1.34",
    "total_revenue": "555823.40",
    "total_passengers": "67429"
  }
}
```

---

### `GET /api/taxi/hourly`

Hourly aggregations from `analytics.nyc_taxi_hourly`. Returns up to 48 hours.

**Response:**
```json
{
  "data": [
    {
      "hour": "2015-01-15T09:00:00.000Z",
      "total_trips": 142,
      "avg_distance_miles": 2.31,
      "avg_fare_usd": 11.20,
      "avg_tip_usd": 1.45,
      "total_passengers": 189
    }
  ]
}
```

---

### `GET /api/taxi/:id`

Get a single trip by ID.

### `POST /api/taxi`

Create a new trip record.

**Body fields:** `vendor_id`, `pickup_datetime`, `dropoff_datetime`, `passenger_count`, `trip_distance`, `fare_amount`, `tip_amount`, `tolls_amount`, `mta_tax`, `extra`, `total_amount`, `payment_type`, `rate_code_id`, `store_and_fwd_flag`, `pickup_longitude`, `pickup_latitude`, `dropoff_longitude`, `dropoff_latitude`

All fields are optional (nullable columns).

### `PATCH /api/taxi/:id`

Partially update a trip. Include only fields to change.

### `DELETE /api/taxi/:id`

Delete a trip by ID.

---

## Admin endpoints

Base path: `/api/admin`

### `GET /api/admin/tables`

List all tables and views in the `staging` and `analytics` schemas with row counts and sizes.

**Response:**
```json
{
  "data": [
    {
      "schema_name": "analytics",
      "table_name": "nyc_taxi_hourly",
      "row_count": 0,
      "total_size": "0 bytes"
    },
    {
      "schema_name": "staging",
      "table_name": "nyc_taxi",
      "row_count": 48921,
      "total_size": "9672 kB"
    },
    {
      "schema_name": "staging",
      "table_name": "titanic",
      "row_count": 891,
      "total_size": "96 kB"
    }
  ]
}
```

---

### `GET /api/admin/tables/:schema/:table/columns`

Get column metadata for a specific table.

**Parameters:** `:schema` must be `staging` or `analytics`; `:table` is the table name.

**Example:**
```bash
curl "http://localhost:3001/api/admin/tables/staging/titanic/columns"
```

**Response:**
```json
{
  "data": [
    { "column_name": "id",           "data_type": "integer",          "is_nullable": "NO",  "column_default": "nextval(...)" },
    { "column_name": "passenger_id", "data_type": "integer",          "is_nullable": "YES", "column_default": null },
    { "column_name": "survived",     "data_type": "smallint",         "is_nullable": "YES", "column_default": null },
    { "column_name": "name",         "data_type": "text",             "is_nullable": "YES", "column_default": null },
    { "column_name": "loaded_at",    "data_type": "timestamp with time zone", "is_nullable": "YES", "column_default": "now()" }
  ]
}
```

---

### `GET /api/admin/db-info`

Get database server information.

**Response:**
```json
{
  "pg_version": "16.3",
  "db_size": "9856 kB",
  "schemas": ["analytics", "public", "staging"]
}
```

---

### `POST /api/admin/query`

Execute a read-only SQL query and return results.

**Restriction:** Only `SELECT` and `WITH` (CTE) statements are accepted. Any other statement returns a `400` error.

**Body:**
```json
{ "sql": "SELECT pclass, COUNT(*) FROM staging.titanic GROUP BY pclass ORDER BY pclass" }
```

**Response:**
```json
{
  "data": [
    { "pclass": 1, "count": "216" },
    { "pclass": 2, "count": "184" },
    { "pclass": 3, "count": "491" }
  ],
  "row_count": 3
}
```

**Error (non-SELECT statement):**
```json
{ "error": "Only SELECT and WITH (CTE) statements are permitted" }
```

**Error (SQL syntax error):**
```json
{ "error": "syntax error at or near \"SELEKT\"" }
```

---

## Testing the API with curl

```bash
# Health check
curl http://localhost:3001/health

# List first 5 titanic passengers
curl "http://localhost:3001/api/titanic?limit=5"

# Get survivor stats
curl http://localhost:3001/api/titanic/stats

# Create a passenger
curl -X POST http://localhost:3001/api/titanic \
  -H "Content-Type: application/json" \
  -d '{"survived":1,"pclass":1,"name":"Test, Mr. User","sex":"male","age":30}'

# Update a passenger (replace 123 with a real id)
curl -X PATCH http://localhost:3001/api/titanic/123 \
  -H "Content-Type: application/json" \
  -d '{"survived":0}'

# Delete a passenger
curl -X DELETE http://localhost:3001/api/titanic/123

# Run a SQL query
curl -X POST http://localhost:3001/api/admin/query \
  -H "Content-Type: application/json" \
  -d '{"sql":"SELECT COUNT(*) FROM staging.titanic WHERE survived = 1"}'
```
