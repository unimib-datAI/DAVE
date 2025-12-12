import { Router } from "express";
import document from "./document";
import save from "./save";
import auth from "./auth";
import collection from "./collection";
import users from "./users";

/**
 * Export all defined routes
 */
export default () => {
  const app = Router();
  document(app);
  save(app);
  auth(app);
  collection(app);
  users(app);
  return app;
};
