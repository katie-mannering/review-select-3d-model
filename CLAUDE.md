# CLAUDE.md — Shopify Storefront App (review-select-3d-model)

This file is the persistent architectural reference for this project. Read it at the start of every session.
When in doubt about a pattern, structure, or convention — refer back here before making assumptions.

---

## Project Overview

This is a Shopify embedded app built with Remix / React Router v7 and TypeScript. It contains all the
tailored front-end functionality to support the incahoots3d.com product offering — including allowing
the customer to upload images/data that will be used to manufacture their final product (usually a 3D
printed sculpture), and to review and select the best 3D model from a range of generated options.

A twin Python project at `../3d-generator` handles the majority of server-side operations including
generating and sending all customer emails. All information exchange between the two projects is via
tables defined in `prisma/schema.prisma`.

### What this app does

1. Receives an `ORDERS_PAID` webhook when a customer buys a custom sculpture product
2. Queries the Shopify Admin GraphQL API to read variant options (colour, size) and customer name
3. Creates a `ModelOrder` row in PostgreSQL (shared with the 3d-generator worker service)
4. Serves the customer-facing upload page at `/customer/upload/{token}` — the 3d-generator emails
   the customer the URL to this page; the token is created and stored here when the order is placed
5. Serves the customer-facing model review page at `/customer/review/{token}` — once the
   3d-generator has produced models, the customer selects their preferred one here

### Related Projects
- **3D Model Generator**: `../3d-generator` — Python worker that polls the same database, processes
  orders, generates models, and sends all customer emails
- The `ModelOrder` table is the data contract between these two projects. Its schema lives here in
  `prisma/schema.prisma`. Any schema change must be coordinated with `../3d-generator`.

---

## Architecture Principles

These mirror the patterns in `../3d-generator/CLAUDE.md` — the two projects should stay in sync.

### 1. Dependency Injection via Function Parameters

All external dependencies (database, S3, Shopify Admin API) are passed explicitly as parameters to
service functions. No global state. No module-level singletons inside service code.

```
app/routes/*.tsx          ← the only place that knows what is real vs. test
  └── calls authenticate.webhook() / authenticate.admin() for the Shopify client
  └── imports `db` from db.server.ts and `storage` from s3.server.ts
  └── passes all of the above into a service function
```

Service functions **never** import clients directly. They receive them through their parameters.

### 2. Interfaces via TypeScript Interfaces (Ports)

All external service boundaries are defined as TypeScript interfaces in `app/ports/`.
Concrete implementations live in `app/adapters/`. Service logic depends only on the interface,
never on the concrete adapter.

```
app/ports/storage.ts       — StorageClient interface
app/ports/shopify-admin.ts — ShopifyAdminClient interface
```

Any object satisfying the interface is automatically compatible. This lets tests inject
WireMock- or LocalStack-backed implementations with no application code changes.

### 3. Business Logic Lives in Services

Route handlers are thin: authenticate, wire up real clients, call a service function, return a Response.
All testable logic lives in `app/services/`.

```
app/services/order-webhook.server.ts  — processOrderPaid(order, admin, db, targetProductId)
```

### 4. Tests Use Real Services via Testcontainers

Integration tests spin up real infrastructure using the `testcontainers` npm package:
- **PostgreSQL** (`postgres:16`) — real database, real Prisma migrations
- **WireMock** (`wiremock/wiremock`) — stubs Shopify Admin GraphQL responses
- **LocalStack** (`localstack/localstack`) — real S3 for upload/presign tests (to be added)

There is **no** `if testing:` flag anywhere in application code. The application never knows
whether it is running in production or under test. The route handler wires real clients;
tests wire container-backed equivalents pointing at the same service code.

### 5. Production Wiring

`app/s3.server.ts` and `app/db.server.ts` are the production wiring layer — equivalent to `main.py`
in the 3d-generator. They create real clients (real AWS S3, real PostgreSQL via Prisma) and export
singletons. Route handlers import from these files; service functions and tests do not.

---

## Project Structure

```
app/
  ports/
    storage.ts             # StorageClient interface
    shopify-admin.ts       # ShopifyAdminClient interface
  adapters/
    s3.adapter.ts          # aws-sdk-backed StorageClient (works with real AWS + LocalStack)
  services/
    order-webhook.server.ts  # processOrderPaid — core webhook business logic
  routes/
    webhooks.orders.paid.tsx   # Thin: authenticate → wire clients → call service
    customer.upload.$token.tsx # Customer photo upload (served by this app, URL emailed by 3d-generator)
    customer.review.$token.tsx # Customer model review and selection
  db.server.ts             # Production Prisma singleton
  s3.server.ts             # Production S3 singleton (S3Adapter wired to real AWS)

theme/                     # Shopify OS 2.0 storefront theme (Liquid)
  layout/                  # theme.liquid — main layout
  sections/                # Page sections (hero, product, header, footer, etc.)
  templates/               # JSON templates (index, product, cart, collection, etc.)
  assets/                  # CSS and static assets
  # Deployed separately via: shopify theme push
  # NOT part of the Remix app — changes here are Liquid, not React

tests/
  fixtures/
    graphql-variant-options.json  # WireMock response for GetVariantOptions — see Fixture Capture below
    graphql-order-customer.json   # WireMock response for GetOrderCustomer — see Fixture Capture below
  setup/
    containers.ts          # startContainers() — PostgreSQL + WireMock lifecycle
    wiremock-admin.ts      # WireMockAdminClient implementing ShopifyAdminClient
  integration/
    order-webhook.test.ts  # processOrderPaid integration tests

prisma/
  schema.prisma            # Shared data contract with 3d-generator — coordinate changes
vitest.config.ts           # Separate from vite.config.ts — must NOT include reactRouter() plugin
```

---

## Key Technology Choices

| Concern              | Choice                        | Rationale                                                    |
|----------------------|-------------------------------|--------------------------------------------------------------|
| App framework        | Remix / React Router v7       | Shopify's recommended stack                                  |
| Storefront theme     | Shopify Liquid (OS 2.0)       | Standard Shopify theme, deployed independently               |
| Database             | PostgreSQL via Prisma         | Shared with 3d-generator                                     |
| S3                   | aws-sdk v2 (S3Adapter)        | Existing choice; adapter makes it swappable                  |
| Testing              | `vitest` + `testcontainers`   | Matches 3d-generator pattern; real infrastructure in tests   |
| Shopify GraphQL mock | WireMock                      | HTTP stub server; same tool as 3d-generator REST mocks       |
| S3 mock              | LocalStack                    | Real S3 API locally; same tool as 3d-generator               |

---
## Note on theme development
The theme creates place holders for attaching image files. The images are attached to each placeholder using the theme editor 
of the shopify store admin site. The admin site uses the theme config/settings_data.json to store the association. 
"shopify theme push" overwrites this file - so that all of images need to be reassigned. There are two viable options 
to prevent too much rework:
1. add a theme/.shopifyignore and add the settings file. 
2. Always use "shopify theme pull" before "shopify theme push"

The latter is almost certainly the better option - but it would probably be better to test this and see how things like 
conflicts are handled first - then perhaps create aliases that automatically do both actions to prevent accidental pushes 
that overwrite.

For now, the former is implemented - so any required changes to config/settings_data.json need to be considered 
in this context.

## Test Infrastructure Pattern

```typescript
// tests/setup/containers.ts
const [pg, wireMock] = await Promise.all([
  new PostgreSqlContainer("postgres:16").start(),
  new GenericContainer("wiremock/wiremock:3.3.1").withExposedPorts(8080).start(),
]);

// Apply real Prisma migrations
execSync("npx prisma migrate deploy", {
  env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
});

// Wire up clients for tests
const prisma = new PrismaClient({ datasources: { db: { url: pg.getConnectionUri() } } });
const admin = new WireMockAdminClient(`http://localhost:${wireMock.getMappedPort(8080)}`);
```

Integration tests receive these and call service functions directly — no route handler, no HTTP.

WireMock is configured per-test via `/__admin/mappings` REST API. Reset between tests with
`/__admin/mappings/reset`.

### Fixture Capture

WireMock stubs use real Shopify GraphQL responses stored in `tests/fixtures/`. The fixture files
currently contain realistic placeholders. To replace them with real data:

1. Trigger a paid test order on the Shopify dev store
2. Check the console — `order-webhook.server.ts` logs `FIXTURE variant:` and `FIXTURE order:` lines
3. Copy each JSON block into the corresponding fixture file
4. Remove the `_note` field from each fixture file
5. Remove the `FIXTURE CAPTURE` console.log lines from `order-webhook.server.ts`

Tests use the fixture files as the default WireMock response body, with per-test overrides only for
the fields that vary (colour, size, etc.).

---

## Data Contract with 3d-generator

The tables in `prisma/schema.prisma` are the interface between this app and the 3d-generator worker.
**Any schema change must be coordinated with `../3d-generator`** — both projects share the same
PostgreSQL database in production.

### Status Values and Transitions
- `PURCHASED` — set by this app when payment is confirmed; triggers 3d-generator polling
- `AWAITING_IMAGE` — set by 3d-generator after emailing the customer their upload URL
- `CUSTOMER_IMAGE_UPLOADED` — set by this app when the customer submits their photo
- See `../3d-generator/CLAUDE.md` for the full status lifecycle owned by the Python side

### S3 Key Convention
Documented in `../3d-generator/S3_STRUCTURE.md`. The key structure for customer-supplied images is:
```
image-to-bust/{surname}-{ModelOrderId}/inputs/{ModelOrderInputsId}.{ext}
```

---

## Environment Variables

```
DATABASE_URL=postgresql://user:pass@host:5432/dbname
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=eu-north-1
AWS_S3_BUCKET=...
BUST_FROM_PHOTO_PRODUCT_ID=...   # Shopify product ID that triggers model order creation
APP_URL=https://your-app.example.com
```

Never hardcode credentials or environment-specific values. Never commit `.env`.

---

## What Claude Should NOT Do

- Do not add `if (process.env.NODE_ENV === 'test')` branches anywhere in application code
- Do not import `db` or `storage` directly inside service functions — inject via parameters
- Do not use `vi.mock()` for integration tests — use real testcontainer services
- Do not skip type annotations on service function signatures
- Do not add the `reactRouter()` plugin to `vitest.config.ts`
- Do not put business logic directly in route handler action functions
- Do not change `prisma/schema.prisma` without coordinating with `../3d-generator`
- Do not remove the `FIXTURE CAPTURE` console.log lines from service files until real fixture data
  has been captured and committed to `tests/fixtures/`
- Do not edit theme Liquid files with React patterns, and do not edit Remix routes with Liquid patterns
  — they are separate systems deployed by different commands
