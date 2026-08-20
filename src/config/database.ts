import mongoose from 'mongoose';

export const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/work_monitoring';

    await mongoose.connect(mongoUri);

    console.log('MongoDB connected successfully');

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};
