import type { Request, Response } from "express";
import { getServerClient } from "../../utils/supabaseClient";

export type BrandRow = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
};

export async function getBrands(req: Request, res: Response): Promise<void> {
  try {
    const { supabaseServerClient } = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from("brands")
      .select("id, name, slug, logo")
      .neq("name", "Genny.bot")
      .order("name", { ascending: true });

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.status(200).json({ success: true, data: (data ?? []) as BrandRow[] });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch brands",
    });
  }
}

