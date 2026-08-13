import { Request, Response } from 'express';
import Employee from '../models/Employee';
import { successResponse, errorResponse } from '../utils/response';

export const getAllEmployees = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const employees = await Employee.find()
      .populate('kode_divisi')
      .sort({ createdAt: -1 });
    successResponse(res, 'Employees retrieved successfully', employees);
  } catch (error: any) {
    errorResponse(res, 'Failed to retrieve employees', error.message, 500);
  }
};

export const createEmployee = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { kode_pegawai, nama_pegawai, kode_divisi } = req.body;

    if (!kode_pegawai || !nama_pegawai || !kode_divisi) {
      errorResponse(
        res,
        'kode_pegawai, nama_pegawai, and kode_divisi are required'
      );
      return;
    }

    const employee = new Employee({ kode_pegawai, nama_pegawai, kode_divisi });
    await employee.save();

    const populatedEmployee = await Employee.findById(employee._id).populate(
      'kode_divisi'
    );

    successResponse(
      res,
      'Employee created successfully',
      populatedEmployee,
      201
    );
  } catch (error: any) {
    errorResponse(res, 'Failed to create employee', error.message, 500);
  }
};

export const updateEmployee = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { kode_pegawai, nama_pegawai, kode_divisi } = req.body;

    const employee = await Employee.findByIdAndUpdate(
      id,
      { kode_pegawai, nama_pegawai, kode_divisi },
      { new: true, runValidators: true }
    ).populate('kode_divisi');

    if (!employee) {
      errorResponse(res, 'Employee not found', undefined, 404);
      return;
    }

    successResponse(res, 'Employee updated successfully', employee);
  } catch (error: any) {
    errorResponse(res, 'Failed to update employee', error.message, 500);
  }
};

export const deleteEmployee = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const employee = await Employee.findByIdAndDelete(id);

    if (!employee) {
      errorResponse(res, 'Employee not found', undefined, 404);
      return;
    }

    successResponse(res, 'Employee deleted successfully');
  } catch (error: any) {
    errorResponse(res, 'Failed to delete employee', error.message, 500);
  }
};
