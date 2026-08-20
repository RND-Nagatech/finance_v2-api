import mongoose, { Schema, Document } from 'mongoose';


export interface IRekening extends Document {
  bank_id: mongoose.Types.ObjectId;
  perusahaan_id?: mongoose.Types.ObjectId;
  perusahaan_ids?: mongoose.Types.ObjectId[];
  kode_perusahaan?: string;
  nama_perusahaan?: string;
  kode_bank: string;
  no_rekening: string;
  nama_rekening: string;
  saldo: number;
}


const RekeningSchema: Schema = new Schema({
  bank_id: { type: Schema.Types.ObjectId, ref: 'Bank', required: true },
  perusahaan_id: { type: Schema.Types.ObjectId, ref: 'Perusahaan', default: null },
  perusahaan_ids: [{ type: Schema.Types.ObjectId, ref: 'Perusahaan' }],
  kode_perusahaan: { type: String, default: '' },
  nama_perusahaan: { type: String, default: '' },
  kode_bank: { type: String, required: true, uppercase: true },
  no_rekening: { type: String, required: true, uppercase: true },
  nama_rekening: { type: String, required: true, uppercase: true },
  saldo: { type: Number, default: 0  },
}, { timestamps: true, collection: 'tm_rekening' });

export default mongoose.model<IRekening>('Rekening', RekeningSchema);
