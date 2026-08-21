import mongoose, { Document, Schema } from 'mongoose';

export interface IAssetType extends Document {
  code: string;
  name: string;
  unit: string;
  current_price: number;
  status_aktv: boolean;
  input_date: Date;
  update_date: Date;
  input_by?: string;
  update_by?: string | null;
}

const AssetTypeSchema = new Schema<IAssetType>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, uppercase: true, trim: true },
    unit: { type: String, required: true, trim: true },
    current_price: { type: Number, required: true, min: 0, default: 0 },
    status_aktv: { type: Boolean, default: true, index: true },
    input_date: { type: Date, default: Date.now },
    update_date: { type: Date, default: Date.now },
    input_by: { type: String, default: 'SYSTEM' },
    update_by: { type: String, default: null },
  },
  { collection: 'tm_asset_type' }
);

AssetTypeSchema.index({ code: 1 }, { unique: true });

export default mongoose.model<IAssetType>('AssetType', AssetTypeSchema);
