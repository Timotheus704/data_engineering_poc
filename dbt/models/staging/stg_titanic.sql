-- stg_titanic.sql
-- Staging model for Titanic passenger data.
-- Applies type standardization, null normalization, and business logic
-- to produce a clean, reliable source for analytics models.

WITH source AS (
  -- Pull from the raw staging table loaded by the Python pipeline
  SELECT * FROM {{ source('staging', 'titanic') }}
),

renamed AS (
  SELECT
    id                                      AS passenger_key,
    passenger_id                            AS source_passenger_id,
    loaded_at,

    -- Survival flag: cast to boolean for clarity in downstream models
    CASE survived
      WHEN 1 THEN TRUE
      WHEN 0 THEN FALSE
      ELSE NULL
    END                                     AS did_survive,

    -- Passenger class: normalize to readable label
    CASE pclass
      WHEN 1 THEN 'First'
      WHEN 2 THEN 'Second'
      WHEN 3 THEN 'Third'
      ELSE NULL
    END                                     AS passenger_class_name,
    pclass                                  AS passenger_class_num,

    -- Name: trim whitespace that can sneak in from CSV parsing
    TRIM(name)                              AS full_name,

    -- Sex: normalize to lowercase
    LOWER(sex)                              AS sex,

    -- Age: keep as numeric; flag nulls explicitly in a separate column
    age                                     AS age_years,
    CASE WHEN age IS NULL THEN TRUE ELSE FALSE END AS is_age_unknown,

    sib_sp                                  AS siblings_spouses_count,
    parch                                   AS parents_children_count,

    -- Family size derived field — useful for survival analysis
    sib_sp + parch                          AS family_size,

    TRIM(ticket)                            AS ticket_number,

    -- Fare: stored as exact decimal; ensure non-negative
    GREATEST(fare, 0)                       AS fare_gbp,

    -- Cabin: normalize nulls and empty strings
    NULLIF(TRIM(cabin), '')                 AS cabin_number,

    -- Embarkation port: expand code to full name for readability
    CASE embarked
      WHEN 'C' THEN 'Cherbourg'
      WHEN 'Q' THEN 'Queenstown'
      WHEN 'S' THEN 'Southampton'
      ELSE 'Unknown'
    END                                     AS embarkation_port,
    embarked                                AS embarkation_code

  FROM source
)

SELECT * FROM renamed
