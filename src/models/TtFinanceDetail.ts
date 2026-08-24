import mongoose, { Schema, Document } from 'mongoose';

export interface IAttachment {
  path: string;
}

export type PostingState = 'NOT_APPLIED' | 'APPLIED' | 'FAILED';

export interface ITtFinanceDetail extends Document {
  tanggal: string;
  bulan: string;
  tahun_fiskal?: string;
  kategori: string;
  sub_kategori: string;
  akun: string;
  nilai: number;
  keterangan?: string;
  created_by: string;
  created_at: Date;
  updated_by?: string;
  updated_at?: Date;
  deleted_by?: string;
  deleted_at?: Date;
  status_deleted?: boolean;
  status_final?: boolean;
  attachments?: IAttachment[];
  is_validated?: boolean;
  validator_notes?: string;
  validator_notes_by?: string;
  validator_notes_at?: Date | string;
  validated_at?: Date | string;
  kode_perusahaan?: string;
  nama_perusahaan?: string;
  kode_bank?: string;
  no_rekening?: string;
  source_type?: 'REKENING' | 'ASSET';
  asset_id?: mongoose.Types.ObjectId;
  asset_code?: string;
  asset_name?: string;
  asset_qty?: number;
  asset_unit?: string;
  asset_unit_price_snapshot?: number;
  is_special_transaction?: boolean;
  transaction_mode?: 'NORMAL' | 'SPECIAL' | 'FINANCE_ONLY';
  rekening_mutation_direction?: 'IN' | 'OUT';
  posting_state?: PostingState;
  posting_version?: number;
  posted_at?: Date | string;
  posting_error?: string;
  saldo_on_hold_applied?: boolean;
  perjalanan_dinas_id?: mongoose.Types.ObjectId;
}

const TtFinanceDetailSchema: Schema = new Schema({
  is_validated: { type: Boolean, default: false },
  tanggal: { type: String, required: true },
  bulan: { type: String, required: true },
  tahun_fiskal: { type: String },
  kategori: { type: String, required: true },
  sub_kategori: { type: String, required: true },
  akun: { type: String, required: true },
  nilai: { type: Number, required: true },
  keterangan: { type: String },
  created_by: { type: String, required: true },
  created_at: { type: Date, required: true, default: Date.now },
  updated_by: { type: String },
  updated_at: { type: Date },
  deleted_by: { type: String },
  deleted_at: { type: Date },
  status_deleted: { type: Boolean, default: false },
  status_final: { type: Boolean, default: true, index: true },
  kode_perusahaan: { type: String },
  nama_perusahaan: { type: String },
  kode_bank: { type: String },
  no_rekening: { type: String },
  source_type: { type: String, enum: ['REKENING', 'ASSET'], default: 'REKENING', index: true },
  asset_id: { type: Schema.Types.ObjectId, ref: 'Asset', index: true },
  asset_code: { type: String },
  asset_name: { type: String },
  asset_qty: { type: Number },
  asset_unit: { type: String },
  asset_unit_price_snapshot: { type: Number },
  is_special_transaction: { type: Boolean, default: false, index: true },
  transaction_mode: {
    type: String,
    enum: ['NORMAL', 'SPECIAL', 'FINANCE_ONLY'],
    default: 'NORMAL',
    index: true,
  },
  rekening_mutation_direction: {
    type: String,
    enum: ['IN', 'OUT'],
    index: true,
  },
  attachments: { type: [{ path: { type: String, required: true } }], default: [] },
  validated_at: { type: Schema.Types.Mixed, default: '-' },
  validator_notes: { type: String, default: '-' },
  validator_notes_at: { type: Schema.Types.Mixed, default: '-' },
  validator_notes_by: { type: String, default: '-' },
  posting_state: {
    type: String,
    enum: ['NOT_APPLIED', 'APPLIED', 'FAILED'],
    default: 'NOT_APPLIED',
    index: true,
  },
  posting_version: { type: Number, default: 1, index: true },
  posted_at: { type: Schema.Types.Mixed, default: '-' },
  posting_error: { type: String, default: '-' },
  saldo_on_hold_applied: { type: Boolean, default: false, index: true },
  perjalanan_dinas_id: { type: Schema.Types.ObjectId, ref: 'PerjalananDinas', index: true },
});

export default mongoose.model<ITtFinanceDetail>('tt_finance_detail', TtFinanceDetailSchema);
