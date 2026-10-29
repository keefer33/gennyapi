import { AppError } from "../app/error";
import { getServerClient } from "./supabaseClient";
import { isMissingPromptGuideColumn } from "./const";
import { BrandRow } from "./types";

const BRANDS_SELECT = "id, name, slug, logo, prompt_guide";
const BRANDS_SELECT_WITHOUT_GUIDE = "id, name, slug, logo";

export async function listBrands(): Promise<BrandRow[]> {
  const { supabaseServerClient } = await getServerClient();

  const fetch = (select: string) =>
    supabaseServerClient
      .from("brands")
      .select(select)
      .neq("name", "Genny.bot")
      .order("name", { ascending: true });

  let { data, error } = await fetch(BRANDS_SELECT);
  if (error && isMissingPromptGuideColumn(error.message)) {
    ({ data, error } = await fetch(BRANDS_SELECT_WITHOUT_GUIDE));
  }

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: "brands_fetch_failed",
    });
  }

  return (data ?? []) as BrandRow[];
}
