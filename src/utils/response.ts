import { Response } from 'express';
import { ApiResponse } from '../types';

export const successResponse = <T>(
  res: Response,
  message: string,
  data?: T,
  statusCode: number = 200
): Response => {
  const response: ApiResponse<T> = {
    success: true,
    message,
    data,
  };
  return res.status(statusCode).json(response);
};

export const errorResponse = (
  res: Response,
  message: string,
  error?: string,
  statusCode: number = 400
): Response => {
  const response: ApiResponse = {
    success: false,
    message,
    error,
  };
  return res.status(statusCode).json(response);
};
