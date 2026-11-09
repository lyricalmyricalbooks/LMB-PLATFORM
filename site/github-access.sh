#!/usr/bin/env bash
# Lets GitHub deploy the platform (.github/workflows/deploy.yml), once. Run it in Google Cloud Shell, signed in as an
# owner of lmb-platform-prod (site/README.md has the link). It makes, or leaves alone when already there:
#   - the github-deploy account and the roles a deploy needs in the platform project only
#   - a Workload Identity pool "github" with a provider "lmb-platform" that trusts GitHub's sign-in for one repository
#     (lyricalmyricalbooks/LMB-PLATFORM, by its fixed id) and its main branch only, so no key or password exists anywhere
#   - the two server phrases a person never needs to type (trial-tips-secret, checkup-secret), as random values
#   - Identity Platform with authenticator-app two-step sign-in, which the control room needs
# Safe to run twice. Changes nothing outside lmb-platform-prod.
set -euo pipefail

PROJECT=lmb-platform-prod
REPO_ID=1435818519 # github.com/lyricalmyricalbooks/LMB-PLATFORM; the id stays the same if the repository is renamed
POOL=github
PROVIDER=lmb-platform
ACCOUNT=github-deploy
EMAIL="$ACCOUNT@$PROJECT.iam.gserviceaccount.com"
NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')

echo "1. Switching on the Google services a deploy uses"
gcloud services enable --project="$PROJECT" iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com serviceusage.googleapis.com firebasehosting.googleapis.com \
  firebaserules.googleapis.com firestore.googleapis.com
# The server's services (Cloud Run and the rest) only switch on once the project has a billing account. Without one the
# pages still go live; run this script again after adding billing to get the server's part too.
SERVER_SERVICES=yes
if ! gcloud services enable --project="$PROJECT" run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com compute.googleapis.com \
  identitytoolkit.googleapis.com 2> /dev/null; then
  SERVER_SERVICES=no
  echo "   The server's services need billing on the project, so they are left off for now. The pages don't need it."
fi

echo "2. The deploy account"
gcloud iam service-accounts describe "$EMAIL" --project="$PROJECT" > /dev/null 2>&1 ||
  gcloud iam service-accounts create "$ACCOUNT" --project="$PROJECT" --display-name="GitHub deploys the platform"
for role in firebasehosting.admin firebaserules.admin firebase.viewer datastore.viewer serviceusage.serviceUsageConsumer \
  run.admin cloudbuild.builds.editor storage.admin artifactregistry.admin logging.viewer secretmanager.viewer \
  cloudscheduler.admin iam.serviceAccountAdmin iam.serviceAccountUser resourcemanager.projectIamAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$EMAIL" --role="roles/$role" --condition=None --quiet > /dev/null
done

echo "3. GitHub's sign-in, for this repository's main branch only"
gcloud iam workload-identity-pools describe "$POOL" --project="$PROJECT" --location=global > /dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --project="$PROJECT" --location=global --display-name="GitHub"
CONDITION="assertion.repository_id == '$REPO_ID' && assertion.ref == 'refs/heads/main'"
MAPPING="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref"
if gcloud iam workload-identity-pools providers describe "$PROVIDER" --project="$PROJECT" --location=global --workload-identity-pool="$POOL" > /dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER" --project="$PROJECT" --location=global \
    --workload-identity-pool="$POOL" --attribute-mapping="$MAPPING" --attribute-condition="$CONDITION" > /dev/null
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project="$PROJECT" --location=global \
    --workload-identity-pool="$POOL" --display-name="LMB-PLATFORM main" --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="$MAPPING" --attribute-condition="$CONDITION"
fi
gcloud iam service-accounts add-iam-policy-binding "$EMAIL" --project="$PROJECT" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository_id/$REPO_ID" > /dev/null

if [ "$SERVER_SERVICES" = yes ]; then
echo "4. The server's two link phrases (random; nobody needs to know them)"
for secret in trial-tips-secret checkup-secret; do
  gcloud secrets describe "$secret" --project="$PROJECT" > /dev/null 2>&1 ||
    head -c 32 /dev/urandom | base64 | tr -d '\n' | gcloud secrets create "$secret" --project="$PROJECT" --replication-policy=automatic --data-file=-
done

echo "5. Cloud Build may store the server's image (server/README.md)"
BUILDER="$NUMBER-compute@developer.gserviceaccount.com"
for role in artifactregistry.writer storage.objectViewer logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$BUILDER" --role="roles/$role" --condition=None --quiet > /dev/null
done

echo "6. Sign-in with an authenticator app (the control room asks for one)"
# Identity Platform is Firebase sign-in with two-step codes; it needs billing (free for the first 50,000 people a month).
TOKEN=$(gcloud auth print-access-token)
AUTH_API="https://identitytoolkit.googleapis.com/v2/projects/$PROJECT"
curl -fsS -X POST "$AUTH_API/identityPlatform:initializeAuth" -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: $PROJECT" -H "Content-Type: application/json" -d '{}' > /dev/null 2>&1 || true # already on
curl -fsS -X PATCH "$AUTH_API/config?updateMask=mfa" -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT" \
  -H "Content-Type: application/json" \
  -d '{"mfa":{"state":"ENABLED","providerConfigs":[{"state":"ENABLED","totpProviderConfig":{"adjacentIntervals":5}}]}}' > /dev/null
else
echo "4-6. Skipped until the project has billing (the server's phrases, Cloud Build's roles, authenticator-app sign-in)."
fi

echo
echo "Done. GitHub can now deploy: open https://github.com/lyricalmyricalbooks/LMB-PLATFORM/actions/workflows/deploy.yml and press Run workflow."
echo "(The provider is projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER; deploy.yml has the same.)"
