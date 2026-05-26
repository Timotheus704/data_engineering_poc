-- 007_create_readonly_role.sql
-- Dedicated role for ad hoc inspection surfaces.
-- Local password is intentionally non-secret and must be overridden outside dev/CI.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'poc_readonly') THEN
    CREATE ROLE poc_readonly LOGIN PASSWORD 'poc_readonly_password';
  END IF;
END
$$;

ALTER ROLE poc_readonly SET default_transaction_read_only = on;
ALTER ROLE poc_readonly SET statement_timeout = '5s';
ALTER ROLE poc_readonly SET idle_in_transaction_session_timeout = '5s';

GRANT CONNECT ON DATABASE poc_db TO poc_readonly;
GRANT USAGE ON SCHEMA staging, analytics TO poc_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA staging, analytics TO poc_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA staging
  GRANT SELECT ON TABLES TO poc_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA analytics
  GRANT SELECT ON TABLES TO poc_readonly;
