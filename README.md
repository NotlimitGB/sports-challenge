# Sports Challenge

Demo sports challenge platform with:

- React + Vite frontend
- Express + Prisma API
- PostgreSQL database
- Strava integration
- optional smart contract test flow

## Project Structure

- `apps/web` - frontend
- `apps/api` - backend API
- `packages/contracts` - smart contract and local scripts
- `infra/docker` - local PostgreSQL

## Requirements

- Node.js 20+
- npm
- Docker Desktop or local PostgreSQL

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local environment file:

```bash
copy .env.example .env
```

3. Start PostgreSQL:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

4. Sync the database schema:

```bash
npm --workspace apps/api run db:push
```

5. Start the API:

```bash
npm run dev:api
```

6. Start the frontend:

```bash
npm run dev:web
```

Frontend:

- `http://127.0.0.1:5173`

API:

- `http://127.0.0.1:4000`

## Optional Contract Setup

If you want the smart contract demo flow to work after cloning, compile the local contract artifacts:

```bash
npm --workspace packages/contracts run compile
```

## Important Environment Variables

- `DATABASE_URL`
- `FRONTEND_URL`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REDIRECT_URI`
- `RPC_URL`
- `PRIVATE_KEY`
- `CONTRACT_ADDRESS`

If you only want the demo flow without Strava or contract testing, you can leave the Strava and contract variables empty.

## Build

Frontend:

```bash
npm --workspace apps/web run build
```

API:

```bash
npm --workspace apps/api run build
```
