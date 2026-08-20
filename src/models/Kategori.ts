import mongoose, { Document, Schema } from 'mongoose';

export interface IKategori extends Document {
  kategori: string;
  kode: string;
  status_aktv: boolean;
  input_date: Date;
  update_date: Date;
  delete_date: Date | null;
  input_by: string;
  update_by: string | null;
  delete_by: string | null;
}

const KategoriSchema: Schema = new Schema({
  kategori: { type: String, required: true },
  status_aktv: { type: Boolean, default: true },
  kode: { type: String, required: true },
  input_date: { type: Date, default: Date.now },
  update_date: { type: Date, default: Date.now },
  delete_date: { type: Date, default: null },
  deleted_at: { type: Date, default: null },
  input_by: { type: String, required: true },
  update_by: { type: String, default: null },
  delete_by: { type: String, default: null },
  deleted_by: { type: String, default: null },
});

export default mongoose.model<IKategori>('Kategori', KategoriSchema, 'tm_kategori');
  
