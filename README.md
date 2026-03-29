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
| **Database** | PostgreSQL (Supabase / Neon) |
| **Auth** | JWT, bcryptjs, Google Identity Services |
| **Security** | Helmet, express-rate-limit, express-validator |
| **Hosting** | Netlify / Vercel |

## 📁 Project Structure

```
fitslot_website/
├── backend/                    # Server-side logic
│   ├── src/                   # Backend source code
│   │   ├── config/            # App configuration
│   │   ├── database/          # DB schema & migrations
│   │   ├── middleware/        # Auth & validation
│   │   └── routes/            # API endpoints
│   ├── functions/             # Netlify serverless functions
│   ├── tests/                 # Integration & unit tests
│   ├── server.js              # Express app entry point
│   └── .env                   # Environment variables (local)
├── frontend/                   # Client-side logic
│   ├── public/                # Static assets & HTML
│   └── stitch/                # Design & UI source files
├── netlify.toml               # Netlify configuration
├── vercel.json                # Vercel configuration
├── package.json               # Dependencies & scripts
└── README.md                  # Project documentation
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
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
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

The project is configured for both Netlify and Vercel. 

**For Netlify:**
- Use the `netlify deploy` command.
- The `publish` folder is `frontend/public`.
- The `functions` folder is `backend/functions`.

**For Vercel:**
- Use the `vercel` command.
- Configuration is handled in `vercel.json`.

> **✅ Optimized:** The project uses PostgreSQL for production-ready persistence. Ensure your `DATABASE_URL` is set in the respective platform dashboards.

## 📝 License

MIT
