# 🏋️ FitSlot – Campus Gym Slot Booking System

FitSlot is a full-stack web application for managing campus gym slot bookings. Students can book gym sessions, track attendance, and manage their profiles. Admins get a complete dashboard with analytics, attendance marking, and student management.

## ✨ Features

### Student Portal
- 🔐 Email/password and Google Sign-In authentication
- 📅 Real-time slot availability with live countdown timers
- 📋 One-click booking with waitlist support
- 📊 Personal dashboard with KPIs (bookings, no-shows, attendance)
- 👤 Profile management with avatar selection
- 🔔 In-app notification system

### Admin Console
- 📈 Analytics dashboard with Chart.js (booking trends, category donut)
- 🎛️ Slot monitor with live occupancy and student lists
- ✅ Bulk attendance marking (present/absent with one-click)
- 👥 Student registry with search, no-show tracking, and block/unblock
- 🏷️ Workout category management

### Security & Infrastructure
- 🛡️ Helmet security headers with custom CSP
- ⏱️ Rate limiting (auth: 10 req/15min, API: 100 req/min)
- ✅ Input validation with express-validator
- 🔑 JWT-based authentication
- 🩺 Health check endpoint (`/api/health`)
- 📄 Custom 404 error page

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML, Tailwind CSS (CDN), Vanilla JS |
| **Backend** | Node.js, Express.js |
| **Database** | SQLite (via better-sqlite3) |
| **Auth** | JWT, bcryptjs, Google Identity Services |
| **Security** | Helmet, express-rate-limit, express-validator |
| **Hosting** | Vercel (serverless) |

## 📁 Project Structure

```
fitslot_website/
├── server.js                  # Express app entry point
├── package.json
├── vercel.json                # Vercel deployment config
├── .env.example               # Environment variables template
├── public/                    # Static frontend
│   ├── index.html             # Landing page
│   ├── login.html             # Student login
│   ├── dashboard.html         # Student dashboard
│   ├── slots.html             # Slot booking page
│   ├── my-bookings.html       # Booking history
│   ├── profile.html           # Profile settings
│   ├── 404.html               # Custom error page
│   ├── index.css              # Global styles
│   ├── js/
│   │   ├── api.js             # API client helper
│   │   ├── auth.js            # Auth session management
│   │   └── tailwind-config.js # Tailwind theme config
│   └── admin/
│       ├── login.html         # Admin login
│       ├── dashboard.html     # Admin analytics
│       ├── slots.html         # Slot monitor
│       ├── attendance.html    # Attendance marking
│       └── students.html      # Student management
└── src/
    ├── config/                # App configuration
    ├── database/
    │   ├── db.js              # SQLite schema & migrations
    │   └── seed.js            # Database seeder
    ├── middleware/
    │   └── auth.js            # JWT auth middleware
    └── routes/
        ├── auth.js            # Authentication routes
        ├── slots.js           # Slot CRUD
        ├── bookings.js        # Booking management
        ├── attendance.js      # Attendance marking
        ├── analytics.js       # Admin analytics
        ├── notifications.js   # Notification system
        └── users.js           # User/student management
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20.x or later
- **npm** (comes with Node.js)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/fitslot-website.git
cd fitslot-website

# 2. Install dependencies
npm install --ignore-engines

# 3. Create environment file
cp .env.example .env
# Edit .env with your secrets (see Environment Variables below)

# 4. Seed the database
npm run seed

# 5. Start the development server
npm run dev
```

The app will be available at **http://localhost:3000**

### Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | Server port | `3000` |
| `JWT_SECRET` | Secret key for JWT tokens | (generate a random string) |
| `JWT_EXPIRES_IN` | Token expiration time | `24h` |
| `DB_PATH` | SQLite database file path | `./fitslot.db` |
| `STUDENT_EMAIL_DOMAIN` | Allowed email domain for students | `bvrit.ac.in` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | (from Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | (from Google Cloud Console) |

### Demo Credentials

After running `npm run seed`:

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@bvrit.ac.in` | `admin123` |
| **Student** | `student@bvrit.ac.in` | `student123` |

## 📡 API Reference

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Email/password login |
| `POST` | `/api/auth/register` | Register new student |
| `POST` | `/api/auth/google` | Google Sign-In |
| `POST` | `/api/auth/forgot-password` | Request password reset |
| `POST` | `/api/auth/reset-password` | Reset password with token |

### Slots
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/slots` | List today's slots with availability |
| `GET` | `/api/slots/categories` | List workout categories |

### Bookings
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/bookings` | List user's bookings (paginated) |
| `POST` | `/api/bookings` | Create a booking |
| `DELETE` | `/api/bookings/:id` | Cancel a booking |
| `GET` | `/api/bookings/admin/all` | Admin: all bookings (paginated, searchable) |

### Attendance
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/attendance/:slotId` | Get attendance for a slot |
| `POST` | `/api/attendance` | Mark attendance (bulk) |

### Users
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/users` | Admin: list students (paginated, searchable) |
| `PUT` | `/api/users/profile` | Update user profile |
| `PUT` | `/api/users/:id/unblock` | Admin: unblock a student |

### Notifications
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/notifications` | List user's notifications (paginated) |
| `PUT` | `/api/notifications/:id/read` | Mark notification as read |
| `PUT` | `/api/notifications/read-all` | Mark all as read |

### Health
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |

## 🌐 Deployment (Vercel)

The project is configured for Vercel with `vercel.json`. To deploy:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

> **⚠️ Important:** SQLite does not persist on Vercel's serverless filesystem. For production, consider migrating to PostgreSQL (Supabase/Neon).

Set environment variables in Vercel Dashboard → Settings → Environment Variables.

## 📝 License

MIT
