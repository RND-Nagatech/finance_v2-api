import mongoose, { Document, Schema } from 'mongoose';
import { ISubKategori } from './SubKategori';

export interface IAkun extends Document {
  sub_kategori: string;
  sub_kategori_kode?: string;
  akun: string;
  kode: string;
    status_aktv: boolean;
    input_date: Date;
    update_date: Date;
    delete_date: Date | null;
    input_by: string;
    update_by: string | null;
    delete_by: string | null;
}

const AkunSchema: Schema = new Schema({
  sub_kategori: { type: String, required: true }, // nama sub kategori
  sub_kategori_id: { type: Schema.Types.ObjectId, ref: 'SubKategori', required: false },
  kategori: { type: String, required: false }, // nama kategori dari sub kategori
  status_aktv: { type: Boolean, default: true },
  sub_kategori_kode: { type: String, required: false },
  akun: { type: String, required: true },
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

export default mongoose.model<IAkun>('Akun', AkunSchema, 'tm_akun');
  
