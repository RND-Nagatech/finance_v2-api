import { Request, Response, NextFunction } from 'express';

export const errorLoggerMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Log error details to console
  console.error('❌ Error occurred:');
  console.error(`   Method: ${req.method}`);
  console.error(`   Path: ${req.path}`);
  console.error(`   Message: ${err.message}`);
  console.error(`   Stack: ${err.stack}`);
  console.error(`   Timestamp: ${new Date().toISOString()}`);
  console.error('---');

  // Send error response
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};