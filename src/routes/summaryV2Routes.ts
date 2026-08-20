import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { getSummaryV2Reconciliation, rebuildSummaryV2 } from '../controllers/summaryV2Controller';

const router = Router();

router.post('/rebuild', authenticate, rebuildSummaryV2);
router.get('/reconciliation', authenticate, getSummaryV2Reconciliation);

export default router;
