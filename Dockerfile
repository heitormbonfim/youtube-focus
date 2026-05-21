# syntax=docker/dockerfile:1.7
# ------------------------------------------------------------------------------
# YouTube Focus — production image
# Zero runtime dependencies, so the build is just a copy of the source tree
# into a hardened Node.js Alpine image running as an unprivileged user.
# ------------------------------------------------------------------------------

FROM node:20-alpine AS runtime

ENV NODE_ENV=production \
    WEB_HOST=0.0.0.0 \
    API_HOST=0.0.0.0 \
    WEB_PORT=12345 \
    API_PORT=12346

WORKDIR /app

# Create an unprivileged user and own /app
RUN addgroup -S app && adduser -S -G app app

COPY --chown=app:app package.json ./
COPY --chown=app:app src ./src

USER app

EXPOSE 12345 12346

# Container is healthy iff the API responds on /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "const p=process.env.API_PORT||12346; require('http').get('http://127.0.0.1:'+p+'/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/index.js"]
