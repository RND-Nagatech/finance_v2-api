import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User from '../models/User';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || JWT_SECRET;

export interface AuthRequest extends Request {
  user?: any;
}

function compact(values: any[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (value === undefined || value === null ? '' : String(value).trim()))
        .filter(Boolean)
    )
  );
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'No token' });
  const token = authHeader.split(' ')[1];
  try {
    let payload: string | jwt.JwtPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      payload = jwt.verify(token, PORTAL_JWT_SECRET);
    }
    const tokenUser: any = typeof payload === 'string' ? { sub: payload } : payload;
    const ownerValues = compact([
      tokenUser.userId,
      tokenUser.id,
      tokenUser._id,
      tokenUser.sub,
    ]);
    const usernames = compact([tokenUser.username, tokenUser.email]);

    const lookupConditions = [
      ...(ownerValues.length > 0 ? [{ portal_user_id: { $in: ownerValues } }] : []),
      ...(usernames.length > 0 ? [{ portal_email: { $in: usernames } }] : []),
      ...(usernames.length > 0 ? [{ username: { $in: usernames } }] : []),
    ];
    const localUser = lookupConditions.length > 0
      ? await User.findOne({ $or: lookupConditions }).select('_id username name role portal_user_id portal_email').lean()
      : null;

    req.user = {
      ...tokenUser,
      portal_user_id: ownerValues[0] || tokenUser.portal_user_id || '',
      portal_email: tokenUser.email || tokenUser.username || '',
      finance_user_id: localUser?._id ? String(localUser._id) : undefined,
      finance_username: localUser?.username,
      finance_role: localUser?.role,
      role: localUser?.role || tokenUser.role,
      username: tokenUser.username || tokenUser.email || localUser?.username,
      email: tokenUser.email || tokenUser.username,
      name: tokenUser.name || localUser?.name,
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};
