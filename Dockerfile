FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TF_CPP_MIN_LOG_LEVEL=2

WORKDIR /app

COPY requirements-app.txt .
RUN pip install --no-cache-dir -r requirements-app.txt

COPY src/ src/
COPY app/ app/
COPY data/test/ data/test/
COPY outputs/dataset_summary.json outputs/experiments.csv outputs/
ADD https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js app/static/chart.umd.min.js
RUN chmod 644 app/static/chart.umd.min.js

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=4)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
