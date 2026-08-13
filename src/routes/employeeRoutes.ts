import { Router } from 'express';
import {
  getAllEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from '../controllers/employeeController';
import { authenticate, isAdmin } from '../middleware/auth';

const router = Router();

router.use(authenticate, isAdmin);

router.get('/', getAllEmployees);
router.post('/', createEmployee);
router.put('/:id', updateEmployee);
router.delete('/:id', deleteEmployee);

export default router;
