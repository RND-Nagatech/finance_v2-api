import jwt, { Algorithm } from 'jsonwebtoken';
import { RequestHandler } from 'express';
import { AgentClaims, AgentHttpError, AgentRequest } from '../common/agentTypes';

function configuredKey() {
  const publicKey = process.env.AGENT_TOKEN_PUBLIC_KEY?.replace(/\\n/g, '\n').trim();
  const secret = process.env.AGENT_TOKEN_SECRET?.trim();
  if (!publicKey && !secret) {
    throw new AgentHttpError(503, 'AGENT_AUTH_NOT_CONFIGURED', 'Agent service authentication is not configured');
  }
  return { key: publicKey || (secret as string), algorithms: (publicKey ? ['RS256'] : ['HS256']) as Algorithm[] };
}

function scopesFromClaims(claims: AgentClaims) {
  if (Array.isArray(claims.scope)) return claims.scope.map(String);
  return String(claims.scope || '').split(/\s+/).filter(Boolean);
}

export const agentAuthMiddleware: RequestHandler = (req, _res, next) => {
  try {
    if (String(process.env.AGENT_API_ENABLED).toLowerCase() !== 'true') {
      throw new AgentHttpError(503, 'AGENT_API_DISABLED', 'Agent API is disabled');
    }

    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new AgentHttpError(401, 'AUTH_INVALID_TOKEN', 'Bearer service token is required');
    }

    const token = header.slice('Bearer '.length).trim();
    const { key, algorithms } = configuredKey();
    const audience = process.env.AGENT_SERVICE_AUDIENCE || 'finance-api';
    const claims = jwt.verify(token, key, { audience, algorithms }) as AgentClaims;
    if (!claims.sub) {
      throw new AgentHttpError(401, 'AUTH_INVALID_TOKEN', 'Service token subject is required');
    }

    const agentRequest = req as AgentRequest;
    const context = agentRequest.agentContext;
    if (!context) {
      throw new AgentHttpError(500, 'INTERNAL_ERROR', 'Agent request context is missing');
    }
    context.caller = claims.sub;
    context.claims = claims;
    context.scopes = scopesFromClaims(claims);
    next();
  } catch (error) {
    next(error instanceof AgentHttpError
      ? error
      : new AgentHttpError(401, 'AUTH_INVALID_TOKEN', 'Invalid service token'));
  }
};

export function requireAgentScope(scope: string): RequestHandler {
  return (req, _res, next) => {
    const scopes = (req as AgentRequest).agentContext?.scopes || [];
    if (!scopes.includes(scope)) {
      next(new AgentHttpError(403, 'AUTH_FORBIDDEN', `Required scope: ${scope}`));
      return;
    }
    next();
  };
}
