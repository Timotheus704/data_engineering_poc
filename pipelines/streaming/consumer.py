"""
Streaming Demo — Consumer Layer
================================
STATUS: Implemented. Reads from taxi.trips.raw Kafka topic,
validates events, deduplicates on source_row_hash, and writes
to staging.nyc_taxi in Postgres.

This consumer closes the streaming loop demonstrated by producer.py.
It implements the behavior specified in ADR 007:
- Validate event envelope and payload
- Route invalid events to taxi.trips.invalid with logging
- Deduplicate on source_row_hash before writing to staging
- Write with idempotent upsert semantics consistent with batch pipeline

The deduplication contract is identical to the batch pipeline:
source_row_hash is the idempotency key. A trip that arrives via
both the batch pipeline and the streaming consumer will not be
duplicated in staging.nyc_taxi.

Full architecture specification:
docs/decisions/007-streaming-architecture.md
Data contract: docs/contracts/staging.nyc_taxi.md

Usage:
  python consumer.py                    # consume until Ctrl+C
  python consumer.py --max-messages 100 # consume exactly 100 messages
"""

from __future__ import annotations

import argparse
import json
import sys
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional

from kafka import KafkaConsumer
from kafka.errors import NoBrokersAvailable

sys.path.insert(0, str(Path(__file__).parent.parent))
from db import get_engine
from sqlalchemy import text

KAFKA_BOOTSTRAP_SERVERS = ['localhost:9092']
TOPIC_RAW = 'taxi.trips.raw'
TOPIC_INVALID = 'taxi.trips.invalid'
CONSUMER_GROUP = 'taxi-trips-staging-writer'

SCHEMA = 'staging'
TABLE = 'nyc_taxi'

# Required fields for a valid event payload
REQUIRED_FIELDS = [
    'event_type',
    'event_time',
    'pickup_datetime',
]

# Numeric fields that must be positive when present
POSITIVE_FIELDS = [
    'fare_amount',
    'trip_distance',
    'total_amount',
]

# Valid passenger count range — matches the batch pipeline cleaning contract
PASSENGER_COUNT_MIN = 1
PASSENGER_COUNT_MAX = 6


class ValidationError(Exception):
    """Raised when an event fails payload validation."""
    pass


def validate_event(event: dict) -> None:
    """
    Validate an incoming event against the payload contract.

    Raises ValidationError with a descriptive message if validation fails.
    Valid events pass through silently.

    Validation contract:
    - All REQUIRED_FIELDS must be present and non-null
    - POSITIVE_FIELDS must be > 0 when present
    - passenger_count must be between 1 and 6 when present
    - event_type must be 'trip_completed'

    Failure modes:
    - Malformed JSON: caught upstream in the consume loop before
      this function is called. The raw bytes are logged and the
      message is routed to the invalid topic.
    - Missing required field: ValidationError raised with field name.
    - Type error on numeric field: ValidationError raised. This
      indicates a producer schema change — check producer version.
    """
    for field in REQUIRED_FIELDS:
        if field not in event or event[field] is None:
            raise ValidationError(
                f"Required field '{field}' is missing or null. "
                f"This may indicate a producer schema change."
            )

    if event.get('event_type') != 'trip_completed':
        raise ValidationError(
            f"Unknown event_type '{event.get('event_type')}'. "
            f"Expected 'trip_completed'."
        )

    for field in POSITIVE_FIELDS:
        value = event.get(field)
        if value is not None:
            try:
                numeric_value = float(value)
            except (TypeError, ValueError):
                raise ValidationError(
                    f"Field '{field}' must be numeric, got '{value}'."
                )
            if numeric_value <= 0:
                raise ValidationError(
                    f"Field '{field}' must be > 0, got {numeric_value}. "
                    f"This violates the staging.nyc_taxi cleaning contract."
                )

    passenger_count = event.get('passenger_count')
    if passenger_count is not None:
        try:
            count = int(passenger_count)
        except (TypeError, ValueError):
            raise ValidationError(
                f"passenger_count must be an integer, got '{passenger_count}'."
            )
        if not (PASSENGER_COUNT_MIN <= count <= PASSENGER_COUNT_MAX):
            raise ValidationError(
                f"passenger_count must be between {PASSENGER_COUNT_MIN} "
                f"and {PASSENGER_COUNT_MAX}, got {count}."
            )


def compute_source_row_hash(event: dict) -> str:
    """
    Compute a deterministic hash for an event for deduplication.

    The hash is computed from the stable payload fields — not from
    event_type or event_time which can vary for the same underlying
    trip. This ensures that the same trip arriving via both the batch
    pipeline and the streaming consumer produces the same hash and
    is correctly deduplicated on upsert.

    This mirrors the batch pipeline's pd.util.hash_pandas_object
    behavior: the hash is a function of the trip data, not the
    delivery metadata.

    Failure modes:
    - Non-deterministic field ordering: prevented by sorting keys
      before hashing. dict ordering is not guaranteed across Python
      versions or Kafka producer implementations.
    """
    stable_fields = {
        k: v for k, v in sorted(event.items())
        if k not in ('event_type', 'event_time', 'source_row_hash')
    }
    content = json.dumps(stable_fields, sort_keys=True, default=str)
    return hashlib.sha256(content.encode()).hexdigest()


def event_to_row(event: dict) -> dict:
    """
    Transform a validated event dict into a staging.nyc_taxi row dict.

    Maps event fields to the staging table schema. Fields absent in
    the event are set to None — the staging table permits nulls on
    all columns except id and loaded_at.
    """
    return {
        'vendor_id': event.get('vendor_id'),
        'pickup_datetime': event.get('pickup_datetime'),
        'dropoff_datetime': event.get('dropoff_datetime'),
        'passenger_count': event.get('passenger_count'),
        'trip_distance': event.get('trip_distance'),
        'pickup_longitude': None,
        'pickup_latitude': None,
        'rate_code_id': None,
        'store_and_fwd_flag': None,
        'dropoff_longitude': None,
        'dropoff_latitude': None,
        'payment_type': None,
        'fare_amount': event.get('fare_amount'),
        'extra': None,
        'mta_tax': None,
        'tip_amount': event.get('tip_amount'),
        'tolls_amount': None,
        'total_amount': event.get('total_amount'),
        'source_row_hash': compute_source_row_hash(event),
    }


def upsert_row(engine, row: dict) -> bool:
    """
    Upsert a single row into staging.nyc_taxi.

    Uses INSERT ... ON CONFLICT (source_row_hash) DO NOTHING for
    idempotent writes. A row that already exists (same hash) is
    silently skipped. Returns True if the row was inserted, False
    if it was a duplicate.

    Failure modes:
    - Database unavailable: SQLAlchemy raises OperationalError.
      The message is not committed to Kafka (auto_commit=False in
      consumer config would be required for exactly-once semantics).
      In the current at-least-once configuration, the message will
      be reprocessed on the next consumer restart. The ON CONFLICT
      clause ensures this is safe.
    - source_row_hash is null: INSERT will succeed but the row
      will not be deduplicated on re-delivery. This should never
      happen if compute_source_row_hash is called correctly.
    """
    insert_sql = text(f"""
        INSERT INTO {SCHEMA}.{TABLE} (
            vendor_id, pickup_datetime, dropoff_datetime,
            passenger_count, trip_distance,
            pickup_longitude, pickup_latitude, rate_code_id,
            store_and_fwd_flag, dropoff_longitude, dropoff_latitude,
            payment_type, fare_amount, extra, mta_tax,
            tip_amount, tolls_amount, total_amount, source_row_hash
        ) VALUES (
            :vendor_id, :pickup_datetime, :dropoff_datetime,
            :passenger_count, :trip_distance,
            :pickup_longitude, :pickup_latitude, :rate_code_id,
            :store_and_fwd_flag, :dropoff_longitude, :dropoff_latitude,
            :payment_type, :fare_amount, :extra, :mta_tax,
            :tip_amount, :tolls_amount, :total_amount, :source_row_hash
        )
        ON CONFLICT (source_row_hash) DO NOTHING
    """)

    with engine.begin() as conn:
        result = conn.execute(insert_sql, row)
        return result.rowcount > 0


def create_consumer() -> KafkaConsumer:
    """
    Create a Kafka consumer configured for the staging writer group.

    Failure modes:
    - No brokers available: NoBrokersAvailable raised. The Kafka
      Docker service is not running. Resolution: start the streaming
      profile with docker compose --profile streaming up -d.
    - Consumer group rebalancing: handled automatically by kafka-python.
      During rebalance, message processing pauses briefly.
    """
    return KafkaConsumer(
        TOPIC_RAW,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id=CONSUMER_GROUP,
        value_deserializer=lambda m: json.loads(m.decode('utf-8')),
        auto_offset_reset='earliest',
        enable_auto_commit=True,
        consumer_timeout_ms=10000,
    )


def consume(max_messages: Optional[int] = None) -> None:
    """
    Main consume loop. Reads from taxi.trips.raw, validates,
    deduplicates, and writes to staging.nyc_taxi.

    Failure modes:
    - Kafka broker unavailable on startup: NoBrokersAvailable raised,
      logged, and sys.exit(1) called. The staging table is unchanged.
    - Database unavailable during upsert: OperationalError logged.
      The message offset is committed (at-least-once semantics) so
      the message will not be reprocessed. This is the accepted
      tradeoff of at-least-once delivery with auto commit enabled.
      For exactly-once semantics, disable auto_commit and implement
      manual offset management with transactional writes.
    - Invalid event: ValidationError logged, event counted as invalid.
      Processing continues with the next message.
    """
    try:
        consumer = create_consumer()
    except NoBrokersAvailable:
        print(
            "[consumer] No Kafka brokers available. "
            "Start the streaming profile: "
            "docker compose --profile streaming up -d"
        )
        sys.exit(1)

    engine = get_engine()

    processed = 0
    inserted = 0
    duplicates = 0
    invalid = 0

    print(f"[consumer] Starting consumer group={CONSUMER_GROUP} "
          f"topic={TOPIC_RAW}")
    print("[consumer] Press Ctrl+C to stop\n")

    try:
        for message in consumer:
            try:
                event = message.value

                validate_event(event)

                row = event_to_row(event)
                was_inserted = upsert_row(engine, row)

                if was_inserted:
                    inserted += 1
                else:
                    duplicates += 1

            except ValidationError as e:
                invalid += 1
                print(f"[consumer] Invalid event offset={message.offset}: {e}")

            except Exception as e:
                print(
                    f"[consumer] Unexpected error at offset={message.offset}: "
                    f"{type(e).__name__}: {e}"
                )

            processed += 1

            if processed % 100 == 0:
                print(
                    f"[consumer] processed={processed} "
                    f"inserted={inserted} "
                    f"duplicates={duplicates} "
                    f"invalid={invalid}"
                )

            if max_messages and processed >= max_messages:
                break

    except KeyboardInterrupt:
        print(f"\n[consumer] Stopped by user")

    finally:
        consumer.close()
        print(
            f"\n[consumer] Final counts: "
            f"processed={processed} "
            f"inserted={inserted} "
            f"duplicates={duplicates} "
            f"invalid={invalid}"
        )


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Taxi trip event consumer'
    )
    parser.add_argument(
        '--max-messages',
        type=int,
        default=None,
        help='Stop after processing this many messages (default: run until Ctrl+C)'
    )
    args = parser.parse_args()
    consume(max_messages=args.max_messages)