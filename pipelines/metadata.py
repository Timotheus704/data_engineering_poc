"""Pipeline metadata helpers for orchestration state."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Engine, text


def get_watermark(engine: Engine, dataset_name: str) -> Optional[datetime]:
    """Return the last successful watermark for a dataset."""
    with engine.begin() as conn:
        value = conn.execute(
            text(
                """
                SELECT watermark_value
                FROM orchestration.pipeline_watermarks
                WHERE dataset_name = :dataset_name
                """
            ),
            {"dataset_name": dataset_name},
        ).scalar_one_or_none()
    return value


def update_watermark(
    engine: Engine,
    dataset_name: str,
    watermark_value: datetime,
    rows_loaded: int,
    run_id: str,
) -> None:
    """Persist a successful incremental load watermark."""
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE orchestration.pipeline_watermarks
                SET
                  watermark_value = :watermark_value,
                  last_successful_run = :run_id,
                  last_rows_loaded = :rows_loaded,
                  updated_at = NOW()
                WHERE dataset_name = :dataset_name
                """
            ),
            {
                "dataset_name": dataset_name,
                "watermark_value": watermark_value,
                "rows_loaded": rows_loaded,
                "run_id": run_id,
            },
        )
