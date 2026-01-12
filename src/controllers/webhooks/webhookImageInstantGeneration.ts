import axios, { AxiosResponse } from 'axios';
import { createUserGenerationFile, updateUserGeneration } from '../../utils/getSupaData';
import { saveFileFromUrl } from '../../utils/generate';

export const webhookImageInstantGeneration = async (pollingFileData: any) => {
  try {
    const endpoint = pollingFileData.api_id.api_url;
    const payload = {
      model: pollingFileData.api_id.model_name,
      ...pollingFileData.payload,
    };

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
