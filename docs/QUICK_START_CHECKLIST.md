# DAVE Quick Start Checklist

This checklist will guide you through setting up DAVE from scratch in the correct order.

## Prerequisites

Before you begin, make sure you have:

- [ ] Docker (version 20.10 or higher) installed
- [ ] Docker Compose (version 1.29 or higher) installed
- [ ] Python 3.8+ installed (for data ingestion scripts)
- [ ] Git installed
- [ ] At least 16GB RAM available for Docker
- [ ] NVIDIA GPU (optional, but recommended for text generation)

Verify your installation:
```bash
docker --version
docker compose version
python --version
```

---

## Step 1: Clone and Prepare

- [ ] Clone the DAVE repository
  ```bash
  git clone <repository-url>
  cd DAVE
  ```

- [ ] Copy the environment sample file
  ```bash
  cp .env.sample .env
  ```

- [ ] **(Optional)** Edit `.env` to customize passwords
  - For local development, the defaults work fine
  - For production, generate secure passwords and secrets
  - See [Environment Variables Reference](ENVIRONMENT_VARIABLES.md)

---

## Step 2: Install Python Dependencies

- [ ] Install Python requirements
  ```bash
  pip install -r requirements.txt
  ```

  Or use a virtual environment (recommended):
  ```bash
  python -m venv venv
  source venv/bin/activate  # On Windows: venv\Scripts\activate
  pip install -r requirements.txt
  ```

---

## Step 3: Start Docker Services

- [ ] Start all services
  ```bash
  docker compose up -d
  ```

- [ ] Wait for services to start (1-2 minutes)
  ```bash
  docker compose ps
  ```

- [ ] Check that all services are running
  - [ ] postgres: Up
  - [ ] keycloak: Up
  - [ ] mongo: Up
  - [ ] es (Elasticsearch): Up
  - [ ] documents: Up
  - [ ] ui: Up
  - [ ] text-generation: Up
  - [ ] qavectorizer: Up

- [ ] Check logs if any service fails
  ```bash
  docker compose logs -f <service-name>
  ```

---

## Step 4: Configure Keycloak (REQUIRED)

This is a critical step. Without this, you won't be able to log in.

### 4.1 Access Keycloak

- [ ] Open Keycloak Admin Console
  - URL: http://127.0.0.1:8080
  - Username: `admin`
  - Password: `admin`

### 4.2 Create DAVE Realm

- [ ] Click the dropdown in top-left (says "master")
- [ ] Click "Create Realm"
- [ ] Enter realm name: `DAVE` (exact spelling, case-sensitive)
- [ ] Enable: ON (toggle should be green)
- [ ] Click "Create"

### 4.3 Create Client

- [ ] Click "Clients" in left sidebar
- [ ] Click "Create client" button
- [ ] Fill in:
  - Client type: `OpenID Connect`
  - Client ID: `dave_client` (exact spelling)
- [ ] Click "Next"

- [ ] Configure capabilities:
  - Client authentication: ON
  - Authorization: OFF
  - Standard flow: ON (checked)
  - Direct access grants: ON (checked)
- [ ] Click "Next"

- [ ] Configure login settings:
  - Valid redirect URIs:
    ```
    http://127.0.0.1:3000/dave/api/auth/callback/keycloak
    http://127.0.0.1:3000/*
    ```
  - Valid post logout redirect URIs:
    ```
    http://127.0.0.1:3000/dave
    http://127.0.0.1:3000/*
    ```
  - Web origins:
    ```
    http://127.0.0.1:3000
    +
    ```
- [ ] Click "Save"

### 4.4 Get Client Secret

- [ ] Click on "dave_client" in the clients list
- [ ] Click "Credentials" tab
- [ ] Copy the "Client secret" value

### 4.5 Update Environment Variable

- [ ] Open `.env` file
- [ ] Find the line: `KEYCLOAK_SECRET=your-keycloak-secret-change-me`
- [ ] Replace with: `KEYCLOAK_SECRET=<paste-your-secret-here>`
- [ ] Save the file

### 4.6 Restart UI Service

- [ ] Restart UI to pick up the new secret
  ```bash
  docker compose restart ui
  ```

### 4.7 Create a User

- [ ] In Keycloak, click "Users" in left sidebar
- [ ] Click "Add user" button
- [ ] Fill in:
  - Username: `testuser` (or your preferred username)
  - Email: `testuser@example.com` (optional)
  - Email verified: ON
  - Enabled: ON
- [ ] Click "Create"

- [ ] Click "Credentials" tab
- [ ] Click "Set password" button
- [ ] Fill in:
  - Password: `your-password`
  - Password confirmation: `your-password`
  - Temporary: OFF (important!)
- [ ] Click "Save"
- [ ] Confirm in the popup

**See [Keycloak Setup Guide](KEYCLOAK_SETUP.md) for detailed instructions and troubleshooting.**

---

## Step 5: Verify DAVE UI Access

- [ ] Open DAVE in your browser
  - URL: http://127.0.0.1:3000/dave

- [ ] You should see a login page

- [ ] Log in with the user you created:
  - Username: `testuser` (or what you chose)
  - Password: `your-password`

- [ ] Verify you can access the DAVE interface

**Note:** Always use `127.0.0.1` instead of `localhost` to avoid DNS issues.

---

## Step 6: Load Sample Data (Optional)

If you have documents to ingest:

### 6.1 Prepare Documents

- [ ] Place GateNLP format JSON documents in:
  ```
  scripts/input_data/
  ```

### 6.2 Upload to MongoDB

- [ ] Run the upload script from the project root:
  ```bash
  python scripts/upload_mongo.py
  ```

- [ ] Verify documents were uploaded (check output for count)

### 6.3 Index in Elasticsearch

- [ ] Run the indexing script from the project root:
  ```bash
  python scripts/insert_elastic.py
  ```

- [ ] Wait for indexing to complete (this may take a while)

### 6.4 Verify Data

- [ ] Refresh DAVE UI in browser
- [ ] You should see your documents listed
- [ ] Try searching for a document

---

## Step 7: Test Key Features

- [ ] **Search:** Try searching for documents
- [ ] **View:** Open and view a document
- [ ] **Chat:** Try the conversational AI feature (if text generation is running)
- [ ] **Filters:** Test entity-based filtering

---

## Troubleshooting Common Issues

### Cannot Access Keycloak (http://127.0.0.1:8080)

```bash
# Check if Keycloak is running
docker compose ps keycloak

# Check logs
docker compose logs -f keycloak

# Restart Keycloak
docker compose restart keycloak
```

### "Invalid redirect URI" Error

- Make sure you're using `127.0.0.1` not `localhost`
- Verify redirect URIs in Keycloak client match exactly
- Check `NEXTAUTH_URL` in `.env` is correct

### Cannot Log In to DAVE

- Verify Keycloak user is enabled
- Verify email is verified (toggle ON)
- Verify password is not temporary
- Check `KEYCLOAK_SECRET` in `.env` matches Keycloak

### Services Not Starting

```bash
# Check which service failed
docker compose ps

# View logs for specific service
docker compose logs -f <service-name>

# Common services to check:
docker compose logs -f mongo
docker compose logs -f es
docker compose logs -f keycloak
docker compose logs -f ui
```

### MongoDB Connection Error in Scripts

- Verify `MONGO_ROOT_PASSWORD` in `.env` is correct
- Make sure MongoDB is running: `docker compose ps mongo`
- Check the password in the connection string matches

### Elasticsearch Memory Issues

- Increase Docker memory allocation (Settings → Resources → Memory)
- Minimum 8GB recommended

---

## Quick Reference: Service URLs

Once everything is running:

| Service | URL | Credentials |
|---------|-----|-------------|
| **DAVE UI** | http://127.0.0.1:3000/dave | Keycloak user (testuser) |
| **Keycloak Admin** | http://127.0.0.1:8080 | admin / admin |
| **Elasticsearch** | http://127.0.0.1:9200 | None (no auth) |
| **MongoDB** | mongodb://127.0.0.1:27018 | root / MONGO_ROOT_PASSWORD |
| **Document Service** | http://127.0.0.1:3001 | Internal only |

---

## Next Steps

After successful setup:

- [ ] Read the [main README](../README.md) for detailed features
- [ ] Review [Environment Variables](ENVIRONMENT_VARIABLES.md) for customization
- [ ] Configure your data ingestion pipeline
- [ ] Set up production deployment (if needed)
- [ ] Customize UI theme/variant (if needed)
- [ ] Configure backup strategy for MongoDB and Elasticsearch

---

## Getting Help

If you encounter issues:

1. **Check logs:** `docker compose logs -f <service>`
2. **Review documentation:**
   - [Main README](../README.md)
   - [Keycloak Setup Guide](KEYCLOAK_SETUP.md)
   - [Environment Variables Reference](ENVIRONMENT_VARIABLES.md)
3. **Common issues:** See troubleshooting section above
4. **Contact:** Reach out to the development team

---

## Disable Keycloak (Alternative)

If you don't want to use Keycloak for authentication:

- [ ] Edit `.env` file
- [ ] Set: `USE_KEYCLOAK=false`
- [ ] Restart services: `docker compose restart ui documents`
- [ ] Access DAVE UI: http://127.0.0.1:3000/dave
- [ ] Log in with:
  - Username: `admin` (from `ACCESS_USERNAME`)
  - Password: `password` (from `ACCESS_PASSWORD`)

---

**Last Updated:** 2024