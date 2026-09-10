import { ErrorRequestHandler } from 'express';
import { sendAgentError } from '../common/agentResponse';
import { AgentRequest } from '../common/agentTypes';

export const agentErrorMiddleware: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const context = (req as AgentRequest).agentContext;
  console.error(JSON.stringify({
    requestId: context?.requestId,
    correlationId: context?.correlationId,
    caller: context?.caller,
    method: req.method,
    path: req.originalUrl,
    errorCode: error?.code,
    errorMessage: error?.message,
  }));

  sendAgentError(req, res, error);
};
