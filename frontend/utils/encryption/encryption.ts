/**
 * Encryption utility for securing sensitive data in browser storage
 * Uses Web Crypto API (AES-GCM) when available.
 *
 * This file guards access to Web Crypto APIs (crypto.subtle and crypto.getRandomValues)
 * and provides a non-cryptographic fallback so the app does not crash in environments
 * where Web Crypto isn't available (SSR, older browsers, misconfigured runtimes).
 *
 * IMPORTANT:
 * - The fallback is INSECURE (simple XOR-based obfuscation). It exists only to avoid
 *   runtime errors and preserve functionality when Web Crypto isn't present.
 * - If security is important in your deployment, ensure Web Crypto is available in the
 *   execution environment (run encryption only on the client). Prefer the real Web Crypto.
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes for AES-GCM
const SALT_LENGTH = 16; // bytes

const hasGlobalCrypto =
  typeof globalThis !== 'undefined' &&
  typeof (globalThis as any).crypto !== 'undefined';

// crypto object (if present)
const nativeCrypto: Crypto | undefined = hasGlobalCrypto
  ? ((globalThis as any).crypto as Crypto)
  : undefined;

// Some runtimes expose subtle under crypto.subtle or crypto.webcrypto.subtle
const subtle =
  (nativeCrypto &&
    (nativeCrypto.subtle || (nativeCrypto as any).webcrypto?.subtle)) ||
  undefined;

const hasSubtle = typeof subtle !== 'undefined';
const hasGetRandomValues = !!(
  nativeCrypto && typeof nativeCrypto.getRandomValues === 'function'
);

/**
 * getRandomBytes - generate cryptographically strong random bytes when possible,
 * otherwise fall back to less secure Math.random based bytes.
 */
function getRandomBytes(length: number): Uint8Array {
  if (hasGetRandomValues && nativeCrypto) {
    const arr = new Uint8Array(length);
    nativeCrypto.getRandomValues(arr);
    return arr;
  }

  // Try Node fallback if available (this branch will usually be removed in browser bundles).
  // We access require dynamically to avoid static bundler resolution. This may fail in many setups.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maybeRequire: any = (globalThis as any).require;
    if (typeof maybeRequire === 'function') {
      const nodeCrypto = maybeRequire('crypto');
      if (nodeCrypto && typeof nodeCrypto.randomBytes === 'function') {
        return new Uint8Array(nodeCrypto.randomBytes(length));
      }
    }
  } catch {
    // ignore and fallback to Math.random
  }

  // Last resort: insecure PRNG
  console.warn(
    '[encryption] crypto.getRandomValues not available — falling back to insecure Math.random PRNG'
  );
  const arr = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    arr[i] = Math.floor(Math.random() * 256);
  }
  return arr;
}

/**
 * getDevicePassword - creates a device bound password string used for deriving keys.
 * This is the same as before: combines a few browser properties so stored data is device-specific.
 * If running outside the browser (no navigator), returns a fallback static string.
 */
function getDevicePassword(): string {
  try {
    const navigatorObj = (globalThis as any).navigator;
    const screenObj = (globalThis as any).screen;
    const fingerprint = [
      navigatorObj?.userAgent || 'unknown',
      navigatorObj?.language || 'unknown',
      typeof new Date().getTimezoneOffset === 'function'
        ? new Date().getTimezoneOffset()
        : 0,
      screenObj?.colorDepth || 0,
      (screenObj?.width || 0) + 'x' + (screenObj?.height || 0),
    ].join('|');

    // Note: btoa may throw in some environments; guard it.
    try {
      return btoa(fingerprint);
    } catch {
      return Buffer.from(fingerprint).toString('base64');
    }
  } catch {
    return 'device-password-fallback';
  }
}

/**
 * deriveKeySubtle - derive a CryptoKey using PBKDF2 -> AES-GCM (Web Crypto).
 */
async function deriveKeySubtle(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const importedKey = await (subtle as SubtleCrypto).importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return (subtle as SubtleCrypto).deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    importedKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * deriveKeyFallbackBytes - fallback KDF that produces KEY_LENGTH/8 bytes deterministically
 * from password + salt. THIS IS NOT CRYPTOGRAPHICALLY SECURE. Use only when Web Crypto is unavailable.
 */
function deriveKeyFallbackBytes(
  password: string,
  salt: Uint8Array
): Uint8Array {
  const encoder = new TextEncoder();
  const pwdBytes = encoder.encode(password);

  // Create an intermediate buffer by concatenating salt + password bytes
  const combined = new Uint8Array(salt.length + pwdBytes.length);
  combined.set(salt, 0);
  combined.set(pwdBytes, salt.length);

  // A simple non-secure mixing function (FNV-like mix) to expand to key length.
  const keyLen = KEY_LENGTH / 8;
  const key = new Uint8Array(keyLen);

  // initialize state from combined data
  let state = 0x811c9dc5 >>> 0;
  for (let i = 0; i < combined.length; i++) {
    state ^= combined[i];
    state = (state * 0x01000193) >>> 0;
  }

  // expand
  for (let i = 0; i < keyLen; i++) {
    // mix more
    state ^= i;
    state = (state * 0x01000193) >>> 0;
    // take bytes from state
    key[i] = (state >>> ((i % 4) * 8)) & 0xff;
  }

  return key;
}

/**
 * encrypt - main encryption function
 * - if Web Crypto is available: AES-GCM with PBKDF2
 * - otherwise: fallback XOR-based obfuscation using derived key bytes
 *
 * Returns base64(salt + iv + ciphertext)
 */
export async function encrypt(plaintext: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    const salt = getRandomBytes(SALT_LENGTH);
    const iv = getRandomBytes(IV_LENGTH);

    const password = getDevicePassword();

    if (hasSubtle) {
      // Use real Web Crypto AES-GCM
      const key = await deriveKeySubtle(password, salt);
      const encryptedData = await (subtle as SubtleCrypto).encrypt(
        {
          name: ALGORITHM,
          iv,
        },
        key,
        data
      );

      // Combine salt + iv + encrypted data
      const encryptedBytes = new Uint8Array(
        encryptedData instanceof ArrayBuffer
          ? encryptedData
          : new Uint8Array(encryptedData)
      );
      const combined = new Uint8Array(
        salt.length + iv.length + encryptedBytes.byteLength
      );
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(encryptedBytes, salt.length + iv.length);

      // Convert to base64
      let binary = '';
      for (let i = 0; i < combined.length; i++)
        binary += String.fromCharCode(combined[i]);
      try {
        return btoa(binary);
      } catch {
        // Node/browser-compat fallback
        return Buffer.from(combined).toString('base64');
      }
    }

    // Fallback encryption path (insecure)
    console.warn(
      '[encryption] Web Crypto not available — using insecure fallback encryption. Data may not be secure.'
    );

    const keyBytes = deriveKeyFallbackBytes(password, salt);
    const ciphertext = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      // combine key + iv to make XOR stream
      const k = keyBytes[(i + iv[0]) % keyBytes.length];
      const v = iv[i % iv.length];
      ciphertext[i] = data[i] ^ k ^ v;
    }

    const combined = new Uint8Array(
      salt.length + iv.length + ciphertext.length
    );
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(ciphertext, salt.length + iv.length);

    let binary = '';
    for (let i = 0; i < combined.length; i++)
      binary += String.fromCharCode(combined[i]);
    try {
      return btoa(binary);
    } catch {
      return Buffer.from(combined).toString('base64');
    }
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * decrypt - counterpart to encrypt
 * Accepts base64(salt + iv + ciphertext) and returns plaintext
 */
export async function decrypt(encryptedText: string): Promise<string> {
  try {
    // Decode base64
    let combined: Uint8Array;
    try {
      const binary = atob(encryptedText);
      combined = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    } catch {
      // Node/browser-compat fallback
      combined = new Uint8Array(Buffer.from(encryptedText, 'base64'));
    }

    if (combined.length < SALT_LENGTH + IV_LENGTH) {
      throw new Error('Invalid encrypted data');
    }

    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const encryptedData = combined.slice(SALT_LENGTH + IV_LENGTH);

    const password = getDevicePassword();

    if (hasSubtle) {
      const key = await deriveKeySubtle(password, salt);
      const decrypted = await (subtle as SubtleCrypto).decrypt(
        {
          name: ALGORITHM,
          iv,
        },
        key,
        encryptedData
      );
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    }

    // Fallback decryption (insecure)
    console.warn(
      '[encryption] Web Crypto not available — using insecure fallback decryption. Data may not be secure.'
    );

    const keyBytes = deriveKeyFallbackBytes(password, salt);
    const decrypted = new Uint8Array(encryptedData.length);
    for (let i = 0; i < encryptedData.length; i++) {
      const k = keyBytes[(i + iv[0]) % keyBytes.length];
      const v = iv[i % iv.length];
      decrypted[i] = encryptedData[i] ^ k ^ v;
    }

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * secureStore - store JSON-serializable value in localStorage with encryption
 */
export async function secureStore(key: string, value: any): Promise<void> {
  try {
    const jsonString = JSON.stringify(value);
    const encrypted = await encrypt(jsonString);

    // localStorage may be unavailable in SSR; guard it
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available in this environment');
    }

    localStorage.setItem(key, encrypted);
  } catch (error) {
    console.error('Error storing data:', error);
    throw error;
  }
}

/**
 * secureRetrieve - get and decrypt item from localStorage
 */
export async function secureRetrieve<T>(key: string): Promise<T | null> {
  try {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available in this environment');
    }

    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;

    const decrypted = await decrypt(encrypted);
    return JSON.parse(decrypted) as T;
  } catch (error) {
    console.error('Error retrieving data:', error);
    // If decryption fails, remove the corrupted data to avoid repeated errors
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
    return null;
  }
}

/**
 * secureRemove - remove item from localStorage
 */
export function secureRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.error('Error removing item from localStorage:', error);
  }
}
