"""
NYC Taxi pipeline: download from Kaggle → clean → load into staging.nyc_taxi
Run: python nyc_taxi/ingest.py
"""
import sys
import subprocess
import pandas as pd
from pathlib import Path
from db import get_engine

DATASET  = "new-york-city-taxi-fare-prediction"
DATA_DIR = Path(__file__).parent / "data"
CSV_FILE = DATA_DIR / "train.csv"
TABLE    = "nyc_taxi"
SCHEMA   = "staging"
# Limit rows for PoC — full dataset is 55M rows
SAMPLE_ROWS = 50_000


def download_data() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    if CSV_FILE.exists():
        print(f"[nyc_taxi] Data already downloaded: {CSV_FILE}")
        return
    print("[nyc_taxi] Downloading from Kaggle (this may take a moment)...")
    result = subprocess.run(
        ["kaggle", "competitions", "download", "-c", DATASET, "-p", str(DATA_DIR), "--unzip"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"[nyc_taxi] Kaggle download failed:\n{result.stderr}")
        sys.exit(1)
    print("[nyc_taxi] Download complete.")


def load_and_clean() -> pd.DataFrame:
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

    # Drop obviously bad rows
    df = df[df["fare_amount"] > 0]
    df = df[df["trip_distance"] > 0]
    df = df[df["passenger_count"].between(1, 6)]

    # Keep only columns that exist in our schema
    keep = [
        "vendor_id", "pickup_datetime", "dropoff_datetime",
        "passenger_count", "trip_distance", "pickup_longitude",
        "pickup_latitude", "rate_code_id", "store_and_fwd_flag",
        "dropoff_longitude", "dropoff_latitude", "payment_type",
        "fare_amount", "extra", "mta_tax", "tip_amount",
        "tolls_amount", "total_amount",
    ]
    df = df[[c for c in keep if c in df.columns]]
    print(f"[nyc_taxi] Cleaned dataset: {len(df):,} rows")
    return df


def ingest(df: pd.DataFrame) -> None:
    engine = get_engine()
    with engine.begin() as conn:
        conn.exec_driver_sql(f"TRUNCATE {SCHEMA}.{TABLE} RESTART IDENTITY")
    df.to_sql(TABLE, engine, schema=SCHEMA, if_exists="append", index=False, method="multi", chunksize=1000)
    print(f"[nyc_taxi] Inserted {len(df):,} rows into {SCHEMA}.{TABLE}")


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


if __name__ == "__main__":
    download_data()
    df = load_and_clean()
    ingest(df)
    run_analysis(df)
    print("[nyc_taxi] Pipeline complete ✅")
