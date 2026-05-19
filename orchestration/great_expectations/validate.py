"""Run a Great Expectations suite against a Postgres staging table."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import great_expectations as gx
from great_expectations.core.batch import RuntimeBatchRequest


SUITES = {
    "titanic_staging": "SELECT * FROM staging.titanic",
    "nyc_taxi_staging": "SELECT * FROM staging.nyc_taxi",
}


def postgres_connection_string() -> str:
    host = os.getenv("POSTGRES_HOST", "postgres")
    port = os.getenv("POSTGRES_PORT", "5432")
    user = os.getenv("POSTGRES_USER", "poc_user")
    password = os.getenv("POSTGRES_PASSWORD", "poc_password")
    db = os.getenv("POSTGRES_DB", "poc_db")
    return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db}"


def validate_suite(suite_name: str) -> bool:
    if suite_name not in SUITES:
        known = ", ".join(sorted(SUITES))
        raise ValueError(f"Unknown suite '{suite_name}'. Expected one of: {known}")

    os.environ["POSTGRES_CONNECTION_STRING"] = postgres_connection_string()
    context_root = Path(__file__).parent
    context = gx.get_context(context_root_dir=str(context_root))

    batch_request = RuntimeBatchRequest(
        datasource_name="poc_postgres",
        data_connector_name="default_runtime_data_connector_name",
        data_asset_name=suite_name,
        runtime_parameters={"query": SUITES[suite_name]},
        batch_identifiers={"default_identifier_name": suite_name},
    )

    validator = context.get_validator(
        batch_request=batch_request,
        expectation_suite_name=suite_name,
    )
    result = validator.validate()
    context.build_data_docs()

    success = bool(result.success)
    print(f"[great_expectations] suite={suite_name} success={success}")
    return success


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python orchestration/great_expectations/validate.py <suite_name>")
        sys.exit(2)

    sys.exit(0 if validate_suite(sys.argv[1]) else 1)
