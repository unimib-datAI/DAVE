import KcAdminClient from "@keycloak/keycloak-admin-client";
import axios from "axios";

const KEYCLOAK_ISSUER =
  process.env.KEYCLOAK_ISSUER || "http://keycloak:8080/realms/dave";
const KEYCLOAK_ADMIN_USER = process.env.KEYCLOAK_ADMIN || "admin";
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || "admin";
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_ID || "dave_client";
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_SECRET || "";

// Extract realm from issuer URL (e.g., "http://keycloak:8080/realms/dave" -> "dave")
const getRealm = () => {
  const match = KEYCLOAK_ISSUER.match(/\/realms\/([^\/]+)/);
  return match ? match[1] : "dave";
};

// Extract base URL (e.g., "http://keycloak:8080/realms/dave" -> "http://keycloak:8080")
const getBaseUrl = () => {
  return KEYCLOAK_ISSUER.split("/realms/")[0];
};

const TARGET_REALM = getRealm();
const BASE_URL = getBaseUrl();

class KeycloakService {
  constructor() {
    this.adminClient = null;
    this.lastAuth = null;
  }

  async getAdminClient() {
    // Authenticate if not authenticated or token expired (refresh every 50 seconds)
    if (
      !this.adminClient ||
      !this.lastAuth ||
      Date.now() - this.lastAuth > 50000
    ) {
      try {
        // Admin user is in the master realm, so we authenticate there
        this.adminClient = new KcAdminClient({
          baseUrl: BASE_URL,
          realmName: "master", // Admin authentication happens in master realm
        });

        await this.adminClient.auth({
          username: KEYCLOAK_ADMIN_USER,
          password: KEYCLOAK_ADMIN_PASSWORD,
          grantType: "password",
          clientId: "admin-cli",
        });

        this.lastAuth = Date.now();
      } catch (error) {
        console.error(
          "Failed to authenticate with Keycloak admin:",
          error.message,
        );
        throw error;
      }
    }
    return this.adminClient;
  }

  async getAllUsers() {
    try {
      const client = await this.getAdminClient();

      // Switch to target realm to fetch users
      client.setConfig({
        realmName: TARGET_REALM,
      });

      const users = await client.users.find();

      // Map Keycloak users to our format
      const mappedUsers = users.map((user) => ({
        id: user.id,
        userId: user.id,
        email: user.email || "",
        name:
          user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.username || user.email || "",
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        enabled: user.enabled,
        emailVerified: user.emailVerified,
        createdAt: user.createdTimestamp
          ? new Date(user.createdTimestamp)
          : null,
      }));

      return mappedUsers;
    } catch (error) {
      console.error("Error fetching users from Keycloak:", error.message);
      throw new Error(`Failed to fetch users from Keycloak: ${error.message}`);
    }
  }

  async getUserById(userId) {
    try {
      const client = await this.getAdminClient();

      // Switch to target realm
      client.setConfig({
        realmName: TARGET_REALM,
      });

      const user = await client.users.findOne({ id: userId });

      if (!user) {
        return null;
      }

      return {
        id: user.id,
        userId: user.id,
        email: user.email || "",
        name:
          user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.username || user.email || "",
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        enabled: user.enabled,
        emailVerified: user.emailVerified,
        createdAt: user.createdTimestamp
          ? new Date(user.createdTimestamp)
          : null,
      };
    } catch (error) {
      console.error(
        `Error fetching user ${userId} from Keycloak:`,
        error.message,
      );
      return null;
    }
  }

  async createUser({ email, password, firstName, lastName }) {
    try {
      const client = await this.getAdminClient();

      // Switch to target realm
      client.setConfig({
        realmName: TARGET_REALM,
      });

      const newUser = await client.users.create({
        email,
        username: email,
        firstName: firstName || "",
        lastName: lastName || "",
        enabled: true,
        emailVerified: false,
        credentials: [
          {
            type: "password",
            value: password,
            temporary: false,
          },
        ],
      });

      return {
        id: newUser.id,
        email,
        name: firstName && lastName ? `${firstName} ${lastName}` : email,
      };
    } catch (error) {
      console.error("Error creating user in Keycloak:", error.message);
      throw new Error(`Failed to create user in Keycloak: ${error.message}`);
    }
  }

  /**
   * Authenticate a user directly against Keycloak using the Resource Owner
   * Password Credentials (ROPC) grant.  Returns the full token response
   * (access_token, refresh_token, expires_in, …) so callers can use the
   * access_token as a Bearer token for subsequent API calls.
   *
   * Requires "Direct Access Grants" to be enabled on the Keycloak client.
   */
  async loginUser(username, password) {
    const tokenUrl = `${KEYCLOAK_ISSUER}/protocol/openid-connect/token`;

    const params = new URLSearchParams();
    params.append("grant_type", "password");
    params.append("client_id", KEYCLOAK_CLIENT_ID);
    if (KEYCLOAK_CLIENT_SECRET) {
      params.append("client_secret", KEYCLOAK_CLIENT_SECRET);
    }
    params.append("username", username);
    params.append("password", password);
    params.append("scope", "openid");

    try {
      const response = await axios.post(tokenUrl, params, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      return response.data; // { access_token, refresh_token, expires_in, token_type, … }
    } catch (error) {
      const msg =
        error.response?.data?.error_description ||
        error.response?.data?.error ||
        error.message;
      throw new Error(`Keycloak login failed: ${msg}`);
    }
  }

  /**
   * Exchange a Keycloak refresh_token for a new token pair.
   */
  async refreshToken(refreshToken) {
    const tokenUrl = `${KEYCLOAK_ISSUER}/protocol/openid-connect/token`;

    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("client_id", KEYCLOAK_CLIENT_ID);
    if (KEYCLOAK_CLIENT_SECRET) {
      params.append("client_secret", KEYCLOAK_CLIENT_SECRET);
    }
    params.append("refresh_token", refreshToken);

    try {
      const response = await axios.post(tokenUrl, params, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      return response.data;
    } catch (error) {
      const msg =
        error.response?.data?.error_description ||
        error.response?.data?.error ||
        error.message;
      throw new Error(`Keycloak token refresh failed: ${msg}`);
    }
  }

  /**
   * Revoke (logout) a Keycloak refresh_token server-side.
   */
  async logoutUser(refreshToken) {
    const logoutUrl = `${KEYCLOAK_ISSUER}/protocol/openid-connect/logout`;

    const params = new URLSearchParams();
    params.append("client_id", KEYCLOAK_CLIENT_ID);
    if (KEYCLOAK_CLIENT_SECRET) {
      params.append("client_secret", KEYCLOAK_CLIENT_SECRET);
    }
    params.append("refresh_token", refreshToken);

    try {
      await axios.post(logoutUrl, params, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    } catch (error) {
      const msg =
        error.response?.data?.error_description ||
        error.response?.data?.error ||
        error.message;
      throw new Error(`Keycloak logout failed: ${msg}`);
    }
  }

  async updateUser(userId, { email, firstName, lastName, password }) {
    try {
      const client = await this.getAdminClient();
      client.setConfig({ realmName: TARGET_REALM });

      const updatePayload = {};
      if (email !== undefined) {
        updatePayload.email = email;
        updatePayload.username = email; // keep username in sync with email
      }
      if (firstName !== undefined) updatePayload.firstName = firstName;
      if (lastName !== undefined) updatePayload.lastName = lastName;

      if (Object.keys(updatePayload).length > 0) {
        await client.users.update({ id: userId }, updatePayload);
      }

      if (password) {
        await client.users.resetPassword({
          id: userId,
          credential: { type: "password", value: password, temporary: false },
        });
      }

      return { ok: true };
    } catch (error) {
      console.error(
        `Error updating user ${userId} in Keycloak:`,
        error.message,
      );
      throw new Error(`Failed to update user in Keycloak: ${error.message}`);
    }
  }

  async getUserRealmRoles(userId) {
    try {
      const client = await this.getAdminClient();
      client.setConfig({ realmName: TARGET_REALM });
      const roles = await client.users.listRealmRoleMappings({ id: userId });
      const MANAGED = ["admin", "editor", "viewer"];
      return roles.map((r) => r.name).filter((n) => MANAGED.includes(n));
    } catch (error) {
      console.error(`Error fetching roles for user ${userId}:`, error.message);
      return [];
    }
  }

  async setUserRealmRoles(userId, roleNames) {
    try {
      const client = await this.getAdminClient();
      client.setConfig({ realmName: TARGET_REALM });

      const allRoles = await client.roles.find();
      const currentRoles = await client.users.listRealmRoleMappings({
        id: userId,
      });
      const MANAGED = ["admin", "editor", "viewer"];

      const rolesToRemove = currentRoles.filter(
        (r) => MANAGED.includes(r.name) && !roleNames.includes(r.name),
      );
      const currentNames = currentRoles.map((r) => r.name);
      const rolesToAdd = allRoles.filter(
        (r) => roleNames.includes(r.name) && !currentNames.includes(r.name),
      );

      if (rolesToRemove.length > 0) {
        await client.users.delRealmRoleMappings({
          id: userId,
          roles: rolesToRemove,
        });
      }
      if (rolesToAdd.length > 0) {
        await client.users.addRealmRoleMappings({
          id: userId,
          roles: rolesToAdd,
        });
      }

      return { ok: true };
    } catch (error) {
      console.error(`Error setting roles for user ${userId}:`, error.message);
      throw new Error(`Failed to set user roles in Keycloak: ${error.message}`);
    }
  }

  async deleteUser(userId) {
    try {
      const client = await this.getAdminClient();
      client.setConfig({ realmName: TARGET_REALM });
      await client.users.del({ id: userId });
      return { ok: true };
    } catch (error) {
      console.error(
        `Error deleting user ${userId} from Keycloak:`,
        error.message,
      );
      throw new Error(`Failed to delete user from Keycloak: ${error.message}`);
    }
  }
}

export const keycloakService = new KeycloakService();
