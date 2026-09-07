// Collection domain model. Moved out of server/routers/collection.ts.

export type collectionDocInfo = {
  name: string;
  preview?: string;
  id: string;
};

export type Collection = {
  id: string;
  name: string;
  ownerId: string;
  allowedUserIds: string[];
  createdAt: string;
  updatedAt: string;
};

/**
 * A user as seen from the collection-sharing UI (Mongo `users` shape).
 *
 * Renamed from `User` during the type extraction — `user.ts` had a different
 * Keycloak-shaped type by the same name (now `KeycloakUser`).
 */
export type CollectionUser = {
  userId: string;
  email: string;
  name?: string;
};
