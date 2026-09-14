import jwt from "jsonwebtoken";
import env from "../constants/env.js";

export interface SessionPayload {
  sub: string;
  email: string;
}

export function signAccessToken(payload: SessionPayload) {
  return jwt.sign(payload, env.JWT_SECRET as string, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function signRefreshToken(payload: SessionPayload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET as string, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Rotasi secret tanpa downtime (Guide §8.3): token yang diterbitkan dengan
 * JWT_SECRET_OLD tetap diterima sampai kedaluwarsa sendiri. Penandatanganan
 * SELALU memakai JWT_SECRET yang baru.
 */
function verifyWithRotation(token: string, current: string, previous?: string) {
  try {
    return jwt.verify(token, current) as SessionPayload;
  } catch (error) {
    if (!previous) throw error;
    return jwt.verify(token, previous) as SessionPayload;
  }
}

export function verifyAccessToken(token: string): SessionPayload {
  return verifyWithRotation(
    token,
    env.JWT_SECRET as string,
    env.JWT_SECRET_OLD,
  );
}

export function verifyRefreshToken(token: string): SessionPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET as string) as SessionPayload;
}
