import { Response } from 'express';
import Task from '../models/Task';
import { AuthRequest } from '../types';
import { successResponse, errorResponse } from '../utils/response';

export const getAdminDashboard = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const tasks = await Task.find()
      .populate('kode_divisi')
      .populate('pic')
      .sort({ createdAt: -1 });

    const groupedByDivision: any = {};
    const onProgressTasks: any[] = [];

    tasks.forEach((task: any) => {
      const divisionName = task.kode_divisi?.nama_divisi || 'Unknown';

      if (!groupedByDivision[divisionName]) {
        groupedByDivision[divisionName] = {
          division: divisionName,
          tasks: [],
        };
      }

      groupedByDivision[divisionName].tasks.push(task);

      if (task.status_pekerjaan === 'ON PROGRESS') {
        onProgressTasks.push(task);
      }
    });

    const dashboardData = {
      totalTasks: tasks.length,
      tasksByStatus: {
        OPEN: tasks.filter((t: any) => t.status_pekerjaan === 'OPEN').length,
        'ON PROGRESS': tasks.filter((t: any) => t.status_pekerjaan === 'ON PROGRESS').length,
        DONE: tasks.filter((t: any) => t.status_pekerjaan === 'DONE').length,
      },
      tasksByDivision: Object.values(groupedByDivision),
      onProgressTasks,
    };

    successResponse(res, 'Admin dashboard retrieved successfully', dashboardData);
  } catch (error: any) {
    errorResponse(res, 'Failed to retrieve admin dashboard', error.message, 500);
  }
};

export const getEmployeeDashboard = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user || !req.user.pegawai_id) {
      errorResponse(res, 'Employee ID not found', undefined, 400);
      return;
    }

    const tasks = await Task.find({ pic: req.user.pegawai_id })
      .populate('kode_divisi')
      .populate('pic')
      .sort({ createdAt: -1 });

    const dashboardData = {
      totalTasks: tasks.length,
      tasksByStatus: {
        OPEN: tasks.filter((t: any) => t.status_pekerjaan === 'OPEN').length,
        'ON PROGRESS': tasks.filter((t: any) => t.status_pekerjaan === 'ON PROGRESS').length,
        DONE: tasks.filter((t: any) => t.status_pekerjaan === 'DONE').length,
      },
      totalPoints: tasks.reduce((sum, task) => sum + task.poin, 0),
      tasks,
    };

    successResponse(res, 'Employee dashboard retrieved successfully', dashboardData);
  } catch (error: any) {
    errorResponse(res, 'Failed to retrieve employee dashboard', error.message, 500);
  }
};
