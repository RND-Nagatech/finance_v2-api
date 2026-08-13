import { Router } from 'express';
import { getReport } from '../controllers/reportController';
import { authenticate, isAdmin } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, isAdmin, getReport);

export default router;
