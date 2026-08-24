import mongoose, { Document, Schema } from 'mongoose';

export type PerjalananItemAuditStatus = 'PENDING' | 'APPROVED' | 'REVISI';

export interface IPerjalananAttachment {
  path: string;
  original_name?: string;
  mime_type?: string;
  size?: number;
}

export interface IPerjalananDinasDetail extends Document {
  perjalanan_id: mongoose.Types.ObjectId;
  user_id: string;
  user_username?: string;
  user_name: string;
  tanggal_transaksi: string;
  nominal: number;
  keterangan: string;
  attachments: IPerjalananAttachment[];
  audit_status: PerjalananItemAuditStatus;
  audit_catatan_item?: string;
  audit_by?: string;
  audit_at?: Date;
  created_by: string;
  created_at: Date;
  updated_by?: string;
  updated_at?: Date;
  status_deleted?: boolean;
  deleted_by?: string;
  deleted_at?: Date;
}

const AttachmentSchema = new Schema<IPerjalananAttachment>(
  {
    path: { type: String, required: true },
    original_name: { type: String },
    mime_type: { type: String },
    size: { type: Number },
  },
  { _id: false }
);

const PerjalananDinasDetailSchema = new Schema<IPerjalananDinasDetail>(
  {
    perjalanan_id: { type: Schema.Types.ObjectId, ref: 'PerjalananDinas', required: true, index: true },
    user_id: { type: String, required: true, index: true },
    user_username: { type: String, index: true },
    user_name: { type: String, required: true },
    tanggal_transaksi: { type: String, required: true, index: true },
    nominal: { type: Number, required: true, min: 0 },
    keterangan: { type: String, required: true },
    attachments: { type: [AttachmentSchema], default: [] },
    audit_status: { type: String, enum: ['PENDING', 'APPROVED', 'REVISI'], default: 'PENDING', index: true },
    audit_catatan_item: { type: String },
    audit_by: { type: String },
    audit_at: { type: Date },
    created_by: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    updated_by: { type: String },
    updated_at: { type: Date },
    status_deleted: { type: Boolean, default: false, index: true },
    deleted_by: { type: String },
    deleted_at: { type: Date },
  },
  { collection: 'tt_perjalanan_dinas_detail' }
);

PerjalananDinasDetailSchema.index({ perjalanan_id: 1, audit_status: 1 });
PerjalananDinasDetailSchema.index({ perjalanan_id: 1, tanggal_transaksi: 1 });

export default mongoose.model<IPerjalananDinasDetail>('PerjalananDinasDetail', PerjalananDinasDetailSchema);
