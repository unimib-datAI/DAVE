// Ported from backend/documents/src/controllers/auth.js
//
// Note: this local email/password JWT auth path has no caller in the Next.js
// UI (sign-in only uses Keycloak via NextAuth) - ported for parity since
// external API consumers may still use it directly.

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { RefreshTokenModel } from '../db/models/RefreshToken';
import { UserModel, IUser } from '../db/models/User';
import { dbConnect } from '../db/connection';
import { HTTPError } from './httpError';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const ACCESS_EXPIRES = parseInt(process.env.ACCESS_TOKEN_EXPIRES_IN || '3600', 10);
const REFRESH_EXPIRES = parseInt(
  process.env.REFRESH_TOKEN_EXPIRES_IN || `${7 * 24 * 3600}`,
  10
);

function signAccessToken(user: { userId: string; email: string }) {
  return jwt.sign(
    {
      sub: user.userId,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function maskToken(t?: string | null) {
  if (!t || typeof t !== 'string') return '<missing>';
  return t.slice(0, 8) + '...';
}

export const AuthController = {
  async createUser({ email, password }: { email: string; password: string }) {
    await dbConnect();
    const existing = await UserModel.findOne({ email: email.toLowerCase().trim() });
    if (existing) throw new Error('User already exists');
    const user = new UserModel({ email });
    await user.setPassword(password);
    await user.save();
    return user;
  },

  async verifyCredentials(email: string, password: string): Promise<IUser | null> {
    await dbConnect();
    const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      console.log(`AuthController.verifyCredentials: no user for ${email}`);
      return null;
    }
    const ok = await user.validatePassword(password);
    if (!ok) {
      console.log(`AuthController.verifyCredentials: invalid password for ${email}`);
      return null;
    }
    console.log(`AuthController.verifyCredentials: verified ${user.userId}`);
    return user;
  },

  async login(email: string, password: string) {
    console.log(`AuthController.login: attempt for email=${email}`);
    const user = await this.verifyCredentials(email, password);
    if (!user) {
      console.log(`AuthController.login: invalid credentials for ${email}`);
      throw new Error('Invalid credentials');
    }

    const accessToken = signAccessToken(user);
    const refreshToken = generateRefreshToken();

    const rt = new RefreshTokenModel({
      token: refreshToken,
      userId: user.userId,
      expiresAt: new Date(Date.now() + REFRESH_EXPIRES * 1000),
    });
    await rt.save();

    const userObj = typeof (user as any).toObject === 'function' ? (user as any).toObject() : user;

    console.log(
      `AuthController.login: success userId=${user.userId} refreshToken=${maskToken(
        refreshToken
      )} accessExpiresIn=${ACCESS_EXPIRES}s`
    );
    return {
      user: userObj,
      accessToken,
      refreshToken,
      expiresIn: ACCESS_EXPIRES,
    };
  },

  async refresh(refreshToken: string) {
    console.log(`AuthController.refresh: attempt refresh=${maskToken(refreshToken)}`);
    await dbConnect();
    if (!refreshToken) {
      console.log('AuthController.refresh: missing refresh token');
      throw new HTTPError({ code: 401, message: 'Missing refresh token' });
    }
    const dbToken = await RefreshTokenModel.findOne({ token: refreshToken });
    if (!dbToken) {
      console.log('AuthController.refresh: refresh token not found in DB');
      throw new HTTPError({ code: 403, message: 'Invalid refresh token' });
    }
    if (dbToken.revoked) {
      console.log('AuthController.refresh: refresh token revoked');
      throw new HTTPError({ code: 403, message: 'Invalid refresh token' });
    }
    if (dbToken.expiresAt < new Date()) {
      console.log('AuthController.refresh: refresh token expired', dbToken.expiresAt);
      throw new HTTPError({ code: 403, message: 'Invalid refresh token' });
    }

    const user = await UserModel.findOne({ userId: dbToken.userId }).lean();
    if (!user) {
      console.log(`AuthController.refresh: user not found for userId=${dbToken.userId}`);
      throw new HTTPError({ code: 404, message: 'User not found' });
    }

    // revoke previous refresh token
    dbToken.revoked = true;
    await dbToken.save();

    // create a new refresh token
    const newRefreshToken = generateRefreshToken();
    const newToken = new RefreshTokenModel({
      token: newRefreshToken,
      userId: user.userId,
      expiresAt: new Date(Date.now() + REFRESH_EXPIRES * 1000),
    });
    await newToken.save();
    const accessToken = signAccessToken(user as any);

    return {
      user,
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: ACCESS_EXPIRES,
    };
  },

  async checkIsAdmin(userId: string) {
    await dbConnect();
    const userObj = await UserModel.findOne({ userId });
    if (!userObj) throw new Error('Current user not found');
    return userObj.role === 'admin';
  },

  async meFromJwt(token: string) {
    await dbConnect();
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
      const user = await UserModel.findOne({ userId: payload.sub }).lean();
      return user;
    } catch (err: any) {
      console.log('AuthController.meFromJwt: invalid token', err?.message ?? err);
      throw new Error('Invalid token');
    }
  },

  async logout(refreshToken: string) {
    await dbConnect();
    await RefreshTokenModel.updateOne({ token: refreshToken }, { revoked: true });
  },
};
