// Shared API/domain types, extracted from server/routers/* so client code
// never imports from server route modules. Prefer importing from the
// specific file (`@/lib/types/document`) — this barrel is for convenience
// when a module needs several.
//
// NOT re-exported here: `AppRouter` (the tRPC contract) stays in
// server/routers/_app.ts.

export * from './document';
export * from './search';
export * from './taxonomy';
export * from './review';
export * from './permission';
export * from './collection';
export * from './user';
