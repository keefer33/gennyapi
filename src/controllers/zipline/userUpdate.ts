import axios from "axios";
import { getServerClient, SupabaseServerClients } from "../../utils/supabaseClient";
import { Request, Response } from 'express';

export const userUpdate = async (req: Request, res: Response): Promise<void> => {
  if (req.method !== "PATCH" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = (req as any).user;
  if (!user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const baseUrl = process.env.ZIPLINE_URL;
  if (!baseUrl) {
    res.status(500).json({ error: "Zipline URL not configured" });
    return;
  }

  try {
    const body = req.body;

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: userProfile, error: profileError } = await supabaseServerClient
      .from('user_profiles')
      .select('zipline')
      .eq('user_id', user.id)
      .single();
    if (profileError) {
      res.status(500).json({ error: profileError?.message || "Failed to get user profile" });
      return;
    }
    const response = await axios.patch(`${baseUrl}/api/user`, body, {
      headers: {
        "Content-Type": "application/json",
        Authorization: userProfile?.zipline?.token,
      },
      validateStatus: () => true,
    });

    const data = response.data;

    if (response.status < 200 || response.status >= 300) {
      res.status(response.status).json({ error: data?.message || "Failed to update user", details: data });
      return;
    }

    res.status(200).json({ success: true, data: data });
    return;
  } catch (error) {
    console.error("Zipline user PATCH error:", error);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
}
