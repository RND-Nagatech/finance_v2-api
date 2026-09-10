import { Request } from 'express';

export type AgentSource = 'finance' | 'business-travel' | 'assets' | 'finance-api';

export interface AgentClaims {
  sub?: string;
  aud?: string | string[];
  scope?: string | string[];
  exp?: number;
  [key: string]: unknown;
}

export interface AgentContext {
  requestId: string;
  correlationId: string;
  startedAt: number;
  caller?: string;
  claims?: AgentClaims;
  scopes?: string[];
}

export type AgentRequest = Request & {
  agentContext?: AgentContext;
};

export interface AgentPagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface AgentMetadata {
  source: AgentSource;
  generatedAt: string;
  requestId: string;
  correlationId: string;
  dataAsOf?: string;
  pagination?: AgentPagination;
}

export class AgentHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = null
  ) {
    super(message);
    this.name = 'AgentHttpError';
  }
}
