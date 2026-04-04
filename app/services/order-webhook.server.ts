import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import type { PrismaClient, Colour } from "@prisma/client";
import type { ShopifyAdminClient } from "../ports/shopify-admin";

export interface OrderPayload {
  id: number;
  order_number?: number;
  created_at?: string;
  customer?: { id: number };
  line_items: LineItem[];
}

interface LineItem {
  product_id: number;
  variant_id?: number;
}

const COLOUR_MAP: Record<string, Colour> = {
  white: "white",
  black: "black",
  grey: "grey",
  gray: "grey",
};

const VARIANT_OPTIONS_QUERY = `#graphql
  query GetVariantOptions($id: ID!) {
    productVariant(id: $id) {
      selectedOptions {
        name
        value
      }
    }
  }
`;

const ORDER_CUSTOMER_QUERY = `#graphql
  query GetOrderCustomer($id: ID!) {
    order(id: $id) {
      name
      email
      billingAddress {
        firstName
        lastName
      }
      customer {
        firstName
        lastName
        email
      }
    }
  }
`;

/**
 * Core business logic for the ORDERS_PAID webhook.
 *
 * Accepts all external dependencies via parameters — no imports of real
 * clients. The route handler wires production clients; tests inject
 * testcontainer-backed equivalents.
 */
export async function processOrderPaid(
  order: OrderPayload,
  admin: ShopifyAdminClient,
  db: PrismaClient,
  targetProductId: number,
): Promise<void> {
  const targetItem = order.line_items?.find(
    (item) => item.product_id === targetProductId,
  );

  if (!targetItem) {
    return;
  }

  // Extract colour and size from variant selectedOptions via Admin GraphQL
  const variantGid = `gid://shopify/ProductVariant/${targetItem.variant_id}`;
  const variantResponse = await admin.graphql(VARIANT_OPTIONS_QUERY, {
    variables: { id: variantGid },
  });
  const variantJson = await variantResponse.json();
  const { data: variantData } = variantJson;
  const selectedOptions: { name: string; value: string }[] =
    variantData?.productVariant?.selectedOptions ?? [];

  const getOption = (name: string) =>
    selectedOptions.find((o) => o.name.toLowerCase() === name.toLowerCase())?.value;

  const colourRaw = getOption("Color");
  const sizeRaw = getOption("Size");

  const colour = colourRaw ? COLOUR_MAP[colourRaw.toLowerCase()] : undefined;
  const size_cm = sizeRaw ? parseInt(sizeRaw, 10) : NaN;

  if (!colour) {
    console.error(`Order ${order.id}: missing or unrecognised Color option ("${colourRaw}")`);
    return;
  }

  if (isNaN(size_cm)) {
    console.error(`Order ${order.id}: missing or invalid Size option ("${sizeRaw}")`);
    return;
  }

  // Fetch customer name via Admin GraphQL (email requires Protected Customer Data approval)
  const orderGid = `gid://shopify/Order/${order.id}`;
  const orderResponse = await admin.graphql(ORDER_CUSTOMER_QUERY, {
    variables: { id: orderGid },
  });
  const orderJson = await orderResponse.json();
  const { data } = orderJson;
  const orderData = data?.order;

  const customerEmail = orderData?.customer?.email ?? orderData?.email ?? "";
  const customerFirstName =
    orderData?.customer?.firstName ?? orderData?.billingAddress?.firstName ?? "";
  const customerLastName =
    orderData?.customer?.lastName ?? orderData?.billingAddress?.lastName ?? "";

  const uploadToken = randomUUID();

  await db.modelOrder.create({
    data: {
      shopify_order_id: String(order.id),
      shopify_cust_id: String(order.customer?.id ?? ""),
      order_number: orderData?.name ?? `#${order.order_number ?? order.id}`,
      customer_email: customerEmail,
      customer_first_name: customerFirstName,
      customer_last_name: customerLastName,
      colour,
      size_cm,
      placed: order.created_at ? new Date(order.created_at) : new Date(),
      upload_token: uploadToken,
      order_status: "PURCHASED",
    },
  });

  const appUrl = process.env.APP_URL || process.env.SHOPIFY_APP_URL || "";
  console.log(
    `Created ModelOrder for Shopify order ${order.id} (${customerEmail})\n` +
      `  Upload URL: ${appUrl}/customer/upload/${uploadToken}`,
  );
}
