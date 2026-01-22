// app/routes/api.cart.jsx
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function action({ request, params }) {
  const { storefront } = await authenticate.public.appProxy(request);
  
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { gemstoneHandle, settingHandle } = body;

    if (!gemstoneHandle || !settingHandle) {
      return json({ error: "Both gemstone and setting are required" }, { status: 400 });
    }

    // Get product variants
    const productsQuery = `
      query getProducts($gemstoneHandle: String!, $settingHandle: String!) {
        gemstone: productByHandle(handle: $gemstoneHandle) {
          id
          title
          variants(first: 1) {
            edges {
              node {
                id
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
        setting: productByHandle(handle: $settingHandle) {
          id
          title
          variants(first: 1) {
            edges {
              node {
                id
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    `;

    const { data } = await storefront.graphql(productsQuery, {
      variables: {
        gemstoneHandle,
        settingHandle
      }
    });

    if (!data.gemstone || !data.setting) {
      return json({ error: "Products not found" }, { status: 404 });
    }

    const gemstoneVariantId = data.gemstone.variants.edges[0].node.id;
    const settingVariantId = data.setting.variants.edges[0].node.id;

    // Create cart with both items
    const cartCreateMutation = `
      mutation cartCreate($lines: [CartLineInput!]!) {
        cartCreate(input: { lines: $lines }) {
          cart {
            id
            checkoutUrl
            lines(first: 10) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      product {
                        title
                      }
                      price {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
            cost {
              totalAmount {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const cartResponse = await storefront.graphql(cartCreateMutation, {
      variables: {
        lines: [
          {
            merchandiseId: gemstoneVariantId,
            quantity: 1,
            attributes: [
              {
                key: "Ring Component",
                value: "Gemstone"
              }
            ]
          },
          {
            merchandiseId: settingVariantId,
            quantity: 1,
            attributes: [
              {
                key: "Ring Component",
                value: "Setting"
              }
            ]
          }
        ]
      }
    });

    if (cartResponse.data.cartCreate.userErrors.length > 0) {
      return json({ 
        error: "Failed to create cart", 
        details: cartResponse.data.cartCreate.userErrors 
      }, { status: 400 });
    }

    const cart = cartResponse.data.cartCreate.cart;

    // Set cart cookie for the storefront
    const headers = new Headers();
    headers.append('Set-Cookie', `cart=${encodeURIComponent(cart.id)}; Path=/; HttpOnly; SameSite=Lax`);

    return json({
      success: true,
      cartId: cart.id,
      checkoutUrl: cart.checkoutUrl,
      totalAmount: cart.cost.totalAmount,
      items: cart.lines.edges.map(edge => ({
        title: edge.node.merchandise.product.title,
        price: edge.node.merchandise.price,
        quantity: edge.node.quantity
      }))
    }, { headers });

  } catch (error) {
    console.error("Cart API Error:", error);
    return json({ error: "Failed to process request" }, { status: 500 });
  }
}

// GET method to check cart status
export async function loader({ request }) {
  const { storefront } = await authenticate.public.appProxy(request);
  
  // Get cart ID from cookie
  const cookieHeader = request.headers.get("Cookie");
  const cartId = cookieHeader?.split(';')
    .find(c => c.trim().startsWith('cart='))
    ?.split('=')[1];

  if (!cartId) {
    return json({ cart: null });
  }

  try {
    const cartQuery = `
      query getCart($cartId: ID!) {
        cart(id: $cartId) {
          id
          checkoutUrl
          lines(first: 10) {
            edges {
              node {
                id
                quantity
                merchandise {
                  ... on ProductVariant {
                    product {
                      title
                    }
                  }
                }
              }
            }
          }
          cost {
            totalAmount {
              amount
              currencyCode
            }
          }
        }
      }
    `;

    const { data } = await storefront.graphql(cartQuery, {
      variables: { cartId: decodeURIComponent(cartId) }
    });

    return json({ cart: data.cart });
  } catch (error) {
    return json({ cart: null });
  }
}