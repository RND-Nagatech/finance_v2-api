import mongoose, { Document, Schema } from 'mongoose';

export interface IAssetTransfer extends Document {
  direction: 'REKENING_TO_ASSET' | 'ASSET_TO_REKENING';
  rekening_id: mongoose.Types.ObjectId;
  asset_id: mongoose.Types.ObjectId;
  kode_bank: string;
  no_rekening: string;
  asset_code: string;
  asset_name: string;
  nominal: number;
  asset_qty: number;
  asset_unit: string;
  unit_price_snapshot: number;
  tanggal: Date;
  keterangan?: string;
  created_by?: string;
  created_at: Date;
}

const AssetTransferSchema = new Schema<IAssetTransfer>(
  {
    direction: { type: String, enum: ['REKENING_TO_ASSET', 'ASSET_TO_REKENING'], required: true, index: true },
    rekening_id: { type: Schema.Types.ObjectId, ref: 'Rekening', required: true, index: true },
    asset_id: { type: Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    kode_bank: { type: String, required: true },
    no_rekening: { type: String, required: true },
    asset_code: { type: String, required: true },
    asset_name: { type: String, required: true },
    nominal: { type: Number, required: true, min: 0 },
    asset_qty: { type: Number, required: true, min: 0 },
    asset_unit: { type: String, required: true },
    unit_price_snapshot: { type: Number, required: true, min: 0, default: 0 },
    tanggal: { type: Date, required: true },
    keterangan: { type: String, default: '' },
    created_by: { type: String, default: 'SYSTEM' },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'tt_asset_transfer' }
);

AssetTransferSchema.index({ tanggal: -1, created_at: -1 });
AssetTransferSchema.index({ rekening_id: 1, tanggal: -1 });
AssetTransferSchema.index({ asset_id: 1, tanggal: -1 });

export default mongoose.model<IAssetTransfer>('AssetTransfer', AssetTransferSchema);
