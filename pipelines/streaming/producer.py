"""
Streaming Demo — Producer Layer
================================
STATUS: Implemented. The consumer layer is specified in ADR 007 and
intentionally not implemented here. See pipelines/streaming/README.md
for the full scope rationale.

This producer demonstrates:
- Event schema design for a real-time taxi dispatch system
- Production-grade Kafka producer configuration (acks, retries, batching)
- Partition key strategy (vendor_id) with documented tradeoffs
- Configurable throughput simulation (--rate flag)

Full architecture specification:
docs/decisions/007-streaming-architecture.md

Usage:
  python producer.py --rate 10   # 10 events per second
  python producer.py --rate 0    # unlimited (testing only)
"""
import argparse
import json
import time
import sys
from pathlib import Path
import pandas as pd
from kafka import KafkaProducer

KAFKA_BOOTSTRAP_SERVERS = ['localhost:9092']
TOPIC = 'taxi.trips.raw'
CSV_FILE = Path(__file__).parent.parent / 'nyc_taxi' / 'data' / 'train.csv'
SAMPLE_ROWS = 1000  # Stream a subset for the demo


def create_producer() -> KafkaProducer:
    """Create a Kafka producer with production-appropriate settings."""
    return KafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode('utf-8'),
        key_serializer=lambda k: k.encode('utf-8') if k else None,
        # acks='all' ensures the message is written to all replicas before
        # the producer considers it sent. Critical for data durability.
        acks='all',
        # Retry up to 3 times on transient failures
        retries=3,
        # Batch messages to improve throughput
        batch_size=16384,
        linger_ms=10,
    )


def publish_trips(rate: float) -> None:
    if not CSV_FILE.exists():
        print(f"[streaming] CSV not found at {CSV_FILE}")
        print("[streaming] Run the nyc_taxi pipeline first to download the data.")
        sys.exit(1)

    print(f"[streaming] Reading {SAMPLE_ROWS} rows from {CSV_FILE}")
    df = pd.read_csv(CSV_FILE, nrows=SAMPLE_ROWS)

    producer = create_producer()
    interval = 1.0 / rate if rate > 0 else 0

    print(f"[streaming] Starting producer → topic={TOPIC} rate={rate or 'max'} events/sec")
    print("[streaming] Press Ctrl+C to stop\n")

    sent = 0
    try:
        for _, row in df.iterrows():
            event = {
                'event_type': 'trip_completed',
                'event_time': pd.Timestamp.now().isoformat(),
                'vendor_id': int(row.get('vendor_id', 0)) if pd.notna(row.get('vendor_id')) else None,
                'pickup_datetime': str(row.get('pickup_datetime', '')),
                'dropoff_datetime': str(row.get('dropoff_datetime', '')),
                'passenger_count': int(row.get('passenger_count', 1)) if pd.notna(row.get('passenger_count')) else 1,
                'trip_distance': float(row.get('trip_distance', 0)) if pd.notna(row.get('trip_distance')) else None,
                'fare_amount': float(row.get('fare_amount', 0)) if pd.notna(row.get('fare_amount')) else None,
                'tip_amount': float(row.get('tip_amount', 0)) if pd.notna(row.get('tip_amount')) else None,
                'total_amount': float(row.get('total_amount', 0)) if pd.notna(row.get('total_amount')) else None,
            }

            # Use vendor_id as partition key for consistent ordering per vendor
            key = str(event['vendor_id']) if event['vendor_id'] else None
            producer.send(TOPIC, key=key, value=event)
            sent += 1

            if sent % 100 == 0:
                print(f"[streaming] Sent {sent}/{SAMPLE_ROWS} events")

            if interval > 0:
                time.sleep(interval)

    except KeyboardInterrupt:
        print(f"\n[streaming] Stopped after {sent} events")
    finally:
        producer.flush()
        producer.close()
        print(f"[streaming] Producer closed. Total events sent: {sent}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Taxi trip event producer')
    parser.add_argument('--rate', type=float, default=5.0,
                        help='Events per second (default: 5, 0=unlimited)')
    args = parser.parse_args()
    publish_trips(args.rate)
    