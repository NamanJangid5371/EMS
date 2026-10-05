# Appinop Employee Management System

Multi-portal Employee Management System with role-based access for **Admin**, **Manager**, and **Employee**.

## Stack

- **Admin Portal** — React (Vite) on `http://localhost:3000`
- **Manager Portal** — React (Vite) on `http://localhost:3001`
- **Employee Portal** — React (Vite) on `http://localhost:3002`
- **Backend API** — Node.js + Express on `http://localhost:5000`
- **Database** — MongoDB (`mongodb://127.0.0.1:27017/appinop_ems`)

If local MongoDB is unavailable, the API automatically starts an **in-memory MongoDB** and seeds demo data.

## Quick start

```bash
# From repo root
npm run install:all

# Terminal 1 — API
npm run dev:backend

# Terminal 2–4 — portals
npm run dev:admin
npm run dev:manager
npm run dev:employee
```

Optional seed against a real MongoDB instance:

```bash
npm run seed
```

## Demo accounts

| Role | Email | Password | Portal |
|------|-------|----------|--------|
| Admin | `admin@appinop.com` | `Admin@123` | :3000 |
| Manager | `manager@appinop.com` | `Manager@123` | :3001 |
| Employee | `employee@appinop.com` | `Employee@123` | :3002 |

## Environment

Backend (`backend/.env`):

- `PORT=5000`
- `MONGODB_URI=mongodb://127.0.0.1:27017/appinop_ems`
- `JWT_SECRET=...`
- `CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002`

Each portal `.env`:

- `VITE_API_URL=http://localhost:5000/api`
- `VITE_PORTAL_ROLE=admin|manager|employee`

## MVP features

- JWT authentication + role-gated portals
- Employee / user / department management (Admin)
- Team-scoped views and leave approval (Manager)
- Profile, attendance check-in/out, leave apply (Employee)
- Announcements, dashboards, reports, audit logs
