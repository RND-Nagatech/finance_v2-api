import { Router } from 'express';
import {
  getAdminDashboard,
  getEmployeeDashboard,
} from '../controllers/dashboardController';
import { authenticate, isAdmin, isEmployee } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, isAdmin, getAdminDashboard);
router.get('/employee', authenticate, isEmployee, getEmployeeDashboard);

export default router;
