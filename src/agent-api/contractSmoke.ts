import assert from 'assert';
import jwt from 'jsonwebtoken';
import { agentMetadata, sendAgentSuccess } from './common/agentResponse';
import { pageMetadata, parseDateValue, safeRegex } from './common/agentQuery';
import { AgentHttpError } from './common/agentTypes';
import { agentAuthMiddleware } from './middleware/agentAuthMiddleware';

const request: any = {
  query: {},
  agentContext: {
    requestId: 'req_contract',
    correlationId: 'corr_contract',
    startedAt: Date.now(),
  },
};

assert.equal(parseDateValue('2026-02-28', 'date'), '2026-02-28');
assert.equal(safeRegex('A.B')?.test('a.b'), true);
assert.deepEqual(pageMetadata(2, 10, 21), { page: 2, limit: 10, totalItems: 21, totalPages: 3 });
assert.equal(agentMetadata(request, 'finance').source, 'finance');

let responseBody: any;
const response: any = {
  status() { return this; },
  json(body: any) { responseBody = body; return body; },
};
sendAgentSuccess(request, response, 'finance', { ok: true });
assert.equal(responseBody.success, true);
assert.equal(responseBody.metadata.requestId, 'req_contract');

assert.throws(() => parseDateValue('28-02-2026', 'date'), (error: unknown) => error instanceof AgentHttpError && error.code === 'VALIDATION_ERROR');

process.env.AGENT_API_ENABLED = 'true';
process.env.AGENT_TOKEN_SECRET = 'contract-secret';
process.env.AGENT_SERVICE_AUDIENCE = 'finance-api';
const token = jwt.sign({ sub: 'contract-gateway', aud: 'finance-api', scope: ['agent:finance:read'] }, 'contract-secret');
let authError: unknown;
(request as any).header = (name: string) => name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined;
agentAuthMiddleware(request, {} as any, (error?: unknown) => { authError = error; });
assert.equal(authError, undefined);
assert.equal(request.agentContext.caller, 'contract-gateway');
assert.deepEqual(request.agentContext.scopes, ['agent:finance:read']);

(request as any).header = () => 'Bearer invalid-token';
authError = undefined;
agentAuthMiddleware(request, {} as any, (error?: unknown) => { authError = error; });
assert.equal((authError as AgentHttpError).code, 'AUTH_INVALID_TOKEN');
console.log('agent contract smoke: ok');
