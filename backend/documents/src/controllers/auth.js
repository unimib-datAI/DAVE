import jwt from "jsonwebtoken";
import crypto from "crypto";
import { RefreshToken } from "../models/refreshToken";
import { User } from "../models/user"; // if you implement this
import { HTTPError, HTTP_ERROR_CODES } from "../utils/http-error";

const JWT_SECRET = process.env.JWT_SECRET || "secret";
const ACCESS_EXPIRES = parseInt(
  process.env.ACCESS_TOKEN_EXPIRES_IN || "3600",
  10,
);
const REFRESH_EXPIRES = parseInt(
  process.env.REFRESH_TOKEN_EXPIRES_IN || `${7 * 24 * 3600}`,
  10,
);

// Log basic auth configuration (helpful for debugging startup)
console.log(
  `AuthController configured: ACCESS_EXPIRES=${ACCESS_EXPIRES}s REFRESH_EXPIRES=${REFRESH_EXPIRES}s`,
);

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.userId,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES },
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString("hex");
}

function maskToken(t) {
  if (!t || typeof t !== "string") return "<missing>";
  return t.slice(0, 8) + "...";
}

export const AuthController = {
  async createUser({ email, password }) {
    const existing = await User.findOne({
      email: email.toLowerCase().trim(),
    });
    if (existing) throw new Error("User already exists");
    const user = new User({ email });
    await user.setPassword(password);
    await user.save();
    console.log(
      `AuthController.createUser: created ${user.userId} (${user.email})`,
    );
    return user;
  },
  async verifyCredentials(email, password) {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      console.log(`AuthController.verifyCredentials: no user for ${email}`);
      return null;
    }
    const ok = await user.validatePassword(password);
    if (!ok) {
      console.log(
        `AuthController.verifyCredentials: invalid password for ${email}`,
      );
      return null;
    }
    console.log(`AuthController.verifyCredentials: verified ${user.userId}`);
    return user;
  },
  async login(email, password) {
    console.log(`AuthController.login: attempt for email=${email}`);
    // Verify credentials and obtain the mongoose user document (so instance methods like validatePassword work)
    const user = await this.verifyCredentials(email, password);
    if (!user) {
      console.log(`AuthController.login: invalid credentials for ${email}`);
      throw new Error("Invalid credentials");
    }

    // Sign access token using the verified user
    const accessToken = signAccessToken(user);
    const refreshToken = generateRefreshToken();

    const rt = new RefreshToken({
      token: refreshToken,
      userId: user.userId,
      expiresAt: new Date(Date.now() + REFRESH_EXPIRES * 1000),
    });
    await rt.save();

    // Return a plain object representation for the user to avoid returning mongoose internals
    const userObj =
      typeof user.toObject === "function" ? user.toObject() : user;

    console.log(
      `AuthController.login: success userId=${user.userId} refreshToken=${maskToken(refreshToken)} accessExpiresIn=${ACCESS_EXPIRES}s`,
    );
    return {
      user: userObj,
      accessToken,
      refreshToken,
      expiresIn: ACCESS_EXPIRES,
    };
  },
  async refresh(refreshToken) {
    console.log(
      `AuthController.refresh: attempt refresh=${maskToken(refreshToken)}`,
    );
    if (!refreshToken) {
      console.log("AuthController.refresh: missing refresh token");
      throw new HTTPError({
        code: HTTP_ERROR_CODES.UNAUTHORIZED,
        message: "Missing refresh token",
      });
    }
    const dbToken = await RefreshToken.findOne({ token: refreshToken });
    if (!dbToken) {
      console.log("AuthController.refresh: refresh token not found in DB");
      throw new HTTPError({
        code: HTTP_ERROR_CODES.FORBIDDEN,
        message: "Invalid refresh token",
      });
    }
    if (dbToken.revoked) {
      console.log("AuthController.refresh: refresh token revoked");
      throw new HTTPError({
        code: HTTP_ERROR_CODES.FORBIDDEN,
        message: "Invalid refresh token",
      });
    }
    if (dbToken.expiresAt < new Date()) {
      console.log(
        "AuthController.refresh: refresh token expired",
        dbToken.expiresAt,
      );
      throw new HTTPError({
        code: HTTP_ERROR_CODES.FORBIDDEN,
        message: "Invalid refresh token",
      });
    }

    const user = await User.findOne({ userId: dbToken.userId }).lean();
    if (!user) {
      console.log(
        `AuthController.refresh: user not found for userId=${dbToken.userId}`,
      );
      throw new HTTPError({
        code: HTTP_ERROR_CODES.NOT_FOUND,
        message: "User not found",
      });
    }

    // revoke previous refresh token
    dbToken.revoked = true;
    await dbToken.save();
    console.log(
      `AuthController.refresh: revoked old refresh token for userId=${dbToken.userId} token=${maskToken(dbToken.token)}`,
    );

    // create a new refresh token
    const newRefreshToken = generateRefreshToken();
    const newToken = new RefreshToken({
      token: newRefreshToken,
      userId: user.userId,
      // fix: call Date.now() (was Date.now) so expiry is computed correctly
      expiresAt: new Date(Date.now() + REFRESH_EXPIRES * 1000),
    });
    await newToken.save();
    const accessToken = signAccessToken(user);

    // Ensure we return a plain user object
    const userObj =
      typeof user.toObject === "function" ? user.toObject() : user;

    console.log(
      `AuthController.refresh: issued new refreshToken=${maskToken(newRefreshToken)} accessExpiresIn=${ACCESS_EXPIRES}s for userId=${user.userId}`,
    );

    return {
      user: userObj,
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: ACCESS_EXPIRES,
    };
  },
  async checkIsAdmin(userId) {
    const userObj = await User.findOne({ userId: userId });
    if (!userObj) throw new Error("Current user not found");
    return userObj.role && userObj.role === "admin";
  },
  async meFromJwt(token) {
    console.log(
      `AuthController.meFromJwt: verifying token=${maskToken(token)}`,
    );
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = await User.findOne({ userId: payload.sub }).lean();
      console.log(`AuthController.meFromJwt: success userId=${payload.sub}`);
      return user;
    } catch (err) {
      console.log(
        "AuthController.meFromJwt: invalid token",
        err && err.message ? err.message : err,
      );
      throw new Error("Invalid token");
    }
  },
  async logout(refreshToken) {
    console.log(
      `AuthController.logout: revoking refreshToken=${maskToken(refreshToken)}`,
    );
    await RefreshToken.updateOne({ token: refreshToken }, { revoked: true });
    console.log("AuthController.logout: completed");
  },
};
