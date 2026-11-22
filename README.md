# Student Engagement Classifier: End-to-End ML Pipeline

**Author:** Anglebert Shumbusho Ishimwe, African Leadership University

| | |
|---|---|
| **Video demo** | [add YouTube link] |
| **Live app** | http://194.163.187.137:8095 |
| **Notebook** | [`notebook/student_engagement_mlops.ipynb`](notebook/student_engagement_mlops.ipynb) |

## Project description

The Introduction to Machine Learning summative predicted **at-risk learners** from tabular activity data (OULAD). Low engagement is one of the earliest signs that a learner is falling behind. This project moves the same problem to **images**: from one photo of a learner during a lesson, the model predicts **Engagement** or **Disengagement**.

The goal is a tool for teachers who run online or blended classes for many children at once, in line with making quality education accessible to children in Rwanda and across Africa: the engagement signal shows which learners need attention first.

The project covers the full pipeline: data acquisition, preprocessing, model training and evaluation, a prediction API, a web dashboard, bulk upload of new data to a database, retraining from the saved model (button and automatic trigger), Docker deployment on a cloud server, and load testing with Locust.

## Dataset

**E-learning Student Engagement and Disengagement Image Dataset** (Chate and Patil, 2025), Zenodo, [doi:10.5281/zenodo.16731734](https://doi.org/10.5281/zenodo.16731734), licence CC BY 4.0. 16,000 JPG images (256 × 256) of learners aged 5 and above, organised by class, age group (5-10, 11-15, 16-21, 22 and above) and gender.

- **Cleaning:** 3,440 exact copies were removed (3,418 repeated files and 22 files stored under both classes), leaving **12,560** images: 6,286 disengaged and 6,274 engaged.
- **Split by recording session:** near-identical frames were grouped with a difference hash (649 groups). Train, validation, test and "new data" splits share no group: 8,267 / 2,020 / 1,669 / 604 images.
- **Not in this repository:** the full dataset stays on Google Drive. Version 1 was removed from Mendeley Data for suspected copyright infringement, and the authors do not state how consent was obtained, so only 100 sample images are included (`data/test`: 20, `data/train`: 80).

## Results

The notebook compares 4 MobileNetV2 transfer learning experiments (frozen baseline, augmentation with dropout and L2, fine-tuning with Adam, fine-tuning with SGD), with early stopping and learning-rate reduction. The model and decision threshold were chosen on the validation set. The test set was used once.

| Metric (test set, 1,669 images) | Version 1 (notebook) | Version 2 (after retraining on 604 new images) |
|---|---|---|
| Accuracy | 0.648 | 0.654 |
| Precision | 0.660 | 0.661 |
| Recall | 0.632 | 0.649 |
| F1 | 0.646 | 0.655 |
| ROC-AUC | 0.692 | 0.727 |
| Loss | 0.695 | 0.710 |

The repository ships **version 1** (9 MB). Version 2 was produced by the retraining demo in the notebook and is kept on Google Drive; on the server, each retraining run creates a new version and keeps the previous one as a backup.

The majority-class baseline scores 0.493 accuracy. The model clearly learns a signal but overfits (training accuracy above 0.96), so its accuracy on unseen learners is moderate. The notebook discusses this in detail, together with errors by age group and gender.

## Flood request simulation (Locust)

Each simulated user sends a test image to `/api/predict` every 0.5 to 1.5 s, and sometimes calls `/api/health`. The same test runs against 1, 2 and 4 API containers behind nginx. Each container is limited to one CPU.

Settings: [add users], spawn rate [add], duration [add], server: 6 vCPU, 11 GB RAM, Ubuntu 24.04.

[paste results/summary.md here after running `bash locust/run_load_tests.sh`]

**Interpretation:** [add after the test: how average and 95th percentile response time and requests per second change from 1 to 2 to 4 containers]

## Repository structure

```
student-engagement-mlops/
├── README.md
├── notebook/student_engagement_mlops.ipynb   data, training, evaluation, prediction, retraining
├── src/
│   ├── preprocessing.py   loading, cleaning, grouping, splitting, image preprocessing
│   ├── model.py           MobileNetV2 model, experiments, metrics, retraining from the saved model
│   ├── prediction.py      loads the saved model and predicts one or many images
│   ├── database.py        SQLite: uploaded images, prediction log, retraining runs
│   └── retraining.py      database uploads -> preprocessing -> retrain -> evaluate -> promote
├── app/
│   ├── main.py            web API (Starlette + Uvicorn)
│   └── static/index.html  dashboard: uptime, prediction, data insights, upload and retrain
├── data/
│   ├── train/             sample upload batch for the retraining demo (40 per class)
│   └── test/              held-out labelled images (10 per class) for prediction and evaluation
├── models/
│   ├── engagement_mobilenetv2.h5        model in production (version 1, from the notebook)
│   └── model_metadata.json              version, threshold, class names, metrics
├── outputs/               dataset_summary.json (dashboard charts), experiments.csv
├── scripts/build_dataset_summary.py
├── locust/                locustfile.py, run_load_tests.sh, summarise.py
├── results/               Locust CSV output and summary.md
├── Dockerfile, docker-compose.yml, deploy/nginx.conf
├── requirements.txt       notebook
└── requirements-app.txt   API container
```

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/` | Dashboard |
| GET | `/api/health` | Status, uptime, model version, container name |
| GET | `/api/model` | Metadata of the model in production |
| GET | `/api/insights` | Dataset summary and experiment results for the charts |
| POST | `/api/predict` | Form field `file`: one image. Returns the class, the probability of engagement and the response time |
| POST | `/api/upload` | Form fields `label` (`Engagement` or `Disengagement`) and `files` (many images). Preprocesses and saves them to the database |
| POST | `/api/retrain` | Starts retraining on the images waiting in the database |
| GET | `/api/retrain/status` | Latest retraining run |
| POST | `/api/evaluate` | Scores the model in production on `data/test` |
| GET | `/api/stats` | Database counts, recent predictions, retraining history |

Example:
```bash
curl -F "file=@data/test/Engagement/ENG_22_ABOVE_BOY_651.jpg" http://194.163.187.137:8095/api/predict
```

## Retraining process

1. **Upload:** the user selects a class and many images on the dashboard.
2. **Preprocessing and saving:** each image is checked as readable, its EXIF orientation is fixed, images under 64 px are rejected, then it is converted to RGB, resized to 256 × 256 (the dataset format) and stored as a JPEG in the SQLite database. Duplicates are skipped by hash.
3. **Trigger:** the **Retrain now** button, or automatically once 200 or more images are waiting (`RETRAIN_THRESHOLD`). At least 5 new images per class are required.
4. **Retraining:** the saved production model is loaded as the starting point. Its last 30 MobileNetV2 layers are fine-tuned at a learning rate of 0.00001 for up to 5 epochs, on the new images plus all images from earlier runs.
5. **Evaluation and promotion:** the old and new model are scored on the held-out images in `data/test`. The new model replaces the old one unless its F1 drops by more than 0.05, and the old file is kept as a backup. Every API container reloads the new version automatically.

## How to set it up

### 1. Notebook (Google Colab)
1. Copy this folder to Google Drive as `MyDrive/student-engagement-mlops`.
2. Download `Final Dataset 256.zip` from [Zenodo](https://zenodo.org/records/16731734) and save it as `data/raw/Final_Dataset_256.zip`.
3. Open `notebook/student_engagement_mlops.ipynb` in Colab, choose a T4 GPU, and run all cells. Finished experiments are saved to Drive and skipped on the next run.

### 2. Run the app on a server with Docker
Requires Docker with the Compose plugin and about 1 GB of RAM per API container.
```bash
git clone https://github.com/Anglebert-Dev/student-engagement-mlops.git
cd student-engagement-mlops
docker compose up -d --build            # 1 API container + nginx on port 8095
docker compose up -d --scale api=4      # 4 API containers behind nginx
docker compose logs -f api              # follow the logs
```
Open `http://<server-ip>:8095`. Settings, through environment variables or a `.env` file: `APP_PORT` (8095), `API_CPUS` (1.0 per container), `RETRAIN_THRESHOLD` (200), `MIN_NEW_PER_CLASS` (5).

### 3. Run the app without Docker
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-app.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 4. Load test
```bash
bash locust/run_load_tests.sh                    # 1, 2 and 4 containers, 50 users, 2 minutes each
USERS=100 DURATION=3m bash locust/run_load_tests.sh
```
Results are written to `results/containers_<n>_stats.csv` and `results/summary.md`. Locust runs from its official Docker image, so it needs no install.

## Limitations

- Moderate accuracy on new learners: test accuracy 0.65 against training accuracy above 0.96.
- No learner IDs in the dataset, so sessions are grouped by image similarity; one learner may still appear in two splits.
- One photo is a simplification of engagement, which changes over time.
- In production, promotion is decided on only 20 held-out images, so the before and after comparison is noisy.
- Images of children need consent from parents and schools before any real use.

## References

1. P. Chate and K. Patil, "E-learning Student Engagement and Disengagement Image Dataset for Educational Research," Zenodo, 2025. doi: 10.5281/zenodo.16731734.
2. P. Chate and K. Patil, "Student Engagement and Disengagement Image Dataset for Educational Research," *Educational Administration: Theory and Practice*, vol. 30, no. 10, pp. 2599–2604, 2024. doi: 10.67145/kuey.v30i10.10736.
3. M. Sandler, A. Howard, M. Zhu, A. Zhmoginov and L.-C. Chen, "MobileNetV2: Inverted Residuals and Linear Bottlenecks," in *Proc. IEEE/CVF CVPR*, 2018, pp. 4510–4520.
