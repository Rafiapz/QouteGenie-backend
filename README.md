# QuoteGenie Backend API

A clean, minimalist Express.js backend built with TypeScript, Prisma ORM, and PostgreSQL, organized according to **Clean Architecture** principles.

---

## 🏛️ Clean Architecture Structure

```
backend/
├── prisma/
│   ├── schema.prisma                 # PostgreSQL schema with Prisma ORM
│   └── migrations/                   # SQL migrations for PostgreSQL
├── src/
│   ├── domain/                       # Core enterprise business rules
│   │   ├── entities/                 # Business models (OrganizationEntity)
│   │   ├── repositories/             # Repository interfaces (IOrganizationRepository)
│   │   └── errors/                   # Domain-level error definitions
│   │
│   ├── application/                  # Application business rules
│   │   ├── dtos/                     # Data transfer objects & Zod validation
│   │   ├── ports/                    # Port interfaces (IPasswordHasher)
│   │   └── use-cases/                # Business use cases (RegisterOrganizationUseCase)
│   │
│   ├── infrastructure/               # Frameworks, database & external services
│   │   ├── config/                   # Validated environment configuration (env.config.ts)
│   │   ├── database/                 # Prisma client instance & DB lifecycle (prisma.client.ts)
│   │   ├── security/                 # Bcrypt password hasher implementation
│   │   └── repositories/             # Prisma implementations of domain repositories
│   │
│   ├── presentation/                 # Interface adapters (HTTP / Express)
│   │   ├── controllers/              # Request handlers (OrganizationController, HealthController)
│   │   ├── routes/                   # Route definitions (organization.routes.ts, health.routes.ts)
│   │   └── middlewares/              # Error handling, 404 & validation middlewares
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

---

## 📡 API Endpoints (`/api/v1`)

### Health Check
- `GET /api/v1/health` – Returns service status and PostgreSQL connectivity.

### Organizations

#### Register Organization
- **Endpoint**: `POST /api/v1/organizations/register`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "email": "contact@acmecorp.com",
    "companyName": "Acme Corporation",
    "password": "SecurePassword123!",
    "plan": 1
  }
  ```
- **Validation**:
  - `email`: Valid email format (unique)
  - `companyName`: Required string (1-255 chars)
  - `password`: Required string (min 8 chars, hashed with bcrypt before saving)
  - `plan`: Optional integer (defaults to 1)
- **Success Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "message": "Organization registered successfully.",
    "data": {
      "id": "c1f7b7cb-9252-4752-9b2f-3d6d5ef66699",
      "email": "contact@acmecorp.com",
      "companyName": "Acme Corporation",
      "plan": 1,
      "createdAt": "2026-11-14T14:00:00.000Z",
      "updatedAt": "2026-11-14T14:00:00.000Z"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation failure (e.g. invalid email or password < 8 characters).
  - `409 Conflict`: If an organization with the same email already exists.
