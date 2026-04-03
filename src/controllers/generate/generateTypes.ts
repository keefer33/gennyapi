// Type definitions
export interface ToolResponse {
    success?: boolean;
    error?: string;
    message?: string;
    result?: any;
    usage?: any;
  }
  
  export interface ToolData {
    id: string;
    schema: any;
    user_id: string;
    is_pipedream: boolean;
    pipedream?: any;
    is_sloot: boolean;
    sloot?: {
      id?: string;
      api?: string;
      type?: string;
      brand?: string;
      config?: any;
      pricing: any;
      category?: string;
      poll?: string;
    } | null;
    user_connect_api?: {
      api_url?: string;
      auth_token?: string;
    } | null;
  }
  
  export interface FinalResponse {
    result: any;
    usage: any[] | null;
  }
  
  export interface SlootToolResponse {
    result: any;
    usage: any[];
  }
  
  export interface FileMetadata {
    user_id: string;
    file_name: string;
    file_path: string;
    file_size: number;
    file_type: string;
    zip_data?: any;
    model_id?: string;
    agent_id?: string;
    generated_info?: any;
    thumbnail_url?: string;
  }

  export interface GenerationModel {
    id: string;
    name: string;
    description: string;
    category: string;
    tags: string[];
    slug: string;
    generation_type: string;
    meta?: { tags?: string[] };
    config: {
      api: string;
      cost_per_generation?: number;
      pricing?: any;
    };
    schema: any;
    brands?: {
      id: string;
      name: string;
      logo: string;
    };
    api?: any;
  }