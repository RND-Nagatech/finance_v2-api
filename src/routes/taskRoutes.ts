import { Router } from 'express';
import {
  getAllTasks,
  createTask,
  updateTask,
  deleteTask,
  getAvailableTasks,
  takeTask,
  finishTask,
} from '../controllers/taskController';
import { authenticate, isAdmin, isEmployee } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, isAdmin, getAllTasks);
router.post('/', authenticate, isAdmin, createTask);
router.put('/:id', authenticate, isAdmin, updateTask);
router.delete('/:id', authenticate, isAdmin, deleteTask);

router.get('/available', authenticate, isEmployee, getAvailableTasks);
router.post('/:id/take', authenticate, isEmployee, takeTask);
router.post('/:id/finish', authenticate, isEmployee, finishTask);

export default router;
