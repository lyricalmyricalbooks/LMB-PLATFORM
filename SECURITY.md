# Reporting a security problem

Please don't open a public issue for a security problem. Use GitHub's private report instead:
the **Security** tab of this repository › **Report a vulnerability**. We answer within five working days.

This repository is checked on every change for keys and passwords (`security/secretScan.js`). The platform signs in to
Google from GitHub without stored keys, and only from the main branch.
