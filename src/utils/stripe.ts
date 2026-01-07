import Stripe from "stripe";
// Only initialize Stripe if the secret key is available
export const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-09-30.clover",
    })
  : null;
  
export const TOKEN_PACKAGES = {
    5: { tokens: 1000, price: 500 }, // $5 = 1000 tokens
    10: { tokens: 2050, price: 1000 }, // $10 = 2050 tokens
    25: { tokens: 5200, price: 2500 }, // $25 = 5200 tokens
    50: { tokens: 10700, price: 5000 }, // $50 = 10700 tokens
    100: { tokens: 22000, price: 10000 }, // $100 = 22000 tokens
  } as const;