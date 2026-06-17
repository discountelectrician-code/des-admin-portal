# Firestore Security Specification - Discount Electrical Ecosystem

## 1. Data Invariants

1. **Strict Admin Restriction**: Only authenticated users with the `admin` custom claim (`request.auth.token.admin == true`) can read or write `tracking_events`.
2. **PII and Claims Isolation**: Standard users can only read/write their own `/users/{userId}` profiles, but are strictly forbidden from modifying their own `claims` map (privilege escalation protection). Only an admin can update user claims.
3. **Temporal Integrity**: All logs or updates must use the server timestamp `request.time`. Specifically on creation, `timestamp` or `createdAt` fields must equal `request.time`.
4. **Id Validation**: Document IDs for writes must conform to a strict alphanumeric set `^[a-zA-Z0-9_\-]+$` and be ≤ 128 chars.
5. **Verified Email Mandate**: To execute any write, the user's email must be verified (`request.auth.token.email_verified == true`).

---

## 2. The "Dirty Dozen" Payloads

Here are twelve payloads designed to violate system security:

1. **Self-Assigning Admin Role (Create User profile)**: A registered standard user tries to create their user profile with `claims: { admin: true }`.
2. **Injecting Shadow Keys**: Creating a telemetry event with extra unlisted tracking variables.
3. **Identity Spoofing**: Attempting to log a tracking event on behalf of a different user ID (`userId` != `request.auth.uid`).
4. **Forging Client Timestamp**: Submitting a payload with a manually generated `timestamp` value instead of `request.time`.
5. **Poisoning Document ID**: Creating a tracking event where the Document ID contains raw SQL strings or is 5,000 characters long.
6. **Bypassing Verification**: Writing as an account that has `email_verified == false`.
7. **Cross-User Leak**: A standard user attempting to read another user's private `/users/{userId}` profile.
8. **Malicious Claims Update**: A standard user trying to update their own document to add `pay: true` claims using part-updates.
9. **Null Server Timestamp on Create**: Omitting `timestamp` or sending `null` to bypass timestamp enforcement.
10. **Malicious Enum Hijack**: Creating a telemetry event with a status of `"super-admin"` or eventType `"hacker_breach"`.
11. **Telemetry Write without Admin Claim**: An authenticated user with ONLY the `timecard` claim attempting to write directly to `tracking_events`.
12. **Blanket Querying without Limits**: Trying to list all `users` without a specific where-filter or admin permissions.

## 3. The Security Rule Blueprint

The security rules are defined to completely shut down all 12 of these vulnerabilities.
The rules will reside in `firestore.rules`.
