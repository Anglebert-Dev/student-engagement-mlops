from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

DB_PATH = Path(os.environ.get("DB_PATH", "storage/engagement.db"))
STALE_RUN_MINUTES = 60

SCHEMA = """
CREATE TABLE IF NOT EXISTS uploads (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    filename        TEXT NOT NULL,
    label           TEXT NOT NULL,
    label_id        INTEGER NOT NULL,
    md5             TEXT NOT NULL UNIQUE,
    original_width  INTEGER,
    original_height INTEGER,
    image           BLOB NOT NULL,
    uploaded_at     TEXT NOT NULL,
    used_in_run     INTEGER
);
CREATE TABLE IF NOT EXISTS predictions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at      TEXT NOT NULL,
    filename        TEXT,
    label           TEXT NOT NULL,
    probability     REAL NOT NULL,
    latency_ms      REAL NOT NULL,
    model_version   INTEGER,
    container       TEXT
);
CREATE TABLE IF NOT EXISTS retrain_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at      TEXT NOT NULL,
    finished_at     TEXT,
    status          TEXT NOT NULL,
    trigger_type    TEXT NOT NULL,
    container       TEXT,
    new_images      INTEGER,
    train_images    INTEGER,
    promoted        INTEGER,
    model_version   INTEGER,
    result          TEXT,
    error           TEXT
);
CREATE INDEX IF NOT EXISTS idx_uploads_unused ON uploads(used_in_run);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect(path: Path = DB_PATH):
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


def save_upload(filename: str, label: str, label_id: int, md5: str, image: bytes,
                width: int, height: int) -> bool:
    with connect() as conn:
        cur = conn.execute(
            "INSERT OR IGNORE INTO uploads (filename, label, label_id, md5, original_width, "
            "original_height, image, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (filename, label, label_id, md5, width, height, image, now()))
        return cur.rowcount == 1


def upload_counts() -> dict:
    with connect() as conn:
        rows = conn.execute(
            "SELECT label, COUNT(*) AS total, SUM(used_in_run IS NULL) AS waiting "
            "FROM uploads GROUP BY label").fetchall()
    counts = {r["label"]: {"total": r["total"], "waiting": r["waiting"] or 0} for r in rows}
    return {"by_label": counts,
            "total": sum(c["total"] for c in counts.values()),
            "waiting": sum(c["waiting"] for c in counts.values())}


def fetch_uploads(waiting: bool) -> list[sqlite3.Row]:
    condition = "used_in_run IS NULL" if waiting else "used_in_run IS NOT NULL"
    with connect() as conn:
        return conn.execute(f"SELECT id, filename, label, label_id, image FROM uploads "
                            f"WHERE {condition} ORDER BY id").fetchall()


def mark_uploads_used(ids: list[int], run_id: int) -> None:
    with connect() as conn:
        conn.executemany("UPDATE uploads SET used_in_run = ? WHERE id = ?", [(run_id, i) for i in ids])


def log_prediction(filename: str, label: str, probability: float, latency_ms: float,
                   model_version: int, container: str) -> None:
    with connect() as conn:
        conn.execute("INSERT INTO predictions (created_at, filename, label, probability, latency_ms, "
                     "model_version, container) VALUES (?, ?, ?, ?, ?, ?, ?)",
                     (now(), filename, label, probability, latency_ms, model_version, container))


def prediction_summary(limit: int = 10) -> dict:
    with connect() as conn:
        agg = conn.execute("SELECT COUNT(*) AS n, AVG(latency_ms) AS avg_ms FROM predictions").fetchone()
        recent = conn.execute("SELECT created_at, filename, label, probability, latency_ms, model_version, "
                              "container FROM predictions ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return {"count": agg["n"], "avg_latency_ms": round(agg["avg_ms"] or 0, 1),
            "recent": [dict(r) for r in recent]}


def start_run(trigger_type: str, container: str) -> int | None:
    """Returns None if a run is already active. Runs stuck for over an hour are marked failed first."""
    stale_before = (datetime.now(timezone.utc) - timedelta(minutes=STALE_RUN_MINUTES)).isoformat(timespec="seconds")
    with connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.execute("UPDATE retrain_runs SET status='failed', error='stopped without finishing', "
                         "finished_at=? WHERE status='running' AND started_at < ?", (now(), stale_before))
            active = conn.execute("SELECT id FROM retrain_runs WHERE status='running'").fetchone()
            if active:
                conn.execute("ROLLBACK")
                return None
            cur = conn.execute("INSERT INTO retrain_runs (started_at, status, trigger_type, container) "
                               "VALUES (?, 'running', ?, ?)", (now(), trigger_type, container))
            conn.execute("COMMIT")
            return cur.lastrowid
        except Exception:
            conn.execute("ROLLBACK")
            raise


def finish_run(run_id: int, status: str, result: dict | None = None, error: str | None = None) -> None:
    result = result or {}
    with connect() as conn:
        conn.execute("UPDATE retrain_runs SET finished_at=?, status=?, new_images=?, train_images=?, "
                     "promoted=?, model_version=?, result=?, error=? WHERE id=?",
                     (now(), status, result.get("new_images"), result.get("train_images"),
                      None if "promoted" not in result else int(result["promoted"]),
                      result.get("model_version"), json.dumps(result, default=float), error, run_id))


def retrain_history(limit: int = 10) -> list[dict]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM retrain_runs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    history = []
    for r in rows:
        item = dict(r)
        item["result"] = json.loads(item["result"]) if item["result"] else None
        history.append(item)
    return history
