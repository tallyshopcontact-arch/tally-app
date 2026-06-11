# TALLY — Developer Context

## What TALLY is
A SaaS platform for music producers that helps them package every beat upload for maximum YouTube discovery.

## Positioning
"We help you package your beats so every upload is positioned for maximum YouTube performance"

## Live URLs
- Production: https://tallyagc.com
- GitHub: https://github.com/tallyshopcontact-arch/tally-app

## Tech Stack
- Frontend: Next.js 16, TypeScript, Tailwind CSS
- Database: Supabase (PostgreSQL)
- Auth: Supabase Auth
- Hosting: Vercel
- AI reports: Anthropic Claude API (claude-sonnet-4-20250514)
- YouTube data: YouTube Data API v3
- Payments: Stripe (single plan $19.99/month)

## Environment Variables Required
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SUPABASE_URL
ANTHROPIC_API_KEY
YOUTUBE_API_KEY
STRIPE_SECRET_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID
ADMIN_PASSWORD
RESEND_API_KEY
GMAIL_USER
GMAIL_APP_PASSWORD

## Database Tables
- profiles — producer accounts (includes stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at, subscription_ends_at, beta_access)
- channel_data — YouTube data pulled per producer per month
- reports — AI generated monthly reports per producer
- upload_kits — upload kit generation history
- title_tests — title tester history
- competitors — tracked competitor channels per producer
- scores_history — TALLY score per producer per month
- rate_limits — API rate limiting per producer per endpoint
- waitlist — email signups from landing page

## Product — 7 Tools
1. Upload Kit Generator (/dashboard/upload-kit) — optimized title (scored 75+), description in beat format, tags, thumbnail inspiration prioritized by artist then genre
2. Title Tester (/dashboard/title-tester) — scores titles 1-100 with rewrites
3. Keyword Heat Map — top 20 trending tags in niche updated monthly
4. Monthly Report (/dashboard/report) — full channel analysis with all sections
5. Action Plan — 7 specific monthly priorities using real channel data
6. Competitor Tracker (/dashboard/competitors) — track up to 5 channels with TALLY score comparison
7. TALLY Score — monthly growth health score with history graph
8. Growth Forecast — 90-day projection unlocks after 3 months of data

## Pricing
Single plan: $19.99/month with 7-day free trial, cancel anytime.
Beta producers get free access via beta_access = true in profiles table — no Stripe required.
Free users get 3 uses of Upload Kit and Title Tester before upgrade prompt.

## Subscription Status Values
- free — no subscription
- trialing — in 7-day free trial
- active — paying subscriber
- past_due — payment failed
- cancelled — subscription ended
- beta — beta access via beta_access flag

## Key Files
lib/youtube.ts — YouTube API functions
lib/report.ts — Anthropic API report generation
lib/stripe.ts — Stripe client
lib/rate-limit.ts — Rate limiting
lib/sanitize.ts — Input sanitization
lib/title-scorer.ts — Title scoring algorithm
lib/hooks/useSubscription.ts — Subscription status hook
middleware.ts — Route protection (renamed proxy.ts)

## Coding Standards
- Always TypeScript
- Always try/catch error handling
- Always authenticate API routes via Supabase session
- Always rate limit API routes
- Always sanitize user inputs before Claude prompts
- Dark theme: #0a0a0a background, white text
- Match existing component styles
