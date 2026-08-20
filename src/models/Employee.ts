import mongoose, { Schema } from 'mongoose';
import { IEmployee } from '../types';

const employeeSchema = new Schema<IEmployee>(
  {
    kode_pegawai: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    nama_pegawai: {
      type: String,
      required: true,
      trim: true,
    },
    kode_divisi: {
      type: Schema.Types.ObjectId,
      ref: 'Division',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IEmployee>('Employee', employeeSchema);
