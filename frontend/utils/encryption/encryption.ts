/**
 * Encryption module removed.
 *
 * This file intentionally no longer performs client-side encryption.
 * It provides simple JSON-based persistence wrappers that use localStorage.
 *
 * IMPORTANT SECURITY NOTE:
 * - Values written with these helpers (including API keys) will be stored in
 *   plaintext within the user's browser storage. Anyone with access to the
 *   browser profile can read them. If confidentiality is required, store
 *   secrets server-side or reintroduce a secure client-side encryption
 *   mechanism (with a stable device/user secret).
 *
 * BEHAVIORAL NOTE:
 * - This implementation deliberately does NOT remove or mutate existing
 *   localStorage entries that it cannot parse as JSON. That keeps previously
 *   stored (possibly encrypted) blobs intact for debugging/inspection.
 * - Calls are intentionally defensive around `localStorage` availability so
 *   the code remains safe in SSR contexts.
 */

/**
 * Persist a JSON-serializable value to localStorage under `key`.
 */
export async function secureStore(key: string, value: any): Promise<void> {
  try {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available in this environment');
    }

    const jsonString = JSON.stringify(value);
    localStorage.setItem(key, jsonString);
  } catch (error) {
    // Keep the error visible in the console so developers can debug storage issues.
    console.error('[storage] Error storing data for key', key, error);
    throw error;
  }
}

/**
 * Retrieve a value previously saved with `secureStore`.
 * Returns parsed object or null if missing/invalid.
 *
 * This will not attempt to decrypt or mutate existing values that are not valid
 * JSON. It simply logs the parse error and returns null so callers fall back to
 * defaults.
 */
export async function secureRetrieve<T>(key: string): Promise<T | null> {
  try {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available in this environment');
    }

    const raw = localStorage.getItem(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch (parseErr) {
      // The stored value is not valid JSON. Log it for debugging and return null.
      // Do NOT remove the stored item automatically to avoid accidental data loss.
      console.warn(
        '[storage] Stored value for key appears to be non-JSON (possibly legacy encrypted data):',
        key
      );
      console.warn(
        '[storage] Raw value length:',
        typeof raw === 'string' ? raw.length : 'unknown'
      );
      console.warn('[storage] JSON parse error:', parseErr);
      return null;
    }
  } catch (error) {
    console.error('[storage] Error retrieving data for key', key, error);
    return null;
  }
}

/**
 * Remove a persisted entry from localStorage.
 */
export function secureRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.error(
      '[storage] Error removing item from localStorage for key',
      key,
      error
    );
  }
}
