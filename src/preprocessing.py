from __future__ import annotations

import hashlib
import io
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image
from sklearn.model_selection import StratifiedGroupKFold

SEED = 42
IMG_SIZE = 224
CLASS_NAMES = ["Disengagement", "Engagement"]  # index 1 = engaged
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def extract_zip(zip_path: str | Path, out_dir: str | Path) -> Path:
    out_dir = Path(out_dir)
    if not any(out_dir.glob("**/Engagement")):
        out_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(out_dir)
    return find_dataset_root(out_dir)


def find_dataset_root(folder: str | Path) -> Path:
    for candidate in sorted(Path(folder).glob("**/Engagement")):
        if (candidate.parent / "Disengagement").is_dir():
            return candidate.parent
    raise FileNotFoundError(f"No Engagement/Disengagement folders under {folder}")


def file_md5(path: str | Path) -> str:
    return hashlib.md5(Path(path).read_bytes()).hexdigest()


def build_manifest(root: str | Path) -> pd.DataFrame:
    root = Path(root)
    rows = []
    for path in sorted(root.rglob("*")):
        if path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        parts = path.relative_to(root).parts  # class / age / gender / file
        label = parts[0]
        rows.append({
            "path": str(path),
            "relpath": path.relative_to(root).as_posix(),
            "label": label,
            "label_id": CLASS_NAMES.index(label),
            "age_group": parts[1].replace(" Years", "") if len(parts) > 3 else "unknown",
            "gender": parts[2] if len(parts) > 3 else "unknown",
            "md5": file_md5(path),
        })
    return pd.DataFrame(rows)


def remove_duplicates(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Files stored under both classes have a conflicting label, so every copy is dropped."""
    labels_per_hash = df.groupby("md5")["label"].nunique()
    conflicting = set(labels_per_hash[labels_per_hash > 1].index)
    clean = df[~df["md5"].isin(conflicting)].drop_duplicates("md5").reset_index(drop=True)
    report = {
        "images_before": len(df),
        "conflicting_label_files": int(df["md5"].isin(conflicting).sum()),
        "same_label_copies": int(len(df) - df["md5"].isin(conflicting).sum()
                                 - df[~df["md5"].isin(conflicting)]["md5"].nunique()),
        "images_after": len(clean),
    }
    return clean, report


def dhash(path: str | Path, size: int = 16) -> np.ndarray:
    """Difference hash: near-identical frames differ in only a few bits."""
    grey = Image.open(path).convert("L").resize((size + 1, size), Image.BILINEAR)
    pixels = np.asarray(grey, dtype=np.int16)
    return (pixels[:, 1:] > pixels[:, :-1]).flatten()


def group_near_duplicates(df: pd.DataFrame, max_distance: int = 20) -> pd.DataFrame:
    """Frames of the same recording session share a group id, so a split never separates them."""
    hashes = np.stack([dhash(p) for p in df["path"]]).astype(np.uint8)
    parent = np.arange(len(hashes))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(hashes) - 1):
        distances = (hashes[i + 1:] != hashes[i]).sum(axis=1)
        for j in np.nonzero(distances <= max_distance)[0]:
            a, b = find(i), find(i + 1 + int(j))
            if a != b:
                parent[a] = b
    roots = np.array([find(i) for i in range(len(hashes))])
    out = df.copy()
    out["group"] = pd.factorize(roots)[0]
    return out


def grouped_split(df: pd.DataFrame, test_share: float = 0.15, val_share: float = 0.15,
                  new_share: float = 0.05, seed: int = SEED) -> pd.DataFrame:
    """The "new" split is held back to stand in for data uploaded later for retraining."""
    out = df.copy()
    out["split"] = "train"
    remaining = out
    for name, share in (("test", test_share), ("new", new_share), ("val", val_share)):
        n_splits = max(2, round(len(remaining) / (share * len(df))))
        folds = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=seed)
        keep_idx, take_idx = next(folds.split(remaining, remaining["label_id"], remaining["group"]))
        out.loc[remaining.index[take_idx], "split"] = name
        remaining = remaining.iloc[keep_idx]
    return out


def image_statistics(path: str | Path) -> dict:
    grey = np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    laplacian = (-4 * grey[1:-1, 1:-1] + grey[:-2, 1:-1] + grey[2:, 1:-1]
                 + grey[1:-1, :-2] + grey[1:-1, 2:])
    return {"brightness": float(grey.mean()), "contrast": float(grey.std()),
            "sharpness": float(laplacian.var())}


_EXIF_ORIENTATION = 0x0112
_ORIENT = {
    2: lambda a: a[:, ::-1],
    3: lambda a: a[::-1, ::-1],
    4: lambda a: a[::-1],
    5: lambda a: a.transpose(1, 0, 2),
    6: lambda a: np.rot90(a, k=-1),
    7: lambda a: a[::-1, ::-1].transpose(1, 0, 2),
    8: lambda a: np.rot90(a, k=1),
}


def _read_bytes(source) -> bytes:
    if isinstance(source, (bytes, bytearray)):
        return bytes(source)
    if isinstance(source, (str, Path)):
        return Path(source).read_bytes()
    return source.read()


def _exif_orientation(raw: bytes) -> int:
    try:
        return int(Image.open(io.BytesIO(raw)).getexif().get(_EXIF_ORIENTATION, 1))
    except Exception:
        return 1


def decode_image(raw: bytes) -> np.ndarray:
    import tensorflow as tf
    try:
        image = tf.io.decode_image(raw, channels=3, expand_animations=False).numpy()
    except (tf.errors.InvalidArgumentError, ValueError):
        from PIL import ImageOps, UnidentifiedImageError
        try:
            pil = Image.open(io.BytesIO(raw))
            pil.load()
        except (UnidentifiedImageError, OSError) as exc:
            raise ValueError("not a readable image") from exc
        return np.asarray(ImageOps.exif_transpose(pil).convert("RGB"))
    orient = _ORIENT.get(_exif_orientation(raw))
    return np.ascontiguousarray(orient(image)) if orient else image


def load_image_array(source, img_size: int = IMG_SIZE) -> np.ndarray:
    """Decoded and resized with TensorFlow, as in make_tf_dataset, so serving sees the training pixels."""
    import tensorflow as tf
    image = decode_image(_read_bytes(source))
    return tf.image.resize(image, (img_size, img_size)).numpy()


STORED_SIZE = 256
MIN_SIDE = 64


def prepare_upload(raw: bytes) -> tuple[bytes, dict]:
    from PIL import ImageOps, UnidentifiedImageError
    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("not a readable image") from exc
    image = ImageOps.exif_transpose(image)
    width, height = image.size
    if min(width, height) < MIN_SIDE:
        raise ValueError(f"too small ({width}x{height}), minimum side is {MIN_SIDE} px")
    image = image.convert("RGB").resize((STORED_SIZE, STORED_SIZE), Image.BILINEAR)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=95)
    data = buffer.getvalue()
    return data, {"original_width": width, "original_height": height,
                  "md5": hashlib.md5(data).hexdigest()}


def make_tf_dataset(paths, labels, img_size: int = IMG_SIZE, batch_size: int = 32,
                    shuffle: bool = False, seed: int = SEED):
    import tensorflow as tf

    def load(path, label):
        image = tf.io.decode_image(tf.io.read_file(path), channels=3, expand_animations=False)
        image = tf.image.resize(image, (img_size, img_size))
        return tf.cast(image, tf.float32), label

    ds = tf.data.Dataset.from_tensor_slices((list(map(str, paths)), list(labels)))
    if shuffle:
        ds = ds.shuffle(len(paths), seed=seed, reshuffle_each_iteration=True)
    return ds.map(load, num_parallel_calls=tf.data.AUTOTUNE).batch(batch_size).prefetch(tf.data.AUTOTUNE)
