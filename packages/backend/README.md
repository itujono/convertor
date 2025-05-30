# Backend

File conversion backend built with Hono, Better-Auth, and FFmpeg.

## Setup

1. Install dependencies:

```bash
bun install
```

2. Set up environment variables:

```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/convertor"

# Better Auth
BETTER_AUTH_SECRET="your-secret-key-here-make-it-long-and-random"

# Google OAuth (required for social sign-in)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# AWS S3 & CloudFront (required for file storage)
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="your-aws-access-key-id"
AWS_SECRET_ACCESS_KEY="your-aws-secret-access-key"
AWS_S3_BUCKET="your-s3-bucket-name"
AWS_CLOUDFRONT_DOMAIN="your-cloudfront-domain.cloudfront.net"  # Optional, improves performance
```

3. Set up Google OAuth:

   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the **Google Identity API** (not Google+ which is deprecated)
   - Go to "Credentials" and create OAuth 2.0 Client IDs
   - Set application type to "Web application"
   - Add authorized redirect URIs:
     - `http://localhost:3001/auth/callback/google` (development)
     - `https://yourdomain.com/auth/callback/google` (production)

4. Set up AWS S3 & CloudFront:

   - Create an S3 bucket for file storage
   - Create a CloudFront distribution pointing to your S3 bucket (optional but recommended)
   - Create an IAM user with S3 permissions and get access keys
   - Required S3 permissions: `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`

5. Run database migrations:

```bash
# From the project root
cd packages/db
bun run migrate
```

5. Run the development server:

```bash
bun run dev
```

## Features

- File upload and conversion using FFmpeg
- User authentication with Better-Auth
- Email/password and Google OAuth sign-in
- Plan-based conversion limits (free/premium)
- Support for video, image, and audio formats
- RESTful API endpoints

## API Endpoints

- `POST /api/upload` - Upload files
- `POST /api/convert` - Convert files
- `GET /api/download/:filename` - Download converted files
- `GET /api/user` - Get current user info
- `GET /health` - Health check
- `/auth/*` - Authentication endpoints (includes Google OAuth)

## Authentication

The backend supports both email/password and Google OAuth authentication:

### Email/Password

- Sign up: `POST /auth/sign-up`
- Sign in: `POST /auth/sign-in`

### Google OAuth

- Initiate: `GET /auth/sign-in/google`
- Callback: `GET /auth/callback/google`

### Session Management

- Get session: `GET /auth/session`
- Get user info: `GET /api/user`
- Sign out: `POST /auth/sign-out`

open http://localhost:3000
