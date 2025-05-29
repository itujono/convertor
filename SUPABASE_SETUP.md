# Supabase Setup Guide

## Overview

This project has been migrated from Neon DB + Better Auth + Drizzle to Supabase for both database and authentication.

## Supabase Configuration

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Get your project URL and anon key from Project Settings > API

### 2. Environment Variables

Add these environment variables to your `.env.local` files:

#### Frontend (`packages/frontend/.env.local`):

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

#### Backend (`packages/backend/.env.local`):

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Database Setup

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the SQL script from `packages/db/supabase-schema.sql`

### 4. Authentication Setup

1. In your Supabase project, go to Authentication > Providers
2. Enable Google provider
3. Configure Google OAuth:
   - Get Google OAuth credentials from Google Cloud Console
   - Add your client ID and secret to Supabase
   - Add authorized redirect URIs: `https://your-project.supabase.co/auth/v1/callback`

### 5. Row Level Security (RLS)

The schema includes RLS policies that ensure users can only access their own data. This is automatically set up when you run the SQL script.

## Key Changes from Better Auth + Drizzle

### Authentication

- **Before**: Better Auth with custom session management
- **After**: Supabase Auth with Google OAuth only
- **Benefits**: Built-in security, easier setup, better scaling

### Database

- **Before**: Neon PostgreSQL with Drizzle ORM
- **After**: Supabase PostgreSQL with direct SQL queries
- **Benefits**: Integrated with auth, Row Level Security, real-time capabilities

### API Authentication

- **Before**: Cookie-based sessions
- **After**: JWT tokens in Authorization header
- **Benefits**: Stateless, better for APIs, built-in token refresh

## Development

### Starting the Development Servers

```bash
# Backend (from packages/backend)
bun run dev

# Frontend (from packages/frontend)
bun run dev
```

### Database Schema Updates

1. Make changes in `packages/db/supabase-schema.sql`
2. Run the updated SQL in Supabase SQL Editor
3. Update TypeScript types in `packages/db/schema.ts` if needed

## Migration Notes

### Removed Dependencies

- `better-auth`
- `drizzle-orm`
- `@neondatabase/serverless`
- `drizzle-kit`

### Added Dependencies

- `@supabase/supabase-js`

### File Changes

- `packages/db/schema.ts` - Now contains Supabase client and TypeScript types
- `packages/backend/src/index.ts` - Updated to use Supabase auth and database
- `packages/frontend/src/lib/auth-client.ts` - Now uses Supabase client
- `packages/frontend/src/lib/auth-context.tsx` - Updated for Supabase auth flow
- `packages/frontend/src/lib/api-client.ts` - Updated to use JWT tokens

### Security Improvements

- Row Level Security (RLS) ensures data isolation
- JWT tokens provide stateless authentication
- Built-in token refresh and session management
- OAuth-only authentication (more secure than passwords)
