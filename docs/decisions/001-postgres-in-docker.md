# ADR 001 — Run Postgres in Docker, not locally installed

**Status:** Accepted  
**Date:** Project inception

---

## Context

The project needs a relational database. There are several ways to provide one for local development:

1. Install Postgres directly on the developer's machine
2. Use a managed cloud database (e.g. AWS RDS, Supabase)
3. Run Postgres in a Docker container

## Decision

Run Postgres in a Docker container managed by Docker Compose.

## Reasons

**No local installation required.** Developers on macOS can have different Postgres versions installed via Homebrew, Postgres.app, or system packages. Version mismatches cause subtle bugs. Docker guarantees everyone uses the same version (16-alpine).

**Identical to CI.** GitHub Actions also spins up a Postgres Docker container. Development and CI use exactly the same image, the same configuration, the same schema. This eliminates the "works on my machine" problem.

**Isolated.** The database runs in its own network namespace. It does not interfere with any existing Postgres installations on the developer's Mac. The data volume is separate from the host filesystem and can be reset cleanly with `docker compose down -v`.

**Portable.** Any machine with Docker Desktop can run this project without any database-specific setup. This lowers the barrier for new contributors significantly.

**Reproducible.** The Postgres image version is pinned (`postgres:16-alpine`). Combined with the migration files, any developer can always recreate the exact database state.

## Trade-offs

**Docker Desktop is required.** This is a non-trivial install (~500MB). For developers who already have Docker, this is no burden. For those who don't, it is a one-time setup.

**Data is lost on `docker compose down -v`.** The named volume `postgres_data` is deleted when the `-v` flag is used. This is intentional for fresh starts but requires re-running pipelines or seeds to restore data.

**Local psql tools aren't automatically available.** Developers who want to use `psql` from the terminal need to install it separately (`brew install libpq`). However, the TypeScript CLI covers most query needs.

## Alternatives considered

**Locally installed Postgres:** Rejected because of version inconsistency across developer machines and the overhead of manual configuration.

**Cloud database:** Rejected for local development because it requires internet connectivity, introduces latency, and raises concerns about accidentally sharing credentials or corrupting shared data.
