/**
 * Encryption utility for securing sensitive data in browser storage
 * Uses Web Crypto API for encryption/decryption
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

/**
 * Derives a cryptographic key from a password using PBKDF2
 */
async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const importedKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
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
 * Generates a device-specific password based on browser fingerprint
 * This provides a base level of obfuscation without requiring user input
 */
function getDevicePassword(): string {
  // Create a fingerprint based on various browser properties
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    new Date().getTimezoneOffset(),
    screen.colorDepth,
    screen.width + 'x' + screen.height,
  ].join('|');

  // Hash the fingerprint to create a consistent password
  return btoa(fingerprint);
}

/**
 * Encrypts a string using AES-GCM
 */
export async function encrypt(plaintext: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Derive key from device password
    const password = getDevicePassword();
    const key = await deriveKey(password, salt);

    // Encrypt the data
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv,
      },
      key,
      data
    );

    // Combine salt + iv + encrypted data
    const combined = new Uint8Array(
      salt.length + iv.length + encryptedData.byteLength
    );
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encryptedData), salt.length + iv.length);

    // Convert to base64 for storage
    return btoa(String.fromCharCode(...Array.from(combined)));
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts an encrypted string
 */
export async function decrypt(encryptedText: string): Promise<string> {
  try {
    // Decode from base64
    const combined = Uint8Array.from(atob(encryptedText), (c) =>
      c.charCodeAt(0)
    );

    // Extract salt, iv, and encrypted data
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const encryptedData = combined.slice(SALT_LENGTH + IV_LENGTH);

    // Derive key from device password
    const password = getDevicePassword();
    const key = await deriveKey(password, salt);

    // Decrypt the data
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv,
      },
      key,
      encryptedData
    );

    // Convert back to string
    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Securely stores data in localStorage with encryption
 */
export async function secureStore(key: string, value: any): Promise<void> {
  try {
    const jsonString = JSON.stringify(value);
    const encrypted = await encrypt(jsonString);
    localStorage.setItem(key, encrypted);
  } catch (error) {
    console.error('Error storing data:', error);
    throw error;
  }
}

/**
 * Retrieves and decrypts data from localStorage
 */
export async function secureRetrieve<T>(key: string): Promise<T | null> {
  try {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) {
      return null;
    }

    const decrypted = await decrypt(encrypted);
    return JSON.parse(decrypted) as T;
  } catch (error) {
    console.error('Error retrieving data:', error);
    // If decryption fails, remove the corrupted data
    localStorage.removeItem(key);
    return null;
  }
}

/**
 * Removes data from localStorage
 */
export function secureRemove(key: string): void {
  localStorage.removeItem(key);
}
