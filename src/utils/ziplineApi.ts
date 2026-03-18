import axios from 'axios';
import FormData from 'form-data';
import { getMimeType } from './fileUtils';

export interface ZiplineUploadResponse {
  files: Array<{
    id: string;
    type: string;
    url: string;
    pending?: boolean;
  }>;
  deletesAt?: string;
  assumedMimetypes?: boolean[];
}

export interface ZiplineFileData {
  id: string;
  name: string;
  originalName: string;
  type: string;
  url: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  favorite: boolean;
  maxViews: number | null;
  views: number;
  password: string | null;
  tags: string[];
  folderId: string | null;
}

/**
 * Upload a file to Zipline
 * @param file - File buffer
 * @param filename - Name of the file
 * @param authToken - Zipline authentication token
 * @returns Promise with upload response
 */
export const uploadFileToZipline = async (
  file: Buffer,
  filename: string,
  authToken: string
): Promise<ZiplineUploadResponse> => {
  const baseUrl = process.env.ZIPLINE_URL;

  if (!baseUrl) {
    throw new Error('ZIPLINE_URL environment variable is not set');
  }

  // First, test authentication with /api/user endpoint
  try {
    const userResponse = await axios.get(`${baseUrl}/api/user`, {
      headers: {
        Authorization: authToken,
      },
      //timeout: 10000,
    });
  } catch (authError: any) {
    console.error('Authentication test failed:', authError.response?.status, authError.response?.data, authError);
    throw new Error(
      `Zipline authentication failed: ${authError.response?.status} - ${authError.response?.data?.message || authError.message}`
    );
  }

  const uploadUrl = `${baseUrl}/api/upload`;

  try {
    const formData = new FormData();

    // Dynamically determine content type based on file extension
    const contentType = getMimeType(filename);

    formData.append('file', file, {
      filename: filename,
      contentType: contentType,
    });

    const requestStart = Date.now();

    const response = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: authToken,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300000,
      validateStatus: () => true,
    });

    const requestTime = Date.now() - requestStart;

    // Check if the response indicates success
    if (response.status < 200 || response.status >= 300) {
      console.error('Zipline upload failed:', response.status, response.data);
      throw new Error(`Zipline upload failed: ${response.status} - ${response.data?.message || 'Unknown error'}`);
    }

    return response.data;
  } catch (error: any) {
    console.error('Zipline upload error details:');
    console.error('- Error message:', error.message);
    console.error('- Error code:', error.code);
    console.error('- Response status:', error.response?.status);
    console.error('- Response data:', error.response?.data);
    console.error('- Request URL:', `${baseUrl}/api/upload`);

    throw new Error(`Failed to upload file to Zipline: ${error.response?.data?.message || error.message}`);
  }
};

/**
 * Upload a file from URL to Zipline
 * @param url - URL to download the file from
 * @param filename - Name for the uploaded file
 * @param authToken - Zipline authentication token
 * @returns Promise with upload response
 */
export const uploadFromUrlToZipline = async (
  url: string,
  filename: string,
  authToken: string
): Promise<ZiplineUploadResponse> => {
  try {
    // Download the file from URL
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120000, // 2 minute timeout
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    // Convert to Buffer
    const fileBuffer = Buffer.from(response.data);

    return await uploadFileToZipline(fileBuffer, filename, authToken);
  } catch (error: any) {
    console.error('Error downloading file from URL:', error);
    throw new Error(`Failed to download file from URL: ${error.message}`);
  }
};

/**
 * Get file data from Zipline by file ID
 * @param fileId - The Zipline file ID
 * @param authToken - Zipline authentication token
 * @returns Promise with file data
 */
export const getZipData = async (fileId: string, authToken: string): Promise<ZiplineFileData> => {
  const baseUrl = process.env.ZIPLINE_URL;

  if (!baseUrl) {
    throw new Error('ZIPLINE_URL environment variable is not set');
  }


  const fileUrl = `${baseUrl}/api/user/files/${fileId}`;

  try {
    const response = await axios.get(fileUrl, {
      headers: {
        Authorization: authToken,
      },
      timeout: 30000,
      validateStatus: () => true,
    });


    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to get file data: ${response.status} - ${response.data?.message || 'Unknown error'}`);
    }

    return response.data;
  } catch (error: any) {
    console.error('=== getZipData ERROR ===');
    console.error('Error details:', error);
    console.error('Error message:', error.message);
    console.error('Response status:', error.response?.status);
    console.error('Response data:', error.response?.data);

    throw new Error(`Failed to get file data from Zipline: ${error.response?.data?.message || error.message}`);
  }
};
