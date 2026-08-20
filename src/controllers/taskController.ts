import { Response } from 'express';
import Task from '../models/Task';
import { AuthRequest } from '../types';
import { successResponse, errorResponse } from '../utils/response';

export const getAllTasks = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const tasks = await Task.find()
      .populate('kode_divisi')
      .populate('pic')
      .sort({ createdAt: -1 });
    successResponse(res, 'Tasks retrieved successfully', tasks);
  } catch (error: any) {
    errorResponse(res, 'Failed to retrieve tasks', error.message, 500);
  }
};

export const createTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { kode_pekerjaan, kode_divisi, deskripsi, poin, deadline } = req.body;

    if (!kode_pekerjaan || !kode_divisi || !deskripsi || !poin || !deadline) {
      errorResponse(
        res,
        'kode_pekerjaan, kode_divisi, deskripsi, poin, and deadline are required'
      );
      return;
    }

    const task = new Task({
      kode_pekerjaan,
      kode_divisi,
      deskripsi,
      status_pekerjaan: 'OPEN',
      poin,
      pic: null,
      deadline,
    });

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('kode_divisi')
      .populate('pic');

    successResponse(res, 'Task created successfully', populatedTask, 201);
  } catch (error: any) {
    errorResponse(res, 'Failed to create task', error.message, 500);
  }
};

export const updateTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const task = await Task.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate('kode_divisi')
      .populate('pic');

    if (!task) {
      errorResponse(res, 'Task not found', undefined, 404);
      return;
    }

    successResponse(res, 'Task updated successfully', task);
  } catch (error: any) {
    errorResponse(res, 'Failed to update task', error.message, 500);
  }
};

export const deleteTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const task = await Task.findByIdAndDelete(id);

    if (!task) {
      errorResponse(res, 'Task not found', undefined, 404);
      return;
    }

    successResponse(res, 'Task deleted successfully');
  } catch (error: any) {
    errorResponse(res, 'Failed to delete task', error.message, 500);
  }
};

export const getAvailableTasks = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user || !req.user.pegawai_id) {
      errorResponse(res, 'Employee ID not found', undefined, 400);
      return;
    }

    const tasks = await Task.find({
      $or: [{ pic: null }, { pic: req.user.pegawai_id }],
    })
      .populate('kode_divisi')
      .populate('pic')
      .sort({ createdAt: -1 });

    successResponse(res, 'Available tasks retrieved successfully', tasks);
  } catch (error: any) {
    errorResponse(res, 'Failed to retrieve available tasks', error.message, 500);
  }
};

export const takeTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user || !req.user.pegawai_id) {
      errorResponse(res, 'Employee ID not found', undefined, 400);
      return;
    }

    const task = await Task.findById(id);

    if (!task) {
      errorResponse(res, 'Task not found', undefined, 404);
      return;
    }

    if (task.pic !== null) {
      errorResponse(res, 'Task already taken by another employee', undefined, 400);
      return;
    }

    task.pic = req.user.pegawai_id as any;
    task.status_pekerjaan = 'ON PROGRESS';
    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('kode_divisi')
      .populate('pic');

    successResponse(res, 'Task taken successfully', populatedTask);
  } catch (error: any) {
    errorResponse(res, 'Failed to take task', error.message, 500);
  }
};

export const finishTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user || !req.user.pegawai_id) {
      errorResponse(res, 'Employee ID not found', undefined, 400);
      return;
    }

    const task = await Task.findById(id);

    if (!task) {
      errorResponse(res, 'Task not found', undefined, 404);
      return;
    }

    if (task.pic?.toString() !== req.user.pegawai_id) {
      errorResponse(
        res,
        'You are not assigned to this task',
        undefined,
        403
      );
      return;
    }

    task.status_pekerjaan = 'DONE';
    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('kode_divisi')
      .populate('pic');

    successResponse(res, 'Task marked as done successfully', populatedTask);
  } catch (error: any) {
    errorResponse(res, 'Failed to finish task', error.message, 500);
  }
};
