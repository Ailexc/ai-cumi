# ---- Builder ----
FROM python:3.12-slim AS builder

RUN pip install --no-cache-dir --upgrade pip

WORKDIR /build
COPY server/requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /build/wheels -r requirements.txt

# ---- Production ----
FROM python:3.12-slim AS production

RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

COPY --from=builder /build/wheels /wheels
RUN pip install --no-cache-dir /wheels/*.whl

COPY server/app /app/app
COPY server/run.py /app/run.py
COPY server/start.sh /app/start.sh

# Ensure data directory exists for SQLite
RUN mkdir -p /app/data && chown -R appuser:appuser /app

USER appuser

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
