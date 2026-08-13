import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User';
import { successResponse, errorResponse } from '../utils/response';

export const getAllUsers = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const users = await User.find()
      .select('-password')
      .populate('pegawai_id')
      .sort({ createdAt: -1 });
    successResponse(res, 'Users retrieved successfully', users);
  } catch (error: any) {
    errorResponse(res, 'Failed to retrieve users', error.message, 500);
  }
};

export const createUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { username, password, role, pegawai_id } = req.body;

    if (!username || !password || !role) {
      errorResponse(res, 'username, password, and role are required');
      return;
    }

    if (role === 'employee' && !pegawai_id) {
      errorResponse(res, 'pegawai_id is required for employee role');
      return;
    }

    const user = new User({ username, password, role, pegawai_id });
    await user.save();

    const populatedUser = await User.findById(user._id)
      .select('-password')
      .populate('pegawai_id');

    successResponse(res, 'User created successfully', populatedUser, 201);
  } catch (error: any) {
    errorResponse(res, 'Failed to create user', error.message, 500);
  }
};

export const updateUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { username, role, pegawai_id } = req.body;

    const updateData: any = {};
    if (username) updateData.username = username;
    if (role) updateData.role = role;
    if (pegawai_id !== undefined) updateData.pegawai_id = pegawai_id;

    const user = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .select('-password')
      .populate('pegawai_id');

    if (!user) {
      errorResponse(res, 'User not found', undefined, 404);
      return;
    }

    successResponse(res, 'User updated successfully', user);
  } catch (error: any) {
    errorResponse(res, 'Failed to update user', error.message, 500);
  }
};

export const deleteUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      errorResponse(res, 'User not found', undefined, 404);
      return;
    }

    successResponse(res, 'User deleted successfully');
  } catch (error: any) {
    errorResponse(res, 'Failed to delete user', error.message, 500);
  }
};

export const resetPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      errorResponse(res, 'newPassword is required');
      return;
    }

    const user = await User.findById(id);
    if (!user) {
      errorResponse(res, 'User not found', undefined, 404);
      return;
    }

    user.password = newPassword;
    await user.save();

    successResponse(res, 'Password reset successfully');
  } catch (error: any) {
    errorResponse(res, 'Failed to reset password', error.message, 500);
  }
};
