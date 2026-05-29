# Data Contracts

This directory contains data contracts for tables and streams in 
this platform. A data contract is a formal agreement between the 
producer of a dataset and its consumers. It documents what the 
producer guarantees, what consumers can depend on, and what 
constitutes a breaking change.

---

## Why Data Contracts Exist

Schema tests and data quality checks validate that data meets 
quality thresholds at a point in time. They do not communicate 
what downstream consumers can depend on over time.

A data contract answers a different set of questions:

- Who owns this dataset and who do I contact when something breaks?
- What schema fields are guaranteed stable versus subject to change?
- What quality guarantees does the producer make?
- What is the SLA for freshness?
- What does a breaking change look like and how will it be communicated?

Without contracts, schema changes break consumers silently. With 
contracts, breaking changes are visible, negotiated, and 
communicated before they land.

---

## Contract Lifecycle

**When to create a contract:**  
Create a contract when a dataset is consumed by more than one 
downstream system, when a dataset is used in production reporting, 
or when a dataset is owned by a different team than its consumers.

**When to update a contract:**  
Update the contract when the schema changes, when ownership changes, 
when quality guarantees change, or when the SLA changes.

**Breaking vs non-breaking changes:**  
A breaking change is any change that would cause an existing 
consumer to fail or produce incorrect results without modification. 
See the Breaking Change Policy section of each contract for 
dataset-specific rules.

**Review process:**  
Contract changes follow the same ADR-first workflow as architectural 
decisions. A proposed contract change should be submitted as a pull 
request with a description of what changes and why. Affected 
consumers should be identified and notified before the change lands.

---

## Contract Template

Use this template when creating a new contract:

```markdown
# Data Contract: [schema].[table]

## Owner
**Team/Individual:** [name]  
**Contact:** [email or Slack channel]  
**Last reviewed:** [date]

## Description
[One paragraph describing what this dataset contains, where it 
comes from, and what it is used for.]

## Schema

| Column | Type | Nullable | Description | Stability |
|---|---|---|---|---|
| [column] | [type] | [yes/no] | [description] | [stable/unstable] |

Stability values:
- **Stable:** This column will not be removed or have its type 
  changed without a breaking change notice.
- **Unstable:** This column may change without notice. Do not 
  build dependencies on it.

## Quality Guarantees
[List the specific quality guarantees the producer makes. 
Reference the Great Expectations suite if one exists.]

## SLA
**Freshness:** [how frequently this data is updated]  
**Latency:** [how long after source data arrives before this 
table reflects it]  
**Availability:** [uptime expectations]

## Breaking Change Policy
[Define what constitutes a breaking change for this dataset 
and how changes will be communicated.]

## Known Limitations
[Document any known issues, edge cases, or limitations that 
consumers should be aware of.]

## Consumers
[List known downstream consumers of this dataset.]
```

---

## Contracts Index

| Dataset | Owner | Last Reviewed | Status |
|---|---|---|---|
| [staging.nyc_taxi](staging.nyc_taxi.md) | Platform | 2026-05-25 | Active |