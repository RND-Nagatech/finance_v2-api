import { Router } from 'express';
import { closeFiscalYear, getFiscalYears, getFiscalMonths, getActiveFiscalYear } from '../controllers/fiscalController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.post('/close', authenticate, closeFiscalYear);
router.get('/years', getFiscalYears);
router.get('/months', getFiscalMonths);
router.get('/active', getActiveFiscalYear);

export default router;
