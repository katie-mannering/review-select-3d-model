import type { ShopifyAdminClient } from "../../app/ports/shopify-admin";

/**
 * ShopifyAdminClient implementation backed by a WireMock container.
 *
 * Used in integration tests as a drop-in replacement for the real Shopify
 * admin client. WireMock stubs define what each GraphQL query returns.
 */
export class WireMockAdminClient implements ShopifyAdminClient {
  constructor(private readonly baseUrl: string) {}

  async graphql(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<{ json(): Promise<unknown> }> {
    return fetch(`${this.baseUrl}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: options?.variables ?? {} }),
    });
  }
}
