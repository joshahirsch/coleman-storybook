# Resend email — one-time setup

This is the setup that makes `EMAIL_PROVIDER="resend"` work (see
`src/lib/email/resend-provider.ts` for what it does and why). It's a
one-time, ~10 minute process using your own account — nothing here can be
done on your behalf without your login, so this is written as a checklist
for you to run through yourself. When you're done you'll have 2 values to
add as Vercel environment variables.

**Why this exists**: the contributor identity form now sends a 6-digit
one-time code to the email a contributor enters, before letting them
record — confirms the email is real and theirs, so what lands in the
contact-log CSV export is trustworthy contact data. The app had no
email-sending capability before this. Without `EMAIL_PROVIDER` set to
`"resend"` (or without `RESEND_API_KEY`/`RESEND_FROM_EMAIL` set), the app
falls back to just logging the code to the server console instead of
emailing it — fine for local dev, not usable in production.

## 1. Create a Resend account

1. Go to [resend.com](https://resend.com/) and sign up (their free tier
   covers this app's expected volume — 3,000 emails/month, 100/day).
2. Verify your own email to activate the account.

## 2. Verify a sending domain (or use Resend's shared test domain to start)

Resend requires the "from" address to come from a domain you've verified
ownership of, via DNS records (SPF/DKIM), so mail actually lands in inboxes
instead of getting flagged as spam.

- **If you have a domain for Coleman Storybook already** (e.g. the org's
  real domain): Resend dashboard → **Domains** → **Add Domain** → follow
  the DNS records it gives you (add them wherever your domain's DNS is
  managed — Namecheap, Google Domains, Cloudflare, etc.) → wait for
  verification (usually minutes, can take longer depending on DNS
  propagation).
- **If you don't have one yet / want to test first**: Resend gives every
  new account a shared `onboarding@resend.dev` sending address that works
  immediately with no DNS setup — fine for verifying the OTP flow works
  end-to-end before investing in a real domain. Swap to a real verified
  domain before treating this as the permanent production setup (a shared
  test domain is not meant for real production traffic long-term).

## 3. Create an API key

1. Resend dashboard → **API Keys** → **Create API Key**.
2. Name it something like `coleman-storybook-production`.
3. Permission: **Sending access** is enough (no need for full account access).
4. Copy the key immediately — Resend only shows it once.

## 4. Add the environment variables to Vercel

Same pattern as the Supabase/Google Drive setup — Vercel project → Settings
→ Environment Variables → add for Production (and Preview, if you want
preview deploys to also send real emails — otherwise leave `EMAIL_PROVIDER`
unset there and it'll fall back to console-logging):

```
EMAIL_PROVIDER=resend
RESEND_API_KEY=<the key from step 3>
RESEND_FROM_EMAIL=Coleman Storybook <noreply@yourdomain.org>
```

`RESEND_FROM_EMAIL` must be an address at the domain you verified in step 2
(or `onboarding@resend.dev` if you're using the shared test domain for now).

## 5. Redeploy and test

Redeploy so the new env vars take effect, then submit a real test
recording on the live site and confirm the verification email actually
arrives (check spam folder the first few times, especially on a freshly
verified domain).
