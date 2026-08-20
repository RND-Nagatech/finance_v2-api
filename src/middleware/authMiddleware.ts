import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || JWT_SECRET;

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
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
    req.user = payload; // payload bisa berupa { _id, username, email, ... }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};
