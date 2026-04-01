import { Router } from "express";
import { asyncRoute } from "../utils/async-route";
import { AuthController } from "../controllers/auth";
import { keycloakService } from "../services/keycloak";

const route = Router();

export default (app) => {
  app.use("/auth", route);

  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     summary: Login with local credentials
   *     description: Authenticates with the local email/password store and returns an access + refresh token pair.
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/LocalLoginRequest'
   *     responses:
   *       200:
   *         description: Login successful
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/LocalTokenResponse'
   *       401:
   *         description: Invalid credentials
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  route.post(
    "/login",
    asyncRoute(async (req, res) => {
      const { email, password } = req.body;
      const data = await AuthController.login(email, password);
      return res.json(data);
    }),
  );

  /**
   * @swagger
   * /api/auth/refresh:
   *   post:
   *     summary: Refresh local access token
   *     description: Exchanges a local refresh token for a new access token.
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/RefreshRequest'
   *     responses:
   *       200:
   *         description: New access token issued
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/LocalTokenResponse'
   *       401:
   *         description: Invalid or expired refresh token
   */
  route.post(
    "/refresh",
    asyncRoute(async (req, res) => {
      const { refreshToken } = req.body;
      const data = await AuthController.refresh(refreshToken);
      return res.json(data);
    }),
  );

  /**
   * @swagger
   * /api/auth/me:
   *   get:
   *     summary: Get current user from local JWT
   *     description: Decodes the provided local access token and returns the authenticated user.
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: User info
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 user:
   *                   $ref: '#/components/schemas/UserInfo'
   *       401:
   *         description: Missing or invalid token
   */
  route.get(
    "/me",
    asyncRoute(async (req, res) => {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
      if (!token) return res.status(401).json({ message: "Missing token" });
      const user = await AuthController.meFromJwt(token);
      return res.json({ user });
    }),
  );

  /**
   * @swagger
   * /api/auth/logout:
   *   post:
   *     summary: Logout (invalidate local refresh token)
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/RefreshRequest'
   *     responses:
   *       200:
   *         description: Logged out successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok:
   *                   type: boolean
   */
  route.post(
    "/logout",
    asyncRoute(async (req, res) => {
      const { refreshToken } = req.body;
      await AuthController.logout(refreshToken);
      return res.json({ ok: true });
    }),
  );

  /**
   * @swagger
   * /api/auth/keycloak-login:
   *   post:
   *     summary: Login via Keycloak (server-side / full API mode)
   *     description: |
   *       Authenticates directly against Keycloak using the **Resource Owner
   *       Password Credentials (ROPC)** grant — no browser redirect needed.
   *       Requires *Direct Access Grants* to be enabled on the Keycloak client.
   *
   *       Use the returned `access_token` as a Bearer token for all subsequent
   *       API calls.
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/KeycloakLoginRequest'
   *           example:
   *             username: user@example.com
   *             password: yourpassword
   *     responses:
   *       200:
   *         description: Login successful — returns Keycloak token response
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/KeycloakTokenResponse'
   *       400:
   *         description: Missing username or password
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       401:
   *         description: Invalid credentials
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  route.post(
    "/keycloak-login",
    asyncRoute(async (req, res) => {
      const { username, password } = req.body;
      if (!username || !password) {
        return res
          .status(400)
          .json({ message: "username and password are required" });
      }
      const tokens = await keycloakService.loginUser(username, password);
      return res.json(tokens);
    }),
  );

  /**
   * @swagger
   * /api/auth/keycloak-refresh:
   *   post:
   *     summary: Refresh Keycloak token
   *     description: Exchanges a Keycloak `refresh_token` for a new token pair.
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/RefreshRequest'
   *     responses:
   *       200:
   *         description: New token pair issued
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/KeycloakTokenResponse'
   *       400:
   *         description: Missing refresh token
   *       401:
   *         description: Invalid or expired refresh token
   */
  route.post(
    "/keycloak-refresh",
    asyncRoute(async (req, res) => {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ message: "refreshToken is required" });
      }
      const tokens = await keycloakService.refreshToken(refreshToken);
      return res.json(tokens);
    }),
  );

  /**
   * @swagger
   * /api/auth/keycloak-logout:
   *   post:
   *     summary: Logout from Keycloak (revoke refresh token)
   *     description: Revokes a Keycloak `refresh_token` server-side, invalidating the session.
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/RefreshRequest'
   *     responses:
   *       200:
   *         description: Logged out successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok:
   *                   type: boolean
   *       400:
   *         description: Missing refresh token
   */
  route.post(
    "/keycloak-logout",
    asyncRoute(async (req, res) => {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ message: "refreshToken is required" });
      }
      await keycloakService.logoutUser(refreshToken);
      return res.json({ ok: true });
    }),
  );
};
