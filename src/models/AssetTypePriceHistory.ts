import mongoose, { Document, Schema } from 'mongoose';

export interface IAssetTypePriceHistory extends Document {
  asset_type_id: mongoose.Types.ObjectId;
  code: string;
  name: string;
  unit: string;
  old_price: number;
  new_price: number;
  changed_by: string;
  changed_at: Date;
  keterangan?: string;
}

const AssetTypePriceHistorySchema = new Schema<IAssetTypePriceHistory>(
  {
    asset_type_id: { type: Schema.Types.ObjectId, ref: 'AssetType', required: true, index: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    unit: { type: String, required: true },
    old_price: { type: Number, required: true, min: 0, default: 0 },
    new_price: { type: Number, required: true, min: 0, default: 0 },
    changed_by: { type: String, required: true, default: 'SYSTEM' },
    changed_at: { type: Date, default: Date.now },
    keterangan: { type: String, default: '' },
  },
  { collection: 'tt_asset_type_price_history' }
);

AssetTypePriceHistorySchema.index({ asset_type_id: 1, changed_at: -1 });
AssetTypePriceHistorySchema.index({ changed_at: -1 });

export default mongoose.model<IAssetTypePriceHistory>('AssetTypePriceHistory', AssetTypePriceHistorySchema);
