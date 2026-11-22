"""Retraining pipeline used by the API: database uploads -> preprocessing -> fine-tune the
saved model -> evaluate on held-out images -> promote or keep the old model."""
from __future__ import annotations

import os
import shutil
from pathlib import Path

import pandas as pd

from . import database as db
from .preprocessing import CLASS_NAMES

DATA_DIR = Path("data")
VALIDATION_DIR = DATA_DIR / "test"       # labelled images never used for training
WORK_DIR = DATA_DIR / "_retrain"
MIN_NEW_PER_CLASS = int(os.environ.get("MIN_NEW_PER_CLASS", "5"))


def labelled_folder(folder: Path, root: Path) -> pd.DataFrame:
    rows = [{"relpath": p.relative_to(root).as_posix(), "label": p.parent.name,
             "label_id": CLASS_NAMES.index(p.parent.name)}
            for p in sorted(folder.glob("*/*")) if p.parent.name in CLASS_NAMES
            and p.suffix.lower() in {".jpg", ".jpeg", ".png"}]
    return pd.DataFrame(rows, columns=["relpath", "label", "label_id"])


def check_ready() -> str | None:
    """Return a reason why retraining cannot start, or None if it can."""
    counts = db.upload_counts()["by_label"]
    missing = [c for c in CLASS_NAMES if counts.get(c, {}).get("waiting", 0) < MIN_NEW_PER_CLASS]
    if missing:
        return (f"Need at least {MIN_NEW_PER_CLASS} new images of each class; "
                f"not enough for: {', '.join(missing)}")
    if labelled_folder(VALIDATION_DIR, DATA_DIR).empty:
        return f"No validation images found in {VALIDATION_DIR}/<class>/"
    return None


def export_uploads(rows, folder: Path) -> pd.DataFrame:
    """Write stored images to disk so the same tf.data pipeline as the notebook can read them."""
    records = []
    for r in rows:
        path = folder / r["label"] / f"{r['id']}.jpg"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(r["image"])
        records.append({"id": r["id"], "relpath": path.relative_to(DATA_DIR).as_posix(),
                        "label": r["label"], "label_id": r["label_id"]})
    return pd.DataFrame(records, columns=["id", "relpath", "label", "label_id"])


def run_retraining(run_id: int, epochs: int = 5) -> dict:
    """Fine-tune the production model on images waiting in the database.

    New images are combined with images from earlier retraining runs (replay) so the
    model keeps what it learnt before. The model is compared with the previous
    version on data/test, and replaces it only if F1 does not drop by more than 0.05.
    """
    from .model import retrain

    work = WORK_DIR / f"run_{run_id}"
    try:
        new_rows, old_rows = db.fetch_uploads(waiting=True), db.fetch_uploads(waiting=False)
        new_df = export_uploads(new_rows, work / "new")
        replay_df = export_uploads(old_rows, work / "replay")
        val_df = labelled_folder(VALIDATION_DIR, DATA_DIR)

        result = retrain(new_df=new_df, val_df=val_df, data_root=DATA_DIR,
                         replay_df=replay_df if len(replay_df) else None, replay_size=1000,
                         fine_tune_layers=30, lr=1e-5, epochs=epochs, batch_size=16, min_gain=-0.05)

        db.mark_uploads_used(new_df["id"].tolist(), run_id)
        from .model import METADATA_PATH
        import json
        result.update({"new_images": len(new_df), "replay_images": len(replay_df),
                       "validation_images": len(val_df),
                       "model_version": json.loads(METADATA_PATH.read_text())["version"]})
        return result
    finally:
        shutil.rmtree(work, ignore_errors=True)
