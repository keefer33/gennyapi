import axios from 'axios';

/**
 * File utility functions for handling file operations
 */

/**
 * Extract file extension from a URL
 * Handles both simple URLs and complex URLs with query parameters
 *
 * @param url - The URL to extract extension from
 * @returns The file extension (without the dot) or null if not found
 *
 * @example
 * getFileExtension('https://example.com/image.jpg') // 'jpg'
 * getFileExtension('https://delivery-us1.bfl.ai/results/2c/8383718ff6fca1/8ff6fca14ee54092a05264e168d6d113/sample.jpeg?se=2025-10-07T10%3A20%3A38Z&sp=r&sv=2024-11-04&sr=b&rsct=image/jpeg&sig=05a5IMFwXThvMr43v2aaOZ6RHB1fTBDifSZb74Sv4Vk%3D') // 'jpeg'
 * getFileExtension('https://example.com/file') // null
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
 * @param url - The URL to extract extension from
 * @returns The file extension (with the dot) or null if not found
 *
 * @example
 * getFileExtensionWithDot('https://example.com/image.jpg') // '.jpg'
 * getFileExtensionWithDot('https://example.com/file') // null
 */
export const getFileExtensionWithDot = (url: string): string | null => {
  const extension = getFileExtension(url);
  return extension ? `.${extension}` : null;
};

/**
 * Check if a URL has a specific file extension
 *
 * @param url - The URL to check
 * @param extension - The extension to check for (with or without dot)
 * @returns True if the URL has the specified extension
 *
 * @example
 * hasFileExtension('https://example.com/image.jpg', 'jpg') // true
 * hasFileExtension('https://example.com/image.jpg', '.jpg') // true
 * hasFileExtension('https://example.com/image.png', 'jpg') // false
 */
export const hasFileExtension = (url: string, extension: string): boolean => {
  const urlExtension = getFileExtension(url);
  const normalizedExtension = extension.startsWith('.')
    ? extension.substring(1)
    : extension;
  return urlExtension === normalizedExtension.toLowerCase();
};

/**
 * Check if a URL is an image based on its extension
 *
 * @param url - The URL to check
 * @returns True if the URL appears to be an image
 *
 * @example
 * isImageUrl('https://example.com/image.jpg') // true
 * isImageUrl('https://example.com/document.pdf') // false
 */
export const isImageUrl = (url: string): boolean => {
  const imageExtensions = [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'bmp',
    'webp',
    'svg',
    'ico',
    'tiff',
    'tif',
  ];
  const extension = getFileExtension(url);
  return extension ? imageExtensions.includes(extension) : false;
};

/**
 * Check if a URL is a video based on its extension
 *
 * @param url - The URL to check
 * @returns True if the URL appears to be a video
 *
 * @example
 * isVideoUrl('https://example.com/video.mp4') // true
 * isVideoUrl('https://example.com/audio.mp3') // false
 */
export const isVideoUrl = (url: string): boolean => {
  const videoExtensions = [
    'mp4',
    'avi',
    'mov',
    'wmv',
    'flv',
    'webm',
    'mkv',
    'm4v',
    '3gp',
    'ogv',
  ];
  const extension = getFileExtension(url);
  return extension ? videoExtensions.includes(extension) : false;
};

/**
 * Check if a URL is an audio file based on its extension
 *
 * @param url - The URL to check
 * @returns True if the URL appears to be an audio file
 *
 * @example
 * isAudioUrl('https://example.com/audio.mp3') // true
 * isAudioUrl('https://example.com/video.mp4') // false
 */
export const isAudioUrl = (url: string): boolean => {
  const audioExtensions = [
    'mp3',
    'wav',
    'flac',
    'aac',
    'ogg',
    'wma',
    'm4a',
    'opus',
    'aiff',
    'au',
  ];
  const extension = getFileExtension(url);
  return extension ? audioExtensions.includes(extension) : false;
};

/**
 * Get the MIME type based on file extension
 *
 * @param url - The URL to get MIME type for
 * @returns The MIME type or 'application/octet-stream' if unknown
 *
 * @example
 * getMimeType('https://example.com/image.jpg') // 'image/jpeg'
 * getMimeType('https://example.com/document.pdf') // 'application/pdf'
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
 *
 * @param url - The URL to extract filename from
 * @returns The filename without extension or null if not found
 *
 * @example
 * getFilenameWithoutExtension('https://example.com/image.jpg') // 'image'
 * getFilenameWithoutExtension('https://example.com/path/to/file.png') // 'file'
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
 *
 * @param url - The URL to extract filename from
 * @returns The complete filename or null if not found
 *
 * @example
 * getFilename('https://example.com/image.jpg') // 'image.jpg'
 * getFilename('https://example.com/path/to/file.png') // 'file.png'
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
 *
 * @param url - The URL to convert
 * @param mimeType - Optional MIME type. If not provided, will be auto-detected
 * @returns Promise<string | null> - Base64 data URL or null if conversion fails
 *
 * @example
 * convertUrlToBase64('https://example.com/image.jpg') // 'data:image/jpeg;base64,/9j/4AAQ...'
 * convertUrlToBase64('https://example.com/doc.pdf', 'application/pdf') // 'data:application/pdf;base64,JVBERi0x...'
 */
export const convertUrlToBase64 = async (
  url: string,
  mimeType?: string
): Promise<string | null> => {
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
      console.error(
        'Failed to fetch file:',
        response.status,
        response.statusText
      );
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
 *
 * @param imageUrl - The URL of the image to convert
 * @returns Promise<string | null> - Base64 data URL or null if conversion fails
 *
 * @example
 * convertImageUrlToBase64('https://example.com/image.jpg') // 'data:image/jpeg;base64,/9j/4AAQ...'
 */
export const convertImageUrlToBase64 = async (
  imageUrl: string
): Promise<string | null> => {
  // Validate that it's an image URL
  if (!isImageUrl(imageUrl)) {
    console.error('Invalid image URL:', imageUrl);
    return null;
  }

  return convertUrlToBase64(imageUrl);
};

/**
 * Check if a MIME type is supported for base64 conversion
 *
 * @param mimeType - The MIME type to check
 * @returns True if the MIME type is supported
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
