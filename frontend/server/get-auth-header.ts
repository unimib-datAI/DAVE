import { toBase64 } from '@/utils/shared';
import { serverConfig } from '@/lib/config/server';

export const getAuthHeader = () => {
  if (!serverConfig.app.useAuth) {
    return ''; // No Authorization header when auth is disabled
  }
  return `Basic ${toBase64(
    `${serverConfig.externalBackend.username}:${serverConfig.externalBackend.password}`
  )}`;
};
