import mongoose, { Schema, Document } from 'mongoose';

export type SummaryPeriodType = 'DAILY' | 'MONTHLY' | 'YEARLY';

export interface ITtSummaryV2 extends Document {
  period_type: SummaryPeriodType;
  period_start: Date;
  tahun_fiskal: number;
  bulan_fiskal?: number;
  bulan_fiskal_label?: string;
  kategori: string;
  sub_kategori: string;
  akun: string;
  total_nilai: number;
  transaction_count: number;
  source: string;
  calculation_version: number;
  calculated_at: Date;
  created_at: Date;
  updated_at: Date;
}

const TtSummaryV2Schema = new Schema<ITtSummaryV2>({
  period_type: { type: String, enum: ['DAILY', 'MONTHLY', 'YEARLY'], required: true, index: true },
  period_start: { type: Date, required: true, index: true },
  tahun_fiskal: { type: Number, required: true, index: true },
  bulan_fiskal: { type: Number, index: true },
  bulan_fiskal_label: { type: String, index: true },
  kategori: { type: String, required: true, index: true },
  sub_kategori: { type: String, required: true, index: true },
  akun: { type: String, required: true, index: true },
  total_nilai: { type: Number, required: true, default: 0 },
  transaction_count: { type: Number, required: true, default: 0 },
  source: { type: String, required: true, default: 'tt_finance_details' },
  calculation_version: { type: Number, required: true, default: 1 },
  calculated_at: { type: Date, required: true, default: Date.now },
  created_at: { type: Date, required: true, default: Date.now },
  updated_at: { type: Date, required: true, default: Date.now },
}, { versionKey: false });

TtSummaryV2Schema.index(
  {
    period_type: 1,
    period_start: 1,
    tahun_fiskal: 1,
    kategori: 1,
    sub_kategori: 1,
    akun: 1,
  },
  {
    unique: true,
    name: 'uniq_summary_v2_period_key',
  }
);

export default mongoose.model<ITtSummaryV2>('TtSummaryV2', TtSummaryV2Schema, 'tt_summary_v2');
