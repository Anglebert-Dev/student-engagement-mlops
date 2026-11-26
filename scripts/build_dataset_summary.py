"""Usage: python scripts/build_dataset_summary.py data/raw/extracted"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.preprocessing import build_manifest, find_dataset_root, image_statistics, remove_duplicates  # noqa: E402

AGE_ORDER = ["5-10", "11-15", "16-21", "22-Above"]

root = find_dataset_root(sys.argv[1])
raw = build_manifest(root)
clean, report = remove_duplicates(raw)
stats = pd.DataFrame([image_statistics(p) for p in clean["path"]], index=clean.index)
clean = clean.join(stats)


def crosstab(index, columns):
    t = pd.crosstab(clean[index], clean[columns])
    if index == "age_group":
        t = t.loc[AGE_ORDER]
    return {"index": t.index.tolist(), "columns": t.columns.tolist(), "values": t.values.tolist()}


before = raw.groupby(["age_group", "gender"]).size()
after = clean.groupby(["age_group", "gender"]).size()
copies = [{"age_group": a, "gender": g, "before": int(before[(a, g)]), "after": int(after[(a, g)]),
           "removed_pct": round(100 * (before[(a, g)] - after[(a, g)]) / before[(a, g)], 1)}
          for a in AGE_ORDER for g in ["Boy", "Girl"]]

quality = {}
for col in ["brightness", "contrast", "sharpness"]:
    upper = float(np.percentile(clean[col], 99))
    edges = np.linspace(0, upper, 26)
    auc = roc_auc_score(clean["label_id"], clean[col])
    quality[col] = {
        "bin_edges": [round(e, 1) for e in edges.tolist()],
        "share_per_class": {label: (np.histogram(g[col].clip(upper=upper), bins=edges)[0] / len(g)).round(4).tolist()
                            for label, g in clean.groupby("label")},
        "median": clean.groupby("label")[col].median().round(1).to_dict(),
        "roc_auc_alone": round(max(auc, 1 - auc), 3),
    }

summary = {
    "source": "Chate and Patil (2025), Zenodo, doi:10.5281/zenodo.16731734, CC BY 4.0",
    "cleaning": report,
    "age_by_label": crosstab("age_group", "label"),
    "gender_by_label": crosstab("gender", "label"),
    "age_by_gender": crosstab("age_group", "gender"),
    "copies_removed": copies,
    "image_quality": quality,
}
out = Path("outputs/dataset_summary.json")
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(summary, indent=1))
print("written", out, report)
