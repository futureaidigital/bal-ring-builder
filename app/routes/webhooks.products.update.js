// app/routes/webhooks.products.update.jsx - Minimal version
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Webhook received: ${topic} for shop: ${shop}`);

  // Simply acknowledge the webhook
  return json({ success: true }, { status: 200 });
};

// Shopify requires a GET endpoint that returns a 401
export const loader = () => {
  return new Response("Unauthorized", { status: 401 });
};