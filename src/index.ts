#!/usr/bin/env node

import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";

interface PixabayConfig {
  apiKey: string;
  baseUrl: string;
  videosUrl: string;
}

interface PixabaySearchParams {
  q?: string;
  lang?: string;
  id?: string;
  image_type?: "all" | "photo" | "illustration" | "vector";
  orientation?: "all" | "horizontal" | "vertical";
  category?: string;
  min_width?: number;
  min_height?: number;
  colors?: string;
  editors_choice?: boolean;
  safesearch?: boolean;
  order?: "popular" | "latest";
  page?: number;
  per_page?: number;
}

interface PixabayVideoSearchParams {
  q?: string;
  lang?: string;
  id?: string;
  video_type?: "all" | "film" | "animation";
  category?: string;
  min_width?: number;
  min_height?: number;
  editors_choice?: boolean;
  safesearch?: boolean;
  order?: "popular" | "latest";
  page?: number;
  per_page?: number;
}

class PixabayMCPServer {
  private server: Server;
  private config: PixabayConfig;

  constructor() {
    this.config = {
      apiKey: process.env.PIXABAY_API_KEY || "",
      baseUrl: "https://pixabay.com/api/",
      videosUrl: "https://pixabay.com/api/videos/",
    };

    this.server = new Server(
      {
        name: "pixabay-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_images",
            description: "Search for royalty-free images on Pixabay",
            inputSchema: {
              type: "object",
              properties: {
                q: {
                  type: "string",
                  description: "Search term (URL encoded). Max 100 characters.",
                },
                lang: {
                  type: "string",
                  description: "Language code (e.g., 'en', 'de', 'fr')",
                  default: "en",
                },
                image_type: {
                  type: "string",
                  enum: ["all", "photo", "illustration", "vector"],
                  description: "Filter by image type",
                  default: "all",
                },
                orientation: {
                  type: "string",
                  enum: ["all", "horizontal", "vertical"],
                  description: "Image orientation",
                  default: "all",
                },
                category: {
                  type: "string",
                  description: "Filter by category (backgrounds, fashion, nature, etc.)",
                },
                min_width: {
                  type: "integer",
                  description: "Minimum image width",
                  default: 0,
                },
                min_height: {
                  type: "integer",
                  description: "Minimum image height",
                  default: 0,
                },
                colors: {
                  type: "string",
                  description: "Color filter (grayscale, red, blue, etc.)",
                },
                editors_choice: {
                  type: "boolean",
                  description: "Editor's Choice award images only",
                  default: false,
                },
                safesearch: {
                  type: "boolean",
                  description: "Safe for all ages",
                  default: false,
                },
                order: {
                  type: "string",
                  enum: ["popular", "latest"],
                  description: "Sort order",
                  default: "popular",
                },
                page: {
                  type: "integer",
                  description: "Page number",
                  default: 1,
                },
                per_page: {
                  type: "integer",
                  description: "Results per page (3-200)",
                  default: 20,
                  minimum: 3,
                  maximum: 200,
                },
              },
            },
          },
          {
            name: "search_videos",
            description: "Search for royalty-free videos on Pixabay",
            inputSchema: {
              type: "object",
              properties: {
                q: {
                  type: "string",
                  description: "Search term (URL encoded). Max 100 characters.",
                },
                lang: {
                  type: "string",
                  description: "Language code (e.g., 'en', 'de', 'fr')",
                  default: "en",
                },
                video_type: {
                  type: "string",
                  enum: ["all", "film", "animation"],
                  description: "Filter by video type",
                  default: "all",
                },
                category: {
                  type: "string",
                  description: "Filter by category (backgrounds, fashion, nature, etc.)",
                },
                min_width: {
                  type: "integer",
                  description: "Minimum video width",
                  default: 0,
                },
                min_height: {
                  type: "integer",
                  description: "Minimum video height",
                  default: 0,
                },
                editors_choice: {
                  type: "boolean",
                  description: "Editor's Choice award videos only",
                  default: false,
                },
                safesearch: {
                  type: "boolean",
                  description: "Safe for all ages",
                  default: false,
                },
                order: {
                  type: "string",
                  enum: ["popular", "latest"],
                  description: "Sort order",
                  default: "popular",
                },
                page: {
                  type: "integer",
                  description: "Page number",
                  default: 1,
                },
                per_page: {
                  type: "integer",
                  description: "Results per page (3-200)",
                  default: 20,
                  minimum: 3,
                  maximum: 200,
                },
              },
            },
          },
          {
            name: "get_image_by_id",
            description: "Retrieve a specific image by its Pixabay ID",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Pixabay image ID",
                },
              },
              required: ["id"],
            },
          },
          {
            name: "get_video_by_id",
            description: "Retrieve a specific video by its Pixabay ID",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Pixabay video ID",
                },
              },
              required: ["id"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this.config.apiKey) {
        throw new Error("PIXABAY_API_KEY environment variable is required");
      }

      try {
        switch (name) {
          case "search_images":
            return await this.searchImages(args as PixabaySearchParams);
          case "search_videos":
            return await this.searchVideos(args as PixabayVideoSearchParams);
          case "get_image_by_id":
            return await this.getImageById(args as { id: string });
          case "get_video_by_id":
            return await this.getVideoById(args as { id: string });
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    });

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [],
      };
    });

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [],
      };
    });
  }

  private async searchImages(params: PixabaySearchParams) {
    const filteredParams = Object.fromEntries(
      Object.entries(params)
        .filter(([_, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => [key, String(value)])
    );

    const searchParams = new URLSearchParams({
      key: this.config.apiKey,
      ...filteredParams,
    });

    const url = `${this.config.baseUrl}?${searchParams}`;
    console.error(`Pixabay API Request: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Pixabay API Error Response: ${errorText}`);
      throw new Error(`Pixabay API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private async searchVideos(params: PixabayVideoSearchParams) {
    const filteredParams = Object.fromEntries(
      Object.entries(params)
        .filter(([_, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => [key, String(value)])
    );

    const searchParams = new URLSearchParams({
      key: this.config.apiKey,
      ...filteredParams,
    });

    const url = `${this.config.videosUrl}?${searchParams}`;
    console.error(`Pixabay Video API Request: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Pixabay Video API Error Response: ${errorText}`);
      throw new Error(`Pixabay API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private async getImageById(params: { id: string }) {
    return await this.searchImages({ id: params.id });
  }

  private async getVideoById(params: { id: string }) {
    return await this.searchVideos({ id: params.id });
  }

  async run() {
    const app = express();
    app.use(cors());

    let transport: SSEServerTransport | null = null;

    app.get("/sse", async (req, res) => {
      transport = new SSEServerTransport("/messages", res);
      await this.server.connect(transport);
    });

    app.post("/messages", async (req, res) => {
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(400).send("SSE session not initialized");
      }
    });

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.error(`Pixabay MCP Server running on SSE at port ${port}`);
    });
  }
}

const server = new PixabayMCPServer();
server.run().catch(console.error);
