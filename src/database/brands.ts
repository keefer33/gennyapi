import { AppError } from "../app/error";
import { getServerClient } from "./supabaseClient";
import { BrandRow } from "./types";

export async function listBrands(): Promise<BrandRow[]> {
  const { supabaseServerClient } = await getServerClient();

  const { data, error } = await supabaseServerClient
    .from("brands")
    .select("id, name, slug, logo")
    .neq("name", "Genny.bot")
    .order("name", { ascending: true });

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: "brands_fetch_failed",
    });
  }

  return (data ?? []) as BrandRow[];
}
