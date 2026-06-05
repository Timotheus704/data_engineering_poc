"""Unit tests for the streaming consumer validation and transformation logic.

These tests validate the consumer's event validation contract,
hash computation determinism, and event-to-row mapping without
requiring a running Kafka broker or database connection.

Per ADR 009: these are unit tests because they test individual
component behavior with controlled inputs. The integration test
(publish → consume → assert database state) is a separate concern
requiring the streaming Docker profile.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(
    0, str(Path(__file__).parent.parent / "pipelines" / "streaming")
)

from consumer import (  # noqa: E402
    ValidationError,
    validate_event,
    compute_source_row_hash,
    event_to_row,
)


def _make_valid_event(**overrides) -> dict:
    """Return a minimal valid event. Override fields to test edge cases."""
    defaults = {
        "event_type": "trip_completed",
        "event_time": "2024-01-15T09:32:00.000Z",
        "vendor_id": 1,
        "pickup_datetime": "2015-01-15 09:32:00",
        "dropoff_datetime": "2015-01-15 09:45:00",
        "passenger_count": 2,
        "trip_distance": 3.5,
        "fare_amount": 14.50,
        "tip_amount": 2.00,
        "total_amount": 16.50,
    }
    defaults.update(overrides)
    return defaults


class TestValidateEvent:
    """Tests for the event validation contract."""

    def test_valid_event_passes_without_error(self):
        """A well-formed event should pass validation silently."""
        validate_event(_make_valid_event())

    def test_missing_required_field_raises_validation_error(self):
        """An event missing a required field must raise ValidationError."""
        event = _make_valid_event()
        del event["pickup_datetime"]
        with pytest.raises(ValidationError, match="pickup_datetime"):
            validate_event(event)

    def test_null_required_field_raises_validation_error(self):
        """A required field set to None must raise ValidationError."""
        event = _make_valid_event(event_time=None)
        with pytest.raises(ValidationError, match="event_time"):
            validate_event(event)

    def test_unknown_event_type_raises_validation_error(self):
        """An unknown event_type must raise ValidationError."""
        event = _make_valid_event(event_type="trip_started")
        with pytest.raises(ValidationError, match="event_type"):
            validate_event(event)

    def test_zero_fare_raises_validation_error(self):
        """
        fare_amount of 0 must raise ValidationError.
        This mirrors the batch pipeline cleaning contract.
        """
        event = _make_valid_event(fare_amount=0.0)
        with pytest.raises(ValidationError, match="fare_amount"):
            validate_event(event)

    def test_negative_fare_raises_validation_error(self):
        """fare_amount < 0 must raise ValidationError."""
        event = _make_valid_event(fare_amount=-5.0)
        with pytest.raises(ValidationError, match="fare_amount"):
            validate_event(event)

    def test_passenger_count_zero_raises_validation_error(self):
        """passenger_count of 0 must raise ValidationError."""
        event = _make_valid_event(passenger_count=0)
        with pytest.raises(ValidationError, match="passenger_count"):
            validate_event(event)

    def test_passenger_count_above_six_raises_validation_error(self):
        """passenger_count > 6 must raise ValidationError."""
        event = _make_valid_event(passenger_count=7)
        with pytest.raises(ValidationError, match="passenger_count"):
            validate_event(event)

    def test_passenger_count_six_passes_validation(self):
        """passenger_count of 6 must pass validation (inclusive boundary)."""
        validate_event(_make_valid_event(passenger_count=6))

    def test_absent_optional_field_passes_validation(self):
        """
        Optional fields (tip_amount, total_amount) may be absent.
        Only REQUIRED_FIELDS are mandatory.
        """
        event = _make_valid_event()
        del event["tip_amount"]
        del event["total_amount"]
        validate_event(event)

    def test_non_numeric_fare_raises_validation_error(self):
        """
        A fare_amount that cannot be cast to float must raise
        ValidationError. This indicates a producer schema change.
        """
        event = _make_valid_event(fare_amount="not_a_number")
        with pytest.raises(ValidationError, match="fare_amount"):
            validate_event(event)


class TestComputeSourceRowHash:
    """
    Tests for hash computation determinism and collision resistance.
    The hash is the idempotency key for deduplication — its
    correctness is critical for the streaming-to-batch consistency
    guarantee.
    """

    def test_identical_events_produce_identical_hashes(self):
        """
        Two events with identical payload fields must hash identically.
        This is the deduplication guarantee across delivery attempts.
        """
        event_a = _make_valid_event()
        event_b = _make_valid_event()
        assert compute_source_row_hash(event_a) == compute_source_row_hash(event_b)

    def test_different_events_produce_different_hashes(self):
        """
        Events with different fare amounts must produce different hashes.
        Hash collisions on different trips would cause data loss.
        """
        event_a = _make_valid_event(fare_amount=14.50)
        event_b = _make_valid_event(fare_amount=25.00)
        assert compute_source_row_hash(event_a) != compute_source_row_hash(event_b)

    def test_event_time_does_not_affect_hash(self):
        """
        event_time is delivery metadata, not trip data. Two events
        with the same trip data but different delivery times must
        produce the same hash so the second delivery is a duplicate.
        """
        event_a = _make_valid_event(event_time="2024-01-15T09:32:00.000Z")
        event_b = _make_valid_event(event_time="2024-01-15T10:00:00.000Z")
        assert compute_source_row_hash(event_a) == compute_source_row_hash(event_b)

    def test_hash_is_deterministic_regardless_of_key_order(self):
        """
        Hash must be identical regardless of dict key insertion order.
        Kafka producers on different platforms may serialize keys differently.
        """
        event_a = _make_valid_event()
        event_b = {k: event_a[k] for k in reversed(list(event_a.keys()))}
        assert compute_source_row_hash(event_a) == compute_source_row_hash(event_b)


class TestEventToRow:
    """Tests for the event-to-staging-row transformation."""

    def test_row_contains_source_row_hash(self):
        """Every transformed row must contain a non-null source_row_hash."""
        event = _make_valid_event()
        row = event_to_row(event)
        assert "source_row_hash" in row
        assert row["source_row_hash"] is not None

    def test_row_maps_fare_amount_correctly(self):
        """fare_amount from event maps to fare_amount in staging row."""
        event = _make_valid_event(fare_amount=14.50)
        row = event_to_row(event)
        assert row["fare_amount"] == 14.50

    def test_row_maps_passenger_count_correctly(self):
        """passenger_count from event maps to passenger_count in row."""
        event = _make_valid_event(passenger_count=3)
        row = event_to_row(event)
        assert row["passenger_count"] == 3

    def test_absent_optional_fields_become_none_in_row(self):
        """
        Fields not present in the event payload map to None in the row.
        The staging table permits nulls on all columns except id and
        loaded_at.
        """
        event = _make_valid_event()
        row = event_to_row(event)
        assert row["pickup_longitude"] is None
        assert row["dropoff_longitude"] is None
        assert row["rate_code_id"] is None

    def test_hash_consistent_between_event_to_row_and_direct_hash(self):
        """
        The source_row_hash in the transformed row must equal the
        hash computed directly from the event. If these diverge,
        the deduplication contract between streaming and batch breaks.
        """
        event = _make_valid_event()
        row = event_to_row(event)
        direct_hash = compute_source_row_hash(event)
        assert row["source_row_hash"] == direct_hash
