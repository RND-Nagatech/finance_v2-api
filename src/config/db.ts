import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

export const connectDB = async () => {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI is required. Set it in finance_v2/backend/.env");
    }

    mongoose.set('autoCreate', false);
    mongoose.set('autoIndex', false);

    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 100000,
      socketTimeoutMS: 450000,
      autoCreate: false,
      autoIndex: false,
    });
    console.log("✅ MongoDB connected successfully to:", mongoose.connection.name);

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    console.error("📝 Connection URI:", MONGO_URI?.replace(/:[^:@]+@/, ':****@') || "not configured");
    throw err;
  }
};
