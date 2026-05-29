# ADR 009 — Testing Strategy

**Status:** Accepted  
**Date:** 2026-05-28

---

## Context

This repository demonstrates production-shaped data engineering 
patterns across multiple layers: ingestion pipelines, orchestration, 
transformation, infrastructure, and API. Each layer has different 
testing requirements, different failure modes, and different costs 
associated with running tests.

Without a stated testing strategy, test coverage accumulates 
inconsistently — some layers are heavily tested, others are untested, 
and the reasoning behind each decision is invisible to contributors. 
This ADR establishes the testing philosophy, defines the boundary 
between test types, and documents known gaps with stated plans.

---

## Definitions

**Unit test:** A test that validates how a specific module or component 
operates independently, with controlled inputs and asserted outputs. 
A unit test has no dependency on external systems, running services, 
or real infrastructure. It tests the contract of a single component 
in isolation.

**Integration test:** A test that validates how multiple components 
operate together as a system. An integration test may involve a real 
database, a real message broker, or a real API server. It tests the 
contract between components, not the internal behavior of any single 
component. An integration test may be composed of multiple unit-level 
assertions plus broader assertions about system state.

**The boundary:** The distinction is component boundary, not 
infrastructure boundary. A transformation function that reads from 
a DataFrame and returns a DataFrame is a unit test subject even if 
it performs complex logic. A pipeline that reads from a file, 
transforms data, and writes to a database is an integration test 
subject because it crosses component boundaries. The presence or 
absence of a database connection is a consequence of the boundary, 
not the definition of it.

---

## Decision

### Unit tests

Unit tests are required for any module that contains business logic 
that can fail silently. In this repository, that means:

- **Pipeline cleaning and transformation functions.** These are the 
  most likely source of silent data corruption. A filter that removes 
  the wrong rows or a coercion that produces incorrect types will not 
  raise an exception — it will produce wrong results. Unit tests are 
  the only reliable defense.

- **Watermark and metadata helpers.** These functions maintain 
  incremental loading state. Incorrect behavior here produces 
  duplicate data or missed records on the next run, which is 
  expensive to detect and correct.

- **Schema validation logic.** Zod schemas and their behavior on 
  edge case inputs should be tested in isolation to confirm the 
  validation contract is what the implementation assumes.

Unit tests use mocks or in-memory fixtures to eliminate all external 
dependencies. They must run without any running infrastructure — no 
database, no Kafka broker, no Docker services.

### Integration tests

Integration tests are required to validate that the full data path 
works correctly when all components operate together. In this 
repository, the integration test scope is:

- **Pipeline to database to dbt to API.** A test that seeds the 
  database, runs the dbt models, and asserts the API returns 
  expected results validates the full system contract.

- **Streaming consumer to database.** A test that publishes events 
  to Kafka and asserts the consumer correctly writes deduplicated 
  records to Postgres validates the streaming path contract.

Integration tests require running infrastructure. They are not 
expected to run in the standard CI unit test pass. They run against 
a Docker Compose environment with the relevant profiles active.

### What is explicitly not tested

**Infrastructure code (Terraform).** Terraform modules are validated 
with `terraform validate` and `terraform plan` in CI. Functional 
testing of infrastructure requires a live GCP project and is outside 
the scope of this repository's test suite.

**dbt models.** dbt models are validated with `dbt test` using schema 
tests defined in `schema.yml`. These are not duplicated as Python 
tests. The dbt test framework is the right tool for model contracts.

**React components.** UI component testing is outside the scope of 
this repository. The web layer is a demonstration interface, not a 
production application. If the web layer were promoted to production, 
component tests with React Testing Library would be added.

---

## Current State and Known Gaps

| Layer | Unit tests | Integration tests | Notes |
|---|---|---|---|
| Pipeline cleaning | ✅ | ❌ | `tests/test_nyc_taxi_pipeline.py` |
| Watermark helpers | ✅ | ❌ | `tests/test_metadata_watermarks.py` |
| API schema validation | ✅ | ✅ | `web/server/test/jest/` |
| API routes | ✅ | ✅ | `web/server/test/jest/server.test.ts` |
| dbt models | N/A | ✅ | `dbt test` via schema tests |
| Streaming consumer | ❌ | ❌ | Consumer not yet implemented |
| Pipeline to API path | ❌ | ❌ | Known gap — see below |
| Terraform modules | N/A | ✅ | `terraform validate` in CI |

**Known gap — pipeline to API integration test:**  
No test currently validates the full path from pipeline load through 
dbt transformation to API response. This is the highest-value 
integration test and it is planned as a follow-on addition once the 
streaming consumer is implemented so both ingestion paths can be 
covered in a single integration test pass.

**Known gap — streaming consumer tests:**  
The Kafka consumer is not yet implemented. Unit tests for consumer 
validation and deduplication logic and an integration test for the 
full publish-consume-store path will be added alongside the consumer 
implementation.

---

## CI Integration

Unit tests run on every pull request and push to main via GitHub 
Actions. They require no running infrastructure and complete in 
under 60 seconds.

Integration tests are not currently in CI. The plan for CI 
integration of integration tests is:

1. Add a separate GitHub Actions workflow that spins up Docker 
   Compose with the required profiles
2. Runs the integration test suite against the live stack
3. Tears down the environment after the run

This workflow will be triggered on pull requests that touch pipeline 
code, dbt models, or the API layer. It will not run on documentation 
changes.

---

## Rationale

The component-boundary definition of unit vs integration tests 
produces a cleaner testing pyramid than the infrastructure-boundary 
definition. Under the infrastructure-boundary definition, a complex 
transformation function that happens to be testable in isolation 
gets classified as an integration test simply because it is adjacent 
to database code. This produces undertested transformation logic 
because the test is expensive to run.

Under the component-boundary definition, transformation logic is 
unit-tested regardless of what surrounds it. The result is a fast, 
cheap unit test suite that covers the highest-risk logic and a 
separate integration test suite that validates system behavior 
without duplicating the unit-level assertions.

---

## References

- `tests/test_nyc_taxi_pipeline.py` — unit tests for pipeline 
  cleaning logic
- `tests/test_metadata_watermarks.py` — unit tests for watermark 
  helpers
- `web/server/test/jest/` — API schema and route tests
- [ADR 008](008-ai-collaboration-model.md) — contributor model 
  governing all test additions