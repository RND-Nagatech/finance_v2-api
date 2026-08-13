import { Document, Types } from 'mongoose';
import { Request } from 'express';

export interface IUser extends Document {
  username: string;
  password: string;
  role: 'admin' | 'employee';
  pegawai_id?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEmployee extends Document {
  kode_pegawai: string;
  nama_pegawai: string;
  kode_divisi: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDivision extends Document {
  kode_divisi: string;
  nama_divisi: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITask extends Document {
  kode_pekerjaan: string;
  kode_divisi: Types.ObjectId;
  deskripsi: string;
  status_pekerjaan: 'OPEN' | 'ON PROGRESS' | 'DONE';
  poin: number;
  pic?: Types.ObjectId | null;
  tanggal_input: Date;
  deadline: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: 'admin' | 'employee';
    pegawai_id?: string;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}
