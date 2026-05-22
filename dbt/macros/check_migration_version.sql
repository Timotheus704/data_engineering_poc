{% macro check_migration_version() %}
  {#
    Validates that migration 005 has been applied by checking
    for the source_row_hash column on staging.nyc_taxi.
    Run this before dbt run if you suspect migration state.
  #}
  {% set column_exists_query %}
    SELECT COUNT(*) as cnt
    FROM information_schema.columns
    WHERE table_schema = 'staging'
      AND table_name = 'nyc_taxi'
      AND column_name = 'source_row_hash'
  {% endset %}
  {% set results = run_query(column_exists_query) %}
  {% if execute %}
    {% if results.columns[0].values()[0] == 0 %}
      {{ exceptions.raise_compiler_error(
        "Migration 005 has not been applied. Run db/migrations/005_create_pipeline_watermarks.sql first."
      ) }}
    {% endif %}
  {% endif %}
{% endmacro %}