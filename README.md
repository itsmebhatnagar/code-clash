# ⚓ Code Clash

### **Outcode. Outlast. Claim the Treasure.**

**Code Clash** is a full-stack competitive programming and coding competition platform built to run real-time coding contests with dedicated **Participant** and **Admin** experiences.

It provides everything required to conduct a structured coding competition — from participant registration and workstation assignment to live rounds, code submission, automated judging, scoring, evaluations, leaderboards, audit logs, and sudden-death rounds.

---

## 🚀 Features

### 👨‍💻 Participant Platform

* Secure participant authentication
* Participant-specific profile and identity
* College and College ID information
* Check-in status
* Workstation assignment
* Live contest dashboard
* Active round information
* Real-time countdown
* Problem statements
* Input / Output formats
* Constraints and examples
* Multi-language code submission
* Automated code judging
* Submission status tracking
* Execution time and test-case results
* Submission history
* Live leaderboard
* Competition rules
* Participant status handling
* Automatic submission handling when a round ends

### 🧑‍✈️ Admin Command Center

The Admin panel provides complete control over the competition.

#### Participant Management

* Create participants
* Search participants
* View participant details
* Update participant information
* Check-in participants
* Verify College ID
* Disqualify participants
* Record disqualification reasons
* Participant status history
* Participant activity tracking

#### Workstation Management

* Create and manage workstations
* Assign participants to PCs
* Release workstations
* View workstation status
* Track workstation assignment history
* Monitor participant-to-PC mapping

#### Round Management

* Create coding rounds
* Configure round duration
* Start rounds
* Pause rounds
* End rounds
* Reset rounds
* Configure late-entry cutoff
* Configure automatic submission on round end
* Real-time round state synchronization

#### Problem Management

* Create problems
* Edit problems
* Delete problems
* Duplicate problems
* Assign problems to rounds
* Configure difficulty
* Configure time limits
* Configure memory limits
* Add public examples
* Add hidden test cases
* Manage test cases

#### Submission Management

* View all submissions
* Filter by participant
* Filter by problem
* Filter by status
* Inspect individual submissions
* View judging results
* Track execution time
* Track passed test cases

#### Evaluation & Scoring

* Round-wise scoring
* Manual score adjustments
* Code quality scoring
* Logic clarity scoring
* Judge comments
* Final score calculation
* Evaluation locking
* Evaluation unlocking
* Score adjustment history
* Score adjustment reversal
* Audit trail for score changes

#### Leaderboard

* Live participant rankings
* Final scores
* Rank calculation
* Disqualified participant exclusion
* Real-time competition visibility

#### Sudden Death

* Create sudden-death rounds
* Select participants
* Configure duration
* Configure bonus points
* Assign a problem
* Start sudden death
* End sudden death

#### Audit Logs

Track important administrative actions including:

* Participant check-ins
* Participant disqualifications
* Workstation assignments
* Problem creation
* Problem updates
* Score adjustments
* Evaluation actions
* Round actions
* Sudden-death actions

---

# ⚔️ Automated Code Judge

Code Clash includes a dedicated backend judging worker for evaluating participant submissions.

### Supported Languages

| Language             | Support |
| -------------------- | ------- |
| C++                  | ✅       |
| Java                 | ✅       |
| Python               | ✅       |
| JavaScript / Node.js | ✅       |

### Judging Flow

```text
Participant
     │
     ▼
Submit Code
     │
     ▼
Create Submission
     │
     ▼
PENDING
     │
     ▼
Judge Worker Queue
     │
     ▼
Compile / Execute
     │
     ▼
Run Test Cases
     │
     ├── ACCEPTED
     ├── WRONG ANSWER
     ├── TIME LIMIT EXCEEDED
     ├── RUNTIME ERROR
     ├── OUTPUT LIMIT EXCEEDED
     └── COMPILE ERROR
```

The judge worker supports:

* Per-test-case execution
* Execution time limits
* Memory configuration
* Output size limits
* Compilation handling
* Runtime error detection
* Output normalization
* Temporary workspaces
* Automatic workspace cleanup
* Real-time submission result delivery through Socket.IO

> **Production Security Note:** Running arbitrary participant code requires proper OS/container sandboxing. A production deployment should isolate judge execution using containers or another hardened sandboxing mechanism.

---

# ⚡ Real-Time Competition System

Code Clash uses **Socket.IO** for real-time communication.

Real-time functionality includes:

* Round state synchronization
* Countdown synchronization
* Participant presence
* Admin metrics
* Submission results
* Round start
* Round pause
* Round end
* Automatic participant notifications
* Live competition state

### Real-Time Architecture

```text
                 ┌────────────────────┐
                 │    Participant UI  │
                 └─────────┬──────────┘
                           │
                           │ WebSocket
                           ▼
                 ┌────────────────────┐
                 │     Socket.IO      │
                 │      Server        │
                 └─────────┬──────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
          Participants    Admin       Metrics
```

---

# 🏗️ Architecture

```text
                         ┌────────────────────────┐
                         │      CODE CLASH        │
                         │     Next.js Frontend   │
                         └───────────┬────────────┘
                                     │
                              HTTP / WebSocket
                                     │
                         ┌───────────▼────────────┐
                         │      Express API       │
                         │       + Socket.IO      │
                         └───────────┬────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
                Auth API        Contest API       Admin API
                    │                │                │
                    └────────────────┼────────────────┘
                                     │
                              ┌──────▼──────┐
                              │   Prisma    │
                              │     ORM     │
                              └──────┬──────┘
                                     │
                              ┌──────▼──────┐
                              │  Database   │
                              └─────────────┘

                                     │
                              Submissions
                                     │
                              ┌──────▼──────┐
                              │ Judge Worker│
                              └──────┬──────┘
                                     │
                              Compile / Run
                                     │
                              Test Cases
                                     │
                              Judge Result
```

---

# 🛠️ Tech Stack

## Frontend

* **Next.js 16**
* **React 19**
* **TypeScript**
* **Tailwind CSS**
* **shadcn/ui**
* **Lucide React**
* **Socket.IO Client**
* **Vercel Analytics**

## Backend

* **Node.js**
* **Express 5**
* **TypeScript**
* **Prisma ORM**
* **Socket.IO**
* **JWT**
* **bcrypt**
* **CORS**
* **dotenv**

## Database

* Prisma ORM
* PostgreSQL-ready architecture
* Prisma migrations

## Code Judge

* Node.js
* Python
* GCC / G++
* Java / Javac
* Temporary isolated workspaces
* Process timeout handling
* Output limits

---

# 📁 Project Structure

```text
code-clash/
│
├── frontend/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── components/
│   │   ├── admin/
│   │   └── ...
│   │
│   ├── lib/
│   ├── public/
│   ├── package.json
│   └── package-lock.json
│
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   │
│   ├── src/
│   │   ├── middleware/
│   │   │   ├── asyncHandler.ts
│   │   │   ├── authMiddleware.ts
│   │   │   └── errorMiddleware.ts
│   │   │
│   │   ├── routes/
│   │   │   ├── admin.ts
│   │   │   ├── auth.ts
│   │   │   ├── contest.ts
│   │   │   └── leaderboard.ts
│   │   │
│   │   ├── audit.ts
│   │   ├── index.ts
│   │   ├── judgeWorker.ts
│   │   ├── presence.ts
│   │   └── sockets.ts
│   │
│   ├── prisma.config.ts
│   ├── package.json
│   └── tsconfig.json
│
└── README.md
```

---

# 🗄️ Data Model

The platform uses Prisma to manage the competition data model.

Core entities include:

```text
User
 │
 ├── Workstation
 ├── Submission[]
 └── Evaluation
       
Round
 │
 └── Problem[]
       │
       ├── TestCase[]
       └── ProblemExample[]

AuditLog

ParticipantStatusHistory

WorkstationAssignmentHistory

ScoreAdjustment

ContestSetting

SuddenDeathRound
```

### Participant Identity

Every participant has a unique database identity.

```text
Participant
   │
   ├── Unique ID
   ├── Name
   ├── Email
   ├── College
   ├── College ID
   ├── Phone
   ├── Status
   ├── Workstation
   ├── Submissions
   └── Evaluation
```

Each participant has a unique `Evaluation` record, allowing their competition score and judging information to be managed independently.

---

# 🔐 Authentication & Security

The backend implements:

* JWT authentication
* Role-based authorization
* Admin-only routes
* Participant-only submission access
* bcrypt password hashing
* Environment-based JWT secret
* Protected Socket.IO authentication
* Disqualified participant restrictions
* Round/problem validation
* Source-code size limits
* Execution time limits
* Output size limits

### Roles

```text
ADMIN
JUDGE
PARTICIPANT
```

---

# ⚙️ Getting Started

## Prerequisites

Install:

* Node.js 18+
* npm
* Git
* PostgreSQL
* GCC / G++
* Java JDK
* Python 3

> C++, Java, Python, and Node.js must be available on the machine running the judge worker.

---

## 1. Clone the Repository

```bash
git clone https://github.com/itsmebhatnagar/code-clash.git
cd code-clash
```

---

# 2. Backend Setup

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
```

Generate Prisma Client:

```bash
npx prisma generate
```

Apply migrations:

```bash
npx prisma migrate deploy
```

For a database that was previously created using `prisma db push`, apply the existing baseline once:

```bash
npx prisma migrate resolve --applied 20260910120000_baseline
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

Health check:

```text
GET /api/health
```

---

# 3. Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
```

Create:

```text
frontend/.env.local
```

Configure the frontend API and Socket.IO endpoints according to your deployment setup.

For local development, the backend normally runs on:

```text
http://localhost:5000
```

Start Next.js:

```bash
npm run dev
```

Frontend:

```text
http://localhost:3000
```

---

# 📜 Available Scripts

## Frontend

```bash
npm run dev
npm run build
npm run start
```

## Backend

```bash
npm run dev
```

---

# 🌐 API Overview

## Authentication

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
```

## Participant / Contest

```text
GET  /api/contest/assignment
POST /api/contest/submit
GET  /api/contest/submissions/:id
```

## Leaderboard

```text
GET /api/leaderboard
```

## Admin

```text
GET    /api/admin/participants
POST   /api/admin/participants
PUT    /api/admin/participants/:id
DELETE /api/admin/participants/:id

GET    /api/admin/workstations
POST   /api/admin/workstations/assign
DELETE /api/admin/workstations/:id/release

GET    /api/admin/problems
POST   /api/admin/problems
PUT    /api/admin/problems/:id
DELETE /api/admin/problems/:id

GET    /api/admin/rounds
POST   /api/admin/rounds
PUT    /api/admin/rounds/:id

GET    /api/admin/submissions
GET    /api/admin/evaluations

PUT    /api/admin/evaluations/:participantId

GET    /api/admin/audit-logs

GET    /api/admin/settings
PUT    /api/admin/settings/:key

GET    /api/admin/sudden-death
POST   /api/admin/sudden-death
```

---

# 🧭 Competition Flow

A typical Code Clash event can follow this flow:

```text
1. Admin creates competition
          ↓
2. Admin creates rounds
          ↓
3. Admin creates coding problems
          ↓
4. Admin adds examples + hidden test cases
          ↓
5. Participants register
          ↓
6. Admin verifies / checks in participants
          ↓
7. Workstations are assigned
          ↓
8. Admin starts Round 1
          ↓
9. Participants receive problems
          ↓
10. Participants write code
          ↓
11. Code is submitted
          ↓
12. Judge Worker evaluates submission
          ↓
13. Score is calculated
          ↓
14. Leaderboard updates
          ↓
15. Round ends
          ↓
16. Next round / evaluation
          ↓
17. Sudden Death if required
          ↓
18. Final leaderboard
          ↓
19. Scores are locked
```

---

# 🏆 Scoring & Evaluation

Each participant can have a dedicated evaluation containing:

```text
Round 1 Score
Round 2 Score
Manual Adjustments
Code Quality
Logic Clarity
Judge Comments
Final Score
```

Administrative score changes are tracked through:

```text
Score Adjustment
       │
       ├── Admin
       ├── Participant
       ├── Previous Score
       ├── New Score
       ├── Reason
       ├── Timestamp
       └── Reversal Information
```

This provides an auditable scoring workflow for competition organizers.

---

# 🎯 Production Deployment

Recommended production architecture:

```text
                    Internet
                       │
                       ▼
              ┌─────────────────┐
              │    Next.js      │
              │     Vercel      │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Express API    │
              │  + Socket.IO    │
              └────────┬────────┘
                       │
              ┌────────┴────────┐
              ▼                 ▼
       ┌─────────────┐   ┌─────────────┐
       │ PostgreSQL  │   │ Redis/Queue │
       └─────────────┘   └──────┬──────┘
                                │
                         ┌──────▼──────┐
                         │ Judge Worker│
                         │  Containers │
                         └─────────────┘
```

### Recommended deployment split

**Frontend**

* Vercel
* Next.js

**Backend**

* Railway
* Render
* Fly.io
* VPS / cloud server

**Database**

* PostgreSQL

**Queue**

* Redis + BullMQ

**Judge**

* Dedicated isolated worker machines/containers

---

# ⚠️ Production Security Considerations

Before exposing Code Clash to the public internet, the following should be implemented or hardened:

* Containerized code execution
* Network isolation for judge processes
* CPU quotas
* Memory quotas
* Process limits
* Filesystem restrictions
* Submission rate limiting
* Login rate limiting
* Strict CORS configuration
* Production HTTPS
* Secure authentication cookies
* PostgreSQL for production
* Persistent submission queue
* Worker retry mechanism
* Server-authoritative contest deadlines
* Monitoring and logging

**Never execute untrusted participant code directly on the same unrestricted host environment as the API/database.**

---

# 🧪 Development Philosophy

Code Clash is designed around four major principles:

### 1. Fairness

Every participant should compete under the same rules, time limits, test cases, and judging conditions.

### 2. Real-Time Competition

Important contest events should propagate instantly between admins, participants, and the server.

### 3. Auditability

Important administrative decisions, especially participant status and score changes, should be traceable.

### 4. Separation of Responsibilities

```text
Frontend
    ↓
API
    ↓
Database

Submission
    ↓
Judge Worker
    ↓
Scoring
    ↓
Leaderboard
```

The judging system is separated from the main API to allow the platform to evolve toward scalable worker infrastructure.

---

# 🎨 UI / Design Direction

Code Clash uses a **premium pirate command-center aesthetic**.

The visual identity combines:

* Competitive programming
* Hacker / esports interfaces
* Pirate command decks
* Treasure maps
* Naval navigation
* Antique gold accents
* Deep ocean colors
* Dark command-center surfaces

The pirate theme is intentionally sophisticated rather than cartoonish.

### Brand

**CODE CLASH**

> *Outcode. Outlast. Claim the Treasure.*

---

# 🛣️ Roadmap

### Completed

* [x] Participant authentication
* [x] Admin authentication
* [x] Role-based authorization
* [x] Participant management
* [x] Participant check-in
* [x] Participant status history
* [x] Workstation assignment
* [x] Workstation history
* [x] Round management
* [x] Problem management
* [x] Test case management
* [x] Problem duplication
* [x] Code submission
* [x] Automated judging worker
* [x] C++ judging
* [x] Java judging
* [x] Python judging
* [x] JavaScript judging
* [x] Submission result tracking
* [x] Socket.IO real-time communication
* [x] Evaluation management
* [x] Score locking
* [x] Score adjustment history
* [x] Score reversal
* [x] Audit logs
* [x] Contest settings
* [x] Sudden-death rounds
* [x] Prisma migration setup

### Next

* [ ] Docker-based judge sandbox
* [ ] Redis + BullMQ submission queue
* [ ] Parallel judge workers
* [ ] PostgreSQL production deployment
* [ ] Strict API schema validation with Zod
* [ ] Submission rate limiting
* [ ] Server-authoritative contest timer
* [ ] Advanced live leaderboard broadcasting
* [ ] Automated scoring engine
* [ ] Advanced anti-cheat mechanisms
* [ ] Comprehensive automated tests
* [ ] Production monitoring
* [ ] Judge worker scaling

---

# 🤝 Contributing

Contributions are welcome.

### 1. Fork the repository

### 2. Create a feature branch

```bash
git checkout -b feature/your-feature
```

### 3. Make your changes

### 4. Test locally

### 5. Commit

```bash
git add .
git commit -m "Add your feature"
```

### 6. Push

```bash
git push origin feature/your-feature
```

### 7. Open a Pull Request

---

# 👨‍💻 Author

## Harshil Bhatnagar

BTech Computer Science Engineering

GitHub: [@itsmebhatnagar](https://github.com/itsmebhatnagar)

---

# 📄 License

This project currently does not declare a specific open-source license.

---

<div align="center">

### ⚓ CODE CLASH

**Outcode. Outlast. Claim the Treasure.**

Built for competitive coders.
Designed for the battlefield of code.

</div>
