// Keycloak user shape (admin user-management UI). Moved out of
// server/routers/user.ts.

/**
 * Renamed from `User` during the type extraction — `collection.ts` had a
 * different Mongo-shaped type by the same name (now `CollectionUser`).
 */
export type KeycloakUser = {
  id: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  roles: string[];
  createdAt?: string;
  updatedAt?: string;
};
