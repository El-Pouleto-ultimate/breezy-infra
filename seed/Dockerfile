FROM node:20-alpine
WORKDIR /app
# psql pour la promo des rôles admin/modo
RUN apk add --no-cache postgresql-client
COPY package.json .
RUN npm install
COPY seed.js .
CMD node seed.js
