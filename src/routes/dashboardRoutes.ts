import { Router } from 'express';
import { rekapAggregate, pendapatanHarian } from '../controllers/dashboardController';
const router = Router();

router.get('/rekap-aggregate', rekapAggregate);
router.get('/pendapatan-harian', pendapatanHarian);

export default router;
