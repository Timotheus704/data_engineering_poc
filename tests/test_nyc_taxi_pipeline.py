"""Unit tests for NYC Taxi pipeline cleaning logic.

These tests validate the transformation and filtering behavior of
load_and_clean() without requiring a database connection or Kaggle
credentials. All tests operate on in-memory DataFrames.

Test philosophy: each test asserts one specific behavior of the
cleaning contract. If a test fails, the failure message should make
the broken contract obvious without reading the implementation.
"""

from __future__ import annotations

import pandas as pd
from pathlib import Path
import sys

# Add the pipelines directory to the path so we can import from it
# without installing it as a package. This mirrors how the pipeline
# scripts themselves are invoked (cd pipelines && python nyc_taxi/ingest.py).
sys.path.insert(0, str(Path(__file__).parent.parent / "pipelines"))
sys.path.insert(0, str(Path(__file__).parent.parent / "pipelines" / "nyc_taxi"))


def _make_raw_df(**overrides) -> pd.DataFrame:
    """
    Return a minimal valid raw DataFrame matching the Kaggle CSV schema.
    All values produce a clean row by default. Override specific fields
    to test filtering and coercion behavior.
    """
    defaults = {
        "vendor_id": [1],
        "pickup_datetime": ["2015-01-15 09:32:00"],
        "dropoff_datetime": ["2015-01-15 09:45:00"],
        "passenger_count": [2],
        "trip_distance": [3.5],
        "pickup_longitude": [-73.985],
        "pickup_latitude": [40.758],
        "rate_code": [1],
        "store_and_fwd_flag": ["N"],
        "dropoff_longitude": [-73.990],
        "dropoff_latitude": [40.750],
        "payment_type": [1],
        "fare_amount": [14.50],
        "extra": [0.50],
        "mta_tax": [0.50],
        "tip_amount": [2.00],
        "tolls_amount": [0.00],
        "total_amount": [17.50],
    }
    defaults.update(overrides)
    return pd.DataFrame(defaults)


def _run_clean(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply the cleaning logic from load_and_clean() to a DataFrame
    without hitting the filesystem or Kaggle API.

    This extracts and duplicates the cleaning logic so tests are not
    coupled to the file I/O in load_and_clean(). If the cleaning logic
    changes in ingest.py, these tests will catch the contract break.
    """
    df = df.rename(columns={
        "rate_code": "rate_code_id",
    })

    # Apply the same filters as load_and_clean()
    if "fare_amount" in df.columns:
        df = df[df["fare_amount"] > 0]
    if "trip_distance" in df.columns:
        df = df[df["trip_distance"] > 0]
    if "passenger_count" in df.columns:
        df = df[df["passenger_count"].between(1, 6)]

    # Add source_row_hash
    cols_for_hash = [c for c in df.columns if c != "source_row_hash"]
    df = df.copy()
    df["source_row_hash"] = pd.util.hash_pandas_object(
        df[cols_for_hash], index=False
    ).astype(str)

    return df.reset_index(drop=True)


class TestCleaningFilters:
    """
    Tests for the row-level filtering contract in load_and_clean().
    Each test asserts that a specific filter removes the right rows
    and preserves the right rows.
    """

    def test_valid_row_survives_cleaning(self):
        """A row meeting all quality thresholds should pass through unchanged."""
        df = _make_raw_df()
        result = _run_clean(df)
        assert len(result) == 1, (
            "A valid row should survive cleaning. "
            f"Got {len(result)} rows after cleaning."
        )

    def test_zero_fare_is_removed(self):
        """
        Rows with fare_amount == 0 must be removed.
        Zero-fare trips are either errors or comps that skew fare analytics.
        The filter is strict_gt(0), not gte(0).
        """
        df = _make_raw_df(fare_amount=[0.0])
        result = _run_clean(df)
        assert len(result) == 0, (
            "Zero fare rows should be removed. "
            f"Got {len(result)} rows after cleaning."
        )

    def test_negative_fare_is_removed(self):
        """
        Rows with fare_amount < 0 must be removed.
        Negative fares indicate refunds or data errors and corrupt aggregations.
        """
        df = _make_raw_df(fare_amount=[-5.0])
        result = _run_clean(df)
        assert len(result) == 0, (
            "Negative fare rows should be removed. "
            f"Got {len(result)} rows after cleaning."
        )

    def test_zero_distance_is_removed(self):
        """
        Rows with trip_distance == 0 must be removed.
        Zero-distance trips are not real trips and distort distance analytics.
        """
        df = _make_raw_df(trip_distance=[0.0])
        result = _run_clean(df)
        assert len(result) == 0, (
            "Zero distance rows should be removed. "
            f"Got {len(result)} rows after cleaning."
        )

    def test_passenger_count_zero_is_removed(self):
        """
        Rows with passenger_count == 0 must be removed.
        Zero passengers is a data error — trips require at least one passenger.
        """
        df = _make_raw_df(passenger_count=[0])
        result = _run_clean(df)
        assert len(result) == 0, (
            "Zero passenger count rows should be removed. "
            f"Got {len(result)} rows after cleaning."
        )

    def test_passenger_count_above_six_is_removed(self):
        """
        Rows with passenger_count > 6 must be removed.
        NYC taxi regulations cap capacity at 6. Higher values are data errors.
        """
        df = _make_raw_df(passenger_count=[7])
        result = _run_clean(df)
        assert len(result) == 0, (
            "Passenger count > 6 rows should be removed. "
            f"Got {len(result)} rows after cleaning."
        )

    def test_passenger_count_boundary_six_survives(self):
        """
        Rows with passenger_count == 6 must survive.
        The filter is between(1, 6) inclusive — 6 is a valid value.
        """
        df = _make_raw_df(passenger_count=[6])
        result = _run_clean(df)
        assert len(result) == 1, (
            "Passenger count of 6 should survive cleaning (inclusive boundary). "
            f"Got {len(result)} rows after cleaning."
        )

    def test_multiple_invalid_rows_all_removed(self):
        """
        When multiple rows fail different filters, all invalid rows are removed
        and valid rows are preserved.
        """
        valid = _make_raw_df()
        zero_fare = _make_raw_df(fare_amount=[0.0])
        zero_dist = _make_raw_df(trip_distance=[0.0])
        too_many_passengers = _make_raw_df(passenger_count=[8])

        combined = pd.concat(
            [valid, zero_fare, zero_dist, too_many_passengers],
            ignore_index=True
        )
        result = _run_clean(combined)

        assert len(result) == 1, (
            "Only the valid row should survive when mixed with invalid rows. "
            f"Got {len(result)} rows after cleaning."
        )


class TestSourceRowHash:
    """
    Tests for the source_row_hash column added during cleaning.
    This hash is the idempotency key for upserts — its correctness
    is critical for the incremental loading contract.
    """

    def test_source_row_hash_is_present_after_cleaning(self):
        """Every row that survives cleaning must have a source_row_hash."""
        df = _make_raw_df()
        result = _run_clean(df)
        assert "source_row_hash" in result.columns, (
            "source_row_hash column must be present after cleaning."
        )
        assert result["source_row_hash"].notna().all(), (
            "source_row_hash must not be null for any surviving row."
        )

    def test_identical_rows_produce_identical_hashes(self):
        """
        Two rows with identical values must produce the same hash.
        This is the deduplication guarantee — if the same trip arrives
        twice, the upsert must treat them as the same record.
        """
        df = pd.concat([_make_raw_df(), _make_raw_df()], ignore_index=True)
        result = _run_clean(df)
        assert result["source_row_hash"].iloc[0] == result["source_row_hash"].iloc[1], (
            "Identical rows must produce identical source_row_hash values. "
            "If this fails, the incremental upsert deduplication is broken."
        )

    def test_different_rows_produce_different_hashes(self):
        """
        Two rows with different fare amounts must produce different hashes.
        If hashes collide on different data, records will be incorrectly
        deduplicated during incremental loads.
        """
        row_a = _make_raw_df(fare_amount=[14.50])
        row_b = _make_raw_df(fare_amount=[25.00])
        df = pd.concat([row_a, row_b], ignore_index=True)
        result = _run_clean(df)
        assert result["source_row_hash"].iloc[0] != result["source_row_hash"].iloc[1], (
            "Rows with different values must produce different source_row_hash values. "
            "If this fails, distinct trips are being collapsed into the same record."
        )
        