# Streaming Architecture

**Status:** Proposed (documenting the production-direction alternative)

## Purpose

This repository is intentionally a proof-of-concept and is batch-first by design. The batch pipeline is the simplest way to demonstrate ingestion, transformation, and data quality patterns with a small dataset.

This decision record documents what changes if the same data product has to support continuous arrival, tighter freshness expectations, and multiple independent downstream consumers. In that world, a durable event stream becomes the more natural backbone than scheduled batch jobs.

---

## Why batch gives way to event streaming

Batch is a good fit when data arrives in discrete drops and consumers can tolerate hours of latency. It becomes harder to defend as volumes and expectations increase:

- **Freshness becomes continuous.** Once consumers care about “what’s happening now,” waiting for the next batch window is a structural mismatch.
- **More consumers, more coupling.** A single batch job becomes a coordination point for teams with different SLAs.
- **Reprocessing stops being cheap.** Large backfills and full refresh patterns turn into recurring operational work.
- **Operational health becomes real-time.** The question shifts from “did last night finish?” to “is the feed healthy right now?”

**Measured but direct impact:** batch pipelines fail gracefully at small scale; at real scale they fail loudly—through lateness, expensive reprocessing, and downstream breakage.

---

## Kafka topic design for the taxi trips use case

The current streaming demo already publishes to a Kafka topic named `taxi.trips.raw` and keys messages by `vendor_id`.citeturn10search2turn10search1

### Topic naming

Use names that encode **domain**, **entity**, and **stage**:

- `taxi.trips.raw` — immutable raw trip events as produced/received
- (optional) `taxi.trips.invalid` — events that fail schema validation or required checks

If schema changes require a hard break (rare, and ideally avoided), version the topic explicitly (e.g., `taxi.trips.raw.v2`) and treat it as a migration event rather than an in-place rename.

### Partitioning and key choice (`vendor_id`)

The demo uses `vendor_id` as the message key to keep events for the same vendor in order.citeturn10search2

That rationale is sound for ordering and for explaining the design, but it comes with a real tradeoff: `vendor_id` is low-cardinality, so partitions can skew if one vendor dominates traffic.

- **Why still use it here:** it’s a clear domain boundary and matches the demo’s intent.
- **What changes under skew:** keep the vendor boundary but increase cardinality (e.g., hash `vendor_id` with a stable trip identifier) to avoid hot partitions.

### Retention policy

Retention should be chosen based on recovery objectives, not convenience.

- Enough retention to replay through downstream outages.
- Enough retention to support bounded backfills without rehydrating from the original source.
- Not so much that storage and compliance become an afterthought.

In practice, teams usually start with **days-to-weeks** of raw-topic retention and adjust based on replay needs and cost.

### Consumer groups

Consumer groups are how you decouple responsibilities while preserving independent scaling and recovery.

A clean separation for this use case:

- `taxi-trips-bq-staging-writer` — validates events and writes to BigQuery staging
- `taxi-trips-dq-monitor` — monitors schema failure rate, null spikes, and lag
- `taxi-trips-metrics` — operational telemetry and alerting

The important rule: don’t overload one consumer with unrelated responsibilities. Isolation is what keeps incidents from cascading.

---

## Managed alternative: GCP Pub/Sub

Kafka and Pub/Sub both provide durable messaging and fanout. The difference is operational ownership.

### When Kafka is the better choice

Choose Kafka when:

- you need Kafka-native tooling (Kafka Streams/Connect ecosystems)
- you need deep control over partitioning/retention/cluster behavior
- you already have the operational maturity to run brokers reliably

Tradeoff: operating Kafka means owning capacity, upgrades, rebalancing, and incident response.

### When Pub/Sub is the better choice

Choose Pub/Sub when:

- you want managed operations (no brokers to patch or scale)
- you’re already building primarily in GCP
- you want IAM-first controls and simpler integration with managed stream processing

Tradeoff: some Kafka patterns map differently (consumer groups vs subscriptions, partitions vs ordering keys). You gain managed ops, but give up some low-level control.

### Concept mapping

- Kafka topic → Pub/Sub topic
- Kafka consumer group → Pub/Sub subscription
- Kafka partition key → Pub/Sub ordering key (only when ordering is required)

If strict ordering is required, both systems impose a parallelism tradeoff: fewer keys means less parallel processing.

---

## Consumer behavior (canonical path)

The consumer described here is the minimum behavior needed to make the stream operationally safe.

1. **Read** events from `taxi.trips.raw`.citeturn10search2
2. **Validate** the event schema:
   - Validate an envelope (event metadata, producer time, schema version).
   - Validate the payload (types, required fields).
   - Route invalid events to `taxi.trips.invalid` and emit metrics.
3. **Write** to BigQuery staging with deduplication:
   - Target: a staging table partitioned by ingestion time.
   - Deduplicate on `source_row_hash` to make retries safe.
   - Keep staging append-friendly; downstream merges into curated tables stay bounded.

**Measured but direct impact:** without deduplication, at-least-once delivery turns into duplicate facts, and “retry” becomes “corrupt the dataset.”

---

## Schema evolution

Schema evolution is inevitable. The question is how you prevent producers from breaking consumers.

### Kafka: Schema Registry

A schema registry is the standard control plane for Kafka ecosystems. It provides:

- versioned schemas
- compatibility rules (backward/forward/full)
- producer/consumer coordination across schema versions

This is the usual choice when many teams publish/consume and you want explicit compatibility gates.

### Pub/Sub: schema validation

Pub/Sub supports attaching schemas to topics and validating messages at publish time.

This can be sufficient when:

- you want managed enforcement
- the supported schema model fits your event format
- you prefer fewer moving parts over ecosystem flexibility

Regardless of mechanism, consumers should still tolerate mixed versions during rollout windows and quarantine invalid messages rather than halting the stream.

---

## Scope

- This repo stays batch-first; streaming is documented as the production-direction alternative.
- The included producer exists to demonstrate event shape and publishing mechanics. The consumer, schema controls, and Pub/Sub alternative are described here.
