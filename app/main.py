"""Web API and dashboard for the student engagement classifier.

Run locally:  uvicorn app.main:app --host 0.0.0.0 --port 8000   (from the project root)
"""
from __future__ import annotations

import asyncio
import json
import os
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from src import database as db
from src import retraining
from src.preprocessing import CLASS_NAMES, prepare_upload

APP_DIR = Path(__file__).parent
CONTAINER = socket.gethostname()
STARTED_AT = time.time()
RETRAIN_THRESHOLD = int(os.environ.get("RETRAIN_THRESHOLD", "200"))
MAX_UPLOAD_FILES = int(os.environ.get("MAX_UPLOAD_FILES", "500"))
MAX_FILE_BYTES = 15 * 1024 * 1024
MODEL_EXECUTOR = ThreadPoolExecutor(max_workers=int(os.environ.get("PREDICT_CONCURRENCY", "1")),
                                    thread_name_prefix="model")


async def run_model(fn, *args):
    return await asyncio.get_running_loop().run_in_executor(MODEL_EXECUTOR, fn, *args)

state = {"predictor": None, "model_error": None, "requests": 0, "predictions": 0, "latency_total_ms": 0.0}


def load_predictor() -> None:
    try:
        from src.prediction import EngagementPredictor
        state["predictor"] = EngagementPredictor()
        state["model_error"] = None
    except Exception as exc:  # the dashboard shows the reason instead of the app crashing
        state["predictor"], state["model_error"] = None, f"{type(exc).__name__}: {exc}"


def get_predictor():
    predictor = state["predictor"]
    if predictor is None:
        load_predictor()
        predictor = state["predictor"]
    if predictor is not None:
        predictor.reload_if_changed()
    return predictor


def error(message: str, status: int) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)


# ---------------------------------------------------------------- status and insights
async def health(request: Request):
    predictor = state["predictor"]
    if predictor is not None:
        await run_in_threadpool(predictor.reload_if_changed)
    uptime = time.time() - STARTED_AT
    served = state["predictions"]
    return JSONResponse({
        "status": "ok" if predictor is not None else "degraded",
        "container": CONTAINER,
        "started_at": datetime.fromtimestamp(STARTED_AT, timezone.utc).isoformat(timespec="seconds"),
        "uptime_seconds": round(uptime),
        "model_loaded": predictor is not None,
        "model_version": predictor.version if predictor else None,
        "model_error": state["model_error"],
        "requests_served": state["requests"],
        "predictions_served": served,
        "avg_prediction_ms": round(state["latency_total_ms"] / served, 1) if served else None,
    })


async def model_info(request: Request):
    predictor = get_predictor()
    if predictor is None:
        return error(state["model_error"] or "model not loaded", 503)
    return JSONResponse(predictor.metadata)


async def insights(request: Request):
    summary_file = Path("outputs/dataset_summary.json")
    payload = json.loads(summary_file.read_text()) if summary_file.exists() else {}
    experiments_file = Path("outputs/experiments.csv")
    if experiments_file.exists():
        exp = pd.read_csv(experiments_file).drop_duplicates("config_id", keep="last")
        cols = [c for c in ["name", "epochs_run", "train_minutes", "train_accuracy_last", "val_accuracy",
                            "val_precision", "val_recall", "val_f1", "val_roc_auc", "val_loss"] if c in exp]
        payload["experiments"] = exp[cols].round(4).to_dict(orient="records")
    return JSONResponse(payload)


async def stats(request: Request):
    data = await run_in_threadpool(lambda: {
        "uploads": db.upload_counts(),
        "predictions": db.prediction_summary(10),
        "retraining": db.retrain_history(10),
    })
    data["retrain_threshold"] = RETRAIN_THRESHOLD
    data["min_new_per_class"] = retraining.MIN_NEW_PER_CLASS
    return JSONResponse(data)


# ---------------------------------------------------------------- prediction
async def predict(request: Request):
    form = await request.form(max_files=1, max_part_size=MAX_FILE_BYTES)
    upload = form.get("file")
    if upload is None or not hasattr(upload, "read"):
        return error("send one image in the form field 'file'", 400)
    raw = await upload.read()
    predictor = await run_model(get_predictor)
    if predictor is None:
        return error(state["model_error"] or "model not loaded", 503)

    start = time.perf_counter()
    try:
        result = await run_model(predictor.predict, raw)
    except Exception:
        return error("could not read this file as an image", 400)
    latency_ms = (time.perf_counter() - start) * 1000

    state["predictions"] += 1
    state["latency_total_ms"] += latency_ms
    await run_in_threadpool(db.log_prediction, upload.filename, result["label"],
                            result["probability_engaged"], round(latency_ms, 1), result["model_version"], CONTAINER)
    return JSONResponse({**result, "filename": upload.filename, "latency_ms": round(latency_ms, 1),
                         "container": CONTAINER})


# ---------------------------------------------------------------- upload and retraining
def start_retraining(trigger: str) -> tuple[int | None, str | None]:
    reason = retraining.check_ready()
    if reason:
        return None, reason
    run_id = db.start_run(trigger, CONTAINER)
    if run_id is None:
        return None, "a retraining run is already in progress"

    def worker():
        try:
            result = retraining.run_retraining(run_id)
            db.finish_run(run_id, "done", result)
            predictor = state["predictor"]
            if predictor is not None:
                predictor.reload_if_changed()
        except Exception as exc:
            db.finish_run(run_id, "failed", error=f"{type(exc).__name__}: {exc}")

    threading.Thread(target=worker, name=f"retrain-{run_id}", daemon=True).start()
    return run_id, None


async def upload(request: Request):
    form = await request.form(max_files=MAX_UPLOAD_FILES, max_part_size=MAX_FILE_BYTES)
    label = form.get("label")
    if label not in CLASS_NAMES:
        return error(f"label must be one of {CLASS_NAMES}", 400)
    files = [f for f in form.getlist("files") if hasattr(f, "read")]
    if not files:
        return error("send one or more images in the form field 'files'", 400)

    saved, duplicates, rejected = 0, 0, []
    for f in files:
        raw = await f.read()
        try:
            image, info = await run_in_threadpool(prepare_upload, raw)
        except ValueError as exc:
            rejected.append({"file": f.filename, "reason": str(exc)})
            continue
        stored = await run_in_threadpool(db.save_upload, f.filename, label, CLASS_NAMES.index(label),
                                         info["md5"], image, info["original_width"], info["original_height"])
        saved += stored
        duplicates += not stored

    counts = await run_in_threadpool(db.upload_counts)
    auto_run = None
    if counts["waiting"] >= RETRAIN_THRESHOLD:
        auto_run, _ = await run_in_threadpool(start_retraining, "automatic")
    return JSONResponse({
        "label": label, "received": len(files), "saved": saved, "duplicates_skipped": duplicates,
        "rejected": rejected, "waiting_for_retraining": counts["waiting"],
        "preprocessing": "checked readable, EXIF orientation fixed, minimum 64 px, converted to RGB, "
                         "resized to 256x256, stored as JPEG in the database, duplicates removed by hash",
        "automatic_retraining_started": auto_run,
    })


async def retrain(request: Request):
    run_id, reason = await run_in_threadpool(start_retraining, "button")
    if run_id is None:
        status = 409 if "in progress" in reason else 400
        return error(reason, status)
    return JSONResponse({"run_id": run_id, "status": "running"}, status_code=202)


async def retrain_status(request: Request):
    history = await run_in_threadpool(db.retrain_history, 1)
    return JSONResponse(history[0] if history else {"status": "never run"})


# ---------------------------------------------------------------- evaluation in production
async def evaluate(request: Request):
    """Score the model currently in production on the held-out labelled images in data/test."""
    from src.model import classification_metrics
    import numpy as np

    predictor = await run_model(get_predictor)
    if predictor is None:
        return error(state["model_error"] or "model not loaded", 503)
    files = [p for p in sorted(Path("data/test").glob("*/*")) if p.parent.name in CLASS_NAMES]
    if not files:
        return error("no labelled images in data/test", 400)

    start = time.perf_counter()
    results = []
    for i in range(0, len(files), 32):
        results += await run_model(predictor.predict_batch, files[i:i + 32])
    y_true = np.array([CLASS_NAMES.index(p.parent.name) for p in files])
    proba = np.array([r["probability_engaged"] for r in results])
    metrics = classification_metrics(y_true, proba, predictor.threshold)
    return JSONResponse({
        "model_version": predictor.version, "images": len(files),
        "seconds": round(time.perf_counter() - start, 2),
        "metrics": {k: round(float(v), 4) for k, v in metrics.items()},
        "predictions": [{"file": p.name, "true": p.parent.name, **r} for p, r in zip(files, results)],
    })


# ---------------------------------------------------------------- app
async def index(request: Request):
    return FileResponse(APP_DIR / "static" / "index.html")


class CountRequests:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            state["requests"] += 1
        await self.app(scope, receive, send)


@asynccontextmanager
async def lifespan(app):
    db.init_db()
    await run_in_threadpool(load_predictor)
    yield


routes = [
    Route("/", index),
    Route("/api/health", health),
    Route("/api/model", model_info),
    Route("/api/insights", insights),
    Route("/api/stats", stats),
    Route("/api/predict", predict, methods=["POST"]),
    Route("/api/upload", upload, methods=["POST"]),
    Route("/api/retrain", retrain, methods=["POST"]),
    Route("/api/retrain/status", retrain_status),
    Route("/api/evaluate", evaluate, methods=["POST"]),
    Mount("/static", StaticFiles(directory=APP_DIR / "static"), name="static"),
]
app = CountRequests(Starlette(routes=routes, lifespan=lifespan))
