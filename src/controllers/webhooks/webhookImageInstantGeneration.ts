import axios, { AxiosResponse } from 'axios';
import { createUserGenerationFile, updateUserGeneration } from '../../utils/getSupaData';
import { saveFileFromUrl } from '../../utils/generate';

// Remove empty values (null, undefined, empty strings, empty arrays, empty objects) from payload
const removeEmptyValues = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return undefined;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    const filtered = obj.map(removeEmptyValues).filter(item => {
      if (item === null || item === undefined) return false;
      if (typeof item === 'string' && item === '') return false;
      if (Array.isArray(item) && item.length === 0) return false;
      if (typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0) return false;
      return true;
    });
    return filtered.length === 0 ? undefined : filtered;
  }

  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const cleanedValue = removeEmptyValues(value);

    // Skip if value is empty
    if (cleanedValue === null || cleanedValue === undefined) continue;
    if (typeof cleanedValue === 'string' && cleanedValue === '') continue;
    if (Array.isArray(cleanedValue) && cleanedValue.length === 0) continue;
    if (typeof cleanedValue === 'object' && !Array.isArray(cleanedValue) && Object.keys(cleanedValue).length === 0)
      continue;

    cleaned[key] = cleanedValue;
  }

  return Object.keys(cleaned).length === 0 ? undefined : cleaned;
};

export const webhookImageInstantGeneration = async (pollingFileData: any) => {
  try {
    const endpoint = pollingFileData.api_id.api_url;
    const rawPayload = {
      model: pollingFileData.api_id.model_name,
      ...pollingFileData.payload,
    };
    const cleanedPayload = removeEmptyValues(rawPayload);
    // Ensure payload is an object (not undefined) before sending
    const payload = cleanedPayload && typeof cleanedPayload === 'object' ? cleanedPayload : {};

    let response: AxiosResponse;
    try {
      response = await axios.post(endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pollingFileData.api_id.key.key}`,
        },
      });
    } catch (axiosError: any) {
      console.error('API request error:', axiosError);
      await updateUserGeneration({
        id: pollingFileData.id,
        status: 'error',
        polling_response: axiosError.response?.data || axiosError.message,
      });
      throw new Error(axiosError.response?.data?.message || axiosError.message || 'Failed to generate image');
    }

    // Validate response structure
    if (!response.data?.data?.[0]?.url) {
      const errorMessage = 'Invalid response structure: missing image URL';
      console.error(errorMessage, response.data);
      await updateUserGeneration({
        id: pollingFileData.id,
        status: 'error',
        polling_response: response.data,
      });
      throw new Error(errorMessage);
    }

    // Save file from URL
    let savedFile: any;
    try {
      savedFile = await saveFileFromUrl(response.data.data[0].url, pollingFileData, response);
      if (!savedFile?.file_id) {
        throw new Error('Failed to save file: no file_id returned');
      }
    } catch (saveError: any) {
      console.error('Error saving file:', saveError);
      await updateUserGeneration({
        id: pollingFileData.id,
        status: 'error',
        polling_response: {
          error: saveError.message,
          original_response: response.data,
        },
      });
      throw new Error(`Failed to save file: ${saveError.message}`);
    }

    // Create user generation file record
    try {
      await createUserGenerationFile({
        generation_id: pollingFileData.id,
        file_id: savedFile.file_id,
      });
    } catch (createError: any) {
      console.error('Error creating user generation file:', createError);
      await updateUserGeneration({
        id: pollingFileData.id,
        status: 'error',
        polling_response: {
          error: createError.message,
          file_id: savedFile.file_id,
          original_response: response.data,
        },
      });
      throw new Error(`Failed to create file record: ${createError.message}`);
    }

    // Update generation status to completed
    await updateUserGeneration({
      id: pollingFileData.id,
      response: response.data,
      status: 'completed',
    });

    return 'completed';
  } catch (error: any) {
    // Final catch-all: ensure updateUserGeneration is called even if previous error handling failed
    try {
      await updateUserGeneration({
        id: pollingFileData.id,
        status: 'error',
        polling_response: {
          error: error.message || 'Unknown error occurred',
          stack: error.stack,
        },
      });
    } catch (updateError) {
      console.error('Critical: Failed to update user generation status:', updateError);
    }
    throw error;
  }
};
