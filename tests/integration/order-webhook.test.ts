import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  processOrderPaid,
  type OrderPayload,
} from "../../app/services/order-webhook.server";
import {
  startContainers,
  stubWireMock,
  resetWireMock,
  type TestContainers,
} from "../setup/containers";
import { WireMockAdminClient } from "../setup/wiremock-admin";
import variantOptionsFixture from "../fixtures/graphql-variant-options.json";
import orderCustomerFixture from "../fixtures/graphql-order-customer.json";

const TARGET_PRODUCT_ID = 99999;

/**
 * Stubs both GraphQL queries using the fixture files in tests/fixtures/.
 * Override individual fields via the options to drive specific test scenarios
 * without duplicating the full response shape.
 */
async function stubShopifyGraphQL(
  wireMockUrl: string,
  options: {
    color?: string;
    size?: string;
    orderName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  } = {},
) {
  const {
    color = variantOptionsFixture.data.productVariant.selectedOptions[0].value,
    size = variantOptionsFixture.data.productVariant.selectedOptions[1].value,
    orderName = orderCustomerFixture.data.order.name,
    firstName = orderCustomerFixture.data.order.customer.firstName,
    lastName = orderCustomerFixture.data.order.customer.lastName,
    email = orderCustomerFixture.data.order.customer.email,
  } = options;

  await stubWireMock(wireMockUrl, {
    request: {
      method: "POST",
      url: "/graphql",
      bodyPatterns: [{ contains: "GetVariantOptions" }],
    },
    response: {
      status: 200,
      headers: { "Content-Type": "application/json" },
      jsonBody: {
        ...variantOptionsFixture,
        data: {
          productVariant: {
            selectedOptions: [
              { name: "Color", value: color },
              { name: "Size", value: size },
            ],
          },
        },
      },
    },
  });

  await stubWireMock(wireMockUrl, {
    request: {
      method: "POST",
      url: "/graphql",
      bodyPatterns: [{ contains: "GetOrderCustomer" }],
    },
    response: {
      status: 200,
      headers: { "Content-Type": "application/json" },
      jsonBody: {
        ...orderCustomerFixture,
        data: {
          order: {
            ...orderCustomerFixture.data.order,
            name: orderName,
            billingAddress: { firstName, lastName },
            customer: { firstName, lastName, email },
          },
        },
      },
    },
  });
}

describe("processOrderPaid integration", () => {
  let containers: TestContainers;
  let admin: WireMockAdminClient;

  beforeAll(async () => {
    containers = await startContainers();
    admin = new WireMockAdminClient(containers.wireMockUrl);
  }, 120_000);

  afterAll(async () => {
    await containers.stop();
  });

  beforeEach(async () => {
    await resetWireMock(containers.wireMockUrl);
    await containers.prisma.modelOrder.deleteMany();
  });

  const baseOrder: OrderPayload = {
    id: 7810522022234,
    order_number: 1042,
    created_at: "2026-03-27T15:54:38-04:00",
    customer: { id: 10398073520474 },
    line_items: [{ product_id: TARGET_PRODUCT_ID, variant_id: 53803851841882 }],
  };

  it("creates a ModelOrder row with correct colour and size", async () => {
    await stubShopifyGraphQL(containers.wireMockUrl);

    await processOrderPaid(baseOrder, admin, containers.prisma, TARGET_PRODUCT_ID);

    const orders = await containers.prisma.modelOrder.findMany();
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      shopify_order_id: "7810522022234",
      shopify_cust_id: "10398073520474",
      order_number: orderCustomerFixture.data.order.name,
      colour: "white",
      size_cm: 10,
      customer_first_name: orderCustomerFixture.data.order.customer.firstName,
      customer_last_name: orderCustomerFixture.data.order.customer.lastName,
      customer_email: orderCustomerFixture.data.order.customer.email,
      order_status: "PURCHASED",
    });
  });

  it("generates a unique UUID upload_token", async () => {
    await stubShopifyGraphQL(containers.wireMockUrl);

    await processOrderPaid(baseOrder, admin, containers.prisma, TARGET_PRODUCT_ID);

    const order = await containers.prisma.modelOrder.findFirst();
    expect(order?.upload_token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("does nothing when no line item matches the target product", async () => {
    const otherOrder: OrderPayload = {
      ...baseOrder,
      line_items: [{ product_id: 11111, variant_id: 22222 }],
    };

    await processOrderPaid(otherOrder, admin, containers.prisma, TARGET_PRODUCT_ID);

    const orders = await containers.prisma.modelOrder.findMany();
    expect(orders).toHaveLength(0);
  });

  it("does nothing when the Color option is unrecognised", async () => {
    await stubShopifyGraphQL(containers.wireMockUrl, { color: "Invisible" });

    await processOrderPaid(baseOrder, admin, containers.prisma, TARGET_PRODUCT_ID);

    const orders = await containers.prisma.modelOrder.findMany();
    expect(orders).toHaveLength(0);
  });

  it("does nothing when the Size option is not a number", async () => {
    await stubShopifyGraphQL(containers.wireMockUrl, { size: "large" });

    await processOrderPaid(baseOrder, admin, containers.prisma, TARGET_PRODUCT_ID);

    const orders = await containers.prisma.modelOrder.findMany();
    expect(orders).toHaveLength(0);
  });

  it("maps all supported colours correctly", async () => {
    const colourCases: [string, string][] = [
      ["White", "white"],
      ["Black", "black"],
      ["Grey", "grey"],
      ["Gray", "grey"],
    ];

    for (const [input, expected] of colourCases) {
      await resetWireMock(containers.wireMockUrl);
      await containers.prisma.modelOrder.deleteMany();
      await stubShopifyGraphQL(containers.wireMockUrl, { color: input });

      await processOrderPaid(
        { ...baseOrder, id: baseOrder.id + colourCases.indexOf([input, expected]) },
        admin,
        containers.prisma,
        TARGET_PRODUCT_ID,
      );

      const order = await containers.prisma.modelOrder.findFirst();
      expect(order?.colour).toBe(expected);
    }
  });
});
