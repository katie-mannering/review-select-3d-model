import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  processOrderPaid,
  type OrderPayload,
} from "../services/order-webhook.server";

const TARGET_PRODUCT_ID = parseInt(
  process.env.BUST_FROM_PHOTO_PRODUCT_ID ?? "0",
  10,
);

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);
  const order = payload as OrderPayload;

  console.log(`Received ${topic} webhook for ${shop}, order ${order.id}`);

  if (!admin) {
    console.error(`No admin context for shop ${shop} — cannot process order`);
    return new Response();
  }

  await processOrderPaid(order, admin, db, TARGET_PRODUCT_ID);

  return new Response();
};
