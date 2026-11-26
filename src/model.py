from __future__ import annotations

import hashlib
import json
import os
import random
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score, log_loss,
                             precision_score, recall_score, roc_auc_score)

from .preprocessing import CLASS_NAMES, IMG_SIZE, SEED, make_tf_dataset

MODEL_PATH = Path("models/engagement_mobilenetv2.h5")
METADATA_PATH = Path("models/model_metadata.json")


def set_seeds(seed: int = SEED) -> None:
    import tensorflow as tf
    os.environ["PYTHONHASHSEED"] = str(seed)
    random.seed(seed)
    np.random.seed(seed)
    tf.random.set_seed(seed)


def config_id(cfg: dict) -> str:
    return hashlib.md5(json.dumps(cfg, sort_keys=True).encode()).hexdigest()[:10]


def get_backbone(model):
    import keras
    return next(layer for layer in model.layers if isinstance(layer, keras.Model))


def build_model(cfg: dict):
    import keras
    from keras import layers, regularizers

    inputs = keras.Input(shape=(IMG_SIZE, IMG_SIZE, 3), name="image")
    x = inputs
    if cfg.get("augment"):
        x = layers.RandomFlip("horizontal", seed=SEED)(x)
        x = layers.RandomRotation(0.05, seed=SEED)(x)
        x = layers.RandomZoom(0.1, seed=SEED)(x)
        x = layers.RandomContrast(0.1, seed=SEED)(x)
    x = layers.Rescaling(1.0 / 127.5, offset=-1.0)(x)
    backbone = keras.applications.MobileNetV2(input_shape=(IMG_SIZE, IMG_SIZE, 3),
                                              include_top=False, weights="imagenet")
    backbone.trainable = False
    x = backbone(x, training=False)  # keeps BatchNorm in inference mode, also when fine-tuning
    x = layers.GlobalAveragePooling2D()(x)
    if cfg.get("dropout", 0) > 0:
        x = layers.Dropout(cfg["dropout"], seed=SEED)(x)
    outputs = layers.Dense(1, activation="sigmoid", name="engaged_probability",
                           kernel_regularizer=regularizers.l2(cfg.get("l2", 0.0)))(x)
    return keras.Model(inputs, outputs, name="engagement_classifier")


def make_optimizer(name: str, lr: float):
    import keras
    if name == "sgd":
        return keras.optimizers.SGD(learning_rate=lr, momentum=0.9)
    return keras.optimizers.Adam(learning_rate=lr)


def compile_model(model, optimizer: str, lr: float) -> None:
    import keras
    model.compile(optimizer=make_optimizer(optimizer, lr),
                  loss="binary_crossentropy",
                  metrics=[keras.metrics.BinaryAccuracy(name="accuracy"),
                           keras.metrics.Precision(name="precision"),
                           keras.metrics.Recall(name="recall"),
                           keras.metrics.AUC(name="auc")])


def unfreeze_top(model, n_layers: int) -> None:
    """BatchNorm layers stay frozen so small batches do not disturb their ImageNet statistics."""
    import keras
    backbone = get_backbone(model)
    backbone.trainable = True
    for layer in backbone.layers[:-n_layers]:
        layer.trainable = False
    for layer in backbone.layers:
        if isinstance(layer, keras.layers.BatchNormalization):
            layer.trainable = False


def callbacks(patience: int, log_dir: Path | None = None):
    import keras
    cbs = [keras.callbacks.EarlyStopping(monitor="val_loss", patience=patience,
                                         restore_best_weights=True),
           keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5,
                                             patience=max(1, patience // 2), min_lr=1e-7)]
    if log_dir is not None:
        cbs.append(keras.callbacks.TensorBoard(log_dir=str(log_dir)))
    return cbs


def history_frame(*histories) -> pd.DataFrame:
    frames = [pd.DataFrame(h.history) for h in histories if h is not None]
    df = pd.concat(frames, ignore_index=True)
    df.insert(0, "epoch", np.arange(1, len(df) + 1))
    return df


def predict_proba(model, ds) -> np.ndarray:
    return model.predict(ds, verbose=0).ravel()


def best_threshold(y_true, proba) -> float:
    grid = np.round(np.arange(0.05, 0.96, 0.01), 2)
    scores = [f1_score(y_true, (proba >= t).astype(int), zero_division=0) for t in grid]
    return float(grid[int(np.argmax(scores))])


def classification_metrics(y_true, proba, threshold: float = 0.5) -> dict:
    y_true = np.asarray(y_true)
    pred = (proba >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, pred, labels=[0, 1]).ravel()
    return {
        "accuracy": accuracy_score(y_true, pred),
        "precision": precision_score(y_true, pred, zero_division=0),
        "recall": recall_score(y_true, pred, zero_division=0),
        "f1": f1_score(y_true, pred, zero_division=0),
        "roc_auc": roc_auc_score(y_true, proba),
        "loss": log_loss(y_true, np.clip(proba, 1e-7, 1 - 1e-7), labels=[0, 1]),
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp),
    }


def run_experiment(cfg: dict, train_df: pd.DataFrame, val_df: pd.DataFrame, data_root: str | Path,
                   results_csv: str | Path = "outputs/experiments.csv",
                   model_dir: str | Path = "models/experiments",
                   log_root: str | Path = "outputs/logs") -> dict:
    """Runs whose settings already finished are skipped."""
    import keras

    cid = config_id(cfg)
    results_csv, model_dir = Path(results_csv), Path(model_dir)
    model_file = model_dir / f"{cfg['name']}_{cid}.h5"
    if results_csv.exists() and model_file.exists():
        previous = pd.read_csv(results_csv)
        done = previous[previous["config_id"] == cid]
        if len(done):
            print(f"{cfg['name']}: already trained, loading saved result")
            return done.iloc[-1].to_dict()

    set_seeds()
    root = Path(data_root)
    train_ds = make_tf_dataset([root / p for p in train_df["relpath"]], train_df["label_id"],
                               batch_size=cfg["batch_size"], shuffle=True)
    val_ds = make_tf_dataset([root / p for p in val_df["relpath"]], val_df["label_id"],
                             batch_size=cfg["batch_size"])

    start = time.time()
    model = build_model(cfg)
    compile_model(model, cfg["optimizer"], cfg["lr"])
    log_dir = Path(log_root) / f"{cfg['name']}_{cid}"
    h1 = model.fit(train_ds, validation_data=val_ds, epochs=cfg["head_epochs"],
                   callbacks=callbacks(cfg["patience"], log_dir), verbose=2)
    h2 = None
    if cfg.get("fine_tune_layers", 0) > 0:
        unfreeze_top(model, cfg["fine_tune_layers"])
        compile_model(model, cfg["optimizer"], cfg["fine_tune_lr"])
        h2 = model.fit(train_ds, validation_data=val_ds, epochs=cfg["fine_tune_epochs"],
                       callbacks=callbacks(cfg["patience"], log_dir), verbose=2)
    minutes = (time.time() - start) / 60

    model_dir.mkdir(parents=True, exist_ok=True)
    model.save(model_file)
    history = history_frame(h1, h2)
    history.to_csv(model_dir / f"{cfg['name']}_{cid}_history.csv", index=False)

    val_proba = predict_proba(model, val_ds)
    metrics = classification_metrics(val_df["label_id"], val_proba)
    row = {"name": cfg["name"], "config_id": cid, **{f"cfg_{k}": v for k, v in cfg.items() if k != "name"},
           "epochs_run": len(history), "train_minutes": round(minutes, 1),
           "train_accuracy_last": history["accuracy"].iloc[-1],
           **{f"val_{k}": v for k, v in metrics.items()}, "model_file": str(model_file)}
    results_csv.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame([row]).to_csv(results_csv, mode="a", header=not results_csv.exists(), index=False)
    keras.backend.clear_session()
    return row


def save_production_model(model_file: str | Path, threshold: float, metrics: dict,
                          version: int = 1, extra: dict | None = None) -> dict:
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    # Copy then rename, so a container reading the model never sees a half-written file.
    # Metadata is written last: other containers reload when it changes.
    tmp_model = MODEL_PATH.with_name(MODEL_PATH.stem + ".tmp.h5")
    shutil.copy(model_file, tmp_model)
    os.replace(tmp_model, MODEL_PATH)
    metadata = {"version": version, "class_names": CLASS_NAMES, "positive_class": CLASS_NAMES[1],
                "img_size": IMG_SIZE, "threshold": threshold,
                "metrics": {k: float(v) for k, v in metrics.items()},
                "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                **(extra or {})}
    tmp_meta = METADATA_PATH.with_suffix(".tmp")
    tmp_meta.write_text(json.dumps(metadata, indent=2))
    os.replace(tmp_meta, METADATA_PATH)
    return metadata


def retrain(new_df: pd.DataFrame, val_df: pd.DataFrame, data_root: str | Path,
            replay_df: pd.DataFrame | None = None, replay_size: int = 1000,
            fine_tune_layers: int = 30, lr: float = 1e-5, epochs: int = 5,
            batch_size: int = 32, min_gain: float = -0.01) -> dict:
    """The new model replaces the old one only if its F1 has not dropped by more than |min_gain|."""
    import keras

    set_seeds()
    root = Path(data_root)
    metadata = json.loads(METADATA_PATH.read_text())
    old_model = keras.models.load_model(MODEL_PATH)

    val_ds = make_tf_dataset([root / p for p in val_df["relpath"]], val_df["label_id"], batch_size=batch_size)
    old_proba = predict_proba(old_model, val_ds)
    old_metrics = classification_metrics(val_df["label_id"], old_proba, metadata["threshold"])

    train_part = new_df
    if replay_df is not None and len(replay_df):
        replay = replay_df.sample(min(replay_size, len(replay_df)), random_state=SEED)
        train_part = pd.concat([new_df, replay], ignore_index=True)
    train_ds = make_tf_dataset([root / p for p in train_part["relpath"]], train_part["label_id"],
                               batch_size=batch_size, shuffle=True)

    model = keras.models.load_model(MODEL_PATH)
    unfreeze_top(model, fine_tune_layers)
    compile_model(model, "adam", lr)
    start = time.time()
    history = model.fit(train_ds, validation_data=val_ds, epochs=epochs,
                        callbacks=callbacks(patience=2), verbose=2)

    new_proba = predict_proba(model, val_ds)
    threshold = best_threshold(val_df["label_id"], new_proba)
    new_metrics = classification_metrics(val_df["label_id"], new_proba, threshold)
    promoted = new_metrics["f1"] - old_metrics["f1"] >= min_gain

    if promoted:
        version = metadata["version"] + 1
        backup = MODEL_PATH.with_name(f"engagement_mobilenetv2_v{metadata['version']}.h5")
        shutil.copy(MODEL_PATH, backup)
        candidate = MODEL_PATH.with_name("candidate.h5")
        model.save(candidate)
        save_production_model(candidate, threshold, new_metrics, version,
                              {"retrained_on_new_images": int(len(new_df)),
                               "replay_images": int(len(train_part) - len(new_df))})
        candidate.unlink()
    keras.backend.clear_session()
    return {"promoted": bool(promoted), "old_val": old_metrics, "new_val": new_metrics,
            "new_threshold": threshold, "train_images": int(len(train_part)),
            "epochs_run": len(history.history["loss"]),
            "minutes": round((time.time() - start) / 60, 1)}
