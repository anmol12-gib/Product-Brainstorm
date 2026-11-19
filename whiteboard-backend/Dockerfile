FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
# npm install (instead of npm ci) because pg was introduced to the original repository;
# generate and commit package-lock.json by running npm install in this directory.
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js migrate.js ./
COPY lib ./lib
COPY db ./db
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
