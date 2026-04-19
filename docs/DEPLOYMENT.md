# Deployment Guide

This guide covers deploying `mcp-server-starter-ts` to various platforms.

## Prerequisites

- Docker installed locally
- Terraform 1.0+ (for cloud deployments)
- Cloud provider CLI (gcloud or aws)

## Docker Deployment

### Build the Image

```bash
docker build -t my-mcp-server .
```

### Run Locally

```bash
docker run -p 8080:8080 \
  -e API_KEY=your-secret-key \
  -e NODE_ENV=production \
  my-mcp-server
```

### Run with Docker Compose (Local Development)

```bash
docker compose up
```

This starts:
- MCP Server on `http://localhost:8080`
- Jaeger UI on `http://localhost:16686`
- Prometheus on `http://localhost:9090`

## GCP Cloud Run

### Prerequisites

1. Enable required APIs:
```bash
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

2. Authenticate:
```bash
gcloud auth login
gcloud auth configure-docker us-central1-docker.pkg.dev
```

### Deploy with Terraform

1. Navigate to the GCP infrastructure directory:
```bash
cd infra/gcp
```

2. Copy and edit the variables file:
```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
```

3. Initialize and apply:
```bash
terraform init
terraform plan
terraform apply
```

4. Get the service URL:
```bash
terraform output service_url
```

### Manual Deployment

1. Build and push to Artifact Registry:
```bash
docker build -t us-central1-docker.pkg.dev/PROJECT_ID/mcp-server/mcp-server:latest .
docker push us-central1-docker.pkg.dev/PROJECT_ID/mcp-server/mcp-server:latest
```

2. Deploy to Cloud Run:
```bash
gcloud run deploy mcp-server \
  --image us-central1-docker.pkg.dev/PROJECT_ID/mcp-server/mcp-server:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production"
```

## AWS Lambda + API Gateway

### Prerequisites

1. Install AWS CLI and configure:
```bash
aws configure
```

2. Create ECR repository:
```bash
aws ecr create-repository --repository-name mcp-server
```

### Deploy with Terraform

1. Navigate to the AWS infrastructure directory:
```bash
cd infra/aws
```

2. Copy and edit the variables file:
```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
```

3. Initialize and apply:
```bash
terraform init
terraform plan
terraform apply
```

4. Get the API endpoint:
```bash
terraform output api_endpoint
```

### Manual Deployment

1. Build and push to ECR:
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
docker build -t ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/mcp-server:latest .
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/mcp-server:latest
```

2. Deploy with Terraform or AWS Console

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `8080` | Server port |
| `NODE_ENV` | No | `development` | Environment (`development`, `production`, `test`) |
| `API_KEY` | Yes (prod) | — | API key for authentication |
| `AUTH_MODE` | No | `api-key` | Auth mode (`api-key` or `bearer`) |
| `RATE_LIMIT_RPM` | No | `60` | Requests per minute per client |
| `IDEMPOTENCY_TTL_MS` | No | `300000` | Idempotency cache TTL (5 min) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | — | OTLP collector endpoint |
| `OTEL_SERVICE_NAME` | No | `mcp-server` | Service name for tracing |
| `OTEL_RESOURCE_ATTRIBUTES` | No | — | Resource attributes (e.g. `service.version=1.0.0`) |
| `LOG_LEVEL` | No | `info` | Log level (`debug`, `info`, `warn`, `error`) |

## Health Check Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Overall health (ready + alive) |
| `GET /ready` | Readiness probe (dependencies available) |
| `GET /live` | Liveness probe (process is running) |

## Monitoring

### Cloud Run

- View logs: `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=mcp-server"`
- View metrics: Cloud Monitoring → Metrics Explorer → Cloud Run

### Lambda

- View logs: CloudWatch Logs → `/aws/lambda/mcp-server`
- View metrics: CloudWatch → Lambda → Function metrics

### Custom Metrics

The server exposes these OTel metrics:
- `mcp.tool.invocations` — Counter by tool name and status
- `mcp.tool.duration` — Histogram (P50/P90/P99)
- `mcp.server.active_sessions` — Gauge
- `mcp.server.errors` — Counter by error type
