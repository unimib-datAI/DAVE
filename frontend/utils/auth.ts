/**
 * Authentication utility functions
 *
 * Provides a centralized way to check if authentication is enabled
 * across the frontend application.
 */

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
  return callbackUrl ? `${url}?callbackUrl=${encodeURIComponent(callbackUrl)}` : url;
};
