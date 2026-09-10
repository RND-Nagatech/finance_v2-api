import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { sendAgentSuccess } from './common/agentResponse';

function openApiDocument() {
  const readOnlySecurity = [{ bearerAuth: [] }];
  const operation = (summary: string, scope: string, parameters: any[] = []) => ({
    summary,
    operationId: summary.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_match, char) => String(char).toUpperCase()),
    security: readOnlySecurity,
    parameters: [...parameters, { name: 'sortBy', in: 'query', schema: { type: 'string' } }, { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } }],
    responses: { '200': { description: 'Successful response' }, '401': { description: 'Invalid service token' }, '403': { description: 'Missing scope' } },
  });
  const queryParameters = [
    { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
    { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
    { name: 'search', in: 'query', schema: { type: 'string' } },
    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
  ];
  return {
    openapi: '3.0.3',
    info: { title: 'Finance Agent API', version: process.env.APP_VERSION || '1.0.0', description: 'Read-only agent interface for finance, business travel, and assets.' },
    servers: [{ url: '/api/agent/v1' }],
    security: readOnlySecurity,
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    paths: {
      '/health': { get: operation('Agent API health', 'agent:health:read') },
      '/capabilities': { get: operation('List agent capabilities', 'agent:capabilities:read') },
      '/finance/summary': { get: operation('Finance summary', 'agent:finance:read', queryParameters) },
      '/finance/revenue': { get: operation('Finance revenue', 'agent:finance:read', queryParameters) },
      '/finance/expenses': { get: operation('Finance expenses', 'agent:finance:read', queryParameters) },
      '/finance/profit-loss': { get: operation('Finance profit and loss', 'agent:finance:read', queryParameters) },
      '/finance/transactions': { get: operation('List finance transactions', 'agent:finance:read', queryParameters) },
      '/finance/transactions/{id}': { get: operation('Get finance transaction', 'agent:finance:read', [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, ...queryParameters]) },
      '/business-travel': { get: operation('List business travel', 'agent:travel:read', queryParameters) },
      '/business-travel/{id}': { get: operation('Get business travel', 'agent:travel:read', [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]) },
      '/business-travel/{id}/summary': { get: operation('Business travel summary', 'agent:travel:read', [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]) },
      '/business-travel/status-summary': { get: operation('Business travel status summary', 'agent:travel:read', queryParameters) },
      '/business-travel/{id}/expenses': { get: operation('List business travel expenses', 'agent:travel:read', [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, ...queryParameters]) },
      '/assets': { get: operation('List assets', 'agent:asset:read', queryParameters) },
      '/assets/summary': { get: operation('Asset summary', 'agent:asset:read', queryParameters) },
      '/assets/{id}': { get: operation('Get asset', 'agent:asset:read', [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]) },
      '/assets/{id}/ledger': { get: operation('Get asset ledger', 'agent:asset:read', [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, ...queryParameters]) },
    },
  };
}

export function agentOpenApi(_req: Request, res: Response) {
  return res.json(openApiDocument());
}

export function agentDocs(_req: Request, res: Response) {
  return res.type('html').send(`<!doctype html><html><head><title>Finance Agent API</title></head><body><h1>Finance Agent API</h1><p>Read-only integration surface.</p><p><a href="/api/agent/openapi.json">OpenAPI JSON</a></p></body></html>`);
}

export function agentHealth(req: Request, res: Response) {
  const dbReady = mongoose.connection.readyState === 1;
  const payload = {
    service: 'finance',
    version: process.env.APP_VERSION || '1.0.0',
    status: dbReady ? 'healthy' : 'degraded',
    checks: { database: dbReady ? 'up' : 'down' },
  };
  return sendAgentSuccess(req, res, 'finance-api', payload, dbReady ? 200 : 503);
}

export function agentCapabilities(req: Request, res: Response) {
  return sendAgentSuccess(req, res, 'finance-api', {
    service: 'finance',
    version: process.env.APP_VERSION || '1.0.0',
    readOnly: true,
    tools: [
      { name: 'finance.summary', method: 'GET', path: '/finance/summary', scope: 'agent:finance:read', risk: 'read' },
      { name: 'finance.revenue', method: 'GET', path: '/finance/revenue', scope: 'agent:finance:read', risk: 'read' },
      { name: 'finance.expenses', method: 'GET', path: '/finance/expenses', scope: 'agent:finance:read', risk: 'read' },
      { name: 'finance.profitLoss', method: 'GET', path: '/finance/profit-loss', scope: 'agent:finance:read', risk: 'read' },
      { name: 'finance.transactions.list', method: 'GET', path: '/finance/transactions', scope: 'agent:finance:read', risk: 'read' },
      { name: 'finance.transactions.get', method: 'GET', path: '/finance/transactions/{id}', scope: 'agent:finance:read', risk: 'read' },
      { name: 'businessTravel.list', method: 'GET', path: '/business-travel', scope: 'agent:travel:read', risk: 'read' },
      { name: 'businessTravel.get', method: 'GET', path: '/business-travel/{id}', scope: 'agent:travel:read', risk: 'read' },
      { name: 'businessTravel.summary', method: 'GET', path: '/business-travel/{id}/summary', scope: 'agent:travel:read', risk: 'read' },
      { name: 'businessTravel.statusSummary', method: 'GET', path: '/business-travel/status-summary', scope: 'agent:travel:read', risk: 'read' },
      { name: 'businessTravel.expenses', method: 'GET', path: '/business-travel/{id}/expenses', scope: 'agent:travel:read', risk: 'read' },
      { name: 'assets.list', method: 'GET', path: '/assets', scope: 'agent:asset:read', risk: 'read' },
      { name: 'assets.summary', method: 'GET', path: '/assets/summary', scope: 'agent:asset:read', risk: 'read' },
      { name: 'assets.get', method: 'GET', path: '/assets/{id}', scope: 'agent:asset:read', risk: 'read' },
      { name: 'assets.ledger', method: 'GET', path: '/assets/{id}/ledger', scope: 'agent:asset:read', risk: 'read' },
    ],
    permissions: ['agent:finance:read', 'agent:travel:read', 'agent:asset:read'],
  });
}
