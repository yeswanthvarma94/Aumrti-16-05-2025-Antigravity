# Authentication Issues - Complete Solution

## Root Causes

### 1. **Invalid Credentials Error**
- No users exist yet in Supabase Auth
- The registration edge function (`register-hospital`) hasn't been invoked yet
- Default test user doesn't exist

### 2. **Password Reset Emails Not Working**
- Supabase Auth email templates not configured
- SMTP provider not set up (SendGrid, etc.)
- Redirect URL for password reset not configured

---

## Quick Fix: Create Test User Directly

### Step 1: Get Your Supabase Credentials
1. Open: https://app.supabase.com/
2. Select project: **lcemfzoangvewaahgmcz**
3. Go to **Settings → API**
4. Note down:
   - **Project URL**: `https://lcemfzoangvewaahgmcz.supabase.co`
   - **Anon Key**: Copy this and update in `.env.local`

### Step 2: Update `.env.local` 
Edit `d:\aumrti-hms-latest\.env.local`:
```env
VITE_SUPABASE_URL=https://lcemfzoangvewaahgmcz.supabase.co
VITE_SUPABASE_ANON_KEY=your-actual-anon-key
```

### Step 3: Create Test Hospital (if not exists)
In Supabase, go to **SQL Editor** and run:
```sql
INSERT INTO public.hospitals (id, name, type, state, beds_count, subscription_tier, is_active)
VALUES (
  '11111111-1111-1111-1111-111111111111'::uuid,
  'Test Hospital',
  'general',
  'Maharashtra',
  100,
  'professional',
  true
) ON CONFLICT DO NOTHING;
```

### Step 4: Create Auth User
In Supabase dashboard:
1. Go to **Authentication → Users**
2. Click **Add User**
3. Fill in:
   - **Email**: `admin@testhospital.com`
   - **Password**: `TestPassword123!`
4. Click **Create User**

### Step 5: Sync User to Users Table
In Supabase **SQL Editor**, run:
```sql
INSERT INTO public.users (id, hospital_id, full_name, email, role, is_active)
SELECT 
  id,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'Test Admin',
  email,
  'hospital_admin'::public.app_role,
  true
FROM auth.users
WHERE email = 'admin@testhospital.com'
ON CONFLICT DO NOTHING;
```

### Step 6: Test Login
1. Restart dev server: `npm run dev`
2. Go to: http://localhost:8080/login
3. Login with:
   - **Email**: `admin@testhospital.com`
   - **Password**: `TestPassword123!`

---

## Fix Password Reset Emails

### Step 1: Enable Email Provider in Supabase Auth
1. Go to **Authentication → Providers**
2. Find **Email** provider
3. Toggle **ON**

### Step 2: Configure Email Templates
1. Go to **Authentication → Email Templates**
2. For **Password Reset Email Template**, ensure:
   - **Redirect URL** is set to: `http://localhost:8080/login`
   - (Change to your production URL when deploying)

### Step 3: Configure SMTP (for production email delivery)

**Option A: SendGrid (Recommended)**
1. Get a SendGrid account: https://sendgrid.com/
2. Generate API Key
3. In Supabase, go to **Authentication → SMTP Settings**
4. Enter:
   ```
   From Email: noreply@yourhospital.com
   SMTP Host: smtp.sendgrid.net
   SMTP Port: 587
   SMTP User: apikey
   SMTP Password: YOUR_SENDGRID_API_KEY
   ```

**Option B: Use Built-in Email (Development Only)**
- Supabase sends limited test emails (4/hour)
- Check email in spam folder

### Step 4: Test Password Reset
1. Go to http://localhost:8080/login
2. Click **Forgot password?**
3. Enter: `admin@testhospital.com`
4. Check email for reset link
5. Click link and set new password

---

## Why Password Reset Was Failing

The code does this:
```typescript
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/login`
});
```

**But fails because:**
- ❌ Email templates not configured in Supabase
- ❌ SMTP not set up (no email provider)
- ❌ The redirect URL not matching Supabase settings

---

## Why Login Was Failing

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: credential,
  password: password,
});
```

**But fails because:**
- ❌ No users exist in `auth.users` table yet
- ❌ The users table not synced with auth
- ❌ Or wrong email/password combination

---

## Alternative: Use Registration Page

Instead of manual setup, you can use the built-in registration:
1. Go to: http://localhost:8080/register
2. Fill in hospital and admin details
3. Submit (calls `register-hospital` edge function)
4. The function creates auth user + hospital + users table entry automatically

**Note**: Ensure the edge function is deployed to your Supabase project

---

## Verification Checklist

- [ ] `.env.local` has correct `VITE_SUPABASE_ANON_KEY`
- [ ] Hospital exists in `hospitals` table
- [ ] Auth user exists in `auth.users` (visible in Supabase dashboard)
- [ ] User exists in `users` table with matching email
- [ ] Email provider enabled in Authentication → Providers
- [ ] Password reset template configured with correct redirect URL
- [ ] SMTP configured (for production)
- [ ] Dev server restarted after env changes
- [ ] Browser cache cleared (Ctrl+Shift+Delete)

---

## Common Issues

| Issue | Solution |
|-------|----------|
| "Invalid credentials" | Verify user exists in Supabase Dashboard → Auth → Users |
| Password reset email not arriving | Check Settings → Email Templates → Password Reset Redirect URL |
| Infinite redirect loop | Clear browser cache, check if hospital_id matches in users table |
| "Oops! Error on page" | Check browser console (F12) for specific error message |
| CORS error | Verify VITE_SUPABASE_URL matches your project |
