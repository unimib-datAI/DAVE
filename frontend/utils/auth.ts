/**
 * Authentication utility functions
 *
 * Provides a centralized way to check if authentication is enabled
 * across the frontend application.
 */

/**
 * Decodes a Keycloak JWT access token (without signature verification — client-side only)
 * and returns all user roles: realm-level roles + all resource-access client roles.
 *
 * Keycloak tokens carry roles in two places:
 *   - `realm_access.roles`            → realm-level roles (e.g. "editor", "viewer", "admin")
 *   - `resource_access[*].roles`      → per-client roles
 *
 * A single-value `role` field is also checked for compatibility with the local JWT auth mode.
 */
export function getUserRolesFromToken(accessToken: string): string[] {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return [];

    // base64url → base64 → JSON
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      Array.prototype.map
        .call(
          atob(b64),
          (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        )
        .join('')
    );
    const payload = JSON.parse(jsonPayload);

    const realmRoles: string[] = payload?.realm_access?.roles ?? [];

    // Collect roles from every client registered in resource_access
    const clientRoles: string[] = Object.values(
      payload?.resource_access ?? {}
    ).flatMap((client: any) => client?.roles ?? []);

    // Compatibility: local JWT may carry a single `role` string instead
    const singleRole: string[] = payload?.role ? [payload.role] : [];

    return Array.from(new Set([...realmRoles, ...clientRoles, ...singleRole]));
  } catch {
    return [];
  }
}

/**
 * Checks if authentication is enabled based on the environment variable
 * @returns {boolean} true if authentication is enabled, false otherwise
 */
export const isAuthEnabled = (): boolean => {
  return process.env.NEXT_PUBLIC_USE_AUTH !== 'false';
};

/**
 * Checks if authentication is disabled based on the environment variable
 * @returns {boolean} true if authentication is disabled, false otherwise
 */
export const isAuthDisabled = (): boolean => {
  return process.env.NEXT_PUBLIC_USE_AUTH === 'false';
};

/**
 * Gets the default redirect URL after authentication
 * @param callbackUrl Optional callback URL from query params
 * @returns {string} The redirect URL
 */
export const getAuthRedirectUrl = (callbackUrl?: string): string => {
  return callbackUrl || '/';
};

/**
 * Gets the sign-in URL with optional callback
 * @param callbackUrl Optional callback URL to redirect after sign-in
 * @returns {string} The sign-in URL
 */
export const getSignInUrl = (callbackUrl?: string): string => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const url = `${basePath}/sign-in`;
  return callbackUrl
    ? `${url}?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : url;
};
