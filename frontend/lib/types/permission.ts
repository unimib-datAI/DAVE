// Permission matrix shape. Moved out of server/routers/permission.ts.

export type DAVEPermissions = {
  _id: string;
  collections: {
    create: string[];
    update: string[];
    delete: string[];
    view: string[];
    deAnonimize: string[];
  };
  document: {
    update: string[];
  };
  chat: {
    canUse: string[];
    canDevMode: string[];
  };
  settings: {
    llm: string[];
    pipeline: string[];
  };
};
