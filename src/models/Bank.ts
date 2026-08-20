import mongoose, { Schema, Document } from 'mongoose';

export interface IBank extends Document {
  kode_bank: string;
  nama_bank: string;
}

const BankSchema: Schema = new Schema({
  kode_bank: { type: String, required: true, unique: true, uppercase: true },
  nama_bank: { type: String, required: true, uppercase: true },
}, { timestamps: true, collection: 'tm_bank' });

export default mongoose.model<IBank>('Bank', BankSchema);
