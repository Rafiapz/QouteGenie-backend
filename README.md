# QuoteGenie Backend API

A clean, minimalist Express.js backend starter built with TypeScript, Prisma ORM, and PostgreSQL, organized according to **Clean Architecture** principles.

---

## 🏛️ Clean Architecture Structure

```
backend/
├── prisma/
│   └── schema.prisma                 # PostgreSQL schema with Prisma ORM
├── src/
│   ├── domain/                       # Core enterprise business rules
│   │   ├── entities/                 # Business models & entities
│   │   ├── repositories/             # Repository interfaces (contracts)
│   │   └── errors/                   # Domain-level error definitions
│   │
│   ├── application/                  # Application business rules
│   │   ├── dtos/                     # Data transfer objects
│   │   └── use-cases/                # Business use cases
│   │
│   ├── infrastructure/               # Frameworks, database & external services
│   │   ├── config/                   # Validated environment configuration (env.config.ts)
│   │   ├── database/                 # Prisma client instance & DB lifecycle (prisma.client.ts)
│   │   └── repositories/             # Prisma implementations of domain repositories
│   │
│   ├── presentation/                 # Interface adapters (HTTP / Express)
│   │   ├── controllers/              # Request handlers (e.g. HealthController)
│   │   ├── routes/                   # Route definitions (health.routes.ts, index.ts)
│   │   └── middlewares/              # Error handling & 404 middlewares
│   │
│   ├── app.ts                        # Express app configuration (CORS, Helmet, JSON parser)
│   └── server.ts                     # Server bootstrap & graceful shutdown hooks
├── .env
├── .env.example
├── tsconfig.json
└── package.json
```

---

## 🚀 Quick Start

### 1. Environment Setup
Configure your PostgreSQL connection in `.env`:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/quotegenie_db?schema=public"
CORS_ORIGIN="http://localhost:3000"
```

### 2. Available Scripts

```bash
# Run in development mode with live reload (tsx)
npm run dev

# Compile TypeScript to dist/
npm run build

# Start production server
npm start

# Generate Prisma Client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate
```

### 3. API Base URL
- Base API: `http://localhost:5000/api/v1`
- Health check: `http://localhost:5000/api/v1/health`
