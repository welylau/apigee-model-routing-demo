# Demo web UI for Cloud Run. Built by web-ui/deploy-cloudrun.sh from a staging folder that also
# contains a copy of the proxy's routing.properties (read by the "View Details" dialogs).
FROM node:22-slim

ENV NODE_ENV=production \
    BIND_HOST=0.0.0.0 \
    RULES_FILE=/app/routing.properties

WORKDIR /app
COPY package.json server.js routing.properties ./
COPY public ./public

# Zero npm dependencies; run as the image's unprivileged user.
USER node
EXPOSE 8080
CMD ["node", "server.js"]
