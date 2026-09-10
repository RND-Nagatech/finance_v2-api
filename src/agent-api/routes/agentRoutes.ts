import { Router } from 'express';
import { agentCapabilities, agentDocs, agentHealth, agentOpenApi } from '../agentController';
import { financeExpenses, financeProfitLoss, financeRevenue, financeSummary, getFinanceTransaction, listFinanceTransactions } from '../finance/financeAgentController';
import { getAgentAsset, getAgentAssetLedger, getAgentAssetSummary, listAgentAssets } from '../assets/assetAgentController';
import { getBusinessTravel, getBusinessTravelStatusSummary, getBusinessTravelSummary, listBusinessTravel, listBusinessTravelExpenses } from '../travel/travelAgentController';
import { requireAgentScope, agentAuthMiddleware } from '../middleware/agentAuthMiddleware';
import { agentErrorMiddleware } from '../middleware/agentErrorMiddleware';
import { agentRateLimitMiddleware } from '../middleware/agentRateLimitMiddleware';
import { agentRequestContextMiddleware } from '../middleware/agentRequestContextMiddleware';

const router = Router();

router.use(agentRequestContextMiddleware, agentAuthMiddleware, agentRateLimitMiddleware);
router.get('/health', agentHealth);
router.get('/capabilities', agentCapabilities);
router.get('/openapi.json', agentOpenApi);
router.get('/docs', agentDocs);

router.get('/finance/summary', requireAgentScope('agent:finance:read'), financeSummary);
router.get('/finance/revenue', requireAgentScope('agent:finance:read'), financeRevenue);
router.get('/finance/expenses', requireAgentScope('agent:finance:read'), financeExpenses);
router.get('/finance/profit-loss', requireAgentScope('agent:finance:read'), financeProfitLoss);
router.get('/finance/transactions', requireAgentScope('agent:finance:read'), listFinanceTransactions);
router.get('/finance/transactions/:id', requireAgentScope('agent:finance:read'), getFinanceTransaction);

router.get('/business-travel/status-summary', requireAgentScope('agent:travel:read'), getBusinessTravelStatusSummary);
router.get('/business-travel/:id/summary', requireAgentScope('agent:travel:read'), getBusinessTravelSummary);
router.get('/business-travel/:id/expenses', requireAgentScope('agent:travel:read'), listBusinessTravelExpenses);
router.get('/business-travel', requireAgentScope('agent:travel:read'), listBusinessTravel);
router.get('/business-travel/:id', requireAgentScope('agent:travel:read'), getBusinessTravel);

router.get('/assets/summary', requireAgentScope('agent:asset:read'), getAgentAssetSummary);
router.get('/assets/:id/ledger', requireAgentScope('agent:asset:read'), getAgentAssetLedger);
router.get('/assets', requireAgentScope('agent:asset:read'), listAgentAssets);
router.get('/assets/:id', requireAgentScope('agent:asset:read'), getAgentAsset);

router.use(agentErrorMiddleware);

export default router;
