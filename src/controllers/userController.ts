import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User';
import { AuthRequest } from '../middleware/authMiddleware';

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.find({}, { password: 0, credentials: 0, currentChallenge: 0 });
    return res.json({ success: true, data: users });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', err });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { username, name, password, role } = req.body;
    const normalizedUsername = String(username || '').trim();
    const normalizedPassword = String(password || '');
    const normalizedName = String(name || '').trim();

    if (!normalizedUsername || !normalizedPassword || !role) {
      return res.status(400).json({ message: 'Username, password, dan role wajib diisi.' });
    }

    if (normalizedPassword.length < 6) {
      return res.status(400).json({ message: 'Password minimal 6 karakter.' });
    }

    const exists = await User.findOne({ username: normalizedUsername });
    if (exists) {
      return res.status(400).json({ message: 'Username sudah digunakan.' });
    }

    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);
    const user = await User.create({
      username: normalizedUsername,
      name: normalizedName || undefined,
      password: hashedPassword,
      role,
      credentials: [],
    });

    const sanitizedUser = await User.findById(user._id, { password: 0, credentials: 0, currentChallenge: 0 });
    return res.status(201).json({ success: true, data: sanitizedUser });
  } catch (err: any) {
    if (err?.name === 'ValidationError') {
      return res.status(400).json({ message: 'Data user tidak valid.', err });
    }
    return res.status(500).json({ message: 'Server error', err });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, name, password, role } = req.body;

    const updateData: any = {};
    if (username) updateData.username = username;
    if (name) updateData.name = name;
    if (password) updateData.password = await bcrypt.hash(password, 10);
    if (role) updateData.role = role;

    const user = await User.findByIdAndUpdate(id, updateData, { new: true, select: '-password -credentials -currentChallenge' });
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json({ success: true, data: user });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', err });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', err });
  }
};

export const changeMyPassword = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { old_password, new_password, confirm_password } = req.body || {};

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!old_password || !new_password || !confirm_password) {
      return res.status(400).json({ message: 'Password lama, password baru, dan konfirmasi wajib diisi.' });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({ message: 'Konfirmasi password baru tidak cocok.' });
    }

    if (String(new_password).length < 6) {
      return res.status(400).json({ message: 'Password baru minimal 6 karakter.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan.' });
    }

    const isOldPasswordMatch = await bcrypt.compare(String(old_password), user.password);
    if (!isOldPasswordMatch) {
      return res.status(400).json({ message: 'Password lama tidak valid.' });
    }

    user.password = await bcrypt.hash(String(new_password), 10);
    await user.save();

    return res.json({ success: true, message: 'Password berhasil diubah.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', err });
  }
};
