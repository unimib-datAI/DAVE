import { Router } from "express";
import { asyncRoute } from "../utils/async-route";
import { CollectionController } from "../controllers/collection";
import { validateRequest } from "zod-express-middleware";
import { z } from "zod";
import User from "../models/user";
import { AuthController } from "../controllers/auth";

const route = Router();
async function getAllUsers(req, res) {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const userObj = await User.findOne({ userId: userId });
  if (!userObj) {
    return res.status(404).json({ message: "User not found" });
  }
  const allUsers = await User.find({}).lean();
  const sanitizedUsers = allUsers.map((user) => ({
    id: user.userId,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }));
  return res.json(sanitizedUsers);
}

async function createUser(req, res) {
  try {
    const userId = req.user?.sub;
    const { email, password } = req.body;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    let checkRes = await AuthController.checkIsAdmin(userId);
    if (!checkRes) return res.status(401).json({ message: "Unauthorized" });
    else {
      try {
        let result = await AuthController.createUser({ email, password });
        if (result) return res.json(result);
        else {
          console.error("Error creating new user", error);
          return res.status(500).json({ message: "Internal server error" });
        }
      } catch (error) {
        console.error("Error creating new user catched", error);

        return res
          .status(500)
          .json({ message: error?.message || "Internal server error" });
      }
    }
  } catch (error) {
    console.error("Error in createUser", error);
    return res
      .status(401)
      .json({ message: "The user is unathorized to do this operation" });
  }
}
export default (app) => {
  app.use("/users", route);
  route.get("/", asyncRoute(getAllUsers));
  route.post(
    "/",
    validateRequest({
      req: {
        body: z.object({
          email: z.string(),
          password: z.string(),
        }),
      },
    }),
    asyncRoute(createUser),
  );
};
