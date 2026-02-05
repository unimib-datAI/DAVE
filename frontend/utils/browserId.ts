// DAVE/frontend/utils/browserId.ts

/**
 * Generates and stores a unique browser ID in localStorage.
 * Returns the existing ID if already generated.
 */
export function getBrowserId(): string {
  const key = 'browserId';
  let id = localStorage.getItem(key);
  if (!id) {
    // Generate a UUID v4
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
