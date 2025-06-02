# Railway Deployment Guide

This guide will help you deploy your Bun monorepo convertor app to Railway.

## Prerequisites

1. [Railway Account](https://railway.app) (free tier available)
2. GitHub repository connected to Railway
3. Environment variables ready

## Deployment Steps

### 1. Create Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Connect your GitHub repository
4. Railway will detect it's a monorepo

### 2. Deploy Backend Service

1. **Add Backend Service:**

   - Click "Add Service" → "GitHub Repo"
   - Select your repository
   - Set **Root Directory** to `packages/backend`
   - Railway will auto-detect Bun and use the `nixpacks.toml` config

2. **Set Backend Environment Variables:**

   ```bash
   # Database
   DATABASE_URL=your_neon_db_connection_string

   # Supabase
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

   # AWS S3
   AWS_REGION=your_aws_region
   AWS_S3_BUCKET=your_bucket_name
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   AWS_CLOUDFRONT_DOMAIN=your_cloudfront_domain (optional)

   # Stripe
   STRIPE_SECRET_KEY=your_stripe_secret_key
   STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

   # Frontend URL (will be set after frontend deployment)
   FRONTEND_URL=https://your-frontend-domain.railway.app
   ```

3. **Deploy Backend:**
   - Railway will automatically build and deploy
   - Note the backend URL: `https://your-backend-service.railway.app`

### 3. Deploy Frontend Service

1. **Add Frontend Service:**

   - Click "Add Service" → "GitHub Repo"
   - Select your repository again
   - Set **Root Directory** to `packages/frontend`
   - Railway will auto-detect Next.js

2. **Set Frontend Environment Variables:**

   ```bash
   # Backend API
   NEXT_PUBLIC_API_URL=https://your-backend-service.railway.app

   # Supabase (public keys)
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

   # Stripe (public key)
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
   ```

3. **Deploy Frontend:**
   - Railway will build and deploy automatically
   - Note the frontend URL: `https://your-frontend-service.railway.app`

### 4. Update Backend CORS

1. Go back to your **Backend Service** environment variables
2. Update `FRONTEND_URL` with your actual frontend Railway URL:
   ```bash
   FRONTEND_URL=https://your-frontend-service.railway.app
   ```
3. Redeploy the backend service

## Configuration Files Explained

### `railway.json` (Root)

Basic Railway project configuration.

### `packages/backend/railway.json`

- Configures Bun-based backend service
- Uses `bun run src/index.ts` as start command

### `packages/backend/nixpacks.toml`

- Ensures Railway installs Bun and FFmpeg
- Required for video/audio conversion features

### `packages/frontend/railway.json`

- Configures Next.js frontend service
- Standard Node.js build process

## Important Notes

1. **Environment Variables**: Set all required env vars in Railway dashboard
2. **Database**: Make sure your Neon DB allows connections from Railway IPs
3. **CORS**: The backend is configured to accept requests from Railway domains
4. **FFmpeg**: Automatically installed via nixpacks for media conversion
5. **File Storage**: AWS S3 is used for file storage (not Railway's filesystem)

## Troubleshooting

### Backend Issues

- Check logs in Railway dashboard
- Verify all environment variables are set
- Ensure Neon DB connection string is correct

### Frontend Issues

- Verify `NEXT_PUBLIC_API_URL` points to backend Railway URL
- Check browser console for CORS errors
- Ensure Supabase keys are correct

### File Conversion Issues

- FFmpeg should be auto-installed via nixpacks
- Check backend logs for conversion errors
- Verify AWS S3 credentials and permissions

## Manual Deployment Commands

If you prefer CLI deployment:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link project
railway login
railway link

# Deploy backend
cd packages/backend
railway up

# Deploy frontend (in new terminal)
cd packages/frontend
railway up
```

## Production Checklist

- [ ] Backend deployed and accessible
- [ ] Frontend deployed and accessible
- [ ] All environment variables set
- [ ] CORS configured correctly
- [ ] Database connected
- [ ] S3 bucket accessible
- [ ] Stripe webhooks configured
- [ ] File conversion working
- [ ] Authentication working

Your app should now be fully deployed on Railway! 🚀
