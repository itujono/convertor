# Stripe Subscription Setup Guide

This guide will walk you through setting up Stripe subscriptions for your file converter app.

## 🏗️ **What We've Built**

### Backend Components:

- ✅ Subscription table in Supabase
- ✅ Stripe webhook handlers
- ✅ Subscription management endpoints
- ✅ Automatic plan upgrades/downgrades

### Frontend Components:

- ✅ Stripe Checkout integration
- ✅ Plan upgrade buttons
- ✅ Subscription management UI

## 🔧 **Setup Steps**

### 1. Create Stripe Account & Products

1. **Sign up for Stripe**: Go to [stripe.com](https://stripe.com) and create an account
2. **Create Products**:
   - Go to Products in Stripe Dashboard
   - Create "Premium Monthly" product with recurring billing
   - Create "Premium Yearly" product with recurring billing
   - Note down the Price IDs (they start with `price_`)

### 2. Environment Variables

#### Backend (.env):

```bash
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Stripe
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_your_monthly_price_id
STRIPE_PREMIUM_YEARLY_PRICE_ID=price_your_yearly_price_id

# App
FRONTEND_URL=http://localhost:3000
PORT=3001
```

#### Frontend (.env.local):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_your_monthly_price_id
NEXT_PUBLIC_STRIPE_PREMIUM_YEARLY_PRICE_ID=price_your_yearly_price_id
```

### 3. Stripe Webhook Setup

1. **Create Webhook Endpoint**:

   - Go to Webhooks in Stripe Dashboard
   - Add endpoint: `http://localhost:3001/webhooks/stripe` (for development)
   - For production: `https://yourdomain.com/webhooks/stripe`

2. **Select Events**:

   ```
   checkout.session.completed
   customer.subscription.updated
   customer.subscription.deleted
   invoice.payment_succeeded
   invoice.payment_failed
   ```

3. **Get Webhook Secret**:
   - Copy the webhook signing secret (starts with `whsec_`)
   - Add it to your backend environment variables

### 4. Test the Integration

1. **Start your servers**:

   ```bash
   # Backend
   cd packages/backend && bun run dev

   # Frontend
   cd packages/frontend && bun run dev
   ```

2. **Test the flow**:
   - Sign in to your app
   - Click "Upgrade to Premium" button
   - Complete test payment with Stripe test card: `4242 4242 4242 4242`
   - Verify user plan updates in database

## 🎯 **How It Works**

### Subscription Flow:

1. User clicks "Upgrade" button
2. Frontend calls `/api/subscription/checkout`
3. Backend creates Stripe Checkout session
4. User completes payment on Stripe
5. Stripe sends webhook to `/webhooks/stripe`
6. Backend updates user plan in database
7. User gets premium features immediately

### Database Schema:

```sql
-- subscriptions table
id                    UUID PRIMARY KEY
user_id              UUID REFERENCES users(id)
stripe_subscription_id TEXT UNIQUE
stripe_customer_id    TEXT
stripe_price_id       TEXT
status               TEXT (active, canceled, etc.)
current_period_start  TIMESTAMP
current_period_end    TIMESTAMP
cancel_at_period_end  BOOLEAN
created_at           TIMESTAMP
updated_at           TIMESTAMP

-- users table (updated)
stripe_customer_id    TEXT UNIQUE (added)
plan                 TEXT (free, premium)
```

## 🔒 **Security Features**

- ✅ Webhook signature verification
- ✅ Row Level Security (RLS) on subscriptions table
- ✅ Service role authentication for webhooks
- ✅ User can only see their own subscriptions

## 🚀 **Production Deployment**

### 1. Update Webhook URL

- Change webhook endpoint to your production domain
- Update `FRONTEND_URL` environment variable

### 2. Switch to Live Mode

- Use live Stripe keys instead of test keys
- Create live products and price IDs
- Update environment variables

### 3. Test Thoroughly

- Test subscription creation
- Test webhook delivery
- Test plan upgrades/downgrades
- Test cancellations

## 🛠️ **Customization Options**

### Add More Plans:

1. Create new products in Stripe
2. Add price IDs to environment variables
3. Update `STRIPE_PRICES` in both frontend and backend
4. Update plan logic in `getPlanFromPriceId()`

### Custom Pricing Page:

- Create `/pricing` page with plan comparison
- Add yearly discount logic
- Implement plan switching

### Usage Tracking:

- Track conversions per user
- Implement usage limits
- Add overage billing

## 🐛 **Troubleshooting**

### Common Issues:

1. **Webhook not receiving events**:

   - Check webhook URL is correct
   - Verify webhook secret matches
   - Check server logs for errors

2. **User plan not updating**:

   - Check webhook events are being processed
   - Verify database permissions
   - Check Supabase RLS policies

3. **Checkout not working**:
   - Verify Stripe publishable key
   - Check price IDs are correct
   - Ensure user is authenticated

### Debug Commands:

```bash
# Check webhook events
curl -X POST http://localhost:3001/webhooks/stripe

# Check user subscription
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3001/api/subscription

# Check database
SELECT * FROM subscriptions WHERE user_id = 'USER_ID';
```

## 📞 **Support**

If you run into issues:

1. Check Stripe Dashboard for webhook delivery logs
2. Check your server logs for errors
3. Verify all environment variables are set correctly
4. Test with Stripe's test cards first

Happy coding! 🎉
