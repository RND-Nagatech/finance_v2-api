# Work Monitoring System API

A complete backend API for a Work Monitoring System built with Node.js, TypeScript, Express, and MongoDB (Mongoose).

## Features

- JWT-based authentication
- Role-based access control (Admin & Employee)
- Complete CRUD operations for divisions, employees, users, and tasks
- Task assignment and tracking system
- Dashboard endpoints for both roles
- Comprehensive reporting system

## Tech Stack

- Node.js
- TypeScript
- Express.js
- MongoDB with Mongoose
- JWT for authentication
- bcrypt for password hashing

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
Copy `.env.example` to `.env` and update with your MongoDB connection string and JWT secret.

3. Start MongoDB (if running locally):
```bash
mongod
```

4. Run in development mode:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
npm start
```

## API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/change-password` - Change password (authenticated)

### Master Data - Admin Only

#### Divisions
- `GET /divisi` - Get all divisions
- `POST /divisi` - Create division
- `PUT /divisi/:id` - Update division
- `DELETE /divisi/:id` - Delete division

#### Employees
- `GET /pegawai` - Get all employees
- `POST /pegawai` - Create employee
- `PUT /pegawai/:id` - Update employee
- `DELETE /pegawai/:id` - Delete employee

#### Users
- `GET /users` - Get all users
- `POST /users` - Create user
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user
- `POST /users/:id/reset-password` - Reset user password

### Task Management

#### Admin
- `GET /tasks` - Get all tasks
- `POST /tasks` - Create task
- `PUT /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task

#### Employee
- `GET /tasks/available` - Get available tasks (unassigned + own tasks)
- `POST /tasks/:id/take` - Take a task
- `POST /tasks/:id/finish` - Mark task as done

### Dashboard
- `GET /dashboard` - Admin dashboard (all tasks grouped by division)
- `GET /dashboard/employee` - Employee dashboard (own tasks summary)

### Reports
- `GET /report?divisi=&start=&end=` - Generate task reports with filters

## User Roles

### Admin/Manager
- Full access to all master data (divisions, employees, users)
- Complete task management
- View all reports and dashboards

### Employee
- View own dashboard
- View available tasks (unassigned + assigned to self)
- Take unassigned tasks
- Mark own tasks as done
- Change own password
- No access to master data

## Data Models

### Division
- kode_divisi (unique)
- nama_divisi

### Employee
- kode_pegawai (unique)
- nama_pegawai
- kode_divisi (reference to Division)

### User
- username (unique)
- password (hashed)
- role: "admin" | "employee"
- pegawai_id (required for employees)

### Task
- kode_pekerjaan
- kode_divisi (reference to Division)
- deskripsi
- status_pekerjaan: "OPEN" | "ON PROGRESS" | "DONE"
- poin
- pic (reference to Employee, nullable)
- tanggal_input (default: now)
- deadline

## Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <token>
```

## Response Format

All responses follow a standardized format:

Success:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

Error:
```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error"
}
```

## License

MIT
