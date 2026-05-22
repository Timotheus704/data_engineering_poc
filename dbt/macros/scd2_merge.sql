{% macro scd2_merge(
    target_table,
    source_relation,
    natural_key,
    attribute_columns,
    effective_from='NOW()'
) %}
/*
  SCD2 Merge Macro
  ================
  Implements Type 2 Slowly Changing Dimension logic.

  Arguments:
    target_table     - The target dimension table (schema.table)
    source_relation  - The source dbt model or relation
    natural_key      - The column that identifies the real-world entity
    attribute_columns - List of columns to track for changes
    effective_from   - Timestamp to use for valid_from (default: NOW())

  Logic:
    1. Hash all attribute columns to detect changes efficiently
    2. For changed records: expire old row, insert new row
    3. For new records: insert new row
    4. For unchanged records: do nothing
*/

  WITH source AS (
    SELECT
      {{ natural_key }},
      {% for col in attribute_columns %}
      {{ col }},
      {% endfor %}
      MD5(CONCAT_WS('|',
        {% for col in attribute_columns %}
        COALESCE(CAST({{ col }} AS TEXT), 'NULL')
        {%- if not loop.last %},{% endif %}
        {% endfor %}
      )) AS record_hash
    FROM {{ source_relation }}
  ),

  -- Find records that have changed (existing natural key, different hash)
  changed AS (
    SELECT s.{{ natural_key }}
    FROM source s
    JOIN {{ target_table }} t
      ON t.{{ natural_key }} = s.{{ natural_key }}
      AND t.is_current = TRUE
    WHERE t.record_hash != s.record_hash
  )

  -- Step 1: Expire changed records
  UPDATE {{ target_table }}
  SET
    is_current = FALSE,
    valid_to = {{ effective_from }},
    updated_at = NOW()
  WHERE {{ natural_key }} IN (SELECT {{ natural_key }} FROM changed)
    AND is_current = TRUE;

  -- Step 2: Insert new rows for changed and new records
  INSERT INTO {{ target_table }} (
    {{ natural_key }},
    {% for col in attribute_columns %}
    {{ col }},
    {% endfor %}
    record_hash,
    valid_from,
    is_current
  )
  SELECT
    s.{{ natural_key }},
    {% for col in attribute_columns %}
    s.{{ col }},
    {% endfor %}
    s.record_hash,
    {{ effective_from }},
    TRUE
  FROM source s
  WHERE
    -- New records (no existing row)
    NOT EXISTS (
      SELECT 1 FROM {{ target_table }} t
      WHERE t.{{ natural_key }} = s.{{ natural_key }}
    )
    OR
    -- Changed records (just expired above, so no is_current=TRUE row)
    NOT EXISTS (
      SELECT 1 FROM {{ target_table }} t
      WHERE t.{{ natural_key }} = s.{{ natural_key }}
        AND t.is_current = TRUE
    );

{% endmacro %}