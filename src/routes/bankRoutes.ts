import { Router } from 'express';
import { getAllBanks, getBankById, createBank, updateBank, deleteBank } from '../controllers/bankController';

const router = Router();

router.get('/', getAllBanks);
router.get('/:id', getBankById);
router.post('/', createBank);
router.put('/:id', updateBank);
router.delete('/:id', deleteBank);

export default router;
