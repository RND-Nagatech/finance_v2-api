import { Router } from 'express';
import { getAllRekenings, getRekeningById, createRekening, updateRekening, deleteRekening, transferSaldoAntarRekening } from '../controllers/rekeningController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.get('/', getAllRekenings);
router.get('/:id', getRekeningById);
router.post('/', authenticate, createRekening);
router.put('/:id', authenticate, updateRekening);
router.delete('/:id', authenticate, deleteRekening);
router.post('/transfer-saldo', authenticate, transferSaldoAntarRekening);

export default router;
