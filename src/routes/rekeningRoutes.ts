import { Router } from 'express';
import { getAllRekenings, getRekeningById, createRekening, updateRekening, deleteRekening, transferSaldoAntarRekening, rebuildSaldoOnHold } from '../controllers/rekeningController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.get('/', getAllRekenings);
router.post('/rebuild-saldo-on-hold', authenticate, rebuildSaldoOnHold);
router.post('/transfer-saldo', authenticate, transferSaldoAntarRekening);
router.get('/:id', getRekeningById);
router.post('/', authenticate, createRekening);
router.put('/:id', authenticate, updateRekening);
router.delete('/:id', authenticate, deleteRekening);

export default router;
