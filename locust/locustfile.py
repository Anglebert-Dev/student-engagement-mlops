import random
from pathlib import Path

from locust import HttpUser, between, task

PROJECT_ROOT = Path(__file__).resolve().parents[1]
IMAGES = [(p.name, p.read_bytes()) for p in sorted((PROJECT_ROOT / "data" / "test").glob("*/*.jpg"))]
if not IMAGES:
    raise SystemExit("No images found in data/test/<class>/")


class Learner(HttpUser):
    wait_time = between(0.5, 1.5)

    @task(5)
    def predict(self):
        name, content = random.choice(IMAGES)
        self.client.post("/api/predict", files={"file": (name, content, "image/jpeg")}, name="/api/predict")

    @task(1)
    def health(self):
        self.client.get("/api/health", name="/api/health")
