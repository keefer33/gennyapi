import Stripe from "stripe";

// Only initialize Stripe if the secret key is available
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-09-30.clover",
    })
  : null;

/** Allowed balance top-up amounts in USD (whole dollars). */
export const TOP_UP_AMOUNTS_DOLLARS = [5, 10, 25, 50, 100] as const;

export type TopUpDollars = (typeof TOP_UP_AMOUNTS_DOLLARS)[number];

const ALLOWED_CENTS = new Set(TOP_UP_AMOUNTS_DOLLARS.map((d) => d * 100));

export function isValidTopUpDollars(dollars: number): boolean {
  return Number.isInteger(dollars) && TOP_UP_AMOUNTS_DOLLARS.includes(dollars as TopUpDollars);
}

export function isValidTopUpCents(cents: number): boolean {
  return Number.isInteger(cents) && ALLOWED_CENTS.has(cents);
}
