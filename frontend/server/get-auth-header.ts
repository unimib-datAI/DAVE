import { toBase64 } from '@/utils/shared';

export const getAuthHeader = () => {
  if (process.env.USE_AUTH === 'false') {
    return ''; // No Authorization header when auth is disabled
  }
  return `Basic ${toBase64(
    `${process.env.API_USERNAME}:${process.env.API_PASSWORD}`
  )}`;
};
