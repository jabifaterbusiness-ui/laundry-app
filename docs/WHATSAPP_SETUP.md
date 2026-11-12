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
- Implemented inbox foundation: tenant-scoped conversation grouping, inbound/outbound text history, unread/read state, in-app free-form replies to both saved customers and first-time inbound contacts inside the 24-hour customer-service window, and delivery/read status display from webhook events. Template sends require a prior customer-initiated conversation in the inbox.
- Implemented media previews: authenticated, tenant-scoped retrieval of inbound image, video, audio, and PDF attachments through the API. Media IDs must belong to an inbound event for the same business; download URLs are restricted to Meta media hosts, MIME types are allowlisted, and previews are capped at 10 MB.
- Added explicit customer WhatsApp consent tracking to customer create/edit and offline sync. Consent is off by default for existing and new customers; staff must record the customer's agreement and how it was obtained. Customers can withdraw consent at any time by sending STOP (or UNSUBSCRIBE/CANCEL/END/QUIT/REMOVE); matching tenant customer records are automatically opted out. Automated WhatsApp announcements, order-status notifications and unpicked-order reminders are blocked and recorded as failed until the customer opts in. WhatsApp receipt delivery also checks consent.
- Implemented templates: list approved templates from the connected business WABA and send templates with BODY text variables. Templates requiring dynamic header/button parameters are intentionally not offered by this first composer. Order-status rules can select an approved UTILITY template fallback for use outside the 24-hour service window; variables map in order to customer name, order number, order status, and company name. Announcement campaigns use an approved MARKETING template when the free-form window is closed.
- Staff permissions: conversation viewing uses `customers.view`; replying and template sending use `customers.update`. Customer lookups are always scoped to the authenticated business.
- Limitations to validate: media preview support is limited to allowlisted image/video/audio/PDF formats up to 10 MB; template component coverage is currently BODY text parameters; order-status and unpicked-order notifications use approved UTILITY fallbacks; announcements require an approved MARKETING fallback with three BODY variables and a 1,024-character message limit; inbox polling refreshes every 15 seconds.
- External setup still needed: a new v4 Configuration ID, stable token-encryption key, webhook verification/app-secret configuration, and an exact HTTPS app origin. Domain registration/verification remains a separate deferred task. Meta App Review and Advanced Access are required before unrelated customer businesses can onboard in production.
- Before merge/deploy: run API unit/integration tests, web typecheck/build, inspect the full PR diff, and complete Meta test-business send/receive/status verification.


## Recipient compatibility, consent, and receipt templates

- Recipients may use ordinary consumer WhatsApp or WhatsApp Business. They do not need a Business account. The phone number must be registered and reachable on WhatsApp.
- The laundry business must connect its own WhatsApp Business Platform number through Meta Embedded Signup.
- Business-initiated messages require recorded customer opt-in. Do not infer consent merely because a phone number is on WhatsApp.
- Free-form messages are available only during the 24-hour customer-service window after the customer messages the business. Outside that window, an approved Meta template is required.
- To send the actual receipt image outside the 24-hour window, create and approve a Meta **UTILITY** template with an **IMAGE** header and exactly four BODY variables. In LaundryAngel's WhatsApp connection panel, select this template as the receipt template. The BODY variables are populated in this order:
  1. Customer name
  2. Invoice number
  3. Invoice total
  4. Outstanding balance
- The image header is populated with the generated receipt image. Text-only templates are not accepted as receipt templates because they cannot carry the actual receipt image.

## Platform environment readiness

The API reports which server-side values are missing. Configure these only in the production/staging API secret store; never enter secret values in the browser or commit them to the repository:

- `WHATSAPP_API_VERSION`
- `WHATSAPP_APP_ID`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`
- `WHATSAPP_VERIFY_TOKEN`

The Meta app must have Embedded Signup enabled, the correct configuration ID, the required WhatsApp permissions, and a webhook subscription pointing to the LaundryAngel API webhook. A code change cannot replace Meta-side app configuration or server secrets.
