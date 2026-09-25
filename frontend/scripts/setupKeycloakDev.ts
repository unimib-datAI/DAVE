// Idempotent local-dev Keycloak bootstrap: ensures the realm, client, the
// app's realm roles, and a login-ready admin user all exist and are
// correctly configured, matching what the app (permission.ts,
// keycloakAuth.ts, pages/api/auth/[...nextauth].ts) expects. Safe to re-run
// any time the keycloak container is recreated - every step checks for the
// existing object before creating it.
//
// Usage:
//   cd frontend
//   npx tsx scripts/setupKeycloakDev.ts
//
// Reads KEYCLOAK_ISSUER / KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD /
// KEYCLOAK_ID from the environment (frontend/.env), and creates/updates:
//   - the realm (from the issuer URL)
//   - a confidential client with KEYCLOAK_ID, standard flow + direct access
//     grants enabled, redirect URI matching NEXTAUTH_URL
//   - realm roles: admin, editor, viewer (the app's MANAGED_ROLES)
//   - a dev user (default: dev@dave.local / dev123) with the "admin" role
//   - one single-role dev user per role (dev-admin/dev-editor/dev-viewer,
//     same password) for the sign-in page's quick dev-login buttons
//
// Prints the resolved client id/secret at the end so you can confirm they
// match frontend/.env's KEYCLOAK_ID/KEYCLOAK_SECRET.

import 'dotenv/config';

const ISSUER = process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/DAVE';
const BASE_URL = ISSUER.split('/realms/')[0];
const REALM = ISSUER.split('/realms/')[1] || 'DAVE';
const ADMIN_USER = process.env.KEYCLOAK_ADMIN || 'admin';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';
const CLIENT_ID = process.env.KEYCLOAK_ID || 'dave_client';
// Fixed, not auto-generated: Keycloak normally assigns a random secret on
// client creation, which meant every realm rebuild (e.g. after wiping
// postgres/data) silently produced a NEW secret, requiring a manual
// .env update + dev-server restart each time. Pin it instead - this exact
// value is written into `secret` on both create and update below, so it's
// stable across rebuilds. Override with KEYCLOAK_DEV_CLIENT_SECRET if you
// want your own; dev-only, never used outside NODE_ENV !== 'production'.
const CLIENT_SECRET =
  process.env.KEYCLOAK_DEV_CLIENT_SECRET || 'dev-only-fixed-secret-3f6a9c2e1b8d4f57';
const NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'http://localhost:3010/holmes24/api/auth';
const APP_ORIGIN = new URL(NEXTAUTH_URL).origin;
const REDIRECT_URI = `${NEXTAUTH_URL}/callback/keycloak`;

const DEV_USERNAME = process.env.KEYCLOAK_DEV_USERNAME || 'dev';
const DEV_EMAIL = process.env.KEYCLOAK_DEV_EMAIL || 'dev@dave.local';
const DEV_PASSWORD = process.env.KEYCLOAK_DEV_PASSWORD || 'dev123';

const MANAGED_ROLES = ['admin', 'editor', 'viewer'];

// One dedicated single-role user per role, so the sign-in page's dev-login
// buttons can log in as exactly one role at a time (username `dev-<role>`,
// same password for all - convenience only, gated behind NODE_ENV in the
// app itself, see [...nextauth].ts).
const DEV_ROLE_USERS = MANAGED_ROLES.map((role) => ({
  role,
  username: `dev-${role}`,
  email: `dev-${role}@dave.local`,
  password: DEV_PASSWORD,
}));

async function getAdminToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: 'admin-cli',
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
      grant_type: 'password',
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to authenticate as Keycloak admin: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function api(token: string, method: string, path: string, body?: any) {
  const res = await fetch(`${BASE_URL}/admin${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function ensureRealm(token: string) {
  const res = await api(token, 'GET', `/realms/${REALM}`);
  if (res.status === 200) {
    console.log(`Realm "${REALM}" already exists.`);
    return;
  }
  console.log(`Creating realm "${REALM}"...`);
  const create = await api(token, 'POST', `/realms`, { realm: REALM, enabled: true });
  if (!create.ok) throw new Error(`Failed to create realm: ${create.status} ${await create.text()}`);
}

async function ensureClient(token: string): Promise<{ id: string; secret: string }> {
  const list = await api(token, 'GET', `/realms/${REALM}/clients?clientId=${CLIENT_ID}`);
  const clients = await list.json();
  let internalId: string;

  if (clients.length > 0) {
    internalId = clients[0].id;
    console.log(`Client "${CLIENT_ID}" already exists (${internalId}) - updating flags/redirects/secret...`);
    const update = await api(token, 'PUT', `/realms/${REALM}/clients/${internalId}`, {
      ...clients[0],
      protocol: 'openid-connect',
      publicClient: false,
      secret: CLIENT_SECRET,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: true,
      redirectUris: Array.from(new Set([...(clients[0].redirectUris || []), REDIRECT_URI])),
      webOrigins: Array.from(new Set([...(clients[0].webOrigins || []), APP_ORIGIN])),
    });
    if (!update.ok) throw new Error(`Failed to update client: ${update.status} ${await update.text()}`);
  } else {
    console.log(`Creating client "${CLIENT_ID}"...`);
    const create = await api(token, 'POST', `/realms/${REALM}/clients`, {
      clientId: CLIENT_ID,
      protocol: 'openid-connect',
      publicClient: false,
      secret: CLIENT_SECRET,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: true,
      redirectUris: [REDIRECT_URI],
      webOrigins: [APP_ORIGIN],
    });
    if (!create.ok) throw new Error(`Failed to create client: ${create.status} ${await create.text()}`);
    const list2 = await api(token, 'GET', `/realms/${REALM}/clients?clientId=${CLIENT_ID}`);
    internalId = (await list2.json())[0].id;
  }

  // Set explicitly above rather than read back from Keycloak, so it's
  // always this fixed value regardless of what Keycloak auto-generated
  // before we overwrote it.
  return { id: internalId, secret: CLIENT_SECRET };
}

async function ensureRealmRoles(token: string) {
  const list = await api(token, 'GET', `/realms/${REALM}/roles`);
  const existing = new Set((await list.json()).map((r: any) => r.name));
  for (const role of MANAGED_ROLES) {
    if (existing.has(role)) {
      console.log(`Realm role "${role}" already exists.`);
      continue;
    }
    console.log(`Creating realm role "${role}"...`);
    const create = await api(token, 'POST', `/realms/${REALM}/roles`, { name: role });
    if (!create.ok) throw new Error(`Failed to create role ${role}: ${create.status} ${await create.text()}`);
  }
}

async function ensureUser(
  token: string,
  { username, email, password, role }: { username: string; email: string; password: string; role: string }
) {
  const list = await api(token, 'GET', `/realms/${REALM}/users?username=${username}&exact=true`);
  const users = await list.json();
  let userId: string;

  if (users.length > 0) {
    userId = users[0].id;
    console.log(`User "${username}" already exists (${userId}) - resetting password...`);
  } else {
    console.log(`Creating user "${username}"...`);
    const create = await api(token, 'POST', `/realms/${REALM}/users`, {
      username,
      email,
      enabled: true,
      emailVerified: true,
    });
    if (!create.ok) throw new Error(`Failed to create user: ${create.status} ${await create.text()}`);
    const list2 = await api(token, 'GET', `/realms/${REALM}/users?username=${username}&exact=true`);
    userId = (await list2.json())[0].id;
  }

  const pwRes = await api(token, 'PUT', `/realms/${REALM}/users/${userId}/reset-password`, {
    type: 'password',
    value: password,
    temporary: false,
  });
  if (!pwRes.ok) throw new Error(`Failed to set password: ${pwRes.status} ${await pwRes.text()}`);

  const rolesRes = await api(token, 'GET', `/realms/${REALM}/roles/${role}`);
  const roleRep = await rolesRes.json();
  const assign = await api(token, 'POST', `/realms/${REALM}/users/${userId}/role-mappings/realm`, [
    { id: roleRep.id, name: roleRep.name },
  ]);
  // 409/already-assigned is fine; only fail on real errors.
  if (!assign.ok && assign.status !== 409) {
    console.warn(`Warning: role assignment returned ${assign.status}: ${await assign.text()}`);
  }
  console.log(`User "${username}" has the "${role}" realm role.`);
}

async function ensureDevUsers(token: string) {
  // The original single "admin" dev user, kept for backwards compatibility
  // with anyone already using it.
  await ensureUser(token, { username: DEV_USERNAME, email: DEV_EMAIL, password: DEV_PASSWORD, role: 'admin' });
  // One user per role, for the sign-in page's quick dev-login buttons.
  for (const u of DEV_ROLE_USERS) {
    await ensureUser(token, u);
  }
}

async function main() {
  console.log(`Bootstrapping Keycloak dev realm "${REALM}" at ${BASE_URL}...`);
  const token = await getAdminToken();
  await ensureRealm(token);
  const { secret } = await ensureClient(token);
  await ensureRealmRoles(token);
  await ensureDevUsers(token);

  console.log('\n── Done ──────────────────────────────────────────────────');
  console.log(`Realm:          ${REALM}`);
  console.log(`Client id:      ${CLIENT_ID}`);
  console.log(`Client secret:  ${secret}`);
  console.log(`Dev login:      ${DEV_USERNAME} / ${DEV_PASSWORD}  (email: ${DEV_EMAIL}, role: admin)`);
  for (const u of DEV_ROLE_USERS) {
    console.log(`Dev login:      ${u.username} / ${u.password}  (email: ${u.email}, role: ${u.role})`);
  }
  console.log('\nMake sure frontend/.env (and root .env) have:');
  console.log(`  KEYCLOAK_ID=${CLIENT_ID}`);
  console.log(`  KEYCLOAK_SECRET=${secret}`);
  console.log(`  KEYCLOAK_ISSUER=${ISSUER}`);
}

main().catch((err) => {
  console.error('Keycloak dev setup failed:', err);
  process.exit(1);
});
