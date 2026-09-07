/**
 * Config barrel.
 *
 * Only re-exports the CLIENT-SAFE config so a stray `@/lib/config` import
 * from a component can't accidentally pull in (empty) server config. Server
 * code imports `@/lib/config/server` explicitly.
 */
export { publicConfig } from './public';
export type { PublicConfig } from './public';
