<div align="center">

# 🏥 SushrutaCare AI

### AI-Powered Elderly Care Medication Management Platform

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Gemini AI](https://img.shields.io/badge/Gemini-2.5%20Flash-4285F4?logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![WCAG](https://img.shields.io/badge/WCAG-2.1%20AAA-2563EB)](https://www.w3.org/WAI/WCAG21/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

*Helping elderly patients and their caregivers manage medications safely with AI assistance*

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔬 **AI Prescription Scanning** | Upload a prescription photo → Gemini 2.5 Flash extracts medication details automatically |
| 💊 **Drug Interaction Detection** | AI-powered analysis of interactions between multiple medications |
| ⏰ **Smart Reminders** | Automated Gmail email alerts for upcoming doses via APScheduler |
| 📊 **Adherence Tracking** | Log taken/missed doses and view adherence statistics over time |
| 📅 **Google Calendar Sync** | One-click appointment export to Google Calendar |
| 🔊 **Web Speech TTS** | Senior view reads medication names and instructions aloud |
| ♿ **WCAG 2.1 AAA** | High-contrast UI, 48×48px touch targets, skip-links, ARIA attributes |
| 🔒 **Secure Auth** | Bcrypt passcode hashing, JWT tokens, SlowAPI rate limiting |
| 🛡️ **Row-Level Security** | Supabase RLS ensures users can only access their own data |

---

## 🏗️ Architecture

```
Frontend (Next.js 14)          Backend (FastAPI)           External
┌─────────────────────┐        ┌──────────────────────┐    ┌────────────────┐
│ Senior View         │──JWT──▶│ Auth Middleware       │    │ Gemini 2.5     │
│ (High Contrast+TTS) │        │ JWT + Bcrypt + Rate   │    │ Flash API      │
├─────────────────────┤        │ Limit (SlowAPI)       │    └───────▲────────┘
│ Caretaker View      │──JWT──▶├──────────────────────┤            │
│ (Dashboard+Analytics│        │ /api/v1/medications   │◀──────────┘
└─────────────────────┘        │ /api/v1/appointments  │──▶ Supabase PostgreSQL
                               │ /api/v1/ai            │    (RLS Policies)
                               │ APScheduler Cron      │──▶ Gmail SMTP
                               └──────────────────────┘    Google Calendar
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14, React 18, TypeScript, Tailwind CSS 3 |
| **Accessibility** | WCAG 2.1 AAA, Web Speech API (TTS), ARIA |
| **Backend** | Python 3.11+, FastAPI 0.115, Uvicorn |
| **AI / Vision** | Google Gemini 2.5 Flash (OCR + drug interactions) |
| **Auth** | JWT (python-jose), Bcrypt (passlib), SlowAPI |
| **Database** | Supabase (PostgreSQL + Row-Level Security) |
| **Scheduler** | APScheduler (AsyncIOScheduler) |
| **Email** | Gmail SMTP via smtplib (SSL) |
| **Calendar** | Google Calendar deep-link URL generation |
| **Testing** | Pytest, httpx, pytest-asyncio |
| **CI/CD** | GitHub Actions |

---

## 🚀 Setup & Installation

### Prerequisites
- Python 3.11+
- Node.js 20+
- A [Supabase](https://supabase.com) project
- A [Google AI Studio](https://aistudio.google.com) API key
- A Gmail account with App Password enabled

### 1. Clone the Repository

```bash
git clone https://github.com/leopears2008-cell/Elderly-Care-Medication-Management-Platform.git
cd Elderly-Care-Medication-Management-Platform
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
# Edit .env with your actual credentials
```

### 3. Run Supabase Migration

In your Supabase dashboard → SQL Editor, paste and run:
```
supabase/migrations/001_initial_schema.sql
```

### 4. Start the Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs

### 5. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

App available at: http://localhost:3000

### 6. Run Backend Tests

```bash
cd backend
pytest tests/ -v
```

---

## 📡 API Endpoints

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/health` | Health check | ❌ |
| `POST` | `/api/v1/auth/register` | Register new user | ❌ |
| `POST` | `/api/v1/auth/login` | Login with passcode | ❌ |
| `GET` | `/api/v1/auth/me` | Get current user | ✅ |
| `GET` | `/api/v1/medications` | List medications | ✅ |
| `POST` | `/api/v1/medications` | Create medication | ✅ |
| `PUT` | `/api/v1/medications/{id}` | Update medication | ✅ |
| `DELETE` | `/api/v1/medications/{id}` | Soft-delete medication | ✅ |
| `POST` | `/api/v1/medications/adherence/{id}` | Log dose taken/missed | ✅ |
| `GET` | `/api/v1/medications/adherence/{id}` | Get adherence stats | ✅ |
| `GET` | `/api/v1/appointments` | List appointments | ✅ |
| `POST` | `/api/v1/appointments` | Create appointment | ✅ |
| `PUT` | `/api/v1/appointments/{id}` | Update appointment | ✅ |
| `DELETE` | `/api/v1/appointments/{id}` | Delete appointment | ✅ |
| `POST` | `/api/v1/appointments/{id}/calendar-link` | Generate Google Calendar link | ✅ |
| `POST` | `/api/v1/ai/prescription-scan` | Scan prescription image | ✅ |
| `POST` | `/api/v1/ai/drug-interaction` | Check drug interactions | ✅ |

---

## 🔐 Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon/public key |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `JWT_SECRET_KEY` | Secret key for JWT signing |
| `JWT_ALGORITHM` | JWT algorithm (default: HS256) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token TTL in minutes (default: 30) |
| `GMAIL_SENDER` | Gmail address for sending alerts |
| `GMAIL_APP_PASSWORD` | Gmail App Password (16 chars) |
| `FRONTEND_URL` | Frontend URL for CORS (default: http://localhost:3000) |
| `ENVIRONMENT` | `development` or `production` |
| `NEXT_PUBLIC_API_URL` | Backend API URL for frontend |

---

## 🧪 Testing

```bash
# Run all tests with verbose output
pytest backend/tests/ -v

# Run with coverage
pytest backend/tests/ --cov=app --cov-report=html
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'feat: add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
Made with ❤️ for elderly care | Powered by Google Gemini AI
</div>
