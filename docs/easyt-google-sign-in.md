# Google sign-in for EasyT

The EasyT Google provider is already configured in `auth.config.ts`. Google sign-in appears on the login page only when both provider secrets are present.

## 1. Create the Google OAuth client

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create or choose a project, configure the OAuth consent screen, then create an **OAuth client ID** for a **Web application**.

Add these authorised redirect URIs exactly:

```text
https://shaunwhiting.com/api/auth/callback/google
http://localhost:3000/api/auth/callback/google
```

Do not add a trailing slash. The production URL must match the public URL configured in Better Auth and Netlify exactly.

## 2. Add the secrets in Netlify

In **Site configuration → Environment variables**, add these values for **Production**, **Deploy Previews**, **Branch deploys** and **Local development**:

```text
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
BETTER_AUTH_URL=https://shaunwhiting.com
NEXT_PUBLIC_APP_URL=https://shaunwhiting.com
```

Mark the client secret as secret. Never add either value to the repository.

## 3. Deploy and test

Trigger a new production deploy after saving the variables. On `/journey/login`, choose **Continue with Google**, select an account, then confirm you return to the intended EasyT page and can see the account in the dashboard.

If Google reports `redirect_uri_mismatch`, compare the displayed redirect URI character-for-character with the production URI above. If a preview URL needs Google sign-in, add that exact preview callback URI too, or keep SSO testing on localhost and production.
