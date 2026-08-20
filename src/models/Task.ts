import mongoose, { Schema } from 'mongoose';
import { ITask } from '../types';

const taskSchema = new Schema<ITask>(
  {
    kode_pekerjaan: {
      type: String,
      required: true,
      trim: true,
    },
    kode_divisi: {
      type: Schema.Types.ObjectId,
      ref: 'Division',
      required: true,
    },
    deskripsi: {
      type: String,
      required: true,
    },
    status_pekerjaan: {
      type: String,
      enum: ['OPEN', 'ON PROGRESS', 'DONE'],
      default: 'OPEN',
      required: true,
    },
    poin: {
      type: Number,
      required: true,
      min: 0,
    },
    pic: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
      default: null,
    },
    tanggal_input: {
      type: Date,
      default: Date.now,
    },
    deadline: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ITask>('Task', taskSchema);
