import mongoose, { Schema, Document } from 'mongoose';

interface IFiscalConfig extends Document {
  key: string;
  active_year: number;
  closed_years?: {
    year: number;
    closed_at: Date;
    closed_by?: string;
  }[];
}

const FiscalConfigSchema: Schema = new Schema({
  key: { type: String, default: 'fiscal', unique: true },
  active_year: { type: Number, required: true },
  closed_years: {
    type: [
      {
        year: { type: Number, required: true },
        closed_at: { type: Date, default: Date.now },
        closed_by: { type: String },
      },
    ],
    default: [],
  },
});

export default mongoose.model<IFiscalConfig>('FiscalConfig', FiscalConfigSchema);
