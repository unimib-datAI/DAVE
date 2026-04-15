import { Router } from "express";
import { asyncRoute } from "../utils/async-route";
import { validateRequest } from "zod-express-middleware";
import { z } from "zod";
import { keycloakService } from "../services/keycloak";
import { requireAdmin } from "../middlewares/keycloak-auth";

const route = Router();

async function getAllUsers(req, res) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const allUsers = await keycloakService.getAllUsers();

    const usersWithRoles = await Promise.all(
      allUsers.map(async (user) => {
        const roles = await keycloakService.getUserRealmRoles(
          user.id || user.userId,
        );
        return {
          id: user.id || user.userId,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          name: user.name,
          roles,
          createdAt: user.createdAt,
        };
      }),
    );

    return res.json(usersWithRoles);
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
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { email, password, firstName, lastName, role } = req.body;

    const result = await keycloakService.createUser({
      email,
      password,
      firstName,
      lastName,
    });

    if (role) {
      await keycloakService.setUserRealmRoles(result.id, [role]);
    }

    return res.json({ ...result, roles: role ? [role] : [] });
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

async function deleteUser(req, res) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;
    await keycloakService.deleteUser(id);

    return res.json({ ok: true });
  } catch (error) {
    console.error("Error deleting user in Keycloak:", error);
    return res.status(500).json({
      message: error?.message || "Failed to delete user",
    });
  }
}

async function updateUser(req, res) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;
    const { email, firstName, lastName, password, role } = req.body;

    await keycloakService.updateUser(id, {
      email,
      firstName,
      lastName,
      password,
    });

    if (role !== undefined) {
      await keycloakService.setUserRealmRoles(id, role ? [role] : []);
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("Error updating user in Keycloak:", error);
    return res.status(500).json({
      message: error?.message || "Failed to update user",
    });
  }
}

export default (app) => {
  app.use("/users", route);

  route.get("/", requireAdmin, asyncRoute(getAllUsers));

  route.post(
    "/",
    requireAdmin,
    validateRequest({
      req: {
        body: z.object({
          email: z.string().email(),
          password: z.string().min(8),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          role: z.enum(["admin", "editor", "viewer"]).optional(),
        }),
      },
    }),
    asyncRoute(createUser),
  );

  route.put(
    "/:id",
    requireAdmin,
    validateRequest({
      req: {
        body: z.object({
          email: z.string().email().optional(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          password: z.string().min(8).optional(),
          role: z.enum(["admin", "editor", "viewer", ""]).optional(),
        }),
      },
    }),
    asyncRoute(updateUser),
  );

  route.delete("/:id", requireAdmin, asyncRoute(deleteUser));
};
