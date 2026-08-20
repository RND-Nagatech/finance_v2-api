import mongoose, { Document, Schema } from 'mongoose';

export interface IRekeningTransfer extends Document {
  from_rekening_id: mongoose.Types.ObjectId;
  to_rekening_id: mongoose.Types.ObjectId;
  from_kode_bank: string;
  from_no_rekening: string;
  to_kode_bank: string;
  to_no_rekening: string;
  nominal: number;
  tanggal: Date;
  keterangan?: string;
  created_by?: string;
  created_at: Date;
}

const RekeningTransferSchema = new Schema<IRekeningTransfer>(
  {
    from_rekening_id: { type: Schema.Types.ObjectId, ref: 'Rekening', required: true, index: true },
    to_rekening_id: { type: Schema.Types.ObjectId, ref: 'Rekening', required: true, index: true },
    from_kode_bank: { type: String, required: true, index: true },
    from_no_rekening: { type: String, required: true, index: true },
    to_kode_bank: { type: String, required: true, index: true },
    to_no_rekening: { type: String, required: true, index: true },
    nominal: { type: Number, required: true, min: 0 },
    tanggal: { type: Date, required: true, index: true },
    keterangan: { type: String, default: '' },
    created_by: { type: String, default: '' },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'rekening_transfer' }
);

RekeningTransferSchema.index({ from_kode_bank: 1, from_no_rekening: 1, tanggal: -1 });
RekeningTransferSchema.index({ to_kode_bank: 1, to_no_rekening: 1, tanggal: -1 });
RekeningTransferSchema.index({ tanggal: -1 });

export default mongoose.model<IRekeningTransfer>('RekeningTransfer', RekeningTransferSchema);

