# Deployment Guide: Code Clash

This guide will walk you through deploying your full-stack Code Clash application. We will use **Render** for the backend (which supports Docker to run your code judge) and **Vercel** for the Next.js frontend.

## 1. Prepare the Backend for Render

Your backend requires a few services to run properly:
- **Node.js Web Server & Worker**: Started concurrently in your `Dockerfile`.
- **PostgreSQL Database**: For your Prisma models.
- **Redis**: For your BullMQ job queues.

Since your `Dockerfile` installs `python3`, `gcc`, `g++`, and `default-jdk`, you **must** use Render's **Docker** environment rather than the native Node.js environment.

### Step 1: Set up Redis (Free Tier)
Render no longer offers a free Redis instance. The best free alternative is [Upstash](https://upstash.com/).
1. Go to Upstash and create a free Redis database.
2. Copy the **Redis URL** (it should look like `rediss://default:password@endpoint:port`).

### Step 2: Create a Render PostgreSQL Database
1. Go to the [Render Dashboard](https://dashboard.render.com/) and click **New > PostgreSQL**.
2. Name it `code-clash-db`.
3. Select the **Free** instance type and click **Create Database**.
4. Once created, copy the **Internal Database URL**.

### Step 3: Deploy the Backend Web Service
1. On Render, click **New > Web Service**.
2. Connect your GitHub repository.
3. In the setup page, configure the following:
   - **Name**: `code-clash-backend`
   - **Environment**: `Docker`
   - **Root Directory**: Leave blank (or `/` depending on your setup)
   - **Dockerfile Path**: `./backend/Dockerfile` (Render needs to know where it is)
4. Add the following **Environment Variables**:
   - `DATABASE_URL`: The Internal Database URL you copied from Step 2.
   - `REDIS_URL`: The URL you copied from Upstash in Step 1.
   - `JUDGE_REQUIRE_SANDBOX`: `false` (since you're running compilers locally inside the Docker container).
   - `JWT_SECRET`: Generate a random long string.
   - `FRONTEND_URL`: You can leave this as a placeholder for now (e.g., `https://your-vercel-app.vercel.app`) and update it after Vercel deployment.
   - `ADMIN_EMAIL`: Your admin email.
   - `ADMIN_PASSWORD`: Your admin password.
5. Click **Create Web Service**. Render will build the Docker container and start both the API and Worker!
6. Copy the resulting backend URL (e.g., `https://code-clash-backend.onrender.com`).

---

## 2. Deploy the Frontend on Vercel

Vercel is perfect for Next.js applications and is completely free for personal projects.

### Step 1: Create a Vercel Project
1. Go to the [Vercel Dashboard](https://vercel.com/) and click **Add New > Project**.
2. Import your GitHub repository.

### Step 2: Configure the Build
1. In the "Configure Project" screen, ensure the **Framework Preset** is set to `Next.js`.
2. **Root Directory**: Click "Edit" and select the `frontend` folder.
3. Open the **Environment Variables** section and add:
   - `NEXT_PUBLIC_BACKEND_URL`: The Render URL you copied earlier (e.g., `https://code-clash-backend.onrender.com`).

### Step 3: Deploy
1. Click **Deploy**. Vercel will build and deploy your Next.js application.
2. Once deployed, Vercel will give you a public URL (e.g., `https://code-clash-frontend.vercel.app`).

---

## 3. Final Polish
1. Take the Vercel URL and go back to your **Render Web Service**.
2. Navigate to the **Environment** tab on Render.
3. Update the `FRONTEND_URL` variable to match your actual Vercel URL to avoid CORS issues.
4. Save and let Render do a quick redeploy.

Your application is now live!
