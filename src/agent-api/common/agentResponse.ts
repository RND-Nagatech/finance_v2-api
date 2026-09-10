import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import {
  AgentContext,
  AgentMetadata,
  AgentPagination,
  AgentRequest,
  AgentSource,
  AgentHttpError,
} from './agentTypes';

function getContext(req: Request): AgentContext {
  const context = (req as AgentRequest).agentContext;
  if (context) return context;

  return {
    requestId: `req_${randomUUID()}`,
    correlationId: `corr_${randomUUID()}`,
    startedAt: Date.now(),
  };
}

export function agentMetadata(
  req: Request,
  source: AgentSource,
  extra: Pick<AgentMetadata, 'dataAsOf' | 'pagination'> = {}
): AgentMetadata {
  const context = getContext(req);
  return {
    source,
    generatedAt: new Date().toISOString(),
    requestId: context.requestId,
    correlationId: context.correlationId,
    ...extra,
  };
}

export function sendAgentSuccess<T>(
  req: Request,
  res: Response,
  source: AgentSource,
  data: T,
  statusCode = 200,
  extra: Pick<AgentMetadata, 'dataAsOf' | 'pagination'> = {}
) {
  return res.status(statusCode).json({
    success: true,
    data,
    metadata: agentMetadata(req, source, extra),
  });
}

export function sendAgentCollection<T>(
  req: Request,
  res: Response,
  source: AgentSource,
  items: T[],
  pagination: AgentPagination,
  dataAsOf?: string
) {
  return sendAgentSuccess(req, res, source, { items }, 200, { pagination, dataAsOf });
}

export function sendAgentError(
  req: Request,
  res: Response,
  error: unknown,
  fallbackSource: AgentSource = 'finance-api'
) {
  const agentError = error instanceof AgentHttpError
    ? error
    : new AgentHttpError(500, 'INTERNAL_ERROR', 'Internal server error');

  return res.status(agentError.statusCode).json({
    success: false,
    error: {
      code: agentError.code,
      message: agentError.message,
      details: agentError.details,
    },
    metadata: agentMetadata(req, fallbackSource),
  });
}
