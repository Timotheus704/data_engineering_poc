SELECT
  id,
  passenger_id,
  survived,
  pclass,
  name,
  sex,
  age,
  sib_sp,
  parch,
  ticket,
  fare,
  cabin,
  embarked,
  loaded_at
FROM {{ source('staging', 'titanic') }}
