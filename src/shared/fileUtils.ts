import axios from 'axios';

/**
 * File utility functions for handling file operations
 */

/**
 * Extract file extension from a URL
 * Handles both simple URLs and complex URLs with query parameters
 */
export const getFileExtension = (url: string): string | null => {
  try {
    // Check if it's a valid URL first
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      // If it's not a URL, treat it as a filename and extract extension
      const lastDotIndex = url.lastIndexOf('.');
      if (lastDotIndex === -1 || lastDotIndex === url.length - 1) {
        return null;
      }
      return url.substring(lastDotIndex + 1).toLowerCase();
    }

    // Remove query parameters and fragments
    const urlWithoutQuery = url.split('?')[0]?.split('#')[0];

    if (!urlWithoutQuery) {
      return null;
    }

    // Extract the pathname from the URL
    const pathname = new URL(urlWithoutQuery).pathname;

    // Get the last part of the path (filename)
    const filename = pathname.split('/').pop();

    if (!filename) {
      return null;
    }

    // Check if filename has an extension
    const lastDotIndex = filename.lastIndexOf('.');

    if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
      return null;
    }

    // Return the extension without the dot
    return filename.substring(lastDotIndex + 1).toLowerCase();
  } catch (error) {
    console.error('Error extracting file extension from URL:', error);
    return null;
  }
};

/**
 * Extract file extension from a URL with the dot included
 *
 */
export const getFileExtensionWithDot = (url: string): string | null => {
  const extension = getFileExtension(url);
  return extension ? `.${extension}` : null;
};

/**
 * Check if a URL has a specific file extension
 */
export const hasFileExtension = (url: string, extension: string): boolean => {
  const urlExtension = getFileExtension(url);
  const normalizedExtension = extension.startsWith('.') ? extension.substring(1) : extension;
  return urlExtension === normalizedExtension.toLowerCase();
};

/**
 * Check if a URL is an image based on its extension
 */
export const isImageUrl = (url: string): boolean => {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif'];
  const extension = getFileExtension(url);
  return extension ? imageExtensions.includes(extension) : false;
};

/**
 * Check if a URL is a video based on its extension
 */
export const isVideoUrl = (url: string): boolean => {
  const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', '3gp', 'ogv'];
  const extension = getFileExtension(url);
  return extension ? videoExtensions.includes(extension) : false;
};

/**
 * Check if a URL is an audio file based on its extension
 */
export const isAudioUrl = (url: string): boolean => {
  const audioExtensions = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus', 'aiff', 'au'];
  const extension = getFileExtension(url);
  return extension ? audioExtensions.includes(extension) : false;
};

/**
 * Get the MIME type based on file extension
 */
export const getMimeType = (url: string): string => {
  const extension = getFileExtension(url);

  if (!extension) {
    return 'application/octet-stream';
  }

  const mimeTypes: Record<string, string> = {
    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    tiff: 'image/tiff',
    tif: 'image/tiff',

    // Videos
    mp4: 'video/mp4',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    wmv: 'video/x-ms-wmv',
    flv: 'video/x-flv',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    m4v: 'video/x-m4v',
    '3gp': 'video/3gpp',
    ogv: 'video/ogg',

    // Audio
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    wma: 'audio/x-ms-wma',
    m4a: 'audio/x-m4a',
    opus: 'audio/opus',
    aiff: 'audio/aiff',
    au: 'audio/basic',

    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    rtf: 'application/rtf',
    odt: 'application/vnd.oasis.opendocument.text',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odp: 'application/vnd.oasis.opendocument.presentation',

    // Archives
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    bz2: 'application/x-bzip2',

    // Code
    js: 'application/javascript',
    ts: 'application/typescript',
    html: 'text/html',
    css: 'text/css',
    json: 'application/json',
    xml: 'application/xml',
    yaml: 'application/x-yaml',
    yml: 'application/x-yaml',
  };

  return mimeTypes[extension] || 'application/octet-stream';
};

/**
 * Get filename from URL without extension
 */
export const getFilenameWithoutExtension = (url: string): string | null => {
  try {
    const urlWithoutQuery = url.split('?')[0]?.split('#')[0];

    if (!urlWithoutQuery) {
      return null;
    }

    const pathname = new URL(urlWithoutQuery).pathname;
    const filename = pathname.split('/').pop();

    if (!filename) {
      return null;
    }

    const lastDotIndex = filename.lastIndexOf('.');

    if (lastDotIndex === -1) {
      return filename;
    }

    return filename.substring(0, lastDotIndex);
  } catch (error) {
    console.error('Error extracting filename from URL:', error);
    return null;
  }
};

/**
 * Get complete filename from URL
 */
export const getFilename = (url: string): string | null => {
  try {
    const urlWithoutQuery = url.split('?')[0]?.split('#')[0];

    if (!urlWithoutQuery) {
      return null;
    }

    const pathname = new URL(urlWithoutQuery).pathname;
    return pathname.split('/').pop() || null;
  } catch (error) {
    console.error('Error extracting filename from URL:', error);
    return null;
  }
};

/**
 * Convert URL to base64 data URL
 * Supports images, PDFs, and other file types
 */
export const convertUrlToBase64 = async (url: string, mimeType?: string): Promise<string | null> => {
  try {
    // Validate URL
    if (!url || !url.startsWith('http')) {
      console.error('Invalid URL provided:', url);
      return null;
    }

    // Fetch the file content from URL
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      console.error('Failed to fetch file:', response.status, response.statusText);
      return null;
    }

    // Get the content type from response headers or use provided mimeType
    let contentType = mimeType || response.headers['content-type'];

    if (!contentType) {
      // Try to determine from file extension
      const extension = getFileExtension(url);
      if (extension) {
        contentType = getMimeType(url);
      } else {
        console.error('Could not determine content type for URL:', url);
        return null;
      }
    }

    // Validate that it's a supported file type
    if (!isSupportedFileType(contentType)) {
      console.error('Unsupported file type:', contentType);
      return null;
    }

    // Convert to base64
    const arrayBuffer = response.data;
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('Error converting URL to base64:', error);
    return null;
  }
};

/**
 * Convert image URL to base64 data URL (convenience function)
 */
export const convertImageUrlToBase64 = async (imageUrl: string): Promise<string | null> => {
  // Validate that it's an image URL
  if (!isImageUrl(imageUrl)) {
    console.error('Invalid image URL:', imageUrl);
    return null;
  }

  return convertUrlToBase64(imageUrl);
};

/**
 * Check if a MIME type is supported for base64 conversion
 */
const isSupportedFileType = (mimeType: string): boolean => {
  const supportedTypes = [
    // Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/webp',
    'image/svg+xml',
    'image/x-icon',
    'image/tiff',
    'image/tif',

    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',

    // Archives
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-bzip2',

    // Code
    'application/javascript',
    'application/typescript',
    'text/html',
    'text/css',
    'application/json',
    'application/xml',
    'application/x-yaml',
  ];

  return supportedTypes.includes(mimeType.toLowerCase());
};
