import { Request, Response } from 'express';
import Task from '../models/Task';
import { successResponse, errorResponse } from '../utils/response';

export const getReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { divisi, start, end } = req.query;

    const filter: any = {};

    if (divisi) {
      filter.kode_divisi = divisi;
    }

    if (start || end) {
      filter.tanggal_input = {};
      if (start) {
        filter.tanggal_input.$gte = new Date(start as string);
      }
      if (end) {
        filter.tanggal_input.$lte = new Date(end as string);
      }
    }

    const tasks = await Task.find(filter)
      .populate('kode_divisi')
      .populate('pic')
      .sort({ tanggal_input: -1 });

    const reportData = tasks.map((task: any) => ({
      kode_pekerjaan: task.kode_pekerjaan,
      divisi: task.kode_divisi?.nama_divisi || 'N/A',
      deskripsi: task.deskripsi,
      poin: task.poin,
      pic: task.pic?.nama_pegawai || 'Unassigned',
      status: task.status_pekerjaan,
      tanggal_input: task.tanggal_input,
      deadline: task.deadline,
    }));

    const summary = {
      totalTasks: tasks.length,
      totalPoints: tasks.reduce((sum, task) => sum + task.poin, 0),
      byStatus: {
        OPEN: tasks.filter((t: any) => t.status_pekerjaan === 'OPEN').length,
        'ON PROGRESS': tasks.filter((t: any) => t.status_pekerjaan === 'ON PROGRESS').length,
        DONE: tasks.filter((t: any) => t.status_pekerjaan === 'DONE').length,
      },
    };

    successResponse(res, 'Report generated successfully', {
      summary,
      tasks: reportData,
    });
  } catch (error: any) {
    errorResponse(res, 'Failed to generate report', error.message, 500);
  }
};
