"""
Titanic pipeline: download from Kaggle → clean → load into staging.titanic
Run: python titanic/ingest.py
"""
import os
import sys
import subprocess
import zipfile
import pandas as pd
from pathlib import Path
from db import get_engine

DATASET   = "titanic"            # kaggle competitions dataset name
DATA_DIR  = Path(__file__).parent / "data"
CSV_FILE  = DATA_DIR / "train.csv"
TABLE     = "titanic"
SCHEMA    = "staging"


def download_data() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    if CSV_FILE.exists():
        print(f"[titanic] Data already downloaded: {CSV_FILE}")
        return
    print("[titanic] Downloading from Kaggle...")
    result = subprocess.run(
        ["kaggle", "competitions", "download", "-c", DATASET, "-p", str(DATA_DIR)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"[titanic] Kaggle download failed:\n{result.stderr}")
        sys.exit(1)

    # Manually unzip to avoid CLI version dependency issues
    zip_path = DATA_DIR / f"{DATASET}.zip"
    if zip_path.exists():
        print(f"[titanic] Extracting {zip_path}...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(DATA_DIR)
        os.remove(zip_path)
        print("[titanic] Extraction complete.")
    else:
        print(f"[titanic] Warning: Expected {zip_path} but it was not found.")


def load_and_clean() -> pd.DataFrame:
    df = pd.read_csv(CSV_FILE)
    # Normalize column names to match DB schema
    df = df.rename(columns={
        "PassengerId": "passenger_id",
        "Survived":    "survived",
        "Pclass":      "pclass",
        "Name":        "name",
        "Sex":         "sex",
        "Age":         "age",
        "SibSp":       "sib_sp",
        "Parch":       "parch",
        "Ticket":      "ticket",
        "Fare":        "fare",
        "Cabin":       "cabin",
        "Embarked":    "embarked",
    })
    df["age"]     = pd.to_numeric(df["age"],  errors="coerce")
    df["fare"]    = pd.to_numeric(df["fare"], errors="coerce")
    df["cabin"]   = df["cabin"].where(df["cabin"].notna(), None)
    df["embarked"] = df["embarked"].where(df["embarked"].notna(), None)
    print(f"[titanic] Loaded {len(df)} rows, {df['survived'].sum()} survivors")
    return df


def ingest(df: pd.DataFrame) -> None:
    engine = get_engine()
    with engine.begin() as conn:
        # Truncate first for idempotent re-runs
        conn.exec_driver_sql(f"TRUNCATE {SCHEMA}.{TABLE} RESTART IDENTITY")
    df.to_sql(TABLE, engine, schema=SCHEMA, if_exists="append", index=False, method="multi", chunksize=500)
    print(f"[titanic] Inserted {len(df)} rows into {SCHEMA}.{TABLE}")


def run_analysis(df: pd.DataFrame) -> None:
    import matplotlib.pyplot as plt
    import seaborn as sns

    reports = Path(__file__).parent.parent / "reports"
    reports.mkdir(exist_ok=True)

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    fig.suptitle("Titanic — Survival Analysis")

    sns.barplot(data=df, x="pclass", y="survived", hue="sex", ax=axes[0])
    axes[0].set_title("Survival Rate by Class & Sex")
    axes[0].set_ylabel("Survival Rate")

    df["age"].dropna().hist(bins=30, ax=axes[1], color="steelblue", edgecolor="white")
    axes[1].set_title("Age Distribution")
    axes[1].set_xlabel("Age")

    out = reports / "titanic_analysis.png"
    fig.savefig(out, dpi=120, bbox_inches="tight")
    print(f"[titanic] Saved chart to {out}")


if __name__ == "__main__":
    download_data()
    df = load_and_clean()
    ingest(df)
    run_analysis(df)
    print("[titanic] Pipeline complete ✅")
