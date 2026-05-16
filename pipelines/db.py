"""Shared database connection helper for all pipeline scripts."""
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, Engine

load_dotenv()


def get_engine() -> Engine:
    host     = os.getenv("POSTGRES_HOST", "postgres")
    port     = os.getenv("POSTGRES_PORT", "5432")
    user     = os.getenv("POSTGRES_USER", "poc_user")
    password = os.getenv("POSTGRES_PASSWORD", "poc_password")
    db       = os.getenv("POSTGRES_DB", "poc_db")

    url = f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db}"
    return create_engine(url, pool_pre_ping=True)
