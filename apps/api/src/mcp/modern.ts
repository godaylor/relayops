import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { registerMcpTools, toMcpToolRegistrar } from "./tools";

// Tools accept small structured arguments and text, not bulk payloads. Both
// protocol eras must bound parsing and validation (GHSA-46jr-4wx8-v453).
export const MCP_HTTP_LIMITS = {
  maxToolInputElements: 10_000,
  maxRequestBodySize: 256 * 1024,
} as const;

/** Create a stateless MCP 2026 handler with a fresh server per request. */
export function createModernMcpHandler(token: string, apiUrl: string) {
  return createMcpHandler(
    () => {
      const server = new McpServer(
        {
          name: "kaneo-mcp",
          version: "1.0.0",
        },
        { maxToolInputElements: MCP_HTTP_LIMITS.maxToolInputElements },
      );
      registerMcpTools(toMcpToolRegistrar(server), apiUrl, token);
      return server;
    },
    {
      legacy: "reject",
      maxRequestBodySize: MCP_HTTP_LIMITS.maxRequestBodySize,
    },
  );
}
