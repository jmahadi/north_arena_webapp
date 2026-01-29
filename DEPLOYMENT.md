# Deployment Guide: Vercel + Railway

This guide will help you deploy the North Arena Booking System with:
- **Frontend (Next.js)** → Vercel
- **Backend (FastAPI)** → Railway

---

## Prerequisites

1. GitHub account with this repository pushed
2. [Vercel account](https://vercel.com) (free)
3. [Railway account](https://railway.app) (free tier: $5/month credit)

---

## Step 1: Deploy Backend to Railway

### 1.1 Create Railway Project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose this repository
5. Railway will auto-detect the Python app - select the `backend` folder as the root directory

### 1.2 Add PostgreSQL Database

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Railway will automatically create and link the database

### 1.3 Configure Environment Variables

In Railway, go to your backend service → **Variables** tab and add:

```
SECRET_KEY=<generate-a-secure-key>
DATABASE_URL=${{Postgres.DATABASE_URL}}
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
ADMIN_EMAIL=your-admin@email.com
ADMIN_PASSWORD=your-secure-password
CORS_ORIGINS=https://your-app.vercel.app
```

**Important:**
- Generate SECRET_KEY with: `python3 -c "import secrets; print(secrets.token_hex(32))"`
- The `${{Postgres.DATABASE_URL}}` syntax auto-links to your Railway PostgreSQL
- Update CORS_ORIGINS after you deploy the frontend to Vercel

### 1.4 Configure Root Directory

In Railway service settings:
- Set **Root Directory** to: `backend`

### 1.5 Deploy

Railway will automatically deploy. Note your backend URL (e.g., `https://your-project.railway.app`)

---

## Step 2: Deploy Frontend to Vercel

### 2.1 Import Project

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Import your GitHub repository

### 2.2 Configure Build Settings

- **Framework Preset:** Next.js (auto-detected)
- **Root Directory:** `frontend`
- **Build Command:** `npm run build` (default)
- **Output Directory:** Leave empty (default)

### 2.3 Add Environment Variables

In Vercel project settings → **Environment Variables**:

```
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
```

Replace with your actual Railway backend URL from Step 1.5

### 2.4 Deploy

Click **"Deploy"**. Vercel will build and deploy your frontend.

---

## Step 3: Connect Frontend & Backend

### 3.1 Update Railway CORS

Go back to Railway and update the `CORS_ORIGINS` variable:

```
CORS_ORIGINS=https://your-app.vercel.app
```

Use your actual Vercel URL. Railway will auto-redeploy.

### 3.2 Verify Connection

1. Visit your Vercel frontend URL
2. Try logging in with admin credentials
3. Check browser console for any CORS errors

---

## Quick Reference: Environment Variables

### Backend (Railway)

| Variable | Description | Example |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing key | `a1b2c3d4...` (64 chars) |
| `DATABASE_URL` | PostgreSQL connection | `${{Postgres.DATABASE_URL}}` |
| `ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiry | `10080` (7 days) |
| `CORS_ORIGINS` | Allowed frontend URLs | `https://app.vercel.app` |
| `ADMIN_EMAIL` | Initial admin email | `admin@example.com` |
| `ADMIN_PASSWORD` | Initial admin password | `secure-password` |

### Frontend (Vercel)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `https://api.railway.app` |

---

## Troubleshooting

### CORS Errors
- Ensure `CORS_ORIGINS` in Railway includes your Vercel URL
- Include `https://` prefix
- For multiple origins: `https://app.vercel.app,https://custom.com`

### Database Connection Issues
- Verify `DATABASE_URL` uses Railway's variable reference syntax
- Check Railway logs for connection errors

### Build Failures
- Check that `requirements.txt` is in the `backend` folder
- Check that `package.json` is in the `frontend` folder

### API Not Responding
- Check Railway deployment logs
- Verify the backend service is running
- Test the API directly: `https://your-backend.railway.app/docs`

---

## Custom Domain (Optional)

### Vercel
1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS as instructed

### Railway
1. Go to Service Settings → Networking
2. Add custom domain
3. Configure DNS CNAME record

---

## Cost Estimate

- **Vercel Free Tier:** Sufficient for admin dashboards
- **Railway Free Tier:** $5/month credit, typically enough for low-traffic apps
- **Total:** $0-5/month for small admin dashboard usage
