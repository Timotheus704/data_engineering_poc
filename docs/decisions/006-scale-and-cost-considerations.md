# Scale and Cost Considerations (PoC, Written With Production in Mind)

## Purpose

This repository is intentionally a proof-of-concept. The goal is to demonstrate pipeline shape, tradeoffs, and engineering judgment—not to produce something we expect to deploy and operate as-is.

PoCs are still worth doing “the right way” in the areas that matter. This doc captures what changes once the same pattern has to run reliably, repeatedly, and cheaply under real load. It’s here so a reader can see we understand the gap between a working prototype and an operational platform.

---

## When the Data Gets Big, the System Changes

At PoC size, a lot of decisions look equivalent. Full scans finish quickly, reruns are cheap, and the easiest orchestration is usually good enough.

Once row counts, partitions, and downstream usage grow, the problem shifts. You stop building “a job that transforms data” and start running a distributed system with failure modes, recovery paths, and a monthly spend profile.

### The unit of work stops being “the table”

In a small demo, it’s common to treat an entire table as the processing boundary.

Under heavier load, the natural boundary becomes a slice:

- a partition or business date
- an ingestion window
- a source batch
- a facility / tenant / domain slice

That shift changes extraction, landing layout, transformation design, validation scope, retry behavior, and backfill mechanics.

**Failure mode to plan for:** the first time a single bad batch forces a full-table rebuild, you learn the hard way that “rerun everything” is not a recovery strategy.

### Physical layout becomes part of the architecture

At small volumes, you can often get away with “correct SQL” and ignore physical layout. At larger volumes, layout decisions directly drive runtime and cost.

Partitioning strategy, clustering strategy, merge behavior, retention windows, and late-arriving data handling are not implementation details—they are the architecture.

**Failure mode to plan for:** if your partition key doesn’t match how the pipeline and consumers filter, you end up paying for scans that behave like the table is effectively unpartitioned.

### Recovery and idempotency become non-negotiable

Rerunning a PoC pipeline is fine. Rerunning a large pipeline repeatedly is expensive and risky.

Operational pipelines generally need:

- idempotent writes
- batch / partition status tracking
- bounded retries (retry the slice that failed)
- durable checkpoints (“what ran” and “what’s published”)
- reconciliation (source → landed → curated)
- clear separation between transient failures and data-quality failures

**Failure mode to plan for:** without slice-level state, teams end up choosing between publishing partial data or rewriting far more history than necessary to recover.

### Data quality has to move earlier

With more volume and more consumers, discovering issues after publication is expensive.

Quality checks tend to layer:

- pre-ingestion file/batch checks
- schema checks at ingestion
- required field/type checks during staging
- reconciliation checks after transforms
- business-rule checks before publish

**Failure mode to plan for:** letting bad data reach curated tables usually turns into a backfill project, not a quick fix.

### Shared context does not scale

A small team can rely on shared understanding. A larger ecosystem needs explicit contracts around schema expectations, ownership, freshness, keys, nullability, partitioning behavior, and backfill expectations.

**Failure mode to plan for:** upstream “small” schema changes become downstream incidents when there’s no contract, no lineage, and no compatibility checks.

---

## Why Full Refresh Works in a PoC (and Why It Stops Working)

Full refresh is a reasonable PoC choice because it keeps iteration tight:

- simpler orchestration
- less state to manage
- easier debugging
- easier end-to-end validation

The tradeoff is that full refresh scales with *total* data size, not with the *size of change*.

### Incremental loading changes the cost curve

A scalable pattern processes only what changed:

1. identify the changed slice
2. land only that slice
3. transform only affected partitions
4. merge/overwrite only impacted targets
5. validate the impacted slice (plus required rollups)

That tends to produce more predictable runtimes, cheaper retries, and a smaller blast radius when something goes wrong.

**Failure mode to plan for:** full refresh holds until late-arriving corrections show up; then you’re rewriting months/years of partitions to fix yesterday.

### Partition pruning is what makes “incremental” physically real

It’s possible to be logically incremental and still scan most of the table.

Partition pruning is what makes the engine skip irrelevant data. Transformations need to preserve partition elimination by filtering directly on the partition column.

```sql
WHERE business_date BETWEEN @start_date AND @end_date
```

**Failure mode to plan for:** an incremental job that can’t prune partitions will look “fine” in development and then quietly become one of the biggest cost drivers in production.

---

## Partitioning and Clustering vs. Traditional Indexing

Index instincts from transactional databases don’t translate directly to analytical warehouses.

### Transactional indexing (row-store thinking)

Row-store indexes are optimized for point lookups and selective predicates, and they’re maintained as separate structures alongside the table.

That approach works well for transactional workloads and smaller tables, but it’s not the primary lever for controlling scan cost in a columnar analytics warehouse.

### Partitioning (bound the scan)

Partitioning is usually the first lever: it bounds the amount of data touched when the query/pipeline filters on the partition column.

A partition choice is only “good” if it matches how the pipeline runs and how consumers filter.

### Clustering (improve locality within partitions)

Clustering helps once partitioning is right. It improves locality within a partition for frequently filtered/joined dimensions.

Clustering keys should be driven by observed access patterns, not guesses.

**Failure mode to plan for:** picking clustering keys based on what “sounds important” often results in little benefit and ongoing write overhead.

---

## Cost Profile: Consumption vs. Reserved Capacity

Cost management is part of the architecture once usage and volume grow.

### Consumption-based pricing

Consumption-based pricing is a good fit when workloads are:

- early-stage
- intermittent
- still changing
- hard to predict

That’s why it matches PoC work. The main risk is that inefficiencies (unbounded scans, missing partition filters, repeated history processing) turn into disproportionate spend.

**Failure mode to plan for:** one scheduled query without a bounded filter can scan terabytes daily for weeks before anyone notices.

### Reserved capacity

Reserved capacity tends to make sense once workloads are:

- predictable
- recurring
- operationally important
- competing for shared resources

Reservations are not only a cost lever; they’re also a way to isolate and prioritize workloads so one job doesn’t starve everything else.

**Failure mode to plan for:** without workload isolation, ad hoc exploration can collide with scheduled processing windows and create avoidable incidents.

### What to measure

At real load, you manage cost with operational metrics, not opinions:

- bytes scanned per run
- partitions touched per run
- rows written
- compute consumed
- backfill frequency
- concurrency during processing windows

---

## Schema Evolution at Scale

Migration files are fine for a small repo and a small team. They’re explicit and easy to review.

As the number of producers/consumers grows, schema evolution becomes less about “can we alter a table?” and more about “can the ecosystem absorb change safely?”

Production-scale schema management generally moves toward:

- versioned data contracts
- centralized schema/metadata as the system of record
- automated compatibility checks in CI/CD
- lineage-aware impact analysis
- controlled deprecation windows

**Failure mode to plan for:** without compatibility checks and lineage, “minor” changes turn into multi-team fire drills because breakage is discovered downstream.

---

## Scope and Non-Goals

- This PoC is meant to be read and learned from; it is not meant to be deployed as a production system.
- The sections above are included so the PoC doesn’t implicitly teach the wrong lessons about scale, operability, and cost.

---

## If This Pattern Were Promoted Beyond PoC

If this pipeline pattern were ever promoted into a real operating environment, the minimum set of changes would look like:

1. **Make incremental the default**: partition-bounded loads with targeted retries and backfills.
2. **Design for pruning**: enforce partition filters and shape transformations so pruning actually happens.
3. **Add durable run state**: batch/partition checkpoints, reconciliation, and clear publish semantics.
4. **Make layout intentional**: choose partition keys and clustering keys based on real access patterns.
5. **Put guardrails around spend**: monitoring, labeling, isolation between scheduled and ad hoc workloads, and cost budgets.
6. **Treat schema as a contract**: versioning, compatibility checks, and deprecation windows rather than migration files alone.

The key point: scaling isn’t “the same job, but more rows.” Scaling is changing the unit of work so the system only touches data it has a reason to touch.
