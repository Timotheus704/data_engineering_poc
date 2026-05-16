FROM python:3.11-slim

WORKDIR /pipelines

# System deps for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Default overridden per service in docker-compose
CMD ["python", "--version"]
