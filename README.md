# Code Clash

A full-stack competitive programming platform for running real-time coding contests with dedicated Participant and Admin experiences.

---

## Features

### Participant Platform

* Authentication and profile management
* College ID verification
* Check-in status tracking
* Workstation assignment
* Live contest dashboard
* Real-time countdown
* Problem statements with examples
* Multi-language code submission
* Automated judging
* Submission history and results
* Live leaderboard

### Admin Panel

**Participant Management**
* Create, search, and update participants
* Check-in and verification
* Disqualification with reasons
* Status history tracking

**Workstation Management**
* Create and manage workstations
* Assign/release PCs
* Assignment history

**Round Management**
* Create, start, pause, end rounds
* Configure duration and late-entry cutoff
* Real-time state synchronization

**Problem Management**
* Create, edit, delete problems
* Duplicate problems
* Configure limits and difficulty
* Add examples and test cases

**Submission Management**
* View and filter submissions
* Inspect judging results

**Evaluation & Scoring**
* Round-wise scoring
* Manual adjustments
* Code quality and logic scoring
* Evaluation locking
* Score adjustment history and reversal

**Leaderboard**
* Live rankings
* Score calculation

**Sudden Death**
* Create and manage sudden-death rounds
* Participant selection and bonus points

**Audit Logs**
* Track administrative actions

---

## Automated Code Judge

Dedicated backend worker for evaluating submissions.

### Supported Languages

C++, Java, Python, JavaScript/Node.js

### Judging Flow

Submissions go through: compile/execute → test cases → result (ACCEPTED, WRONG ANSWER, TLE, RTE, OLE, COMPILE ERROR)

The judge supports per-test-case execution, time/memory limits, output normalization, and real-time result delivery via Socket.IO.

> Production deployments should use container sandboxing for code execution.

---

## Real-Time System

Socket.IO for round state, countdown, metrics, and submission results.

---

## Architecture

Next.js Frontend → Express API + Socket.IO → Prisma ORM → Database

Submissions → Judge Worker → Compile/Run → Test Cases → Results

---

## Tech Stack

**Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui, Socket.IO Client

**Backend:** Node.js, Express 5, TypeScript, Prisma ORM, Socket.IO, JWT, bcrypt

**Database:** Prisma ORM with PostgreSQL support

**Judge:** Node.js, Python, GCC/G++, Java/Javac

---

## Project Structure

```
code-clash/
├── frontend/ (Next.js app)
├── backend/ (Express API + Prisma)
└── README.md
```

---

## Data Model

Prisma ORM with entities: User, Workstation, Submission, Evaluation, Round, Problem, TestCase, AuditLog, ScoreAdjustment, SuddenDeathRound

---

## Authentication

JWT auth with role-based access (ADMIN, JUDGE, PARTICIPANT), bcrypt hashing, and protected routes.

---

## Getting Started

**Prerequisites:** Node.js 18+, npm, Git, PostgreSQL, GCC/G++, Java JDK, Python 3

### Clone

```bash
git clone https://github.com/itsmebhatnagar/code-clash.git
cd code-clash
```

### Backend Setup

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:5432/DATABASE_NAME"
JWT_SECRET="your-secure-random-secret"
FRONTEND_URL="http://localhost:3000"
PORT=5000
```

Generate Prisma client and apply migrations:

```bash
npx prisma generate
npx prisma migrate deploy
```

Start backend:

```bash
npm run dev
```

Backend runs on `http://localhost:5000`

### Frontend Setup

```bash
cd frontend
npm install
```

Create `frontend/.env.local` and configure API endpoint (default: `http://localhost:5000`)

Start frontend:

```bash
npm run dev
```

Frontend runs on `http://localhost:3000`

---

## API Overview

**Auth:** POST /api/auth/register, POST /api/auth/login, GET /api/auth/me

**Contest:** GET /api/contest/assignment, POST /api/contest/submit

**Leaderboard:** GET /api/leaderboard

**Admin:** Participants, workstations, problems, rounds, submissions, evaluations, audit logs, settings, sudden-death

---

## Competition Flow

Admin creates rounds/problems → Participants register → Check-in → Workstation assignment → Round starts → Submissions → Judging → Scoring → Leaderboard

---

## Scoring

Round-wise scores, manual adjustments, code quality, logic clarity, judge comments, final score. All changes audited.

---

## Production Deployment

Frontend: Vercel (Next.js)
Backend: Railway/Render/Fly.io
Database: PostgreSQL
Queue: Redis + BullMQ
Judge: Isolated containers

**Security:** Use container sandboxing for code execution, rate limiting, HTTPS, proper CORS.

---

## Roadmap

Docker judge sandbox, Redis queue, parallel workers, Zod validation, rate limiting, automated tests, monitoring.

---

## Contributing

Fork, create branch, commit, push, open PR.

---

## Author

Harshil Bhatnagar - [@itsmebhatnagar](https://github.com/itsmebhatnagar)
