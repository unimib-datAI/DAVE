import { expressLoader } from "./express";
import { mongoLoader } from "./mongo";
import { User } from "../models/user";

export const startServer = async (callback) => {
    const PORT = process.env.DOCS_PORT;
    // setup express routes
    const app = expressLoader();
    // setup mongodb
    await mongoLoader();

    // ensure a default admin exists (create if no users in DB)
    try {
        await User.ensureDefaultAdmin();
        console.log("✅ Default admin check complete");
    } catch (err) {
        console.error("❌ Error ensuring default admin:", err);
    }

    // start server
    const server = app.listen(PORT, () => callback({ PORT }));

    return server;
};
