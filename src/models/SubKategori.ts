import mongoose, { Document, Schema } from 'mongoose';
import { IKategori } from './Kategori';

export interface ISubKategori extends Document {
  sub_kategori: string;
  kode: string;
  kategori: string; // langsung nama kategori
  status_aktv: boolean;
  input_date: Date;
  update_date: Date;
  delete_date: Date | null;
  input_by: string;
  update_by: string | null;
  delete_by: string | null;
}

const SubKategoriSchema: Schema = new Schema({
  sub_kategori: { type: String, required: true },
  status_aktv: { type: Boolean, default: true },
  kode: { type: String, required: true },
  kategori: { type: String, required: true }, // langsung nama kategori
  input_date: { type: Date, default: Date.now },
  update_date: { type: Date, default: Date.now },
  delete_date: { type: Date, default: null },
  deleted_at: { type: Date, default: null },
  input_by: { type: String, required: true },
  update_by: { type: String, default: null },
  delete_by: { type: String, default: null },
  deleted_by: { type: String, default: null },
});

export default mongoose.model<ISubKategori>('SubKategori', SubKategoriSchema,'tm_sub_kategori');
