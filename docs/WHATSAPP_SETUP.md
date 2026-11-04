# WhatsApp Business onboarding and production setup

This repository implements tenant-specific WhatsApp Cloud API connections. Each LaundryAngel business connects its own WhatsApp Business Account (WABA) and phone number; platform credentials are not returned to the browser.

## Meta configuration: Embedded Signup v4

Use **Embedded Signup v4** for new customer onboarding. Meta's older v2/v3 signup flows were retired on 15 October 2026. Create a new configuration even if an older configuration exists.

1. Open the [LaundryAngel Meta developer app](https://developers.facebook.com/apps/28391436863850192/).
2. Open **Facebook Login for Business → Configurations → Create configuration**.
3. Choose **WhatsApp Embedded Signup** as the login variation.
4. Select **WhatsApp Cloud API**. Select Marketing Messages API only if LaundryAngel will use that product.
5. Choose a system-user access token with the configuration's supported 60-day expiration.
6. Select WhatsApp accounts as the shared asset.
7. Grant the WhatsApp permissions required by the configuration: `whatsapp_business_management` and `whatsapp_business_messaging`.
8. Save the new Configuration ID. Do not reuse a v2/v3 Configuration ID.
9. In Facebook Login for Business settings, enable Client OAuth Login, Web OAuth Login, Embedded Browser OAuth Login, Enforce HTTPS, and Login with the JavaScript SDK.
10. Add the exact HTTPS application origin to both Allowed Domains for the JavaScript SDK and Valid OAuth Redirect URIs. Do not use wildcard origins.

The app ID already associated with this integration is `28391436863850192`. The Configuration ID is a new Meta-generated value and must be added to the server environment.

## Meta webhook

Configure the callback URL as:

`https://<your-https-host>/api/v1/whatsapp/webhook`

Use the same random verify token as `WHATSAPP_VERIFY_TOKEN`. Subscribe the WABA webhook to at least `messages` so Meta sends both inbound messages and outbound message-status updates. The application verifies `X-Hub-Signature-256` using `WHATSAPP_APP_SECRET`.

A public HTTPS host is required for Meta to deliver production webhooks and for the Facebook JavaScript SDK to run. The current server IP alone is not a substitute for an HTTPS application origin with the required Meta OAuth configuration.

## API environment

Configure these on the API service. Never expose the app secret, access token, or encryption key in Vite/web environment variables.

- `WHATSAPP_API_VERSION`: supported Graph API version, for example the version already configured for the current Cloud API integration.
- `WHATSAPP_APP_ID`: `28391436863850192`.
- `WHATSAPP_APP_SECRET`: Meta app secret (server-side only).
- `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`: the new v4 Configuration ID.
- `WHATSAPP_VERIFY_TOKEN`: a long random value used for webhook challenge verification.
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`: 32 random bytes encoded as 64 hexadecimal characters. Generate with `openssl rand -hex 32`; keep it stable and back it up securely. Losing it makes stored tenant access tokens undecryptable.

Existing `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` are retained for legacy internal paths only. New business communications, digital receipts, and financial statement messages are routed using each business's saved connection.

## Meta review and customer onboarding

Before allowing unrelated customer businesses to connect in production, complete the Meta app's required App Review and Advanced Access steps for the requested WhatsApp permissions. Keep the app in Development mode for controlled tests with app-role users until the review and production readiness steps are complete.

The first live test should connect a separate test business, send an approved template to an opted-in test recipient, receive a customer reply, and confirm SENT/DELIVERED/READ/FAILED callbacks. Do not use the platform's own test number as the sender for every tenant.

## Current application scope

- Implemented: per-business connection storage, encrypted tokens, Embedded Signup code exchange, account/phone validation, webhook subscription, disconnect, and durable webhook event capture.
- Implemented inbox foundation: tenant-scoped conversation grouping, inbound/outbound text history, unread/read state, in-app free-form replies inside the 24-hour customer-service window, and delivery/read status display from webhook events.
- Implemented templates: list approved templates from the connected business WABA and send templates with BODY text variables. Templates requiring dynamic header/button parameters are intentionally not offered by this first composer.
- Staff permissions: conversation viewing uses `customers.view`; replying and template sending use `customers.update`. Customer lookups are always scoped to the authenticated business.
- Limitations to validate: media messages are shown as message-type notices rather than downloaded previews; template component coverage is currently BODY text parameters; inbox polling refreshes every 15 seconds.
- External setup still needed: a new v4 Configuration ID, stable token-encryption key, webhook verification/app-secret configuration, and an exact HTTPS app origin. Domain registration/verification remains a separate deferred task. Meta App Review and Advanced Access are required before unrelated customer businesses can onboard in production.
- Before merge/deploy: run API unit/integration tests, web typecheck/build, inspect the full PR diff, and complete Meta test-business send/receive/status verification.
