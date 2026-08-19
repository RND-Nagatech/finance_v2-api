import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || JWT_SECRET;

export interface JWTPayload {
  id: string;
  username: string;
  role: string;
  pegawai_id?: string;
  name?: string;
  iss?: string;
}

export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

export const verifyToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload & { userId?: string };
    return { ...decoded, id: decoded.id || decoded.userId || '' };
  } catch (error) {
    const decoded = jwt.verify(token, PORTAL_JWT_SECRET) as JWTPayload & { userId?: string };
    return { ...decoded, id: decoded.id || decoded.userId || '' };
  }
};
