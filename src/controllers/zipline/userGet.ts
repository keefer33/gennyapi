import axios from "axios";
import { getServerClient, SupabaseServerClients } from "../../utils/supabaseClient";
import { Request, Response } from 'express';

export const userGet = async (req: Request, res: Response): Promise<void> => {
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

  try {
    const response = await axios.get(`${baseUrl}/api/user`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: userProfile?.zipline?.token,
      },
      validateStatus: () => true,
    });

    const data = response.data;

    if (response.status < 200 || response.status >= 300) {
      res.status(response.status).json({ error: data?.message || "Failed to fetch user", details: data });
      return;
    }

    res.status(200).json({ success: true, data: data });
    return;
  } catch (error) {
    console.error("Zipline user GET error:", error);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
}
