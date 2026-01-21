# Keycloak Setup Guide for DAVE

This guide explains how to configure Keycloak for authentication with DAVE.

## Table of Contents

- [Quick Start (Use Defaults)](#quick-start-use-defaults)
- [Initial Keycloak Setup](#initial-keycloak-setup)
- [Creating the DAVE Realm](#creating-the-dave-realm)
- [Creating the Client](#creating-the-client)
- [Getting the Client Secret](#getting-the-client-secret)
- [Updating Environment Variables](#updating-environment-variables)
- [Creating Users](#creating-users)
- [Troubleshooting](#troubleshooting)

---

## Quick Start (Use Defaults)

If you just want to get DAVE running locally with Keycloak, you can use the default configuration:

1. **Copy the `.env.sample` to `.env`:**
   ```bash
   cp .env.sample .env
   ```

2. **Start all services:**
   ```bash
   docker compose up -d
   ```

3. **Wait for Keycloak to start** (check logs):
   ```bash
   docker compose logs -f keycloak
   # Wait until you see "Started" or "Running" message
   ```

4. **Access Keycloak admin console:**
   - URL: `http://127.0.0.1:8080`
   - Username: `admin`
   - Password: `admin`

5. **Follow the steps below** to create the realm and get the client secret.

---

## Initial Keycloak Setup

### Access Keycloak Admin Console

1. Open your browser and navigate to:
   ```
   http://127.0.0.1:8080
   ```

2. Click on **"Administration Console"**

3. Log in with the default credentials:
   - **Username:** `admin`
   - **Password:** `admin`
   
   (These are set in your `.env` file via `KEYCLOAK_ADMIN` and `KEYCLOAK_ADMIN_PASSWORD`)

---

## Creating the DAVE Realm

A "realm" in Keycloak is an isolated space for managing authentication.

### Step 1: Create New Realm

1. In the top-left corner, click on the dropdown that says **"master"**

2. Click **"Create Realm"**

3. Fill in the realm details:
   - **Realm name:** `DAVE` (must match exactly)
   - **Enabled:** ON (toggle should be green)

4. Click **"Create"**

### Step 2: Verify Realm Settings

1. In the left sidebar, click **"Realm settings"**

2. In the **"General"** tab, verify:
   - **Realm ID:** `DAVE`
   - **Enabled:** ON

3. Click **"Save"** if you made any changes

---

## Creating the Client

A "client" represents the DAVE application in Keycloak.

### Step 1: Create New Client

1. In the left sidebar, click **"Clients"**

2. Click **"Create client"** button

3. Fill in the **General Settings**:
   - **Client type:** `OpenID Connect`
   - **Client ID:** `dave_client` (must match exactly)
   - **Name:** `DAVE Application` (optional, descriptive name)
   - **Description:** `DAVE Document Assistant` (optional)

4. Click **"Next"**

### Step 2: Configure Capability Config

1. On the **Capability config** page, configure:
   - **Client authentication:** ON (toggle should be green)
   - **Authorization:** OFF
   - **Authentication flow:**
     - Standard flow: ON (checked)
     - Direct access grants: ON (checked)
     - Implicit flow: OFF
     - Service accounts roles: OFF
     - OAuth 2.0 Device Authorization Grant: OFF

2. Click **"Next"**

### Step 3: Configure Login Settings

1. On the **Login settings** page, configure:

   **Valid redirect URIs:**
   ```
   http://127.0.0.1:3000/dave/api/auth/callback/keycloak
   http://127.0.0.1:3000/*
   ```
   
   **Valid post logout redirect URIs:**
   ```
   http://127.0.0.1:3000/dave
   http://127.0.0.1:3000/*
   ```
   
   **Web origins:**
   ```
   http://127.0.0.1:3000
   +
   ```
   (The `+` allows all valid redirect URIs)

2. Click **"Save"**

### Step 4: Additional Client Settings (Optional but Recommended)

1. Click on the **"dave_client"** in the clients list

2. Go to the **"Settings"** tab

3. Scroll down and configure:
   - **Access token lifespan:** `15 Minutes` (or as needed)
   - **Client session idle:** `30 Minutes`
   - **Client session max:** `12 Hours`

4. Click **"Save"**

---

## Getting the Client Secret

This is the most important step - you need this secret for your `.env` file.

### Step 1: Navigate to Credentials

1. In the **"dave_client"** client view, click the **"Credentials"** tab

2. You will see the **"Client secret"** field

### Step 2: Copy the Secret

1. Click the **"Copy to clipboard"** icon next to the client secret

   OR

2. Click on the secret value to reveal it and copy it manually

   The secret will look something like:
   ```
   8pKL2vR9mX3qW5nY7tF1jH4cZ6bA0gU2eD8sV3wN9xK
   ```

### Step 3: Regenerate Secret (Optional)

If you need to generate a new secret:

1. Click **"Regenerate"** button
2. Confirm the regeneration
3. Copy the new secret immediately

**IMPORTANT:** After regenerating, the old secret will no longer work!

---

## Updating Environment Variables

Now that you have the client secret, update your `.env` file.

### Step 1: Open `.env` File

```bash
nano .env
# or
vim .env
# or use your preferred text editor
```

### Step 2: Update KEYCLOAK_SECRET

Find the line:
```env
KEYCLOAK_SECRET=your-keycloak-secret-change-me
```

Replace it with your actual secret:
```env
KEYCLOAK_SECRET=8pKL2vR9mX3qW5nY7tF1jH4cZ6bA0gU2eD8sV3wN9xK
```

### Step 3: Verify Other Keycloak Settings

Make sure these match your setup:

```env
USE_KEYCLOAK=true
KEYCLOAK_ISSUER=http://keycloak:8080/realms/DAVE
KEYCLOAK_ID=dave_client
```

For production with a custom domain:
```env
KEYCLOAK_ISSUER=https://auth.yourdomain.com/realms/DAVE
```

### Step 4: Restart Services

After updating the `.env` file:

```bash
# Restart the UI service to pick up new environment variables
docker compose restart ui

# Or restart all services
docker compose down
docker compose up -d
```

---

## Creating Users

You need to create users in Keycloak who can log into DAVE.

### Step 1: Navigate to Users

1. In the left sidebar, click **"Users"**

2. Click **"Add user"** button

### Step 2: Create User

1. Fill in the user details:
   - **Username:** `testuser` (required)
   - **Email:** `testuser@example.com` (optional but recommended)
   - **First name:** `Test` (optional)
   - **Last name:** `User` (optional)
   - **Email verified:** ON (toggle to green)
   - **Enabled:** ON (toggle to green)

2. Click **"Create"**

### Step 3: Set User Password

1. After creating the user, click on the **"Credentials"** tab

2. Click **"Set password"** button

3. Fill in:
   - **Password:** `your-password`
   - **Password confirmation:** `your-password`
   - **Temporary:** OFF (toggle should be gray)
   
   If you leave "Temporary" ON, users will be forced to change their password on first login.

4. Click **"Save"**

5. Confirm the password change in the popup

### Step 4: Test Login

1. Navigate to DAVE UI:
   ```
   http://127.0.0.1:3000/dave
   ```

2. Log in with:
   - **Username:** `testuser`
   - **Password:** `your-password`

---

## Production Deployment Notes

For production deployments, additional configuration is required:

### 1. HTTPS Configuration

Update redirect URIs to use HTTPS:
```
https://yourdomain.com/dave/api/auth/callback/keycloak
https://yourdomain.com/*
```

### 2. Update Environment Variables

```env
KEYCLOAK_ISSUER=https://auth.yourdomain.com/realms/DAVE
NEXTAUTH_URL=https://yourdomain.com/dave/api/auth
NEXT_PUBLIC_FULL_PATH=https://yourdomain.com/dave
```

### 3. Keycloak Security Settings

1. **Change admin password:**
   - Go to admin user settings
   - Change from default `admin` password

2. **Enable SSL:**
   - Configure SSL certificates for Keycloak
   - Or put Keycloak behind reverse proxy with SSL

3. **Configure realm security:**
   - Set password policies (length, complexity)
   - Enable brute force detection
   - Configure session timeouts

### 4. Client Security

1. In client settings, set:
   - **Access Type:** `confidential`
   - **Proof Key for Code Exchange (PKCE):** ON
   - **Token Endpoint Authentication:** `Client Id and Secret`

---

## Troubleshooting

### Issue: Cannot Access Keycloak Admin Console

**Solution:**
```bash
# Check if Keycloak container is running
docker compose ps keycloak

# Check Keycloak logs
docker compose logs -f keycloak

# Restart Keycloak
docker compose restart keycloak
```

---

### Issue: "Invalid redirect URI" Error

**Cause:** The redirect URI in DAVE doesn't match what's configured in Keycloak.

**Solution:**
1. Check your `NEXTAUTH_URL` in `.env`:
   ```env
   NEXTAUTH_URL=http://127.0.0.1:3000/dave/api/auth
   ```

2. Ensure redirect URI in Keycloak includes:
   ```
   http://127.0.0.1:3000/dave/api/auth/callback/keycloak
   ```

3. Make sure you're using `127.0.0.1` not `localhost`

---

### Issue: "Invalid client secret" Error

**Cause:** The `KEYCLOAK_SECRET` in `.env` doesn't match the actual client secret.

**Solution:**
1. Go to Keycloak Admin Console
2. Navigate to: **Clients** → **dave_client** → **Credentials** tab
3. Copy the current client secret
4. Update `.env` file with the correct secret
5. Restart services: `docker compose restart ui`

---

### Issue: Login Redirects to Wrong URL

**Cause:** Base path or full path configuration mismatch.

**Solution:**
Ensure consistency across:

```env
NEXT_PUBLIC_BASE_PATH=/dave
NEXT_PUBLIC_FULL_PATH=http://127.0.0.1:3000/dave
NEXTAUTH_URL=http://127.0.0.1:3000/dave/api/auth
```

And Keycloak redirect URIs:
```
http://127.0.0.1:3000/dave/api/auth/callback/keycloak
```

---

### Issue: Realm "DAVE" Not Found

**Cause:** Realm name mismatch or realm not created.

**Solution:**
1. Verify realm exists in Keycloak Admin Console
2. Ensure realm name is exactly `DAVE` (case-sensitive)
3. Check `KEYCLOAK_ISSUER` includes `/realms/DAVE`

---

### Issue: Users Cannot Log In

**Solutions:**

1. **Check user is enabled:**
   - Go to **Users** → select user → ensure **Enabled** toggle is ON

2. **Check email verification:**
   - Set **Email verified** to ON
   - Or disable email verification requirement in realm settings

3. **Check password:**
   - Reset password in **Credentials** tab
   - Ensure **Temporary** is OFF

4. **Check realm is enabled:**
   - **Realm settings** → ensure **Enabled** is ON

---

## Disabling Keycloak (Use Basic Auth Instead)

If you don't want to use Keycloak, you can disable it:

1. Update `.env`:
   ```env
   USE_KEYCLOAK=false
   ```

2. Restart services:
   ```bash
   docker compose restart ui documents
   ```

3. Log in with basic auth credentials:
   - Username: value of `ACCESS_USERNAME` (default: `admin`)
   - Password: value of `ACCESS_PASSWORD` (default: `password`)

---

## Advanced Configuration

### Custom Themes

Keycloak supports custom themes for login pages:

1. Create theme directory: `./keycloak/themes/dave-theme`
2. Mount as volume in `docker-compose.yml`
3. Configure in realm settings

### User Federation

Connect to external user directories:

1. **LDAP/Active Directory:**
   - Go to **User Federation** → **Add provider** → **ldap**

2. **Custom providers:**
   - Implement custom SPI (Service Provider Interface)

### Social Login

Enable login with Google, GitHub, etc.:

1. Go to **Identity Providers**
2. Add provider (Google, GitHub, Facebook, etc.)
3. Configure client ID and secret from provider

---

## Additional Resources

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [NextAuth.js Keycloak Provider](https://next-auth.js.org/providers/keycloak)
- [OpenID Connect Protocol](https://openid.net/connect/)
- [Main DAVE README](../README.md)
- [Environment Variables Reference](ENVIRONMENT_VARIABLES.md)

---

**Last Updated:** 2024

For questions or issues, please refer to the project documentation or contact the development team.