import mongoose, { Document, Schema } from 'mongoose';

export type AssetLedgerMovementType = 'ADD' | 'OUT' | 'ADJUSTMENT' | 'ROLLBACK';

export interface IAssetLedger extends Document {
  asset_id: mongoose.Types.ObjectId;
  asset_code: string;
  asset_name: string;
  movement_type: AssetLedgerMovementType;
  qty_delta: number;
  qty_before: number;
  qty_after: number;
  unit: string;
  unit_price_snapshot: number;
  ref_type?: string;
  ref_id?: mongoose.Types.ObjectId | string;
  tanggal?: string;
  keterangan?: string;
  created_by: string;
  created_at: Date;
}

const AssetLedgerSchema = new Schema<IAssetLedger>(
  {
    asset_id: { type: Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    asset_code: { type: String, required: true },
    asset_name: { type: String, required: true },
    movement_type: { type: String, enum: ['ADD', 'OUT', 'ADJUSTMENT', 'ROLLBACK'], required: true },
    qty_delta: { type: Number, required: true },
    qty_before: { type: Number, required: true },
    qty_after: { type: Number, required: true },
    unit: { type: String, required: true },
    unit_price_snapshot: { type: Number, required: true, min: 0, default: 0 },
    ref_type: { type: String, default: null },
    ref_id: { type: Schema.Types.Mixed, default: null },
    tanggal: { type: String, default: '' },
    keterangan: { type: String, default: '' },
    created_by: { type: String, required: true, default: 'SYSTEM' },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'tt_asset_ledger' }
);

AssetLedgerSchema.index({ asset_id: 1, created_at: -1 });
AssetLedgerSchema.index({ ref_type: 1, ref_id: 1 });

export default mongoose.model<IAssetLedger>('AssetLedger', AssetLedgerSchema);
