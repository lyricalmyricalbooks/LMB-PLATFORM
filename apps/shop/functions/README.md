# Cloud Functions Deployment Pipeline V3

Cloud Functions:

| Function | Trigger | Purpose |
|---|---|---|
| `onOrderUpdated` | Firestore update on `orders/{id}` | Consolidated trigger for payment confirmation, shipping, cancellation, and refund emails |
| `onCustomerCreated` | Firestore create on `customers/{id}` | Sends welcome emails automatically to new users |
| `sendTestEmail` | HTTP Post (Admin-only) | Allows sending preview test emails from the dashboard settings |
| `createPayPalOrder` | HTTP POST | Reprices an unpaid order and creates a PayPal order |
| `capturePayPalOrder` | HTTP POST | Captures an approved PayPal order and atomically settles the Firestore order |
| `paypalWebhook` | HTTP POST | Verifies PayPal signatures and idempotently processes completed captures |
| `shippoWebhook` | HTTP Post (Shippo webhook) | Receives status updates, updates order timeline, and sends delivery updates |
| `abandonedCartSweep` | Schedule (every 60 min) | Emails customers whose cart entered checkout but did not complete after 1 hour |

## Setup

```bash
cd functions
npm install

# Configure secret
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set PAYPAL_CLIENT_ID
firebase functions:secrets:set PAYPAL_CLIENT_SECRET
firebase functions:secrets:set PAYPAL_WEBHOOK_ID

# Deploy
firebase deploy --only functions
```

Configure the PayPal app webhook URL as the deployed `paypalWebhook` function
and subscribe it to `PAYMENT.CAPTURE.COMPLETED`. Use sandbox credentials while
the website payment settings are in test mode and live credentials otherwise.

`functions/index.js` uses [Resend](https://resend.com) for delivery. Swap to SendGrid or Postmark if preferred — the helper at the bottom of the file is the only place to change.

Update `FROM` to a verified-domain sender before going live.
