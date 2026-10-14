import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  username: string;
  password: string;
  name?: string;
  role: string;
  portal_email?: string;
  portal_user_id?: string;
  createdAt: Date;
  credentials: Array<{
    credentialID: string;
    publicKey: string;
    counter: number;
  }>;
  currentChallenge?: string;
}

const CredentialSchema = new Schema({
  credentialID: { type: String, required: true },
  publicKey: { type: String, required: true },
  counter: { type: Number, required: true },
});

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String },
    role: { type: String, enum: ['superuser', 'admin', 'finance', 'finance_input', 'corsec', 'user'], default: 'user' },
    portal_email: { type: String, default: '', trim: true, lowercase: true, index: true },
    portal_user_id: { type: String, default: '', index: true },
    credentials: [CredentialSchema],
    currentChallenge: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>("User", UserSchema, "tm_user");
