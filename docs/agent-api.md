# Finance Agent API

This is the phase 1–6 integration surface for the finance project. It is read-only and is served by `finance_v2-api`; it does not connect to `finance-subscriber`.

## Endpoints

Base path: `/api/agent/v1`

- `GET /health`
- `GET /capabilities`
- `GET /openapi.json`
- `GET /finance/summary`
- `GET /finance/revenue`
- `GET /finance/expenses`
- `GET /finance/profit-loss`
- `GET /finance/transactions`
- `GET /finance/transactions/:id`
- `GET /business-travel`
- `GET /business-travel/:id`
- `GET /business-travel/:id/summary`
- `GET /business-travel/status-summary`
- `GET /business-travel/:id/expenses`
- `GET /assets`
- `GET /assets/summary`
- `GET /assets/:id`
- `GET /assets/:id/ledger`

## Authentication

Agent calls use a service-to-service Bearer JWT, separate from the frontend user JWT. The token must include `sub`, the configured audience (`AGENT_SERVICE_AUDIENCE`), and one or more scopes:

- `agent:finance:read`
- `agent:travel:read`
- `agent:asset:read`

Use `AGENT_TOKEN_PUBLIC_KEY` for RS256 verification in deployed environments. `AGENT_TOKEN_SECRET` is available for local development only. Keep `AGENT_API_ENABLED=false` until the caller and key rotation process are ready.

## Response contract

Success responses use:

```json
{
  "success": true,
  "data": {},
  "metadata": {
    "source": "finance",
    "generatedAt": "2026-09-10T00:00:00.000Z",
    "requestId": "req_...",
    "correlationId": "corr_..."
  }
}
```

Collections return `data.items` and pagination metadata. Errors use a stable `error.code`, a safe message, and the same request/correlation metadata. Query dates use `YYYY-MM-DD`; `limit` is capped at 100.

Sensitive attachment paths and raw bank account numbers are intentionally not exposed by the Agent API.
