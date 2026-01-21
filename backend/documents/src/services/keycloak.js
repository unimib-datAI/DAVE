import KcAdminClient from "@keycloak/keycloak-admin-client";

const KEYCLOAK_ISSUER =
  process.env.KEYCLOAK_ISSUER || "http://keycloak:8080/realms/dave";
const KEYCLOAK_ADMIN_USER = process.env.KEYCLOAK_ADMIN || "admin";
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || "admin";

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
}

export const keycloakService = new KeycloakService();
