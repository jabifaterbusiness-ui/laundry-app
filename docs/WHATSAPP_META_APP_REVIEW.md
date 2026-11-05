# WhatsApp Meta App Review preparation

This document prepares LaundryAngel's WhatsApp Business Platform review without requiring a domain purchase today. It is an internal preparation guide, not proof of Meta approval. Do not submit it as evidence until the corresponding flows have been tested against Meta's live test assets.

## Current review position

- WhatsApp tenant-connection, messaging, inbox, consent, and template-routing code is deployed to the production VPS.
- Meta's Independent Tech Provider onboarding has been opened in the LaundryAngel developer app.
- Business verification and App Review are not complete.
- A public HTTPS application origin is not configured. Embedded Signup's JavaScript SDK allowed-domain settings and production webhook callback therefore cannot yet be completed.
- The general Facebook Login for Business configuration flow previously opened did not offer WhatsApp accounts as an asset. Do not create or reuse that configuration for WhatsApp Embedded Signup.
- Do not claim that customers can onboard live until Meta approval, HTTPS, webhook verification, and end-to-end tests are complete.

## App Review permission purpose statements

Use these as drafting material only. Confirm the exact permissions requested in the current Meta dashboard before submission.

### whatsapp_business_management

LaundryAngel is a multi-tenant laundry operations platform. A business administrator connects that business's own WhatsApp Business Account through Meta's supported onboarding experience. LaundryAngel uses this permission to identify and manage the connected business WhatsApp assets and approved message templates needed for that business's customer communications. Each connection is stored against the authenticated LaundryAngel business; staff access is restricted by the application's business and branch authorization rules. LaundryAngel does not use one laundry business's WhatsApp assets to message another business's customers.

### whatsapp_business_messaging

LaundryAngel uses this permission to send and receive WhatsApp messages on behalf of the laundry business that connected the relevant WhatsApp Business Account and phone number. Use cases include customer-initiated conversations, replies from the tenant-scoped inbox, opted-in order updates, digital receipts, unpicked-order reminders, and approved announcement templates. Automated notifications require recorded customer opt-in; customers can withdraw consent using STOP and supported opt-out words. Free-form replies are limited to the applicable 24-hour customer-service window; approved templates are used where required.

## Video evidence plan

Record a real screen capture from the actual application and Meta test environment. Do not fabricate screens, edit together unrelated actions, display secrets, or imply that an untested flow succeeded. Capture the app name and relevant navigation clearly. Use a dedicated test business, test phone numbers, and consenting test recipients.

### Video 1 — Connect a business WhatsApp account (record after HTTPS and Meta Embedded Signup are ready)

1. Sign in to LaundryAngel as the test business owner/admin.
2. Open Communications and locate the WhatsApp connection panel.
3. Start Connect WhatsApp and show the Meta-hosted Embedded Signup experience.
4. Complete Meta's business selection and phone-number steps using a test business.
5. Return to LaundryAngel and show the connected WABA/phone status without exposing access tokens or secrets.
6. Show that the connection belongs to the test tenant only.

### Video 2 — Customer messaging and inbox

1. Open the test tenant's WhatsApp inbox.
2. Receive a customer-initiated message from a controlled test recipient.
3. Open the conversation and show the inbound message.
4. Reply from LaundryAngel while the 24-hour customer-service window is open.
5. Show the outbound message and the actual delivery/read status when Meta sends those callbacks.
6. If testing an approved template, show the approved template selected and sent to an opted-in test recipient.

### Video 3 — Consent and automated notifications (record after test setup)

1. Open a test customer record and show WhatsApp consent initially off or explicitly recorded.
2. Demonstrate that an automated notification is blocked when consent is absent.
3. Record consent using the actual customer agreement and show the consent state.
4. Demonstrate an eligible notification using an approved template and test recipient.
5. Send STOP from the test recipient and show the opt-out state.
6. Demonstrate that subsequent automated notifications are blocked after opt-out.

Keep each recording focused on the permission being reviewed. Use only test data and redact personal information.

## Evidence and test checklist

### Before recording

- [ ] Public HTTPS app origin configured and reachable.
- [ ] Meta Facebook Login for Business configuration specifically supports WhatsApp Embedded Signup v4.
- [ ] Exact app origin entered in Allowed Domains for the JavaScript SDK and any required redirect URI field.
- [ ] Server-side app ID, app secret, Embedded Signup configuration ID, webhook verify token, and token-encryption key configured. Never place secrets in browser code, recordings, screenshots, or this document.
- [ ] Webhook callback is publicly reachable over HTTPS and subscribed to the required WhatsApp message events.
- [ ] Business verification and required Meta review steps completed or in the state Meta permits for testing.
- [ ] A dedicated test WABA, test phone number, and test recipients are available.

### Functional evidence

- [ ] A test tenant can complete Embedded Signup and return to LaundryAngel.
- [ ] The connected WABA and phone number are associated with the correct tenant.
- [ ] A second test tenant cannot see or use the first tenant's connection or conversations.
- [ ] Inbound messages appear in the correct tenant inbox.
- [ ] A tenant staff member can reply only with the required permission.
- [ ] Free-form replies are restricted to the 24-hour customer-service window.
- [ ] Approved templates are listed and sent only through the intended tenant connection.
- [ ] Sent, delivered, read, and failed statuses are reflected from real webhook callbacks.
- [ ] Automated messages and digital receipts are blocked without recorded consent.
- [ ] STOP and supported opt-out words update consent and prevent subsequent automated sends.
- [ ] Webhook signature verification rejects invalid signatures.
- [ ] Disconnecting a tenant removes its active connection without affecting other tenants.

Record the date, test tenant, test asset identifiers (non-secret IDs only), expected result, actual result, and evidence filename for each test. Never include access tokens, app secrets, encryption keys, verification codes, or customer personal data.

## App Review submission notes

- Request only the WhatsApp permissions the app actually uses.
- Explain the user-facing workflow in plain language: a laundry business administrator connects its own WhatsApp assets, then authorized staff communicate with that business's customers from the LaundryAngel inbox.
- Explain the consent model and the distinction between customer-initiated replies within the service window and approved templates outside it.
- Provide reviewers with a dedicated test account and reproducible test instructions only through Meta's designated secure review fields.
- Do not submit placeholder website URLs, a raw VPS IP address, fabricated business records, or videos that imply uncompleted flows work.
- Meta may require business verification documents and a valid business website. A domain purchase alone does not guarantee verification, and business registration/document requirements must be answered truthfully.

## Website content to prepare before domain registration

The eventual public website should identify the actual business operator and accurately describe LaundryAngel as laundry management software. Prepare these pages before launch:

- Home: product purpose, intended users, and contact route.
- Product: orders, customers, payments, receipts, branches, staff permissions, and WhatsApp messaging capabilities.
- WhatsApp messaging: explain that each laundry business connects its own WhatsApp Business Account; messages are sent on that business's behalf; consent and opt-out are respected.
- Privacy Policy: data collected, tenant separation, message/contact data handling, Meta integrations, retention, user rights, and a contact route.
- Terms of Service: account responsibilities, acceptable use, subscription terms, and service limitations.
- Contact: real support email/phone and business contact details.

Do not publish invented addresses, registration numbers, certifications, partner badges, customer testimonials, or claims of Meta approval.

## Deferred until funds and domain are available

1. Register a suitable domain.
2. Point the chosen application hostname to the existing OVH VPS and configure free HTTPS.
3. Configure the exact HTTPS origin in Meta's JavaScript SDK/OAuth settings.
4. Configure and verify the Meta webhook callback over HTTPS.
5. Finish the correct WhatsApp Embedded Signup v4 configuration and obtain its Configuration ID.
6. Complete Meta's business verification and App Review requirements.
7. Run the complete test matrix above, record the real videos, and only then submit the review.
