import mongoose, { Schema, Document } from 'mongoose';

export interface IPerusahaan extends Document {
  kode_perusahaan: string;
  nama_perusahaan: string;
}

const PerusahaanSchema: Schema = new Schema<IPerusahaan>({
  kode_perusahaan: { type: String, required: true, unique: true },
  nama_perusahaan: { type: String, required: true },
}, {
  timestamps: true,
  collection: 'tm_perusahaan',
});

export default mongoose.model<IPerusahaan>('Perusahaan', PerusahaanSchema);