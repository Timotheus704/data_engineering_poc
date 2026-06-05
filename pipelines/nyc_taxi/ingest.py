"""
NYC Taxi pipeline: download from Kaggle → clean → load into staging.nyc_taxi
Run: python nyc_taxi/ingest.py
"""
import argparse
import os
import sys
import subprocess
import zipfile
from uuid import uuid4
import pandas as pd
from pathlib import Path
from sqlalchemy import text
from db import get_engine
from metadata import get_watermark, update_watermark

DATASET  = "new-york-city-taxi-fare-prediction"
DATA_DIR = Path(__file__).parent / "data"
CSV_FILE = DATA_DIR / "train.csv"
TABLE    = "nyc_taxi"
SCHEMA   = "staging"
DATASET_NAME = "nyc_taxi"
WATERMARK_COLUMN = "pickup_datetime"
# Limit rows for PoC — full dataset is 55M rows
SAMPLE_ROWS = 50_000
INGEST_COLUMNS = [
    "vendor_id", "pickup_datetime", "dropoff_datetime",
    "passenger_count", "trip_distance", "pickup_longitude",
    "pickup_latitude", "rate_code_id", "store_and_fwd_flag",
    "dropoff_longitude", "dropoff_latitude", "payment_type",
    "fare_amount", "extra", "mta_tax", "tip_amount",
    "tolls_amount", "total_amount", "source_row_hash",
]


def download_data() -> None:
    """
    Download the NYC taxi dataset from Kaggle.

    Failure modes:
    - Kaggle credentials missing or expired: subprocess exits non-zero,
      sys.exit(1) is called. Pipeline halts cleanly. Resolution: refresh
      ~/.kaggle/kaggle.json and re-run.
    - Network failure mid-download: partial zip file left in DATA_DIR.
      Next run will attempt to re-download because CSV_FILE does not exist.
      The partial zip will be overwritten by the new download.
    - Disk full during extraction: zipfile.ZipFile will raise an exception.
      The partial extraction may leave inconsistent files in DATA_DIR.
      Resolution: clear DATA_DIR and re-run.
    - Kaggle dataset not accepted (terms not agreed): download fails with
      403. Resolution: accept terms at kaggle.com before running.
    """
    DATA_DIR.mkdir(exist_ok=True)
    if CSV_FILE.exists():
        print(f"[nyc_taxi] Data already downloaded: {CSV_FILE}")
        return
    print("[nyc_taxi] Downloading from Kaggle (this may take a moment)...")
    result = subprocess.run(
        ["kaggle", "competitions", "download", "-c", DATASET, "-p", str(DATA_DIR)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"[nyc_taxi] Kaggle download failed:\n{result.stderr}")
        sys.exit(1)

    zip_path = DATA_DIR / f"{DATASET}.zip"
    if zip_path.exists():
        print(f"[nyc_taxi] Extracting {zip_path}...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(DATA_DIR)
        os.remove(zip_path)
        print("[nyc_taxi] Extraction complete.")
    else:
        print(f"[nyc_taxi] Warning: Expected {zip_path} but it was not found.")


def load_and_clean() -> pd.DataFrame:
    """
    Read and clean the raw CSV into a pipeline-ready DataFrame.

    Failure modes:
    - CSV file missing: FileNotFoundError raised by pd.read_csv.
      This indicates download_data() was not called or failed silently.
      Resolution: re-run the full pipeline from download_data().
    - CSV schema mismatch (Kaggle changed column names): rename map
      produces NaN columns. Downstream filters will not apply correctly
      and source_row_hash will be computed on wrong columns.
      Detection: row count after cleaning is unexpectedly low or zero.
      Resolution: update the rename map in this function.
    - All rows filtered out: cleaning contract removes all rows.
      This produces an empty DataFrame. The ingest() function will
      truncate the staging table and load zero rows. Downstream dbt
      models will produce empty output. Great Expectations row count
      check will catch this before dbt runs.
    - Memory exhaustion on large CSV: pd.read_csv with nrows cap
      prevents this at current PoC scale. At full dataset scale
      (55M rows), chunked reading is required. See ADR 006.

    Cleaning contract (guaranteed on output DataFrame):
    - fare_amount > 0
    - trip_distance > 0
    - passenger_count between 1 and 6 inclusive
    - source_row_hash is non-null for every row
    See docs/contracts/staging.nyc_taxi.md for the full contract.
    """
    print(f"[nyc_taxi] Reading {SAMPLE_ROWS:,} rows from CSV...")
    df = pd.read_csv(CSV_FILE, nrows=SAMPLE_ROWS, parse_dates=["pickup_datetime"])

    df = df.rename(columns={
        "vendor_id":           "vendor_id",
        "pickup_datetime":     "pickup_datetime",
        "dropoff_datetime":    "dropoff_datetime",
        "passenger_count":     "passenger_count",
        "trip_distance":       "trip_distance",
        "pickup_longitude":    "pickup_longitude",
        "pickup_latitude":     "pickup_latitude",
        "rate_code":           "rate_code_id",
        "store_and_fwd_flag":  "store_and_fwd_flag",
        "dropoff_longitude":   "dropoff_longitude",
        "dropoff_latitude":    "dropoff_latitude",
        "payment_type":        "payment_type",
        "fare_amount":         "fare_amount",
        "extra":               "extra",
        "mta_tax":             "mta_tax",
        "tip_amount":          "tip_amount",
        "tolls_amount":        "tolls_amount",
        "total_amount":        "total_amount",
    })

    if "fare_amount" in df.columns:
        df = df[df["fare_amount"] > 0]
    if "trip_distance" in df.columns:
        df = df[df["trip_distance"] > 0]
    if "passenger_count" in df.columns:
        df = df[df["passenger_count"].between(1, 6)]

    keep = [
        "vendor_id", "pickup_datetime", "dropoff_datetime",
        "passenger_count", "trip_distance", "pickup_longitude",
        "pickup_latitude", "rate_code_id", "store_and_fwd_flag",
        "dropoff_longitude", "dropoff_latitude", "payment_type",
        "fare_amount", "extra", "mta_tax", "tip_amount",
        "tolls_amount", "total_amount",
    ]
    df = df[[c for c in keep if c in df.columns]]
    for column in [c for c in INGEST_COLUMNS if c != "source_row_hash"]:
        if column not in df.columns:
            df[column] = None
    df = df[[c for c in INGEST_COLUMNS if c != "source_row_hash"]]
    df["source_row_hash"] = pd.util.hash_pandas_object(
        df, index=False
    ).astype(str)
    print(f"[nyc_taxi] Cleaned dataset: {len(df):,} rows")
    return df


def filter_incremental(df: pd.DataFrame) -> pd.DataFrame:
    engine = get_engine()
    watermark = get_watermark(engine, DATASET_NAME)
    if watermark is None:
        print("[nyc_taxi] No existing watermark; incremental run will load all cleaned rows.")
        return df

    incremental_df = df[df[WATERMARK_COLUMN] > watermark].copy()
    print(
        "[nyc_taxi] Incremental watermark "
        f"{watermark.isoformat()} retained {len(incremental_df):,} of {len(df):,} cleaned rows"
    )
    return incremental_df


def ingest_full_refresh(df: pd.DataFrame) -> int:
    """
    Truncate staging.nyc_taxi and reload from DataFrame.

    Failure modes:
    - Database unavailable: SQLAlchemy raises OperationalError.
      The TRUNCATE has not yet run so the existing data is intact.
      Resolution: restore database connectivity and re-run.
    - TRUNCATE succeeds but INSERT fails: staging table is empty.
      Great Expectations row count check will catch this before
      dbt runs. The next successful run will restore the data.
      This is the accepted tradeoff of full refresh — there is a
      window between TRUNCATE and INSERT where the table is empty.
      For zero-downtime requirements, use incremental mode instead.
    - Partial INSERT (connection lost mid-batch): some rows loaded,
      some not. source_row_hash uniqueness constraint will cause
      duplicate rows to fail on re-run. Resolution: TRUNCATE manually
      and re-run the full pipeline.
    """
    engine = get_engine()
    with engine.begin() as conn:
        conn.exec_driver_sql(f"TRUNCATE {SCHEMA}.{TABLE} RESTART IDENTITY")
    df[INGEST_COLUMNS].to_sql(
        TABLE, engine, schema=SCHEMA,
        if_exists="append", index=False,
        method="multi", chunksize=1000
    )
    print(f"[nyc_taxi] Inserted {len(df):,} rows into {SCHEMA}.{TABLE}")
    return len(df)


def ingest_incremental(df: pd.DataFrame) -> int:
    if df.empty:
        print("[nyc_taxi] No rows are newer than the current watermark.")
        return 0

    engine = get_engine()
    temp_table = f"nyc_taxi_load_{uuid4().hex}"
    temp_schema = "orchestration"
    target_columns = ", ".join(INGEST_COLUMNS)
    update_columns = [column for column in INGEST_COLUMNS if column != "source_row_hash"]
    update_assignments = ", ".join(
        f"{column} = EXCLUDED.{column}" for column in update_columns
    )

    try:
        df[INGEST_COLUMNS].to_sql(
            temp_table,
            engine,
            schema=temp_schema,
            if_exists="fail",
            index=False,
            method="multi",
            chunksize=1000,
        )

        with engine.begin() as conn:
            result = conn.execute(
                text(
                    f"""
                    INSERT INTO {SCHEMA}.{TABLE} ({target_columns})
                    SELECT {target_columns}
                    FROM {temp_schema}.{temp_table}
                    ON CONFLICT (source_row_hash)
                    DO UPDATE SET {update_assignments}
                    """
                )
            )
        rows_loaded = result.rowcount if result.rowcount is not None else len(df)
    finally:
        with engine.begin() as conn:
            conn.execute(text(f"DROP TABLE IF EXISTS {temp_schema}.{temp_table}"))

    print(f"[nyc_taxi] Upserted {rows_loaded:,} rows into {SCHEMA}.{TABLE}")
    return rows_loaded


def ingest(df: pd.DataFrame, mode: str) -> int:
    if mode == "incremental":
        filtered_df = filter_incremental(df)
        rows_loaded = ingest_incremental(filtered_df)
    else:
        filtered_df = df
        rows_loaded = ingest_full_refresh(filtered_df)

    if not filtered_df.empty:
        watermark = filtered_df[WATERMARK_COLUMN].max()
        update_watermark(
            get_engine(),
            DATASET_NAME,
            watermark.to_pydatetime(),
            rows_loaded,
            os.getenv("AIRFLOW_RUN_ID", "manual"),
        )
        print(f"[nyc_taxi] Updated watermark to {watermark.isoformat()}")

    return rows_loaded


def run_analysis(df: pd.DataFrame) -> None:
    import matplotlib.pyplot as plt

    reports = Path(__file__).parent.parent / "reports"
    reports.mkdir(exist_ok=True)

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    fig.suptitle("NYC Taxi — Trip Analysis")

    df["fare_amount"].clip(0, 60).hist(bins=40, ax=axes[0], color="darkorange", edgecolor="white")
    axes[0].set_title("Fare Distribution (capped $60)")
    axes[0].set_xlabel("Fare ($)")

    df["trip_distance"].clip(0, 20).hist(bins=40, ax=axes[1], color="steelblue", edgecolor="white")
    axes[1].set_title("Trip Distance Distribution (capped 20mi)")
    axes[1].set_xlabel("Miles")

    out = reports / "nyc_taxi_analysis.png"
    fig.savefig(out, dpi=120, bbox_inches="tight")
    print(f"[nyc_taxi] Saved chart to {out}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest NYC taxi data into Postgres.")
    parser.add_argument(
        "--mode",
        choices=["full-refresh", "incremental"],
        default=os.getenv("INGEST_MODE", "full-refresh"),
        help="Load strategy. Defaults to INGEST_MODE or full-refresh.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    download_data()
    df = load_and_clean()
    rows = ingest(df, args.mode)
    run_analysis(df)
    print(f"[nyc_taxi] Pipeline complete: mode={args.mode}, rows_loaded={rows:,}")
