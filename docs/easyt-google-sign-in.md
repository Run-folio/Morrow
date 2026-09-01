# Google sign-in for Morrovia

Google is configured through Morrovia's existing Better Auth instance. It is an additional credential for the canonical Better Auth user, not a separate user or trip owner. The login button appears only when both server-side Google credentials are present; email/password remains available.

## 1. Create the Google OAuth client

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create or choose a project, configure the OAuth consent screen, then create an **OAuth client ID** for a **Web application**.

Add these authorised redirect URIs exactly:

```text
http://localhost:3000/api/auth/callback/google
https://staging.morrovia.com/api/auth/callback/google
https://morrovia.com/api/auth/callback/google
```

Do not add a trailing slash. Better Auth derives the callback from the environment's `BETTER_AUTH_URL`, so the origin and the Google Cloud entry must match character-for-character.

## 2. Configure each environment

Keep the client secret server-side and configure each environment independently:

```text
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
BETTER_AUTH_SECRET=a-stable-environment-secret
```

Use the following URL pairs:

| Environment | `BETTER_AUTH_URL` | `NEXT_PUBLIC_APP_URL` |
| --- | --- | --- |
| Local | `http://localhost:3000` | `http://localhost:3000` |
| Staging | `https://staging.morrovia.com` | `https://staging.morrovia.com` |
| Production | `https://morrovia.com` | `https://morrovia.com` |

The Better Auth secret must remain stable within an environment or existing sessions and in-flight OAuth state cannot be validated. Mark `GOOGLE_CLIENT_SECRET` and `BETTER_AUTH_SECRET` as secrets. Never add credentials to the repository or expose them through `NEXT_PUBLIC_` variables.

Morrovia requests only Google's OpenID identity scopes: `openid`, `email`, and `profile`. Better Auth adds `openid` to the configured `email` and `profile` scopes. No Drive, Calendar, contacts, advertising, or offline access scope is requested.

## 3. Account-linking policy

Better Auth remains the account owner. The Google provider subject is stored as an `account` row attached to the existing Better Auth `user.id`; `easyt_users.id` and `easyt_trips.owner_id` continue to use that same canonical user ID.

Implicit same-email linking is allowed only when Google reports the email as verified **and** the existing local Better Auth user is already verified. Google is deliberately not configured as a forced trusted provider, different-email linking is disabled, provider profile data does not overwrite the existing Morrovia profile on link, and unlinking the last viable account is disabled.

Therefore:

- a verified existing Morrovia user choosing a Google account with the same verified email receives one user with both credentials and keeps the same trips;
- an unverified existing local user fails with `account_not_linked` and is directed to the existing email method; Google linking remains unavailable until that local email can be verified;
- Morrovia never performs a custom email merge and never keys trip ownership from the Google subject.

Better Auth stores the Google provider subject, granted scope, expiry metadata and any access, refresh or ID token Google supplies in the server-side `account` table. New and refreshed OAuth token fields are encrypted with `BETTER_AUTH_SECRET`. They are not sent to client analytics and are removed with the Better Auth account during Morrovia account deletion.

## 4. Deploy and test

After saving variables, deploy to staging first. On `/journey/login`, choose **Continue with Google**, select an account, and confirm the intended Morrovia return route is preserved.

Verify on localhost and staging with test accounts only:

1. new Google user;
2. returning Google user;
3. existing verified email user with the same verified Google email;
4. cancellation and a stale callback;
5. sign out and sign back in;
6. protected-trip and create-trip/save return flows;
7. two-account owner isolation across Overview, Itinerary, Map and Luna.

If Google reports `redirect_uri_mismatch`, compare the displayed URI character-for-character with the relevant entry above. Do not use production customer data for verification.
