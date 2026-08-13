import mongoose, { Schema } from 'mongoose';
import { IDivision } from '../types';

const divisionSchema = new Schema<IDivision>(
  {
    kode_divisi: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    nama_divisi: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IDivision>('Division', divisionSchema);
