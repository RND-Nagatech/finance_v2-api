import { randomUUID } from 'crypto';
import { RequestHandler } from 'express';
import { AgentRequest } from '../common/agentTypes';

function safeHeader(value: string | undefined, prefix: string) {
  if (value && /^[A-Za-z0-9._:-]{1,128}$/.test(value)) return value;
  return `${prefix}_${randomUUID()}`;
}

export const agentRequestContextMiddleware: RequestHandler = (req, res, next) => {
  const requestId = safeHeader(req.header('x-request-id'), 'req');
  const correlationId = safeHeader(req.header('x-correlation-id'), 'corr');
  const agentRequest = req as AgentRequest;

  agentRequest.agentContext = {
    requestId,
    correlationId,
    startedAt: Date.now(),
  };

  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-Id', correlationId);
  next();
};
