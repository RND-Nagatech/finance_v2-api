import mongoose, { Document, Schema } from 'mongoose';

export interface IAsset extends Document {
  asset_code: string;
  asset_name: string;
  asset_type_id: mongoose.Types.ObjectId;
  perusahaan_id?: mongoose.Types.ObjectId | null;
  kode_perusahaan?: string;
  nama_perusahaan?: string;
  qty: number;
  harga_beli_per_unit: number;
  status_aktv: boolean;
  input_date: Date;
  update_date: Date;
  delete_date?: Date | null;
  input_by?: string;
  update_by?: string | null;
  delete_by?: string | null;
}

const AssetSchema = new Schema<IAsset>(
  {
    asset_code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    asset_name: { type: String, required: true, uppercase: true, trim: true },
    asset_type_id: { type: Schema.Types.ObjectId, ref: 'AssetType', required: true, index: true },
    perusahaan_id: { type: Schema.Types.ObjectId, ref: 'Perusahaan', default: null },
    kode_perusahaan: { type: String, default: '' },
    nama_perusahaan: { type: String, default: '' },
    qty: { type: Number, required: true, min: 0, default: 0 },
    harga_beli_per_unit: { type: Number, required: true, min: 0, default: 0 },
    status_aktv: { type: Boolean, default: true, index: true },
    input_date: { type: Date, default: Date.now },
    update_date: { type: Date, default: Date.now },
    delete_date: { type: Date, default: null },
    input_by: { type: String, default: 'SYSTEM' },
    update_by: { type: String, default: null },
    delete_by: { type: String, default: null },
  },
  { collection: 'tm_asset' }
);

AssetSchema.index({ asset_code: 1 }, { unique: true });

export default mongoose.model<IAsset>('Asset', AssetSchema);
