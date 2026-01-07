import axios from "axios";
import { getServerClient, getUserClient, SupabaseServerClients, SupabaseUserClients } from "../../utils/supabaseClient";
import { Request, Response } from 'express';  

export const userFileDelete = async (req: Request, res: Response): Promise<void> => {
  if (req.method !== "POST" && req.method !== "DELETE") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

console.log("userFileDelete", req.body);
  const baseUrl = process.env.ZIPLINE_URL;
  if (!baseUrl) {
    res.status(500).json({ error: "Zipline URL not configured" });
    return;
  }

  try {
    const { idOrName } = req.body;
    if (!idOrName || typeof idOrName !== "string") {
      res.status(400).json({ error: "Missing idOrName" });
      return;
    }

  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

  const { data: userProfile, error: profileError } = await supabaseServerClient
    .from('user_profiles')
    .select('zipline')
    .eq('user_id', (req as any).user?.id)
    .single();
  if (profileError) {
    res.status(500).json({ error: profileError?.message || "Failed to get user profile" });
    return;
  }
  console.log("userProfile?.zipline?.token", userProfile);
    const response = await axios.delete(
      `${baseUrl}/api/user/files/${encodeURIComponent(idOrName)}`,
      {
        headers: {
          // Do not set Content-Type for DELETE with no body
            Authorization: userProfile?.zipline?.token,
        },
        validateStatus: () => true,
      }
    );

    const data = response.data;
    console.log("data", data);
    if (response.status < 200 || response.status >= 300) {
      res.status(response.status).json({ error: data?.message || "Failed to delete file", details: data });
      return;
    }

    res.status(200).json({ success: true, data: data });
    return;
  } catch (error) {
    console.error("Zipline file delete error:", error);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
}
