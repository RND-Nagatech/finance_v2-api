import { Router } from 'express';
import {
  getAllDivisions,
  createDivision,
  updateDivision,
  deleteDivision,
} from '../controllers/divisionController';
import { authenticate, isAdmin } from '../middleware/auth';

const router = Router();

router.use(authenticate, isAdmin);

router.get('/', getAllDivisions);
router.post('/', createDivision);
router.put('/:id', updateDivision);
router.delete('/:id', deleteDivision);

export default router;
