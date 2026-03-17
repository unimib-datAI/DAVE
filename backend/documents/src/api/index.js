import { Router } from "express";
import document from "./document";
import save from "./save";
import auth from "./auth";
import collection from "./collection";
import users from "./users";
import exportRoute from "./export";
import requestLogger from "../middlewares/requestLogger";

/**
 * Export all defined routes
 */
export default () => {
  const app = Router();
  // Global request logger for document/collection routes
  app.use(requestLogger);
  document(app);
  save(app);
  auth(app);
  collection(app);
  users(app);
  // Register export route. The handler should start the export in a detached worker/process
  // so that the main API remains responsive while the export runs.
  exportRoute(app);
  return app;
};
