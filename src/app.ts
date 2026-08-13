import express, { Application } from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes';
import divisionRoutes from './routes/divisionRoutes';
import employeeRoutes from './routes/employeeRoutes';
import userRoutes from './routes/userRoutes';
import taskRoutes from './routes/taskRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import reportRoutes from './routes/reportRoutes';
import { errorHandler } from './middleware/errorHandler';

const app: Application = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Work Monitoring System API',
    version: '1.0.0',
  });
});

app.use('/auth', authRoutes);
app.use('/divisi', divisionRoutes);
app.use('/pegawai', employeeRoutes);
app.use('/users', userRoutes);
app.use('/tasks', taskRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/report', reportRoutes);

app.use(errorHandler);

export default app;
