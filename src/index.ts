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

const config: PixabayConfig = {
  apiKey: process.env.PIXABAY_API_KEY || "",
  baseUrl: "https://pixabay.com/api/",
  videosUrl: "https://pixabay.com/api/videos/",
};

async function searchImages(params: PixabaySearchParams) {
  const filteredParams = Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)])
  );

  const searchParams = new URLSearchParams({
    key: config.apiKey,
    ...filteredParams,
  });

  const url = `${config.baseUrl}?${searchParams}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pixabay API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

async function searchVideos(params: PixabayVideoSearchParams) {
  const filteredParams = Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)])
  );

  const searchParams = new URLSearchParams({
    key: config.apiKey,
    ...filteredParams,
  });

  const url = `${config.videosUrl}?${searchParams}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pixabay API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function createMcpServer(): Server {
  const server = new Server(
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

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "search_images",
        description: "Search for royalty-free images on Pixabay",
        inputSchema: {
          type: "object",
          properties: {
            q: { type: "string", description: "Search term. Max 100 characters." },
            lang: { type: "string", default: "en" },
            image_type: { type: "string", enum: ["all", "photo", "illustration", "vector"], default: "all" },
            orientation: { type: "string", enum: ["all", "horizontal", "vertical"], default: "all" },
            category: { type: "string" },
            min_width: { type: "integer", default: 0 },
            min_height: { type: "integer", default: 0 },
            colors: { type: "string" },
            editors_choice: { type: "boolean", default: false },
            safesearch: { type: "boolean", default: false },
            order: { type: "string", enum: ["popular", "latest"], default: "popular" },
            page: { type: "integer", default: 1 },
            per_page: { type: "integer", default: 20, minimum: 3, maximum: 200 },
          },
        },
      },
      {
        name: "search_videos",
        description: "Search for royalty-free videos on Pixabay",
        inputSchema: {
          type: "object",
          properties: {
            q: { type: "string", description: "Search term. Max 100 characters." },
            lang: { type: "string", default: "en" },
            video_type: { type: "string", enum: ["all", "film", "animation"], default: "all" },
            category: { type: "string" },
            min_width: { type: "integer", default: 0 },
            min_height: { type: "integer", default: 0 },
            editors_choice: { type: "boolean", default: false },
            safesearch: { type: "boolean", default: false },
            order: { type: "string", enum: ["popular", "latest"], default: "popular" },
            page: { type: "integer", default: 1 },
            per_page: { type: "integer", default: 20, minimum: 3, maximum: 200 },
          },
        },
      },
      {
        name: "get_image_by_id",
        description: "Retrieve a specific image by its Pixabay ID",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
      {
        name: "get_video_by_id",
        description: "Retrieve a specific video by its Pixabay ID",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (!config.apiKey) {
      throw new Error("PIXABAY_API_KEY environment variable is required");
    }

    try {
      switch (name) {
        case "search_images":
          return await searchImages(args as PixabaySearchParams);
        case "search_videos":
          return await searchVideos(args as PixabayVideoSearchParams);
        case "get_image_by_id":
          return await searchImages({ id: (args as { id: string }).id });
        case "get_video_by_id":
          return await searchVideos({ id: (args as { id: string }).id });
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [] }));

  return server;
}

const app = express();
app.use(cors());
app.use(express.json());

const transports = new Map<string, SSEServerTransport>();

app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", server: "Pixabay MCP Server" });
});

app.get("/sse", async (_req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);

  transport.onclose = () => {
    transports.delete(transport.sessionId);
  };

  const server = createMcpServer();
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);

  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("Session not found or expired");
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.error(`Pixabay MCP Server running on port ${port}`);
});
