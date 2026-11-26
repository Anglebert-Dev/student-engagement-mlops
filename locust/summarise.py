import csv
import sys
from pathlib import Path

folder = Path(sys.argv[1] if len(sys.argv) > 1 else "results")
rows = []
for stats_file in sorted(folder.glob("containers_*_stats.csv"), key=lambda p: int(p.stem.split("_")[1])):
    n = int(stats_file.stem.split("_")[1])
    with stats_file.open() as f:
        for r in csv.DictReader(f):
            if r["Name"] == "/api/predict":
                total, failed = int(r["Request Count"]), int(r["Failure Count"])
                rows.append([n, total, f"{100 * failed / total:.1f}%" if total else "n/a",
                             f"{float(r['Average Response Time']):.0f}", r["50%"], r["95%"], r["99%"],
                             f"{float(r['Max Response Time']):.0f}", f"{float(r['Requests/s']):.1f}"])

header = ["Containers", "Requests", "Failures", "Average (ms)", "Median (ms)", "95th percentile (ms)",
          "99th percentile (ms)", "Max (ms)", "Requests per second"]
print("| " + " | ".join(header) + " |")
print("|" + "---|" * len(header))
for r in rows:
    print("| " + " | ".join(str(x) for x in r) + " |")
