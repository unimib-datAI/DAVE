import { Router } from "express";
import document from "./document";
import save from "./save";
import auth from "./auth";
import collection from "./collection";
import users from "./users";
import exportRoute from "./export";
import search from "./search";
import rag from "./rag";
import permissionsRoute from "./permissions";
import entity from "./entity";

/**
 * Export all defined routes
 */
export default () => {
  const app = Router();
  document(app);
  save(app);
  auth(app);
  collection(app);
  entity(app);
  users(app);
  search(app);
  rag(app);
  permissionsRoute(app);
  // Register export route. The handler should start the export in a detached worker/process
  // so that the main API remains responsive while the export runs.
  exportRoute(app);
  return app;
};
