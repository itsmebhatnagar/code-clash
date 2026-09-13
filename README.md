# Code Clash

> **A real-time competitive programming platform built for college coding contests, hackathons, and on-campus programming events.**

Code Clash provides a complete contest infrastructure for **participants, administrators, judges, and organizers** — from registration and workstation assignment to live coding, automated judging, scoring, evaluation, and real-time leaderboards.

---

## Highlights

* Dedicated participant coding environment
* Full-featured admin control panel
* Real-time contest synchronization with Socket.IO
* Automated multi-language code judging
* Docker-based sandboxed code execution
* Live leaderboard
* Workstation/PC assignment
* Real-time round countdown and lifecycle management
* Manual evaluation and score adjustments
* JWT authentication with role-based access
* Complete administrative audit trail
* Participant session and suspicious-activity tracking
* Sudden-death round support
* Redis + BullMQ based submission processing

---

# What is Code Clash?

Code Clash is designed to manage the complete lifecycle of an offline or hybrid programming competition.

Instead of relying on multiple disconnected tools for registration, coding, judging, scoring, and administration, Code Clash brings everything into one platform.

### Contest lifecycle

```text
Participant Registration
 ↓
College ID Verification
 ↓
Check-In
 ↓
Workstation Assignment
 ↓
Round Starts
 ↓
Problem Solving
 ↓
Code Submission
 ↓
Automated Judging
 ↓
Evaluation & Scoring
 ↓
Live Leaderboard
 ↓
Final Results
```

---

# Participant Platform

Participants get a dedicated contest interface containing everything required during the competition.

### Authentication & Profile

* Secure registration and login
* JWT-based authentication
* Profile management
* College information
* College ID verification
* Participant status tracking

### Contest Dashboard

* Live contest status
* Real-time countdown
* Current round information
* Assigned workstation
* Available problems
* Submission status
* Live leaderboard

### Coding Environment

Powered by **Monaco Editor**.

Features include:

* Syntax highlighting
* Multi-language support
* Code editing
* Code submission
* Submission history
* Execution results
* Test-case progress

### Supported Languages

| Language | Runtime |
| ---------- | --------- |
| C++ | GCC / G++ |
| Java | OpenJDK |
| Python | Python 3 |
| JavaScript | Node.js |

---

# Admin Panel

Code Clash provides a dedicated administration interface for organizers and judges.

## Participant Management

Administrators can:

* Create participants
* Search participants
* View participant details
* Verify college IDs
* Check participants in/out
* Track participant status
* Disqualify participants
* Record disqualification reasons
* View status history

---

## Workstation Management

Designed for offline college contests where participants are assigned physical systems.

Features:

* Create workstations
* Assign PCs to participants
* Release workstations
* View current assignments
* Maintain assignment history

```text
PC-01 → Participant A
PC-02 → Participant B
PC-03 → Available
PC-04 → Participant C
```

---

# Round Management

Administrators can control the complete contest lifecycle.

### Round states

```text
PENDING
 ↓
ACTIVE
 ↓
PAUSED
 ↓
ACTIVE
 ↓
ENDED
```

Configurable options include:

* Round name
* Duration
* Start time
* End time
* Late-entry cutoff
* Automatic submission on round end
* Pause/resume
* Round status synchronization

---

# Problem Management

Administrators can create and manage programming problems.

Each problem can contain:

* Title
* Description
* Input format
* Output format
* Constraints
* Difficulty
* Time limit
* Memory limit
* Examples
* Hidden test cases

### Problem operations

* Create
* Edit
* Delete
* Duplicate
* Configure limits
* Add/remove examples
* Add/remove test cases

---

# Automated Judge

Code submissions are processed asynchronously through the judging pipeline.

```text
Submission
 ↓
BullMQ Queue
 ↓
Judge Worker
 ↓
Compile
 ↓
Execute
 ↓
Run Test Cases
 ↓
Compare Output
 ↓
Store Result
 ↓
Socket.IO
 ↓
Participant
```

### Possible results

* Accepted
* Wrong Answer
* Time Limit Exceeded
* Runtime Error
* Output Limit Exceeded
* Compile Error

The judge supports:

* Per-test-case execution
* Time limits
* Memory limits
* Output limits
* Output normalization
* Execution-time tracking
* Passed/total test-case tracking
* Real-time result delivery

---

# Secure Code Execution

Untrusted participant code should never execute directly inside the production backend.

Code Clash supports isolated Docker execution with restrictions including:

```text
Network: Disabled
Filesystem: Read-only
Memory: Limited
CPU: Limited
Processes: Limited
Linux Capabilities: Dropped
Privilege Escalation: Disabled
Temporary Storage: Restricted
```

Production environments require sandbox configuration before enabling code execution.

> **Important:** A production deployment must use properly isolated containers and appropriate host-level hardening. Never execute untrusted contest submissions directly on the API server.

---

# Real-Time Infrastructure

Code Clash uses **Socket.IO** for real-time communication.

Real-time events can be used for:

* Contest state
* Countdown
* Participant status
* Admin metrics
* Submission results
* Leaderboard updates
* Workstation changes
* Administrative actions

This avoids relying entirely on periodic client polling.

---

# Leaderboard

The platform supports live ranking based on contest scores.

Leaderboard infrastructure uses Redis for fast score synchronization.

The system supports:

* Live rankings
* Round-wise scores
* Final scores
* Score adjustments
* Evaluation locking
* Sudden-death bonus points

---

# Evaluation & Scoring

Code Clash supports both automated and manual evaluation.

### Evaluation components

```text
Round 1 Score
 +
Round 2 Score
 +
Manual Adjustments
 +
Code Quality
 +
Logic Clarity
 ↓
Final Score
```

Administrators/judges can:

* Evaluate participants
* Add comments
* Adjust scores
* Lock evaluations
* Reverse score adjustments
* View adjustment history

All important administrative changes can be audited.

---

# Sudden Death

Code Clash includes dedicated support for sudden-death rounds.

Administrators can:

* Create sudden-death rounds
* Select participants
* Assign a problem
* Configure duration
* Configure bonus points
* Start/end the round
* Track results

Useful for resolving ties or running a final competitive round.

---

# Authentication & Security

The backend implements:

* JWT authentication
* Role-based access control
* bcrypt password hashing
* Short-lived access tokens
* Refresh tokens
* Admin session tracking
* CORS restrictions
* Authentication logs
* Administrative audit logs
* API rate limiting
* Production environment validation

### Roles

```text
ADMIN
JUDGE
PARTICIPANT
```

Protected routes verify authenticated users before allowing access to restricted resources.

---

# Contest Integrity

Code Clash is designed with physical/offline contest environments in mind.

Participant sessions can track information such as:

* IP address
* Device fingerprint
* User agent
* Connection time
* Last activity
* Disconnection
* Suspicious activity
* Activity flags

This provides the foundation for detecting events such as:

```text
Multiple sessions
Rapid reconnects
Suspicious device reuse
Unexpected session changes
```

Administrators can use this information as part of contest monitoring and investigation.

---

# Audit Logging

Administrative actions are recorded for accountability.

Examples include:

* Admin login
* Participant status changes
* Disqualification
* Workstation assignment
* Score adjustments
* Evaluation actions
* Contest configuration changes

This provides an audit trail for post-contest review.

---

# Architecture

```text
 ┌─────────────────────┐
 │ Next.js │
 │ │
 │ Participant UI │
 │ Admin UI │
 └──────────┬──────────┘
 │
 HTTPS / WebSocket
 │
 ┌──────────▼──────────┐
 │ Express API │
 │ + Socket.IO │
 └──────┬────────┬─────┘
 │ │
 ┌──────▼───┐ │
 │PostgreSQL│ │
 │ / Prisma │ │
 └──────────┘ │
 │
 ┌─────▼─────┐
 │ Redis │
 │ BullMQ │
 └─────┬─────┘
 │
 ┌─────▼─────┐
 │Judge Worker│
 └─────┬─────┘
 │
 ┌─────▼─────┐
 │ Docker │
 │ Sandbox │
 └───────────┘
```

---

# Tech Stack

## Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* shadcn/ui
* Monaco Editor
* Socket.IO Client
* Lucide Icons

## Backend

* Node.js
* Express
* TypeScript
* Prisma ORM
* Socket.IO
* JWT
* bcrypt
* BullMQ
* Redis

## Database

* PostgreSQL

## Code Judge

* Docker
* GCC / G++
* OpenJDK
* Python 3
* Node.js

---

# Project Structure

```text
code-clash/
│
├── frontend/
│ ├── app/
│ ├── components/
│ ├── hooks/
│ ├── lib/
│ └── public/
│
├── backend/
│ ├── prisma/
│ │ └── schema.prisma
│ │
│ ├── src/
│ │ ├── routes/
│ │ ├── middleware/
│ │ ├── sockets/
│ │ ├── queue/
│ │ ├── judge/
│ │ └── ...
│ │
│ ├── tests/
│ ├── compose.yaml
│ └── judge.Dockerfile
│
└── README.md
```

---

# Getting Started

## Prerequisites

Install:

* Node.js 18+
* npm
* PostgreSQL
* Redis
* Docker
* GCC / G++
* Java JDK
* Python 3

---

## 1. Clone the Repository

```bash
git clone https://github.com/itsmebhatnagar/code-clash.git
cd code-clash
```

---

# Backend Setup

```bash
cd backend
npm install
```

Create:

```text
backend/.env
```

Example:

```env
DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:5432/DATABASE_NAME"

JWT_SECRET="your-secure-random-secret"

FRONTEND_URL="http://localhost:3000"

PORT=5000

REDIS_URL="redis://localhost:6379"

JUDGE_DOCKER_IMAGE="code-clash-judge:latest"

ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="change-this-password"
```

Generate Prisma Client:

```bash
npx prisma generate
```

Run migrations:

```bash
npx prisma migrate deploy
```

Start the backend:

```bash
npm run dev
```

Backend:

```text
http://localhost:5000
```

---

# Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
```

Create:

```text
frontend/.env.local
```

Configure the backend API endpoint according to the frontend configuration.

Start the frontend:

```bash
npm run dev
```

Frontend:

```text
http://localhost:3000
```

---

# Judge Setup

Build the judge image:

```bash
cd backend
docker build -f judge.Dockerfile -t code-clash-judge:latest .
```

Ensure Docker is available to the judge worker.

For local development, the project can optionally run without sandbox enforcement.

For production:

```env
NODE_ENV=production
JUDGE_DOCKER_IMAGE=code-clash-judge:latest
```

The production judge should **never fall back to host execution**.

---

# Testing

Backend tests:

```bash
cd backend
npm test
```

Build backend:

```bash
npm run build
```

Build frontend:

```bash
cd frontend
npm run build
```

---

# API Overview

### Authentication

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET /api/auth/me
```

### Contest

```text
GET /api/contest/assignment
POST /api/contest/submit
```

### Leaderboard

```text
GET /api/leaderboard
```

### Administration

The admin API includes endpoints for:

```text
Participants
Workstations
Rounds
Problems
Test Cases
Submissions
Evaluations
Score Adjustments
Contest Settings
Audit Logs
Sudden Death
```

---

# Core Data Model

The platform uses Prisma to model the contest domain.

Major entities include:

```text
User
Workstation
Round
Problem
ProblemExample
TestCase
Submission
Evaluation
ScoreAdjustment
AuditLog
ParticipantStatusHistory
WorkstationAssignmentHistory
ContestSetting
SuddenDeathRound
AuthLog
ParticipantSession
```

---

# Scalability

Code Clash separates API traffic from judging workloads.

Instead of executing submissions directly in the API process:

```text
API
 ↓
Queue
 ↓
Worker
 ↓
Sandbox
```

This allows the judging layer to be scaled independently.

Future deployments can run multiple workers:

```text
 ┌── Judge Worker 1
 │
Redis / BullMQ ───┼── Judge Worker 2
 │
 └── Judge Worker 3
```

---

# Production Deployment

A recommended deployment architecture is:

| Component | Recommended Infrastructure |
| ---------- | ------------------------------- |
| Frontend | Vercel / equivalent |
| Backend | Railway / Render / Fly.io / VPS |
| Database | PostgreSQL |
| Redis | Managed Redis |
| Judge | Dedicated Docker-capable worker |
| Monitoring | Application/error monitoring |

### Production requirements

* HTTPS
* Secure JWT secret
* Secure admin credentials
* PostgreSQL
* Redis
* Docker sandbox
* Strict CORS
* Rate limiting
* Database backups
* Monitoring
* Log aggregation
* Resource limits for judge containers

> Do not run the production judge on the same unrestricted host environment as the public API.

---

# Roadmap

### Security

* [ ] Expand request validation with Zod
* [ ] Strengthen refresh-token/session management
* [ ] Expand rate limiting
* [ ] Security testing of judge sandbox
* [ ] Content Security Policy
* [ ] Additional contest-integrity checks

### Infrastructure

* [ ] Multiple judge workers
* [ ] Better queue observability
* [ ] Worker health monitoring
* [ ] Automatic failed-job recovery
* [ ] Production monitoring

### Quality

* [ ] Increase backend test coverage
* [ ] Judge edge-case test suite
* [ ] Frontend unit tests
* [ ] End-to-end tests
* [ ] CI/CD pipeline

### Platform

* [ ] Advanced leaderboard analytics
* [ ] Contest reports
* [ ] Participant performance analytics
* [ ] Exportable final results
* [ ] Enhanced admin dashboards

---

# Contributing

Contributions are welcome.

```bash
git checkout -b feature/your-feature
```

Make your changes, test them, and open a pull request.

Before submitting a PR, make sure:

* TypeScript builds successfully
* Tests pass
* No secrets are committed
* New API endpoints are validated
* Security-sensitive changes are reviewed

---

# Author

**Harshil Bhatnagar**

GitHub: [@itsmebhatnagar](https://github.com/itsmebhatnagar)

---

# License

This project is currently intended for educational, institutional, and contest-use purposes.

---

## Code Clash

**Build. Compete. Solve. Win.**

A complete infrastructure for running competitive programming contests.
