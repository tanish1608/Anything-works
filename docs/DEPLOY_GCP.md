# Deploying to Google Cloud (project `ao-hacks`)

Set up October 6, 2026. Region `us-central1`.

| Resource | Name | Purpose |
|---|---|---|
| Cloud SQL (Postgres 16, db-f1-micro, daily backups) | `placeholder-pg`, database `placeholder`, user `placeholder` | All app data |
| Cloud Storage bucket | `ao-hacks-placeholder-storage` | Photos, IFC uploads, generated GLBs (mounted at `/mnt/storage`) |
| Artifact Registry | `placeholder` | Backend images |
| Service account | `placeholder-api@ao-hacks.iam.gserviceaccount.com` | Cloud SQL client, secret accessor, bucket object admin |
| Secrets | `DB_PASSWORD`, `JWT_SECRET`, `GEMINI_API_KEY` | Injected as env vars |
| Cloud Run job | `placeholder-seed` | Migrations + demo data (`python -m app.seed --crew-demo`) |
| Cloud Run service | `placeholder-api` | The API: https://placeholder-api-826928184760.us-central1.run.app |

`deploy/start.sh` builds `DATABASE_URL` from `DB_PASSWORD` and the Cloud SQL unix socket, runs `alembic upgrade head`, then starts uvicorn on `$PORT` (or runs the job's command).

## Build

```bash
gcloud builds submit --project ao-hacks --region us-central1 --config deploy/cloudbuild.yaml \
  --substitutions=_IMAGE=us-central1-docker.pkg.dev/ao-hacks/placeholder/backend:v1 .
```

`.gcloudignore` uploads only the backend, deploy files and the samples the seed needs (no `.env`, local DB or venv).

## API service

The phone app calls the API directly, so the service must accept unauthenticated HTTP at the Cloud Run layer; the API itself requires JWT sign-in and project permissions on every private route.

```bash
P=ao-hacks; R=us-central1
gcloud run deploy placeholder-api --project $P --region $R \
  --image $R-docker.pkg.dev/$P/placeholder/backend:v1 \
  --service-account placeholder-api@$P.iam.gserviceaccount.com \
  --add-cloudsql-instances $P:$R:placeholder-pg \
  --set-secrets DB_PASSWORD=DB_PASSWORD:latest,JWT_SECRET=JWT_SECRET:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-env-vars APP_ENV=prod,CLOUDSQL_INSTANCE=$P:$R:placeholder-pg,AGENT_ENABLED=true,VISION_MODE=auto,STORAGE_DIR=/mnt/storage,JOBS_MODE=thread \
  --execution-environment gen2 \
  --add-volume name=storage,type=cloud-storage,bucket=ao-hacks-placeholder-storage \
  --add-volume-mount volume=storage,mount-path=/mnt/storage \
  --no-cpu-throttling --min-instances 0 --max-instances 1 --memory 2Gi --cpu 2 --timeout 300 \
  --allow-unauthenticated
```

- `--no-cpu-throttling`: background jobs (AI checks, IFC imports) run in a worker thread after the request returns.
- `--max-instances 1`: one in-process job worker; raise only after moving jobs to a separate worker.
- Cold start after idle is a few seconds; set `--min-instances 1` for snappier demos (always-on cost).

## Before sharing the URL

The seed created demo accounts with the public password `demo-password`. Reset them (or delete them) before giving anyone the URL, e.g. re-run the seed job on a fresh database with `DEMO_PASSWORD` set from a secret.
