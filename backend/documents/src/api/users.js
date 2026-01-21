import { Router } from "express";
import { asyncRoute } from "../utils/async-route";
import { validateRequest } from "zod-express-middleware";
import { z } from "zod";
import { keycloakService } from "../services/keycloak";

const route = Router();

async function getAllUsers(req, res) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const allUsers = await keycloakService.getAllUsers();

    const sanitizedUsers = allUsers.map((user) => ({
      id: user.userId,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    }));

    return res.json(sanitizedUsers);
  } catch (error) {
    console.error("Error fetching users from Keycloak:", error);
    return res.status(500).json({
      message: "Failed to fetch users",
      error: error.message,
    });
  }
}

async function createUser(req, res) {
  try {
    const userId = req.user?.sub;
    const { email, password, firstName, lastName } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const result = await keycloakService.createUser({
      email,
      password,
      firstName,
      lastName,
    });

    return res.json(result);
  } catch (error) {
    console.error("Error creating user in Keycloak:", error);

    if (error.message && error.message.includes("already exists")) {
      return res.status(409).json({
        message: "User with this email already exists",
      });
    }

    return res.status(500).json({
      message: error?.message || "Failed to create user",
    });
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
          email: z.string().email(),
          password: z.string().min(8),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
        }),
      },
    }),
    asyncRoute(createUser),
  );
};
