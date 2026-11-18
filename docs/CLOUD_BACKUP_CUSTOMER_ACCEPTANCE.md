# Cloud Backup Customer Acceptance Checklist

This checklist is for a **staging environment only**. Do not use production business data or production OAuth accounts.

## Preconditions
- [ ] Deploy the candidate branch to isolated staging with Dropbox and Google Drive OAuth credentials configured.
- [ ] Use two separate test businesses and test users (Business A and Business B); ensure each has distinct records.
- [ ] Use disposable Dropbox and Google Drive accounts/folders.
- [ ] Confirm the customer Data Management UI offers Google Drive and Dropbox only. OneDrive is not offered to business customers.
- [ ] Confirm platform-admin OneDrive access is not claimed as implemented; its dedicated admin workflow is still a separate future task.

## Per-provider OAuth and connection lifecycle (Dropbox, Google Drive)
- [ ] Start OAuth as a permitted Business A owner and complete authorization; connection is stored as pending until verification.
- [ ] Verify the connection and confirm the UI shows it as verified/connected.
- [ ] Disconnect the account and confirm the business connection is removed and no longer selectable.
- [ ] Reconnect and verify a new connection can be validated.
- [ ] Revoke provider access from the provider's security page, then verify the app presents a safe, actionable error and offers reconnect without exposing tokens.

## Manual backup
- [ ] Run an immediate manual backup to a verified destination.
- [ ] Confirm the run reports success and the provider contains the newly uploaded encrypted backup artifact.
- [ ] Confirm a failed or unverified destination cannot start an upload and produces a clear message.
- [ ] Confirm retry behavior does not leave confusing duplicate artifacts or orphan records.

## Scheduled backup
- [ ] Create a daily schedule with a staging time and timezone, save it, and confirm it appears in the schedule list.
- [ ] Confirm one due slot produces one run despite repeated scheduler polling.
- [ ] Confirm the completed run and uploaded artifact appear in run history and provider storage.
- [ ] Change schedule settings and verify the next slot respects the new timezone/time.
- [ ] Pause/disable the schedule and confirm no new run is generated for the disabled slot.

## Restore and integrity
- [ ] Download a newly created cloud backup artifact and restore it into an isolated staging business/database.
- [ ] Confirm restored records match the source business's fixture data.
- [ ] Confirm checksum/integrity validation is enforced and corrupted/incorrect-password backups fail safely.
- [ ] Confirm backup artifacts are encrypted and no provider tokens, refresh tokens, credentials, or plaintext backup data appear in logs.

## Tenant isolation and authorization
- [ ] Business B cannot list, verify, run, delete, or schedule backups using Business A's connection/run/schedule IDs.
- [ ] Non-owner/unauthorized roles cannot manage cloud connections or schedules.
- [ ] A Business B backup contains only Business B data.
- [ ] Business callback state is tenant-bound; no cross-business OAuth callback can create a connection.
- [ ] A business OAuth start request for OneDrive returns HTTP 403 before creating OAuth state or contacting Microsoft.
- [ ] A business callback with a pending OneDrive state returns HTTP 403 before consuming state or exchanging tokens.

## Evidence to record
For each provider, record the staging build SHA, tester/business fixture identifiers (non-sensitive), UTC start/end, run IDs, artifact names, restore result, and screenshots of the customer UI. Never record OAuth tokens, secrets, backup passwords, or private customer data.
