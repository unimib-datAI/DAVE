# DAVE Environment Variables Reference

This document provides a comprehensive reference for all environment variables used in the DAVE application.

## Table of Contents

- [Quick Start](#quick-start)
- [Required Variables](#required-variables)
- [Service Configuration](#service-configuration)
  - [Docker Configuration](#docker-configuration)
  - [Authentication (NextAuth)](#authentication-nextauth)
  - [Keycloak SSO](#keycloak-sso-optional)
  - [MongoDB Database](#mongodb-database)
  - [Elasticsearch](#elasticsearch)
  - [Frontend (UI)](#frontend-ui)
  - [Document Service](#document-service)
  - [Text Generation Service](#text-generation-service)
  - [QA Vectorizer Service](#qa-vectorizer-service)
  - [Annotation Pipeline](#annotation-pipeline-optional)
- [Production Deployment](#production-deployment)
- [Security Best Practices](#security-best-practices)

---

## Quick Start

For local development, copy `.env.sample` to `.env` and update these minimum required variables:

```bash
# 1. Generate NEXTAUTH_SECRET
openssl rand -base64 32

# 2. Update these 3 variables in .env:
NEXTAUTH_SECRET=<output-from-command-above>
MONGO_ROOT_PASSWORD=your-secure-root-password
MONGO_PASSWORD=your-secure-app-password

# 3. Update MONGO connection string with your MONGO_PASSWORD:
MONGO=mongodb://usr:your-secure-app-password@mongo:27017/dave?authSource=admin
```

All other variables have sensible defaults and can be used as-is for local development.

---

## Required Variables

These variables **MUST** be set before starting the application:

### NEXTAUTH_SECRET

- **Type:** String (minimum 32 characters)
- **Required:** ⚠️ Yes
- **Default:** None
- **Description:** Secret key used by NextAuth.js for encrypting tokens and session data.

**How to generate:**
```bash
openssl rand -base64 32
```

**Example:**
```env
NEXTAUTH_SECRET=Kx8vQ2pL9mR3wN7sJ4fY1hT6cV5bA0zE2gU8xD3qW9e=
```

⚠️ **Never use the example value above in production!**

---

### NEXTAUTH_URL

- **Type:** URL
- **Required:** ⚠️ Yes
- **Default:** None
- **Description:** Public-facing URL for NextAuth.js authentication callbacks.

**Local development:**
```env
NEXTAUTH_URL=http://127.0.0.1:3000/dave/api/auth
```

**Production:**
```env
NEXTAUTH_URL=https://yourdomain.com/dave/api/auth
```

⚠️ **Always use `127.0.0.1` instead of `localhost` to avoid DNS resolution issues.**

---

### MONGO_ROOT_PASSWORD

- **Type:** String
- **Required:** ⚠️ Yes
- **Default:** None
- **Description:** Root password for MongoDB database.

**Example:**
```env
MONGO_ROOT_PASSWORD=SecureRootPassword123!
```

⚠️ **Change this immediately in production! Never use default or example passwords.**

---

### MONGO_PASSWORD

- **Type:** String
- **Required:** ⚠️ Yes
- **Default:** None
- **Description:** Password for the MongoDB application user (`usr`).

**Example:**
```env
MONGO_PASSWORD=SecureAppPassword456!
```

⚠️ **Must be different from `MONGO_ROOT_PASSWORD`.**

---

### MONGO

- **Type:** MongoDB Connection String
- **Required:** ⚠️ Yes
- **Default:** None
- **Description:** Full MongoDB connection string used by all services.

**Format:**
```
mongodb://usr:<MONGO_PASSWORD>@mongo:27017/dave?authSource=admin
```

**Example:**
```env
MONGO=mongodb://usr:SecureAppPassword456!@mongo:27017/dave?authSource=admin
```

⚠️ **The password in this string MUST match `MONGO_PASSWORD`.**

---

## Service Configuration

### Docker Configuration

#### RESTART_POLICY

- **Type:** String
- **Required:** No
- **Default:** `unless-stopped`
- **Options:** `no`, `always`, `on-failure`, `unless-stopped`
- **Description:** Docker restart policy for all containers.

**Recommended values:**
- Development: `no` or `unless-stopped`
- Production: `unless-stopped` or `always`

```env
RESTART_POLICY=unless-stopped
```

---

### Authentication (NextAuth)

#### NEXTAUTH_URL_INTERNAL

- **Type:** URL
- **Required:** No
- **Default:** `http://localhost:3000`
- **Description:** Internal URL used by NextAuth.js for server-side requests within Docker network.

```env
NEXTAUTH_URL_INTERNAL=http://localhost:3000
```

---

### Keycloak SSO (Optional)

Keycloak provides enterprise-grade Single Sign-On (SSO) and OAuth2/OIDC authentication. If you don't need SSO, you can use basic authentication instead.

#### USE_KEYCLOAK

- **Type:** Boolean
- **Required:** No
- **Default:** `true`
- **Description:** Enable or disable Keycloak authentication.

```env
USE_KEYCLOAK=true
```

Set to `false` to use basic authentication only.

---

#### KEYCLOAK_DB_PASSWORD

- **Type:** String
- **Required:** No (if using Keycloak)
- **Default:** `keycloak`
- **Description:** Password for Keycloak's PostgreSQL database.

```env
KEYCLOAK_DB_PASSWORD=keycloak_db_password_change_me
```

---

#### KEYCLOAK_ADMIN

- **Type:** String
- **Required:** No (if using Keycloak)
- **Default:** `admin`
- **Description:** Keycloak administrator username.

```env
KEYCLOAK_ADMIN=admin
```

---

#### KEYCLOAK_ADMIN_PASSWORD

- **Type:** String
- **Required:** No (if using Keycloak)
- **Default:** `admin`
- **Description:** Keycloak administrator password.

```env
KEYCLOAK_ADMIN_PASSWORD=SecureKeycloakAdmin789!
```

⚠️ **Change in production!**

---

#### KEYCLOAK_HOSTNAME

- **Type:** String (hostname)
- **Required:** No (if using Keycloak)
- **Default:** `vm.chronos.disco.unimib.it`
- **Description:** Public hostname for Keycloak server.

```env
KEYCLOAK_HOSTNAME=auth.yourdomain.com
```

---

#### KEYCLOAK_ISSUER

- **Type:** URL
- **Required:** No (if using Keycloak)
- **Default:** `http://keycloak:8080/realms/DAVE`
- **Description:** Keycloak realm issuer URL for OAuth2/OIDC.

```env
KEYCLOAK_ISSUER=http://keycloak:8080/realms/DAVE
```

For production with custom domain:
```env
KEYCLOAK_ISSUER=https://auth.yourdomain.com/realms/DAVE
```

---

#### KEYCLOAK_ID

- **Type:** String
- **Required:** No (if using Keycloak)
- **Default:** `dave_client`
- **Description:** Keycloak OAuth2 client ID.

```env
KEYCLOAK_ID=dave_client
```

---

#### KEYCLOAK_SECRET

- **Type:** String
- **Required:** No (if using Keycloak)
- **Default:** None
- **Description:** Keycloak OAuth2 client secret.

```env
KEYCLOAK_SECRET=your-keycloak-client-secret-here
```

⚠️ **Change in production! Generate a secure random string.**

---

### MongoDB Database

MongoDB configuration is covered in [Required Variables](#required-variables) section.

---

### Elasticsearch

#### ELASTIC_INDEX

- **Type:** String
- **Required:** No
- **Default:** `dave`
- **Description:** Name of the Elasticsearch index for document storage and search.

```env
ELASTIC_INDEX=dave
```

For multiple deployments, use different index names:
```env
ELASTIC_INDEX=dave_production
```

---

#### ELASTIC_PORT

- **Type:** Integer
- **Required:** No
- **Default:** `9200`
- **Description:** Elasticsearch service port.

```env
ELASTIC_PORT=9200
```

---

### Frontend (UI)

#### LISTEN_UI

- **Type:** Integer
- **Required:** No
- **Default:** `3000`
- **Description:** Port for the frontend UI service to listen on.

```env
LISTEN_UI=3000
```

---

#### ACCESS_USERNAME

- **Type:** String
- **Required:** No
- **Default:** `admin`
- **Description:** Basic authentication username (when not using Keycloak).

```env
ACCESS_USERNAME=admin
```

---

#### ACCESS_PASSWORD

- **Type:** String
- **Required:** No
- **Default:** `password`
- **Description:** Basic authentication password (when not using Keycloak).

```env
ACCESS_PASSWORD=SecureUIPassword123!
```

⚠️ **Change in production!**

---

#### NEXT_PUBLIC_BASE_PATH

- **Type:** String (path)
- **Required:** No
- **Default:** `/dave`
- **Description:** Base path for the application in the URL. Useful for reverse proxy setups.

```env
NEXT_PUBLIC_BASE_PATH=/dave
```

For root path deployment:
```env
NEXT_PUBLIC_BASE_PATH=/
```

---

#### NEXT_PUBLIC_FULL_PATH

- **Type:** URL
- **Required:** No
- **Default:** `http://127.0.0.1:3000/dave`
- **Description:** Full public URL for the application.

**Local:**
```env
NEXT_PUBLIC_FULL_PATH=http://127.0.0.1:3000/dave
```

**Production:**
```env
NEXT_PUBLIC_FULL_PATH=https://yourdomain.com/dave
```

---

#### VARIANT

- **Type:** String
- **Required:** No
- **Default:** `default`
- **Description:** UI theme/variant configuration.

```env
VARIANT=default
```

---

#### HOST

- **Type:** String (IP or hostname)
- **Required:** No
- **Default:** `0.0.0.0`
- **Description:** Host binding for services.

```env
HOST=0.0.0.0
```

---

#### NEXT_PUBLIC_ELASTIC_INDEX

- **Type:** String
- **Required:** No
- **Default:** `dave`
- **Description:** Elasticsearch index name exposed to frontend.

```env
NEXT_PUBLIC_ELASTIC_INDEX=dave
```

Should match `ELASTIC_INDEX`.

---

#### Optional UI Features

##### NO_LOGIN

- **Type:** Boolean
- **Required:** No
- **Default:** `false`
- **Description:** Disable authentication (for development/testing only).

```env
NO_LOGIN=false
```

⚠️ **Never set to `true` in production!**

---

##### LOCALE

- **Type:** String
- **Required:** No
- **Default:** `ita`
- **Options:** `ita` (Italian), `eng` (English)
- **Description:** Application language/locale.

```env
LOCALE=ita
```

---

##### NEXT_PUBLIC_QUESTIONS

- **Type:** String (pipe-separated)
- **Required:** No
- **Default:** None
- **Description:** Predefined chat questions for users. Separate questions with `-|`.

```env
NEXT_PUBLIC_QUESTIONS=What is this document about?-|Summarize the main points-|Who are the key entities mentioned?
```

---

##### NEXT_PUBLIC_SYSTEM_PROMPT

- **Type:** String (multiline)
- **Required:** No
- **Default:** Built-in expert assistant prompt
- **Description:** Custom system prompt for AI chat functionality.

```env
NEXT_PUBLIC_SYSTEM_PROMPT=You are an expert legal assistant. Answer questions using only the provided context.
```

---

### Document Service

#### DOCS_PORT

- **Type:** Integer
- **Required:** No
- **Default:** `3001`
- **Description:** Port for the document service.

```env
DOCS_PORT=3001
```

---

#### API_BASE_URI

- **Type:** URL
- **Required:** No
- **Default:** `http://documents:3001`
- **Description:** Internal URL for document service API.

```env
API_BASE_URI=http://documents:3001
```

---

#### API_USERNAME

- **Type:** String
- **Required:** No
- **Default:** `api_user`
- **Description:** Username for internal API authentication between services.

```env
API_USERNAME=api_user
```

---

#### API_PASSWORD

- **Type:** String
- **Required:** No
- **Default:** None
- **Description:** Password for internal API authentication between services.

```env
API_PASSWORD=SecureAPIPassword123!
```

⚠️ **Change in production!**

---

#### DOCUMENTS_JWT_SECRET

- **Type:** String
- **Required:** No
- **Default:** `your-secret-key-change-in-production`
- **Description:** JWT secret for document service authentication.

```env
DOCUMENTS_JWT_SECRET=SecureJWTSecret456!
```

⚠️ **Change in production! Use a long random string.**

---

### Text Generation Service

#### TEXT_GENERATION_ADDR

- **Type:** URL
- **Required:** No
- **Default:** `http://text-generation:8000`
- **Description:** Internal URL for text generation service.

```env
TEXT_GENERATION_ADDR=http://text-generation:8000
```

---

#### TEXT_GENERATION_KEY

- **Type:** String
- **Required:** No
- **Default:** `your-key`
- **Description:** API key for text generation service.

```env
TEXT_GENERATION_KEY=your-secure-api-key
```

---

#### MODEL_NAME

- **Type:** String
- **Required:** No
- **Default:** `default-model`
- **Description:** Name of the text generation model to use.

```env
MODEL_NAME=mistral-7b-instruct-v0.2
```

Common options:
- `mistral-7b-instruct-v0.2`
- `llama-2-7b-chat`
- `vicuna-7b-v1.5`

---

#### API_LLM

- **Type:** URL
- **Required:** No
- **Default:** `http://text-generation:8000/v1`
- **Description:** LLM API endpoint (OpenAI-compatible format).

```env
API_LLM=http://text-generation:8000/v1
```

---

#### TEXT_GENERATION_GPU_LAYERS

- **Type:** Integer
- **Required:** No
- **Default:** `35`
- **Description:** Number of model layers to offload to GPU.

```env
TEXT_GENERATION_GPU_LAYERS=35
```

**Adjustment guide:**
- More layers = faster inference, more GPU memory required
- Fewer layers = slower inference, less GPU memory required
- Set to `0` for CPU-only inference

**GPU Memory recommendations:**
- 8GB VRAM: `10-15` layers
- 12GB VRAM: `20-25` layers
- 16GB VRAM: `30-35` layers
- 24GB+ VRAM: `35+` layers (full offload)

---

#### TEXT_GENERATION

- **Type:** Boolean
- **Required:** No
- **Default:** `true`
- **Description:** Enable text generation features.

```env
TEXT_GENERATION=true
```

---

### QA Vectorizer Service

#### HOST_BASE_URL

- **Type:** URL
- **Required:** No
- **Default:** `http://0.0.0.0`
- **Description:** Base URL for the vectorizer host.

```env
HOST_BASE_URL=http://0.0.0.0
```

---

#### QAVECTORIZER_ADDR

- **Type:** Integer
- **Required:** No
- **Default:** `7863`
- **Description:** Port for QA vectorizer service.

```env
QAVECTORIZER_ADDR=7863
```

---

#### API_INDEXER

- **Type:** URL
- **Required:** No
- **Default:** `http://qavectorizer:7863`
- **Description:** Indexer API endpoint exposed to frontend.

```env
API_INDEXER=http://qavectorizer:7863
```

---

#### CHROMA_PORT

- **Type:** Integer
- **Required:** No
- **Default:** `8000`
- **Description:** Port for ChromaDB vector database (if used).

```env
CHROMA_PORT=8000
```

---

#### SENTENCE_TRANSFORMER_EMBEDDING_MODEL

- **Type:** String (Hugging Face model ID)
- **Required:** No
- **Default:** `Alibaba-NLP/gte-multilingual-base`
- **Description:** Sentence transformer model for generating embeddings.

```env
SENTENCE_TRANSFORMER_EMBEDDING_MODEL=Alibaba-NLP/gte-multilingual-base
```

**Popular alternatives:**
- `sentence-transformers/all-MiniLM-L6-v2` (English, lightweight)
- `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (Multilingual, medium)
- `intfloat/multilingual-e5-large` (Multilingual, high quality)
- `BAAI/bge-large-en-v1.5` (English, high quality)

**Selection guide:**
- **Multilingual support:** Use `Alibaba-NLP/gte-multilingual-base` or `multilingual-e5-large`
- **English only:** Use `all-MiniLM-L6-v2` or `bge-large-en-v1.5`
- **Low GPU memory:** Use `MiniLM` variants
- **High quality:** Use `large` variants

---

#### SENTENCE_TRANSFORMER_DEVICE

- **Type:** String
- **Required:** No
- **Default:** `cuda`
- **Options:** `cuda`, `cpu`
- **Description:** Device for embedding model inference.

```env
SENTENCE_TRANSFORMER_DEVICE=cuda
```

Set to `cpu` if no GPU is available:
```env
SENTENCE_TRANSFORMER_DEVICE=cpu
```

---

#### OGG2NAME_INDEX

- **Type:** String
- **Required:** No
- **Default:** `dave_ogg2name`
- **Description:** Elasticsearch index name for object-to-name mapping.

```env
OGG2NAME_INDEX=dave_ogg2name
```

---

### Annotation Pipeline (Optional)

These services enable advanced Named Entity Recognition (NER) and entity linking features. They are optional and can be left empty if not used.

#### ANONYMIZATION_ENDPOINT

- **Type:** URL
- **Required:** No
- **Default:** None
- **Description:** URL for document anonymization service.

```env
ANONYMIZATION_ENDPOINT=http://anonymization:8080
```

---

#### ANNOTATION_SPACYNER_URL

- **Type:** URL
- **Required:** No
- **Default:** None
- **Description:** URL for SpaCy NER annotation service.

```env
ANNOTATION_SPACYNER_URL=http://spacyner:5000
```

---

#### ANNOTATION_BLINK_URL

- **Type:** URL
- **Required:** No
- **Default:** None
- **Description:** URL for BLINK entity linking service.

```env
ANNOTATION_BLINK_URL=http://blink:5001
```

---

#### ANNOTATION_INDEXER_URL

- **Type:** URL
- **Required:** No
- **Default:** None
- **Description:** URL for annotation indexer service.

```env
ANNOTATION_INDEXER_URL=http://indexer:5002
```

---

#### ANNOTATION_NILPREDICTION_URL

- **Type:** URL
- **Required:** No
- **Default:** None
- **Description:** URL for NIL (Not In Lexicon) prediction service.

```env
ANNOTATION_NILPREDICTION_URL=http://nilprediction:5003
```

---

#### ANNOTATION_NILCLUSTER_URL

- **Type:** URL
- **Required:** No
- **Default:** None
- **Description:** URL for NIL entity clustering service.

```env
ANNOTATION_NILCLUSTER_URL=http://nilcluster:5004
```

---

#### ANNOTATION_CONSOLIDATION_URL

- **Type:** URL
- **Required:** No
- **Default:** None
- **Description:** URL for annotation consolidation service.

```env
ANNOTATION_CONSOLIDATION_URL=http://consolidation:5005
```

---

## Production Deployment

### Example Production Configuration

Here's an example production `.env` configuration with secure values:

```env
# ============================================================================
# PRODUCTION CONFIGURATION EXAMPLE
# ⚠️ DO NOT copy these exact values - generate your own secure credentials!
# ============================================================================

# Docker
RESTART_POLICY=unless-stopped

# Authentication (REQUIRED)
NEXTAUTH_SECRET=Kx8vQ2pL9mR3wN7sJ4fY1hT6cV5bA0zE2gU8xD3qW9e=
NEXTAUTH_URL=https://yourdomain.com/dave/api/auth
NEXTAUTH_URL_INTERNAL=http://localhost:3000

# MongoDB (REQUIRED)
MONGO_ROOT_PASSWORD=SecureRootPass123!@#$%^
MONGO_PASSWORD=SecureAppPass456!@#$%^
MONGO=mongodb://usr:SecureAppPass456!@#$%^@mongo:27017/dave?authSource=admin

# Keycloak (if using SSO)
USE_KEYCLOAK=true
KEYCLOAK_DB_PASSWORD=KeycloakDB789!@#$%^
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=KeycloakAdmin012!@#$%^
KEYCLOAK_HOSTNAME=auth.yourdomain.com
KEYCLOAK_ISSUER=https://auth.yourdomain.com/realms/DAVE
KEYCLOAK_ID=dave_client
KEYCLOAK_SECRET=SecureKeycloakClientSecret345!@#$%^

# Frontend
LISTEN_UI=3000
ACCESS_USERNAME=admin
ACCESS_PASSWORD=UIPassword678!@#$%^
NEXT_PUBLIC_BASE_PATH=/dave
NEXT_PUBLIC_FULL_PATH=https://yourdomain.com/dave
VARIANT=default
HOST=0.0.0.0

# Elasticsearch
ELASTIC_INDEX=dave_production
ELASTIC_PORT=9200
NEXT_PUBLIC_ELASTIC_INDEX=dave_production

# Document Service
DOCS_PORT=3001
API_BASE_URI=http://documents:3001
API_USERNAME=api_user
API_PASSWORD=APIPassword901!@#$%^
DOCUMENTS_JWT_SECRET=JWTSecret234!@#$%^567890abcdef

# Text Generation
TEXT_GENERATION_ADDR=http://text-generation:8000
TEXT_GENERATION_KEY=LLMKey567!@#$%^
MODEL_NAME=mistral-7b-instruct-v0.2
API_LLM=http://text-generation:8000/v1
TEXT_GENERATION_GPU_LAYERS=35
TEXT_GENERATION=true

# QA Vectorizer
HOST_BASE_URL=http://0.0.0.0
QAVECTORIZER_ADDR=7863
API_INDEXER=http://qavectorizer:7863
CHROMA_PORT=8000
SENTENCE_TRANSFORMER_EMBEDDING_MODEL=Alibaba-NLP/gte-multilingual-base
SENTENCE_TRANSFORMER_DEVICE=cuda
OGG2NAME_INDEX=dave_production_ogg2name

# Optional UI Features
NO_LOGIN=false
LOCALE=eng

# Annotation Services (optional - configure if using)
ANONYMIZATION_ENDPOINT=
ANNOTATION_SPACYNER_URL=
ANNOTATION_BLINK_URL=
ANNOTATION_INDEXER_URL=
ANNOTATION_NILPREDICTION_URL=
ANNOTATION_NILCLUSTER_URL=
ANNOTATION_CONSOLIDATION_URL=
```

---

## Security Best Practices

### 1. Password Security

✅ **DO:**
- Use strong, unique passwords for each service
- Use password managers to generate secure random passwords
- Minimum 16 characters with mixed case, numbers, and symbols
- Rotate credentials regularly

❌ **DON'T:**
- Use default passwords in production
- Reuse passwords across services
- Use simple passwords like "password123"
- Commit `.env` file to version control

---

### 2. Secret Generation

Generate cryptographically secure secrets:

```bash
# Generate NEXTAUTH_SECRET (32+ characters)
openssl rand -base64 32

# Generate other secrets (64 characters)
openssl rand -base64 48

# Generate passwords (alternative method)
LC_ALL=C tr -dc 'A-Za-z0-9!@#$%^&*' < /dev/urandom | head -c 32
```

---

### 3. Environment File Protection

Protect your `.env` file:

```bash
# Set restrictive permissions (owner read/write only)
chmod 600 .env

# Verify .env is in .gitignore
echo ".env" >> .gitignore
```

---

### 4. HTTPS Configuration

For production deployments:

1. **Use HTTPS** - Always use HTTPS in production
2. **SSL/TLS Certificates** - Use Let's Encrypt or your certificate provider
3. **Reverse Proxy** - Configure nginx or traefik as reverse proxy
4. **Update URLs** - Change all `http://` URLs to `https://` in production

Example nginx configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location /dave/ {
        proxy_pass http://localhost:3000/dave/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

### 5. Network Security

- **Firewall Rules** - Only expose necessary ports (80, 443)
- **Internal Services** - Keep MongoDB, Elasticsearch, and other services on internal network only
- **Docker Networks** - Use Docker networks for service isolation
- **VPN/Bastion** - Use VPN or bastion host for administrative access

---

### 6. Monitoring and Logging

- **Log Monitoring** - Monitor application and service logs
- **Audit Logs** - Enable audit logging for critical operations
- **Secrets in Logs** - Never log passwords or secrets
- **Error Reporting** - Configure error monitoring (Sentry, etc.)

---

### 7. Regular Updates

- **Security Patches** - Keep all services and dependencies updated
- **Vulnerability Scanning** - Regular security scans of Docker images
- **Dependency Updates** - Update npm/pip packages regularly
- **Backup Strategy** - Regular backups of MongoDB and Elasticsearch data

---

## Troubleshooting

### Common Issues

#### "Invalid URL" or "ERR_INVALID_URL"

**Cause:** Missing or incorrect `NEXTAUTH_URL`

**Solution:**
```bash
# Ensure NEXTAUTH_URL is set in .env
NEXTAUTH_URL=http://127.0.0.1:3000/dave/api/auth
```

---

#### MongoDB Connection Failed

**Cause:** Password mismatch in `MONGO` connection string

**Solution:**
```bash
# Ensure password in MONGO matches MONGO_PASSWORD
MONGO_PASSWORD=mypassword123
MONGO=mongodb://usr:mypassword123@mongo:27017/dave?authSource=admin
```

---

#### GPU Not Detected

**Cause:** NVIDIA Docker runtime not installed or misconfigured

**Solution:**
```bash
# Install nvidia-docker
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update && sudo apt-get install -y nvidia-docker2
sudo systemctl restart docker

# Test GPU access
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
```

---

#### Services Not Starting

**Cause:** Various - check logs

**Solution:**
```bash
# Check service logs
docker compose logs -f <service_name>

# Examples:
docker compose logs -f ui
docker compose logs -f mongo
docker compose logs -f es
docker compose logs -f text-generation
docker compose logs -f qavectorizer
```

---

## Additional Resources

- [Main README](../README.md)
- [NextAuth Configuration Guide](NEXTAUTH_CONFIGURATION.md)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [MongoDB Connection Strings](https://www.mongodb.com/docs/manual/reference/connection-string/)
- [Elasticsearch Documentation](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)

---

**Last Updated:** 2024

For questions or issues, please refer to the project documentation or contact the development team.