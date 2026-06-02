import Stripe from "stripe";

let stripeInstance: Stripe | null | undefined;

/** Lazily initialized so dotenv can load before first use (see index.ts import order). */
export function getStripe(): Stripe | null {
  if (stripeInstance === undefined) {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    stripeInstance = key
      ? new Stripe(key, {
          apiVersion: "2025-09-30.clover",
        })
      : null;
  }
  return stripeInstance;
}

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
