import mongoose, { Document, Schema } from 'mongoose';

export type PerjalananStatus = 'BERJALAN' | 'SEDANG_DIAUDIT' | 'SELESAI';

export interface IPostingMeta {
  posting_mode?: 'REALISASI_FROM_SISA';
  posted_at?: Date;
  posted_by?: string;
  tt_finance_detail_id?: mongoose.Types.ObjectId;
  inject_tt_finance_detail_id?: mongoose.Types.ObjectId;
  attachment_target?: 'REALISASI' | 'INJECT';
  sisa_dana_at_posting?: number;
  nilai_realisasi?: number | null;
  kategori?: string;
  sub_kategori?: string;
  akun?: string;
  bulan?: string;
  tanggal_posting?: string;
  tahun_fiskal?: string;
  nilai_posting?: number;
  posting_payload?: {
    perusahaan_id?: string;
    rekening_id?: string;
    kategori?: string;
    sub_kategori?: string;
    akun?: string;
  };
  attachment_merge_count?: number;
  attachment_sources?: {
    item?: number;
    inject?: number;
    return?: number;
    merged?: number;
    skipped_missing?: number;
  };
}

export interface IReturnMeta {
  ledger_dana_id?: mongoose.Types.ObjectId;
  return_amount?: number;
  return_at?: Date;
  return_by?: string;
}

export interface IPerjalananDinas extends Document {
  kode_perjalanan: string;
  user_id: string;
  user_username?: string;
  user_name: string;
  tujuan: string;
  tanggal_berangkat: string;
  tanggal_pulang: string;
  catatan?: string;
  status: PerjalananStatus;
  audit_catatan_header?: string;
  audit_by?: string;
  audit_at?: Date;
  selesai_by?: string;
  selesai_at?: Date;
  posted_to_tt_finance: boolean;
  posting_meta?: IPostingMeta;
  return_done: boolean;
  return_meta?: IReturnMeta;
  created_by: string;
  created_at: Date;
  updated_by?: string;
  updated_at?: Date;
  status_deleted?: boolean;
  deleted_by?: string;
  deleted_at?: Date;
  total_inject?: number;
  total_return?: number;
  total_approved?: number;
  sisa_dana?: number;
}

const PerjalananDinasSchema = new Schema<IPerjalananDinas>(
  {
    kode_perjalanan: { type: String, required: true, unique: true, index: true },
    user_id: { type: String, required: true, index: true },
    user_username: { type: String, required: false, index: true },
    user_name: { type: String, required: true },
    tujuan: { type: String, required: true },
    tanggal_berangkat: { type: String, required: true, index: true },
    tanggal_pulang: { type: String, required: true },
    catatan: { type: String, default: '' },
    status: {
      type: String,
      enum: ['BERJALAN', 'SEDANG_DIAUDIT', 'SELESAI'],
      default: 'BERJALAN',
      index: true,
    },
    audit_catatan_header: { type: String },
    audit_by: { type: String },
    audit_at: { type: Date },
    selesai_by: { type: String },
    selesai_at: { type: Date },
    posted_to_tt_finance: { type: Boolean, default: false },
    posting_meta: {
      posting_mode: { type: String, enum: ['REALISASI_FROM_SISA'] },
      posted_at: { type: Date },
      posted_by: { type: String },
      tt_finance_detail_id: { type: Schema.Types.ObjectId, ref: 'tt_finance_detail' },
      inject_tt_finance_detail_id: { type: Schema.Types.ObjectId, ref: 'tt_finance_detail' },
      attachment_target: { type: String, enum: ['REALISASI', 'INJECT'] },
      sisa_dana_at_posting: { type: Number },
      nilai_realisasi: { type: Number },
      kategori: { type: String },
      sub_kategori: { type: String },
      akun: { type: String },
      bulan: { type: String },
      tanggal_posting: { type: String },
      tahun_fiskal: { type: String },
      nilai_posting: { type: Number },
      posting_payload: {
        perusahaan_id: { type: String },
        rekening_id: { type: String },
        kategori: { type: String },
        sub_kategori: { type: String },
        akun: { type: String },
      },
      attachment_merge_count: { type: Number },
      attachment_sources: {
        item: { type: Number },
        inject: { type: Number },
        return: { type: Number },
        merged: { type: Number },
        skipped_missing: { type: Number },
      },
    },
    return_done: { type: Boolean, default: false },
    return_meta: {
      ledger_dana_id: { type: Schema.Types.ObjectId, ref: 'PerjalananDinasDana' },
      return_amount: { type: Number },
      return_at: { type: Date },
      return_by: { type: String },
    },
    created_by: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    updated_by: { type: String },
    updated_at: { type: Date },
    status_deleted: { type: Boolean, default: false, index: true },
    deleted_by: { type: String },
    deleted_at: { type: Date },
    total_inject: { type: Number, default: 0 },
    total_return: { type: Number, default: 0 },
    total_approved: { type: Number, default: 0 },
    sisa_dana: { type: Number, default: 0 },
  },
  { collection: 'tt_perjalanan_dinas' }
);

PerjalananDinasSchema.index({ user_id: 1, status: 1 });
PerjalananDinasSchema.index({ tanggal_berangkat: 1, status: 1 });

export default mongoose.model<IPerjalananDinas>('PerjalananDinas', PerjalananDinasSchema);
