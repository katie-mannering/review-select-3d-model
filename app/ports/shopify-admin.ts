/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ShopifyAdminClient {
  graphql(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<{ json(): Promise<any> }>;
}
