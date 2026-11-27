FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

ENV NEXT_PUBLIC_API_URL=http://localhost:8000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
    CMD wget --spider -q http://localhost:3000/ || exit 1

CMD ["npm", "start"]