import axios from "axios";
import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from "../../utils/supabaseClient";

export const authRegister = async (req: Request, res: Response): Promise<void> => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { username, password, inviteCode } = req.body;

    // Validate required fields
    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    const baseUrl = process.env.ZIPLINE_URL;
    if (!baseUrl) { 
      res.status(500).json({ error: "Zipline URL not configured" });
      return;
    }

    const requestBody: any = {
      username,
      password,
    };

    // Add invite code if provided
    if (inviteCode) {
      requestBody.code = inviteCode;
    }

    //get zipline admin token
    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
    const { data: superadmin, error: superadminError } = await supabaseServerClient.from('user_profiles').select('*').eq('role', 'superadmin').single();
    if (superadminError) {
      res.status(500).json({ error: superadminError?.message || "Failed to get superadmin" });
      return;
    }
    const superadminToken = superadmin.zipline?.token;

    // Make the request to Zipline API
    const response = await axios.post(`${baseUrl}/api/users`, requestBody, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": superadminToken,
      },
      validateStatus: () => true,
    });

    const data = response.data;
    console.log("zip data", data);
    if (response.status < 200 || response.status >= 300) {
      // Handle different error cases based on status codes
      let errorMessage = "Registration failed";

      if (response.status === 400) {
        if (data.message?.includes("invite")) {
          errorMessage = "Invalid invite code or invites are required";
        } else if (data.message?.includes("username")) {
          errorMessage = "Username is already taken or invalid";
        } else if (data.message?.includes("registration")) {
          errorMessage = "Registration is disabled";
        } else {
          errorMessage = data.message || "Invalid registration data";
        }
      }

      res.status(response.status).json({ error: errorMessage, details: data });
      return;
    }

    // After successful registration, we need to login to get the session cookie
    // and then get the user's token
    try {
      // Step 1: Login to get the session cookie
      const loginResponse = await axios.post(`${baseUrl}/api/auth/login`, {
        username,
        password,
      }, {
        headers: {
          "Content-Type": "application/json",
        },
        validateStatus: () => true,
      });

      if (loginResponse.status < 200 || loginResponse.status >= 300) {
        res.status(500).json({ 
          error: "Registration successful but failed to get user token", 
          details: loginResponse.data 
        });
        return;
      }

      // Extract the session cookie from the response
      const setCookieHeader = loginResponse.headers['set-cookie'];
      let sessionCookie = '';
      
      if (setCookieHeader) {
        const ziplineSessionCookie = setCookieHeader.find(cookie => 
          cookie.startsWith('zipline_session=')
        );
        if (ziplineSessionCookie) {
          sessionCookie = ziplineSessionCookie.split(';')[0]; // Get just the cookie part
        }
      }

      if (!sessionCookie) {
        res.status(500).json({ error: "Failed to get session cookie" });
        return;
      }

      // Step 2: Get the user's token using the session cookie
      const tokenResponse = await axios.get(`${baseUrl}/api/user/token`, {
        headers: {
          "Cookie": sessionCookie,
        },
        validateStatus: () => true,
      });

      if (tokenResponse.status < 200 || tokenResponse.status >= 300) {
        res.status(500).json({ 
          error: "Failed to get user token", 
          details: tokenResponse.data 
        });
        return;
      }

      const userToken = tokenResponse.data.token;
      
      res.status(200).json({ 
        success: true, 
        data: {
          ...data,
          token: userToken,
          password: password,
        }
      });
    } catch (tokenError) {
      console.error("Error getting user token:", tokenError);
      res.status(500).json({ 
        error: "Registration successful but failed to get user token",
        details: tokenError instanceof Error ? tokenError.message : "Unknown error"
      });
    }
    return;
  } catch (error) {
    console.error("Registration error:", error);

    res.status(500).json({ error: error instanceof Error ? error.message : "An unexpected error occurred" });
    return;
  }
}
