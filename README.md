# Code Clash

A full-stack coding competition platform designed to manage coding contests, participants, authentication, and real-time contest interactions from a single application.

## Overview

Code Clash is organized as a separate frontend and backend application:

* **Frontend** — Next.js application with React, TypeScript, Tailwind CSS, shadcn-based UI components, and Vercel Analytics.
* **Backend** — Node.js + Express API with JWT authentication, bcrypt password hashing, Prisma ORM, PostgreSQL support, and Socket.IO for real-time communication.

## Tech Stack

### Frontend

* Next.js 16
* React 19
* TypeScript
* Tailwind CSS
* shadcn/ui
* Lucide React
* Socket.IO Client
* Vercel Analytics

### Backend

* Node.js
* Express 5
* TypeScript
* Prisma ORM
* PostgreSQL
* Socket.IO
* JSON Web Tokens (JWT)
* bcrypt
* CORS
* dotenv

## Project Structure

```text
code-clash/
├── frontend/          # Next.js frontend application
│   ├── app/            # Application routes and pages
│   ├── components/     # Reusable UI components
│   ├── lib/            # Client-side utilities and helpers
│   ├── public/         # Static assets
│   └── package.json
│
├── backend/            # Express backend application
│   ├── prisma/          # Prisma schema and database configuration
│   ├── src/             # Backend source code
│   ├── prisma.config.ts
│   └── package.json
│
└── README.md
```

## Getting Started

This repository uses **npm** as its package manager. Keep `package-lock.json` committed and use `npm` commands for the frontend.

### Prerequisites

Make sure the following are installed:

* Node.js 18+
* npm
* PostgreSQL database
* Git

### 1. Clone the repository

```bash
git clone https://github.com/itsmebhatnagar/code-clash.git
cd code-clash
```

### 2. Setup the backend

```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory and configure the database and authentication settings required by the application.

Example:

```env
DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:5432/DATABASE_NAME"
JWT_SECRET="your-secure-jwt-secret"
FRONTEND_URL="https://your-frontend.vercel.app"
```

Apply the committed migration history and generate the Prisma client:

```bash
npx prisma migrate deploy
npx prisma generate
```

For an existing database that was previously created with `prisma db push`, mark the baseline as already applied once before deploying:

```bash
npx prisma migrate resolve --applied 20260910120000_baseline
npx prisma migrate deploy
```

Start the backend using the development command configured for your local setup.

### 3. Setup the frontend

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

The Next.js development server will start locally. Open the URL shown in the terminal, typically:

```text
http://localhost:3000
```

Use `npm run dev` to start development; `npm dev` is not an npm command.

## Available Frontend Scripts

From `frontend/`:

```bash
npm run dev      # Start development server
npm run build    # Create production build
npm run start    # Start production server
```

## Environment Variables

Keep secrets and environment-specific configuration out of version control.

Typical backend configuration includes:

| Variable       | Purpose                      |
| -------------- | ---------------------------- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET`   | Secret used to sign JWTs     |
| `FRONTEND_URL` | Allowed frontend origin(s)  |

Add any frontend environment variables required by your local deployment configuration.

## Architecture

```text
                    ┌─────────────────────┐
                    │     Code Clash      │
                    │      Frontend       │
                    │    Next.js/React    │
                    └──────────┬──────────┘
                               │
                         HTTP / WebSocket
                               │
                    ┌──────────▼──────────┐
                    │       Backend       │
                    │ Express + Socket.IO │
                    └──────────┬──────────┘
                               │
                     ┌─────────▼─────────┐
                     │      Prisma       │
                     │        ORM        │
                     └─────────┬─────────┘
                               │
                     ┌─────────▼─────────┐
                     │    PostgreSQL     │
                     └───────────────────┘
```

## Authentication & Security

The backend includes JWT-based authentication and bcrypt for password hashing.

Environment secrets such as database credentials and JWT secrets should be stored in `.env` files or deployment-platform environment settings and should never be committed to Git.

## Development Notes

The project is intentionally split into independent `frontend` and `backend` directories so each layer can be developed and deployed separately.

For real-time functionality, the frontend uses `socket.io-client` while the backend uses `socket.io`.

## Deployment

The frontend can be deployed to platforms that support Next.js, such as Vercel.

The backend should be deployed separately to a Node.js-compatible hosting environment with access to the configured PostgreSQL database.

Before production deployment, configure all required environment variables and verify the database connection and CORS settings for the deployed frontend/backend origins.

## Contributing

1. Fork the repository.
2. Create a feature branch:

```bash
git checkout -b feature/your-feature
```

3. Make your changes and test them locally.
4. Commit your changes:

```bash
git add .
git commit -m "Add your feature"
```

5. Push the branch and open a pull request.

## License

This project currently does not declare a specific open-source license in the repository.

## Author

**Harshil Bhatnagar**

GitHub: [@itsmebhatnagar](https://github.com/itsmebhatnagar)
