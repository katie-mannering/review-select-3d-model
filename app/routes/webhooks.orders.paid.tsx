import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

interface LineItem {
  product_id: number;
}

interface OrderPayload {
  id: number;
  customer?: { id: number };
  line_items: LineItem[];
}

// Set this to your specific product ID
const TARGET_PRODUCT_ID = parseInt(process.env.BUST_FROM_PHOTO_PRODUCT_ID ?? "0", 10);

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const order = payload as OrderPayload;

  console.log(`Received ${topic} webhook for ${shop}, order ${order.id}`);

  const hasTargetProduct = order.line_items?.some(
    (item) => item.product_id === TARGET_PRODUCT_ID,
  );

  if (!hasTargetProduct) {
    return new Response();
  }

  await db.modelOrder.create({
    data: {
      shopify_order_id: String(order.id),
      shopify_cust_id: String(order.customer?.id ?? ""),
      order_status: "REQUESTED",
    },
  });

  console.log(`Created ModelOrder for Shopify order ${order.id}`);

  return new Response();
};
