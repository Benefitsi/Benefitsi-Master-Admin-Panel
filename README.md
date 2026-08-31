# Benefitsi Admin Panel

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Supabase setup

Create `.env.local` from `.env.example` and fill in the publishable key from
your Supabase project settings:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://slscoqdhbxftcournvut.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

## Partner research assistant

The Add Partner workflow can research a shop from its website, a Google Maps
link, or its name and location. Gemini uses Google Search and URL context on the
server, then returns source-linked suggestions for an admin to review. Research
never saves a partner or changes a form field until the admin selects and
applies a suggestion.

When an official website URL is supplied, the server also reads first-party
structured data directly. This fallback can recover contact details, opening
hours, official imagery, and machine-readable menu data even when Gemini is
temporarily unavailable. Selected remote images are validated, resized, and
copied into Supabase Storage when the partner is created; external image URLs
are not left as permanent hotlinks. Menu automation is intentionally limited to
current official menu content and never invents missing prices or allergens.

Without Gemini, a name/address search can also use the free OpenStreetMap
Nominatim service for location, coordinates, address, classification, and any
contact details recorded on the map feature. Requests are user-triggered,
limited to one per second, cached for 24 hours per server instance, and clearly
labelled as community-maintained data that requires admin verification. Website
research follows at most three relevant same-domain contact, about, or menu
links in addition to the supplied page.

Configure a Gemini API key with active quota in `.env.local`:

```bash
GEMINI_API_KEY=your-server-only-key
# Optional; defaults to Gemini 3.5 Flash and falls back to current Flash aliases
GEMINI_PARTNER_ENRICHMENT_MODEL=gemini-3.5-flash
```

Do not expose this key through a `NEXT_PUBLIC_` variable. Google Search
grounding and URL context availability depend on the selected model and the
Gemini project billing/quota.

## Partner microsite dashboard access

Partners can now use an isolated dashboard at:

- `http://localhost:3000/partner/login` (or your production domain + `/partner/login`)

Access is scoped and does not change the existing admin panel UI/flow.

### Who can sign in

A Supabase-authenticated user can access the partner dashboard when either of these is true:

1. They are linked as owner: `partners.owner_id` matches `users.id` or `users.uid`
2. They are linked as staff: `partner_staff.user_id` matches `users.id` or `users.uid` (and `active` is not `false`)

`users.is_partner = true` is expected for partner accounts.

### What partners can access

- `/partner`: list of their linked partner shop microsites
- `/partner/microsite-builder/[partner]`: microsite editor for only linked partners
- `/partner/microsite-preview/[partner]`: scoped preview for only linked partners

## Admin and partner password recovery

Both sign-in pages include a **Forgot password?** link. Supabase Auth sends the
recovery message through the project's configured SMTP provider (Resend), so no
Resend API key is exposed to this application.

For production, add these two exact URLs to **Supabase Dashboard > Authentication
> URL Configuration > Redirect URLs**, replacing the example host with the admin
panel host:

```text
https://admin.example.com/reset-password?portal=admin
https://admin.example.com/reset-password?portal=partner
```

Then use `supabase/templates/recovery.html` as the **Reset password** email
template in **Authentication > Email Templates**. The template sends the hashed,
single-use recovery token to `/auth/confirm`; this makes the cookie-based SSR
flow reliable even when the email is opened in a different browser. Local
Supabase already uses this template through `supabase/config.toml`, and local
emails remain available in Mailpit.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
