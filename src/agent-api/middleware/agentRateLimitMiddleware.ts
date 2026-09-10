import { RequestHandler } from 'express';
import { AgentHttpError, AgentRequest } from '../common/agentTypes';

const buckets = new Map<string, { startedAt: number; count: number }>();
const windowMs = 60_000;

export const agentRateLimitMiddleware: RequestHandler = (req, res, next) => {
  const configuredLimit = Number(process.env.AGENT_API_RATE_LIMIT || 100);
  const limit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 100;
  const context = (req as AgentRequest).agentContext;
  const key = context?.caller || req.ip || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.startedAt >= windowMs) {
    buckets.set(key, { startedAt: now, count: 1 });
    next();
    return;
  }

  if (bucket.count >= limit) {
    res.setHeader('Retry-After', '60');
    next(new AgentHttpError(429, 'RATE_LIMIT_EXCEEDED', 'Agent API rate limit exceeded'));
    return;
  }

  bucket.count += 1;
  next();
};
