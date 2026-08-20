import { Request, Response } from 'express';
import Division from '../models/Division';
import { successResponse, errorResponse } from '../utils/response';

export const getAllDivisions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const divisions = await Division.find().sort({ createdAt: -1 });
    successResponse(res, 'Divisions retrieved successfully', divisions);
  } catch (error: any) {
    errorResponse(res, 'Failed to retrieve divisions', error.message, 500);
  }
};

export const createDivision = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { kode_divisi, nama_divisi } = req.body;

    if (!kode_divisi || !nama_divisi) {
      errorResponse(res, 'kode_divisi and nama_divisi are required');
      return;
    }

    const division = new Division({ kode_divisi, nama_divisi });
    await division.save();

    successResponse(res, 'Division created successfully', division, 201);
  } catch (error: any) {
    errorResponse(res, 'Failed to create division', error.message, 500);
  }
};

export const updateDivision = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { kode_divisi, nama_divisi } = req.body;

    const division = await Division.findByIdAndUpdate(
      id,
      { kode_divisi, nama_divisi },
      { new: true, runValidators: true }
    );

    if (!division) {
      errorResponse(res, 'Division not found', undefined, 404);
      return;
    }

    successResponse(res, 'Division updated successfully', division);
  } catch (error: any) {
    errorResponse(res, 'Failed to update division', error.message, 500);
  }
};

export const deleteDivision = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const division = await Division.findByIdAndDelete(id);

    if (!division) {
      errorResponse(res, 'Division not found', undefined, 404);
      return;
    }

    successResponse(res, 'Division deleted successfully');
  } catch (error: any) {
    errorResponse(res, 'Failed to delete division', error.message, 500);
  }
};
