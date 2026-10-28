# Releases

Sends each new shop and stockroom version to every press: the test shop first, then everyone else. A failed check stops the release.

The runner that does this is `services/release-runner/` (plan 4.1); its README says how a release is built, sent, checked and rolled back.
