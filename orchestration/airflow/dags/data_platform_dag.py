"""Production-shaped DAG for the PoC data platform.

The DAG intentionally uses the existing ingestion scripts so local script runs
and scheduled Airflow runs exercise the same loading code.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any

import psycopg2
from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.utils.context import Context


REPO_DIR = "/opt/airflow/repo"
PIPELINES_DIR = f"{REPO_DIR}/pipelines"
DBT_DIR = f"{REPO_DIR}/dbt"
GX_VALIDATE = f"{REPO_DIR}/orchestration/great_expectations/validate.py"


def _postgres_dsn() -> str:
    host = os.getenv("POSTGRES_HOST", "postgres")
    port = os.getenv("POSTGRES_PORT", "5432")
    user = os.getenv("POSTGRES_USER", "poc_user")
    password = os.getenv("POSTGRES_PASSWORD", "poc_password")
    db = os.getenv("POSTGRES_DB", "poc_db")
    return f"host={host} port={port} user={user} password={password} dbname={db}"


def _task_key(context: Context) -> tuple[str, str, str]:
    task_instance = context["task_instance"]
    return (
        task_instance.dag_id,
        task_instance.task_id,
        context["run_id"],
    )


def mark_task_running(context: Context) -> None:
    dag_id, task_id, run_id = _task_key(context)
    with psycopg2.connect(_postgres_dsn()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO orchestration.pipeline_runs
                  (dag_id, task_id, run_id, status, started_at, updated_at)
                VALUES (%s, %s, %s, 'running', NOW(), NOW())
                ON CONFLICT (dag_id, task_id, run_id)
                DO UPDATE SET
                  status = 'running',
                  started_at = COALESCE(orchestration.pipeline_runs.started_at, NOW()),
                  ended_at = NULL,
                  duration_seconds = NULL,
                  error_message = NULL,
                  updated_at = NOW()
                """,
                (dag_id, task_id, run_id),
            )


def mark_task_finished(context: Context, status: str, error: str | None = None) -> None:
    dag_id, task_id, run_id = _task_key(context)
    with psycopg2.connect(_postgres_dsn()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE orchestration.pipeline_runs
                SET
                  status = %s,
                  ended_at = NOW(),
                  duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at)),
                  error_message = %s,
                  updated_at = NOW()
                WHERE dag_id = %s AND task_id = %s AND run_id = %s
                """,
                (status, error, dag_id, task_id, run_id),
            )


def mark_task_success(context: Context) -> None:
    mark_task_finished(context, "success")


def mark_task_failure(context: Context) -> None:
    exception = context.get("exception")
    mark_task_finished(context, "failed", str(exception) if exception else "Task failed")


def report_sla_miss(*args: Any, **kwargs: Any) -> None:
    print(f"[airflow] SLA miss detected: args={args}, kwargs={kwargs}")


default_args = {
    "owner": "data-engineering-poc",
    "depends_on_past": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=2),
    "sla": timedelta(minutes=30),
    "on_execute_callback": mark_task_running,
    "on_success_callback": mark_task_success,
    "on_failure_callback": mark_task_failure,
}


with DAG(
    dag_id="data_platform_batch",
    description="Ingest Kaggle datasets, validate staging data, and build dbt analytics models.",
    default_args=default_args,
    start_date=datetime(2024, 1, 1),
    schedule_interval="@daily",
    catchup=True,
    max_active_runs=1,
    tags=["poc", "batch", "dbt", "great-expectations"],
    sla_miss_callback=report_sla_miss,
) as dag:
    ingest_titanic = BashOperator(
        task_id="ingest_titanic",
        bash_command=f"cd {PIPELINES_DIR} && python titanic/ingest.py",
    )

    ingest_nyc_taxi = BashOperator(
        task_id="ingest_nyc_taxi",
        bash_command=f"cd {PIPELINES_DIR} && python nyc_taxi/ingest.py",
    )

    validate_titanic = BashOperator(
        task_id="validate_titanic",
        bash_command=f"cd {REPO_DIR} && python {GX_VALIDATE} titanic_staging",
    )

    validate_nyc_taxi = BashOperator(
        task_id="validate_nyc_taxi",
        bash_command=f"cd {REPO_DIR} && python {GX_VALIDATE} nyc_taxi_staging",
    )

    dbt_run = BashOperator(
        task_id="dbt_run",
        bash_command=f"cd {DBT_DIR} && dbt run --profiles-dir .",
    )

    dbt_test = BashOperator(
        task_id="dbt_test",
        bash_command=f"cd {DBT_DIR} && dbt test --profiles-dir .",
    )

    [ingest_titanic >> validate_titanic, ingest_nyc_taxi >> validate_nyc_taxi] >> dbt_run >> dbt_test
