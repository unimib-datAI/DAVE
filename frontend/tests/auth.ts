import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ─── User definitions ────────────────────────────────────────────────────────

export interface UserCredentials {
  username: string;
  password: string;
  /** Unique key used to name the saved storage-state file */
  storageKey: string;
}

// Accounts of the shared test deployment by default. Set PW_DEV_USERS=1 to use
// the users that scripts/setupKeycloakDev.ts creates in a local dev Keycloak
// (dev-admin / dev-editor / dev-viewer, password KEYCLOAK_DEV_PASSWORD or dev123).
const useDevUsers = process.env.PW_DEV_USERS === '1';
const devPassword = process.env.KEYCLOAK_DEV_PASSWORD || 'dev123';

export const USERS = (
  useDevUsers
    ? {
        admin: {
          username: 'dev-admin',
          password: devPassword,
          storageKey: 'admin',
        },
        viewer: {
          username: 'dev-viewer',
          password: devPassword,
          storageKey: 'viewer',
        },
        editor: {
          username: 'dev-editor',
          password: devPassword,
          storageKey: 'editor',
        },
      }
    : {
        admin: {
          username: 'admin@daveadmin.com',
          password: 'daveAdmin42!',
          storageKey: 'admin',
        },
        viewer: {
          username: 'viewer@dave.com',
          password: 'daveViewer42!',
          storageKey: 'viewer',
        },
        editor: {
          username: 'editor@dave.com',
          password: 'daveEditor42!',
          storageKey: 'editor',
        },
      }
) satisfies Record<string, UserCredentials>;

export type UserKey = keyof typeof USERS;

// ─── Storage-state paths ─────────────────────────────────────────────────────

const AUTH_DIR = path.join(process.cwd(), 'playwright', '.auth');

/** Returns the path where the storage state for a given user is persisted. */
export function storageStatePath(userKey: UserKey | string): string {
  return path.join(AUTH_DIR, `${userKey}.json`);
}

/** Ensures the .auth directory exists. */
export function ensureAuthDir(): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// ─── Core login helper ────────────────────────────────────────────────────────

/**
 * Performs the full Keycloak login flow for the supplied credentials.
 * After a successful login the caller is responsible for persisting the
 * browser context's storage state if needed.
 *
 * @example
 * await loginAs(page, USERS.admin);
 * await loginAs(page, { username: 'foo@bar.com', password: 'secret', storageKey: 'foo' });
 */
export async function loginAs(
  page: Page,
  user: UserCredentials,
  baseURL = 'http://localhost:3010/holmes24'
): Promise<void> {
  // 1. Navigate to the sign-in page
  await page.goto(`${baseURL}/sign-in`, { waitUntil: 'networkidle' });

  // 2. Click the "Sign in with Keycloak" button
  const signInBtn = page
    .locator('button')
    .filter({ hasText: /sign in/i })
    .first();
  await signInBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await signInBtn.click();

  // 3. Wait for the Keycloak login form
  await page.waitForSelector('#username', {
    state: 'visible',
    timeout: 15_000,
  });
  await page.waitForSelector('#password', {
    state: 'visible',
    timeout: 15_000,
  });

  // 4. Fill in credentials
  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill(user.password);

  // 5. Submit
  await page.click('#kc-login');

  // 6. Wait for a successful redirect away from the sign-in page
  await page.waitForLoadState('networkidle');
  await page.waitForURL(/\/holmes24(?!\/sign-in)/, { timeout: 10_000 });
}
