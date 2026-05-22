"""Unit tests for pipeline watermark helpers.

These tests avoid a real database by mocking the SQLAlchemy Engine/Connection
context manager used by metadata.py.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

from sqlalchemy import Engine

import metadata


def _mock_engine_with_connection():
    """Return (engine, conn) mocks wired for `with engine.begin() as conn:`."""
    engine = MagicMock(spec=Engine)
    conn = MagicMock()

    begin_cm = engine.begin.return_value
    begin_cm.__enter__.return_value = conn
    begin_cm.__exit__.return_value = False

    return engine, conn


def test_watermark_roundtrip_calls_expected_sql_and_params():
    engine, conn = _mock_engine_with_connection()

    # --- get_watermark ---
    expected_dt = datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)

    result_proxy = MagicMock()
    result_proxy.scalar_one_or_none.return_value = expected_dt
    conn.execute.return_value = result_proxy

    got = metadata.get_watermark(engine, dataset_name="nyc_taxi_trips")

    assert got == expected_dt
    engine.begin.assert_called()  # context manager used

    # Assert the query shape and bound parameter
    (sql_obj, params), _kwargs = conn.execute.call_args

    sql_text = getattr(sql_obj, "text", str(sql_obj))
    assert "SELECT watermark_value" in sql_text
    assert "FROM orchestration.pipeline_watermarks" in sql_text
    assert params == {"dataset_name": "nyc_taxi_trips"}

    # --- update_watermark ---
    conn.execute.reset_mock()

    new_dt = datetime(2024, 2, 3, 4, 5, 6, tzinfo=timezone.utc)
    metadata.update_watermark(
        engine,
        dataset_name="nyc_taxi_trips",
        watermark_value=new_dt,
        rows_loaded=123,
        run_id="run-abc",
    )

    (sql_obj2, params2), _kwargs2 = conn.execute.call_args
    sql_text2 = getattr(sql_obj2, "text", str(sql_obj2))

    assert "UPDATE orchestration.pipeline_watermarks" in sql_text2
    assert "SET" in sql_text2
    assert "watermark_value" in sql_text2
    assert "last_successful_run" in sql_text2
    assert "last_rows_loaded" in sql_text2
    assert "updated_at = NOW()" in sql_text2
    assert "WHERE dataset_name" in sql_text2

    assert params2["dataset_name"] == "nyc_taxi_trips"
    assert params2["watermark_value"] == new_dt
    assert params2["rows_loaded"] == 123
    assert params2["run_id"] == "run-abc"
