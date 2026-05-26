# SCD Type 2 Pattern Reference

This document explains the Type 2 Slowly Changing Dimension (SCD2) 
pattern implemented in this repository as a design reference.

---

## Status

The SCD2 schema and merge macro in this repository are reference 
implementations. They demonstrate the pattern without being wired 
into an active pipeline. This is intentional: the schema lifecycle 
(migration 006) and the data lifecycle (pipeline population) are 
deliberately separated to show they are distinct concerns.

In a production system, the population step would be owned by either:
- A dbt snapshot model targeting `analytics.dim_titanic_scd2`
- A Python pipeline invoking the `scd2_merge` macro via a post-hook

---

## What SCD2 Solves

Simple overwrite (SCD Type 1) loses history. When a dimension record 
changes — a passenger's cabin assignment is corrected, a customer's 
address is updated, a product's category is reclassified — Type 1 
replaces the old value with the new one. The old value is gone.

SCD2 preserves history by adding rows instead of replacing them:

- When a record changes, the old row is expired (`is_current = FALSE`, 
  `valid_to = now()`)
- A new row is inserted with the updated values (`is_current = TRUE`, 
  `valid_from = now()`, `valid_to = NULL`)

This enables time-travel queries: "what did this record look like on 
a specific date?"

---

## Schema Design

The `analytics.dim_titanic_scd2` table (created in migration 006) 
implements the standard SCD2 columns:

| Column | Purpose |
|---|---|
| `surrogate_key` | Unique per row — a passenger can have multiple rows |
| `passenger_id` | Natural key — identifies the real-world entity |
| `valid_from` | When this version of the record became active |
| `valid_to` | When this version expired (NULL = currently active) |
| `is_current` | Boolean flag for fast current-record lookups |
| `record_hash` | Hash of all attributes for efficient change detection |

---

## Query Patterns

**Current records only:**
```sql
SELECT * FROM analytics.dim_titanic_current;
-- Equivalent to: WHERE is_current = TRUE
```

**Record as of a specific date:**
```sql
SELECT * FROM analytics.dim_titanic_scd2
WHERE passenger_id = 2
  AND valid_from <= '2024-01-15'::timestamptz
  AND (valid_to IS NULL OR valid_to > '2024-01-15'::timestamptz);
```

**Full version history for a record:**
```sql
SELECT * FROM analytics.dim_titanic_history
WHERE passenger_id = 2
ORDER BY version_number;
```

---

## The Merge Macro

`dbt/macros/scd2_merge.sql` implements the merge logic generically:

1. Hash all attribute columns to detect changes efficiently
2. For changed records: expire the old row, insert a new row
3. For new records: insert a new row
4. For unchanged records: do nothing

The macro is parameterized over `target_table`, `source_relation`, 
`natural_key`, and `attribute_columns` so it can be reused across 
any dimension that requires Type 2 history tracking.

---

## Production Considerations

At production scale, SCD2 has meaningful operational implications:

- **Storage growth is unbounded by default.** Every change adds a row. 
  Retention policies on historical versions are necessary at scale.
- **Query complexity increases.** Consumers must always filter on 
  `is_current` or a `valid_from`/`valid_to` range. Views like 
  `dim_titanic_current` encapsulate this complexity.
- **Late-arriving data requires special handling.** If a source sends 
  a correction for a record that has already been versioned, the merge 
  logic must decide whether to create a new version or correct the 
  existing one. This repository's macro creates a new version, which 
  is the safer default.

See [ADR 006](../decisions/006-scale-and-cost-considerations.md) for 
broader scale and cost reasoning that applies to dimension modeling.