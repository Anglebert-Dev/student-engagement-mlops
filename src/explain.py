from __future__ import annotations

import base64
import io

import numpy as np
from PIL import Image

from .preprocessing import decode_image

MAX_OVERLAY_SIDE = 640


def _parts(model):
    import keras
    rescale = next(l for l in model.layers if isinstance(l, keras.layers.Rescaling))
    backbone = next(l for l in model.layers if isinstance(l, keras.Model))
    kernel, bias = model.get_layer("engaged_probability").get_weights()
    return rescale, backbone, kernel, bias


def gradcam(model, image_array: np.ndarray, towards_engaged: bool = True) -> tuple[np.ndarray, float]:
    """Gradient of the logit before the sigmoid, negated for Disengagement so the map shows what pushed the model towards the predicted class."""
    import tensorflow as tf
    rescale, backbone, kernel, bias = _parts(model)
    x = tf.convert_to_tensor(image_array[None], tf.float32)
    with tf.GradientTape() as tape:
        conv = backbone(rescale(x), training=False)
        tape.watch(conv)
        logit = tf.reduce_mean(conv, axis=(1, 2)) @ kernel + bias
        target = logit if towards_engaged else -logit
    grads = tape.gradient(target, conv)
    weights = tf.reduce_mean(grads, axis=(0, 1, 2))
    cam = tf.nn.relu(tf.reduce_sum(conv[0] * weights, axis=-1))
    peak = float(tf.reduce_max(cam))
    cam = cam / peak if peak > 0 else tf.zeros_like(cam)
    heat = tf.image.resize(cam[..., None], image_array.shape[:2])[..., 0]
    return np.clip(heat.numpy(), 0, 1), float(logit[0, 0])


def _jet(v: np.ndarray) -> np.ndarray:
    r = np.clip(1.5 - np.abs(4 * v - 3), 0, 1)
    g = np.clip(1.5 - np.abs(4 * v - 2), 0, 1)
    b = np.clip(1.5 - np.abs(4 * v - 1), 0, 1)
    return np.stack([r, g, b], axis=-1)


def overlay_png(raw: bytes, heat: np.ndarray, alpha: float = 0.45) -> bytes:
    image = Image.fromarray(decode_image(raw))
    image.thumbnail((MAX_OVERLAY_SIDE, MAX_OVERLAY_SIDE))
    w, h = image.size
    heat = np.asarray(Image.fromarray((heat * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)) / 255.0
    blend = (1 - alpha) * np.asarray(image, dtype=np.float32) + alpha * 255 * _jet(heat)
    buffer = io.BytesIO()
    Image.fromarray(np.clip(blend, 0, 255).astype(np.uint8)).save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def explain(predictor, raw: bytes) -> dict:
    from .preprocessing import load_image_array
    result = predictor.predict(raw)
    engaged = result["label"] == "Engagement"
    heat, logit = gradcam(predictor.model, load_image_array(raw, predictor.img_size), towards_engaged=engaged)
    png = overlay_png(raw, heat)
    return {**result, "logit": round(logit, 4), "towards": result["label"],
            "overlay_png": "data:image/png;base64," + base64.b64encode(png).decode()}
