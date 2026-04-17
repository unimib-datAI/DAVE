import { expressLoader } from "./express";
import { mongoLoader } from "./mongo";
import { User } from "../models/user";
import { Permission } from "../models/permissions";

export const startServer = async (callback) => {
  const PORT = process.env.DOCS_PORT;
  // setup express routes
  const app = expressLoader();
  // setup mongodb
  await mongoLoader();

  // ensure a default admin exists (create if no users in DB)
  try {
    await User.ensureDefaultAdmin();
    console.log("Default admin check complete");
  } catch (err) {
    console.error("Error ensuring default admin:", err);
  }

  // ensure a default permissions document exists
  try {
    await Permission.ensureDefaultPermissions();
    console.log("Default permissions check complete");
  } catch (err) {
    console.error("Error ensuring default permissions:", err);
  }

  // start server
  const server = app.listen(PORT, () => callback({ PORT }));

  return server;
};
