/**
 * TypeScript declarations for Chrome's WebMCP API.
 *
 * WebMCP lets a web page expose structured tools to in-browser AI agents
 * via `document.modelContext.registerTool(...)`. Stable in Chrome 146+
 * (March 2026). Behind `chrome://flags/#enable-webmcp-testing` in earlier
 * versions.
 *
 * Spec: https://developer.chrome.com/docs/ai/webmcp
 * Status: https://chromestatus.com/feature/5117755740913664
 *
 * Notes on the current API surface we depend on:
 *   - Entry point: `document.modelContext` (not `navigator.modelContext`,
 *     which is deprecated as of Chrome 150).
 *   - Registration: `registerTool(tool, { signal })`. Throws on duplicate
 *     names. Aborting the signal unregisters.
 *   - Tool result shape: `{ content: [{ type: "text", text: "..." }] }`.
 *   - `annotations.readOnlyHint` should be set on read-only tools.
 *
 * If `document.modelContext` is undefined, every helper in this folder
 * no-ops; the page works exactly as before.
 */

export interface WebMCPAnnotations {
  /** Tool does not change persistent state. Agents may call without confirmation. */
  readOnlyHint?: boolean;
  /** Tool reads externally-sourced or untrusted content. */
  untrustedContentHint?: boolean;
}

export interface WebMCPToolDefinition {
  name: string;
  /** Short human-readable title. Some agents show this instead of the name. */
  title?: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    [k: string]: unknown;
  };
  annotations?: WebMCPAnnotations;
  /**
   * Execute the tool. Returned value is serialized via `JSON.stringify` and
   * wrapped in `{ content: [{ type: "text", text }] }` before being given
   * back to the agent. Throw to signal an error.
   */
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface WebMCPContentPart {
  type: "text";
  text: string;
}

export interface WebMCPContent {
  content: WebMCPContentPart[];
  isError?: boolean;
}

export interface WebMCPExecuteContext {
  /** AbortSignal tied to the call. The tool should respect it for long ops. */
  signal?: AbortSignal;
}

export interface WebMCPModelContext {
  registerTool(
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema: WebMCPToolDefinition["inputSchema"];
      annotations?: WebMCPAnnotations;
      execute: (
        input: Record<string, unknown>,
        client?: WebMCPExecuteContext
      ) => Promise<WebMCPContent> | WebMCPContent;
    },
    options?: { signal?: AbortSignal }
  ): Promise<void>;
  /** Return the list of tools currently registered on this document. */
  getTools(): Promise<
    Array<Pick<WebMCPToolDefinition, "name" | "title" | "description" | "inputSchema">>
  >;
  /** Manually execute a registered tool by name. Optional, not all impls ship it. */
  executeTool?(name: string, input: string): Promise<WebMCPContent>;
}

declare global {
  interface Document {
    modelContext?: WebMCPModelContext;
  }
}

export {};
