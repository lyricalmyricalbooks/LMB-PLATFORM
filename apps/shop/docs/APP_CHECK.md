# Firebase App Check

The former reCAPTCHA v3 initializer has been replaced by one reCAPTCHA Enterprise
provider, including attestation for browser HTTP Functions. Follow [reCAPTCHA setup
and rollout](RECAPTCHA.md). The old VITE_APP_CHECK_SITE_KEY variable is no longer read;
register an Enterprise score-based key and use RECAPTCHA_ENTERPRISE_SITE_KEY in
GitHub Actions (VITE_RECAPTCHA_ENTERPRISE_SITE_KEY for local builds). Keep monitoring
until verified traffic is confirmed before enabling enforcement.
