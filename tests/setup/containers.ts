import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { PrismaClient } from "@prisma/client";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface TestContainers {
  pg: StartedPostgreSqlContainer;
  wireMock: StartedTestContainer;
  prisma: PrismaClient;
  wireMockUrl: string;
  stop(): Promise<void>;
}

/**
 * Start a PostgreSQL container and a WireMock container, run Prisma migrations
 * against the test database, and return wired-up clients.
 *
 * Both containers are started in parallel. Call stop() in afterAll to tear down.
 */
export async function startContainers(): Promise<TestContainers> {
  const [pg, wireMock] = await Promise.all([
    new PostgreSqlContainer("postgres:16").start(),
    new GenericContainer("wiremock/wiremock:3.3.1")
      .withExposedPorts(8080)
      .start(),
  ]);

  const dbUrl = pg.getConnectionUri();
  const wireMockUrl = `http://localhost:${wireMock.getMappedPort(8080)}`;

  // Apply all Prisma migrations to the fresh test database
  execSync("npx prisma migrate deploy", {
    cwd: PROJECT_ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "inherit",
  });

  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  return {
    pg,
    wireMock,
    prisma,
    wireMockUrl,
    async stop() {
      await prisma.$disconnect();
      await Promise.all([pg.stop(), wireMock.stop()]);
    },
  };
}

/** Register a WireMock stub mapping. */
export async function stubWireMock(
  wireMockUrl: string,
  stub: object,
): Promise<void> {
  const res = await fetch(`${wireMockUrl}/__admin/mappings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stub),
  });
  if (!res.ok) {
    throw new Error(`WireMock stub registration failed: ${await res.text()}`);
  }
}

/** Remove all WireMock stub mappings (call in beforeEach for test isolation). */
export async function resetWireMock(wireMockUrl: string): Promise<void> {
  await fetch(`${wireMockUrl}/__admin/mappings/reset`, { method: "POST" });
}
