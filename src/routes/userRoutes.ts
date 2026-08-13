import { Router } from 'express';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  resetPassword,
} from '../controllers/userController';
import { authenticate, isAdmin } from '../middleware/auth';

const router = Router();

router.use(authenticate, isAdmin);

router.get('/', getAllUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);
router.post('/:id/reset-password', resetPassword);

export default router;
