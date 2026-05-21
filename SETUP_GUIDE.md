# Aumrti Setup Guide - Authentication & Email Configuration

## Step 1: Configure Supabase Auth

1. Go to your Supabase dashboard: https://app.supabase.com/
2. Select your project: **lcemfzoangvewaahgmcz**
3. Go to **Authentication → Providers**
   - Ensure **Email** provider is enabled
   - Toggle ON "Email" under Auth Providers

## Step 2: Configure Email Templates

1. In Supabase dashboard, go to **Authentication → Email Templates**
2. Verify these templates exist:
   - **Confirm signup email** (optional, but recommended)
   - **Magic Link** (required)
   - **Reset Password** (IMPORTANT FOR PASSWORD RESET)

3. For **Reset Password Template**, the default redirect URL should be:
   ```
   http://localhost:8080/login
   ```
   OR your production URL if deploying

## Step 3: Set Up SMTP (Email Provider)

### Option A: Use Supabase's Built-in Email (Development)
- Go to **Authentication → SMTP Settings**
- If not configured, Supabase uses test email (limited to 4 sends/hour)

### Option B: Configure SendGrid/Custom SMTP (Production)
1. In Supabase, go to **Authentication → SMTP Settings**
2. Fill in:
   - **SMTP Host**: smtp.sendgrid.net
   - **SMTP Port**: 587
   - **SMTP User**: apikey
   - **SMTP Password**: YOUR_SENDGRID_API_KEY
   - **From Email**: noreply@yourhospital.com
   - **From Name**: Aumrti Hospital

## Step 4: Create Test User in Supabase

### Option A: Via Supabase Dashboard
1. Go to **Authentication → Users**
2. Click **Add User**
3. Enter:
   - Email: `admin@example.com`
   - Password: `TestPassword123!`
   - Click **Create User**

### Option B: Via Your App (if register endpoint exists)
Visit: `http://localhost:8080/register`

## Step 5: Test Login & Password Reset

1. Go to `http://localhost:8080/login`
2. Enter credentials created in Step 4
3. Test **Forgot password?** link
4. Check email for reset link

## Step 6: Ensure .env.local is Complete

Your `.env.local` file needs:
```env
VITE_SUPABASE_URL=https://lcemfzoangvewaahgmcz.supabase.co
VITE_SUPABASE_ANON_KEY=your-actual-anon-key-here
```

Get your ANON KEY from: **Settings → API → Anon/Public Key**

## Troubleshooting

### "Invalid credentials" even with correct password
- Verify user exists in Auth → Users
- Check .env.local has correct VITE_SUPABASE_ANON_KEY
- Restart dev server after changing .env.local

### Password reset emails not arriving
- Check Supabase Dashboard → Authentication → Email Log
- Verify SMTP is configured
- Check spam folder
- If development, note Supabase test email is limited to 4/hour

### Users table not syncing with Auth
- Database must have a `users` table with:
  - `auth_user_id` (UUID, matches auth.users.id)
  - `full_name` (text)
  - `role` (text)
  - `hospital_id` (UUID)
  - Foreign key relationship to auth.users

## Next Steps

After testing locally, ensure you have:
1. ✅ Supabase Auth enabled with Email provider
2. ✅ Email templates configured
3. ✅ SMTP configured for production
4. ✅ Users table synced with auth.users
5. ✅ Proper database migrations run
