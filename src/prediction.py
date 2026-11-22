"""Load the production model and predict engagement for one or more images."""
from __future__ import annotations

import json
import threading
from pathlib import Path

import numpy as np

from .preprocessing import load_image_array

MODEL_PATH = Path("models/engagement_mobilenetv2.h5")
METADATA_PATH = Path("models/model_metadata.json")
MAX_CHUNK = 4


class EngagementPredictor:
    def __init__(self, model_path: str | Path = MODEL_PATH, metadata_path: str | Path = METADATA_PATH):
        self.model_path, self.metadata_path = Path(model_path), Path(metadata_path)
        self._lock = threading.Lock()
        self._load()

    def _load(self) -> None:
        import keras
        self.model = keras.models.load_model(self.model_path, compile=False)
        self.metadata = json.loads(self.metadata_path.read_text())
        self.threshold = float(self.metadata["threshold"])
        self.class_names = self.metadata["class_names"]
        self.img_size = int(self.metadata["img_size"])
        self._loaded_mtime = self.metadata_path.stat().st_mtime

    @property
    def version(self) -> int:
        return int(self.metadata.get("version", 1))

    def reload_if_changed(self) -> bool:
        """Reload when retraining (possibly in another container) has saved a new version.
        The metadata file is written last, so its change means the model file is ready."""
        if self.metadata_path.stat().st_mtime == self._loaded_mtime:
            return False
        with self._lock:
            if self.metadata_path.stat().st_mtime != self._loaded_mtime:
                self._load()
                return True
        return False

    def predict(self, source) -> dict:
        """source: file path, raw bytes or file object of one image."""
        return self.predict_batch([source])[0]

    def predict_batch(self, sources, chunk_size: int = MAX_CHUNK) -> list[dict]:
        """Images are run through the model a few at a time: memory grows quickly with
        batch size on CPU, and a batch of 20 exceeds the container's 2 GB limit."""
        sources = list(sources)
        proba = np.concatenate([
            np.asarray(self.model(np.stack([load_image_array(s, self.img_size) for s in sources[i:i + chunk_size]]),
                                  training=False)).ravel()
            for i in range(0, len(sources), chunk_size)
        ])
        results = []
        for p in proba:
            engaged = bool(p >= self.threshold)
            results.append({
                "label": self.class_names[int(engaged)],
                "probability_engaged": round(float(p), 4),
                "confidence": round(float(p if engaged else 1 - p), 4),
                "threshold": self.threshold,
                "model_version": self.version,
            })
        return results
