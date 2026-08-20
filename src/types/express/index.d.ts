import { IUser } from '../../models/User';
import 'express-serve-static-core';

declare global {
  namespace Express {
    interface User extends IUser {}
    interface Request {
      user?: IUser | string;
    }
  }
}
