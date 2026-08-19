import { Response } from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User';
import { AuthRequest } from '../types';
import { generateToken } from '../utils/jwt';
import { successResponse, errorResponse } from '../utils/response';

export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const username = req.body.username || req.body.email;
    const { password } = req.body;

    if (!username || !password) {
      errorResponse(res, 'Username and password are required');
      return;
    }

    const user = await User.findOne({ username }).populate('pegawai_id');
    if (!user) {
      errorResponse(res, 'Invalid credentials', undefined, 401);
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      errorResponse(res, 'Invalid credentials', undefined, 401);
      return;
    }

    const token = generateToken({
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      pegawai_id: user.pegawai_id?.toString(),
    });

    successResponse(res, 'Login successful', {
      token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        pegawai_id: user.pegawai_id,
      },
    });
  } catch (error: any) {
    errorResponse(res, 'Login failed', error.message, 500);
  }
};

export const changePassword = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      errorResponse(res, 'Old password and new password are required');
      return;
    }

    if (!req.user) {
      errorResponse(res, 'Unauthorized', undefined, 401);
      return;
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      errorResponse(res, 'User not found', undefined, 404);
      return;
    }

    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      errorResponse(res, 'Current password is incorrect', undefined, 400);
      return;
    }

    user.password = newPassword;
    await user.save();

    successResponse(res, 'Password changed successfully');
  } catch (error: any) {
    errorResponse(res, 'Password change failed', error.message, 500);
  }
};
