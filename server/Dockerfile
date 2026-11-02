# The platform's hosted server: one image, run as two Cloud Run services (platform-api and platform-jobs, told apart by
# PLATFORM_ROLE). Plain Node 22 and the platform's own code: no packages are installed. Built by Cloud Build from the
# repository's root (server/cloudbuild.yaml; server/deploy.js runs it). The folders copied are the ones the server
# imports; server/image.test.js fails when one is missing here or in server/.gcloudignore.
FROM node:22-slim
WORKDIR /srv
ENV NODE_ENV=production
COPY package.json ./
COPY accounts ./accounts
COPY clients ./clients
COPY control-room ./control-room
COPY google ./google
COPY help ./help
COPY profile ./profile
COPY release-check ./release-check
COPY security ./security
COPY server ./server
COPY services ./services
COPY setup ./setup
COPY signup ./signup
COPY status ./status
COPY terms ./terms
COPY waitlist ./waitlist
USER node
CMD ["node", "server/main.js"]
