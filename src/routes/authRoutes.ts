import { Router } from 'express';
import { login, changePassword } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/login', login);
router.post('/change-password', authenticate, changePassword);

export default router;
