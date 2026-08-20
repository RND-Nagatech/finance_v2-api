import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../utils/response';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Error:', err);

  if (err.name === 'ValidationError') {
    errorResponse(res, 'Validation Error', err.message, 400);
    return;
  }

  if (err.name === 'CastError') {
    errorResponse(res, 'Invalid ID format', err.message, 400);
    return;
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    errorResponse(res, 'Duplicate entry', `${field} already exists`, 400);
    return;
  }

  errorResponse(res, 'Internal Server Error', err.message, 500);
};
