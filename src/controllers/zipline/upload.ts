import axios from "axios";
import { getServerClient, getUserClient, SupabaseServerClients, SupabaseUserClients } from "../../utils/supabaseClient";
import { Request, Response } from 'express';
import multer from 'multer';
import FormData from 'form-data';  

// Configure multer for memory storage
const uploadMiddleware = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  }
});

export const upload = async (req: Request, res: Response): Promise<void> => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // User is already authenticated by middleware, get from request
  const user = (req as any).user;

  const baseUrl = process.env.ZIPLINE_URL;
  if (!baseUrl) {
    res.status(500).json({ error: "Zipline URL not configured" });
    return;
  }

  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

  const { data: userProfile, error: profileError } = await supabaseServerClient
    .from('user_profiles')
    .select('zipline')
    .eq('user_id', user?.id)
    .single();
  if (profileError) {
    res.status(500).json({ error: profileError?.message || "Failed to get user profile" });
    return;
  }

  try {
    // Use multer to parse the multipart form data
    uploadMiddleware.single('file')(req, res, async (err) => {
      if (err) {
        console.error("Multer error:", err);
        res.status(400).json({ error: "File upload error" });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      // Create FormData for Zipline API
      const formData = new FormData();
      formData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype
      });
console.log(userProfile?.zipline?.token);
      const response = await axios.post(`${baseUrl}/api/upload`, formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: userProfile?.zipline?.token,
        },
        validateStatus: () => true,
      });

      const data = response.data;
      if (response.status < 200 || response.status >= 300) {
        res.status(response.status).json({ error: data?.message || "Upload failed", details: data });
        return;
      }

      res.status(200).json({ success: true, data: data });
    });
  } catch (error) {
    console.error("Zipline upload error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
