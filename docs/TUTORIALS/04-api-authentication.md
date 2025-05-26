# Tutorial 4: Handling Authentication with Your API

Many APIs require authentication (e.g., API keys, Bearer tokens) to access their resources. AgentB allows you to securely connect your agents to these protected APIs.

**Goal**: Modify the AgentB server to handle an API that requires a Bearer token, and demonstrate how the `AgentB` facade can manage request-specific authentication.

## Prerequisites

*   Completed [Tutorial 2: Connecting AgentB to Your API](./02-agent-with-your-api.md).
*   You have an API endpoint that requires a Bearer token (or you can simulate one). For this tutorial, we'll conceptually use a "secure" version of a service.

## The Challenge: Dynamic Authentication

Often, the authentication token (like a user-specific Bearer token) isn't static. It might come from:
*   A user's session.
*   An HTTP `Authorization` header in the request made *to your AgentB server*.
*   A secure vault or configuration specific to the user making the request.

AgentB's `AgentB.getExpressStreamingHttpHandler` (and its core logic) supports a powerful `authorizeRequest` callback that can return `PerProviderAuthOverrides`. This allows your AgentB server to dynamically provide authentication details for *specific tool providers* on a per-request basis.

## Step 1: Modify Your OpenAPI Specification (Conceptual)

Let's assume you have an OpenAPI specification for a "My Secure Service" that requires a Bearer token.

**`specs/my-secure-service.json` (Conceptual Excerpt):**
```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "My Secure Service",
    "version": "1.0.0"
  },
  "servers": [{ "url": "https://api.mysecure.service/v1" }], // Replace with actual URL
  "components": {
    "securitySchemes": {
      "BearerAuth": { // Define the security scheme
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT" // Optional, but good practice
      }
    }
  },
  "security": [ // Apply the security scheme globally or per-operation
    {
      "BearerAuth": []
    }
  ],
  "paths": {
    "/data": {
      "get": {
        "summary": "Get some secure data",
        "operationId": "getSecureData",
        "responses": {
          "200": { "description": "Secure data retrieved" }
          // ...
        }
        // If this operation needed specific scopes, they'd be listed under "BearerAuth" here.
      }
    }
  }
}
```
The key parts are `components.securitySchemes` defining `BearerAuth` and the top-level `security` applying it.

## Step 2: Update Your AgentB Server

We'll modify the `server.ts` from previous tutorials.

```typescript title="server.ts (Updated for Auth)"
import * // ... your existing imports ...
import { AgentB, ToolProviderSourceConfig, LLMMessage, PerProviderAuthOverrides } from '@ulifeai/agentb'; // Add PerProviderAuthOverrides

// ... (Express app setup, CORS, etc. as before) ...

async function startServer() {
  // ... (AgentB.initialize as before) ...
  AgentB.initialize({
    llmProvider: { provider: 'openai', model: 'gpt-4o-mini' },
  });

  // 1. Register your "My Secure Service"
  let mySecureServiceSpec;
  const fs = require('fs'); // Make sure to require fs and path
  const path = require('path');
  try {
    // Assume specs/my-secure-service.json exists
    const specPath = path.join(__dirname, '../specs/my-secure-service.json'); // Adjust path
    const specFileContent = fs.readFileSync(specPath, 'utf-8');
    mySecureServiceSpec = JSON.parse(specFileContent);

    const secureApiProviderConfig: ToolProviderSourceConfig = {
      id: 'mySecureService', // This ID is crucial for auth overrides
      type: 'openapi',
      openapiConnectorOptions: {
        spec: mySecureServiceSpec,
        sourceId: 'mySecureService', // Match the 'id' above
        // Static authentication can be a fallback or placeholder
        // We will override this dynamically per request.
        authentication: {
          type: 'bearer',
          token: '' // Static token is empty, expecting override
        }
      },
      toolsetCreationStrategy: 'allInOne',
      allInOneToolsetName: 'SecureServiceTools'
    };
    AgentB.registerToolProvider(secureApiProviderConfig);
    console.log("🛠️ Registered My Secure Service Tool Provider.");

  } catch (error) {
    console.error("❌ Failed to load or register My Secure Service spec:", error);
    console.log("Ensure 'specs/my-secure-service.json' exists and is valid for this tutorial.");
  }

  // 2. Update the HTTP Handler with `authorizeRequest`
  app.post('/agent/stream', AgentB.getExpressStreamingHttpHandler({
    getThreadId: async (req: Request, threadStorage) => { /* ... as before ... */
      const requestedThreadId = req.body.threadId || req.query.threadId as string;
      if (requestedThreadId) {
        const threadExists = await threadStorage.getThread(requestedThreadId);
        if (threadExists) return requestedThreadId;
      }
      const newThread = await threadStorage.createThread({ title: `Web Chat ${new Date().toISOString()}` });
      return newThread.id;
    },
    getUserMessage: async (req: Request) => req.body.prompt,

    // ⭐ New: authorizeRequest callback
    authorizeRequest: async (req: Request, threadId: string): Promise<boolean | PerProviderAuthOverrides> => {
      console.log(`[Auth] Authorizing request for thread: ${threadId}, path: ${req.path}`);

      const overrides: PerProviderAuthOverrides = {};
      let isAuthorized = false; // Start with not authorized

      // Example: Extract Bearer token from Authorization header
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7); // Remove "Bearer " prefix
        console.log(`[Auth] Found Bearer token in request for 'mySecureService'.`);

        // Provide this token specifically for the 'mySecureService' provider
        overrides['mySecureService'] = {
          type: 'bearer',
          token: token,
        };
        isAuthorized = true; // Request is authorized if token is present
      } else {
        console.warn("[Auth] No Bearer token found in Authorization header for 'mySecureService'. This provider might fail if it requires auth.");
        // Depending on your app's logic:
        // - You might still return `true` if the request is generally allowed but the tool might fail.
        // - Or, if the token is absolutely required for any useful interaction with this provider,
        //   you could return `false` here to deny the request outright.
        // For this example, we'll allow the request to proceed, and the tool call will likely fail if auth is truly needed by the API.
        // If NO auth mechanism is found for a provider that needs it, but other providers can be used,
        // you might still return true or the overrides object.
        // If *this specific request requires* the secure service and auth is missing, then return false.
        // For simplicity, if the prompt indicates secure data is needed and no token, we could deny.
        if (req.body.prompt?.toLowerCase().includes("secure data") && !isAuthorized) {
            console.log("[Auth] Prompt asks for secure data but no token. Denying.");
            return false; // Deny the request
        }
        isAuthorized = true; // Allow general chat even if secure token is missing for some tools
      }

      // Add logic for other providers if needed:
      // const apiKey = req.headers['x-another-api-key'] as string;
      // if (apiKey) {
      //   overrides['anotherProviderId'] = { type: 'apiKey', name: 'X-API-KEY', in: 'header', key: apiKey };
      //   isAuthorized = true; // If any auth is successful
      // }

      if (!isAuthorized && Object.keys(overrides).length === 0) {
        // If no auth mechanisms were successful for any provider needing auth,
        // and the request is deemed unauthorized overall.
        // This logic depends on your application's requirements.
        // For this example, we made `isAuthorized = true` if *any* auth for *any* provider was found,
        // or even if no auth was found but it's not strictly required for *this request*.
      }
      
      // If the request is authorized to proceed:
      // - Return `true` if no dynamic overrides are needed (static config will be used).
      // - Return the `overrides` object if dynamic auth details were determined.
      // - Return `false` to deny the request (e.g., HTTP 403 Forbidden).
      return Object.keys(overrides).length > 0 ? overrides : isAuthorized;
    },
  }));

  // ... (Error handler and app.listen as before) ...
  app.listen(PORT, () => {
    console.log(`✅ AgentB Express server (with Auth) listening on port ${PORT}`);
    // ...
  });
}

startServer().catch(console.error);
```

## Step 3: Test the Authenticated Endpoint

1.  **Restart** your AgentB server (`node server.js` or `npx ts-node server.ts`).
2.  Use `curl` or Postman to interact.

**Scenario 1: No Authentication Token**

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Can you fetch my secure data?"}' \
  http://localhost:3001/agent/stream \
  --no-buffer
```

**Expected Server Logs (Conceptual):**
```text
[Auth] Authorizing request for thread: ..., path: /agent/stream
[Auth] No Bearer token found in Authorization header for 'mySecureService'. ...
[Auth] Prompt asks for secure data but no token. Denying.
```
*(The client would receive an HTTP error, likely 403 Forbidden, or whatever your `AgentB.getExpressStreamingHttpHandler` sends when `authorizeRequest` returns `false`)*.
*If `authorizeRequest` returned `true` instead of `false` in this case, the flow would continue, and the LLM might try to use the tool. The actual API call by `OpenAPIConnector` would then fail if the (empty) static token isn't valid for "My Secure Service".*

**Scenario 2: With a Valid (or placeholder) Authentication Token**

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACTUAL_OR_PLACEHOLDER_TOKEN" \
  -d '{"prompt":"Please get my secure data using the mySecureService tools."}' \
  http://localhost:3001/agent/stream \
  --no-buffer
```
Replace `YOUR_ACTUAL_OR_PLACEHOLDER_TOKEN` with a token.

**Expected Server Logs (Conceptual):**
```text
[Auth] Authorizing request for thread: ..., path: /agent/stream
[Auth] Found Bearer token in request for 'mySecureService'.
... (AgentB event stream starts) ...
[LLM Intends to Call Tool: mySecureService_getSecureData with args: {}]
[Tool Executing: mySecureService_getSecureData with input {}...]
... (OpenAPIConnector will use the provided token for the API call) ...
[Tool Result (mySecureService_getSecureData) -> Success: true] (if API call succeeds)
```

**Expected Client Output (`curl`):**
You'll see the usual AgentB event stream. If the API call made by the `mySecureService_getSecureData` tool is successful (because the token was valid for the target API), the agent will receive the data and formulate a response. If the token is invalid for the *actual* "My Secure Service" API, the tool execution will fail, and the agent will report that.

## Key Takeaways

*   **`authorizeRequest` Callback**: This function in `AgentB.getExpressStreamingHttpHandler(options)` is your central point for request-level authorization and dynamic authentication.
*   **`PerProviderAuthOverrides`**: The `authorizeRequest` callback can return this object. The keys are the `id`s you defined in your `ToolProviderSourceConfig` (e.g., `'mySecureService'`). The values are `ConnectorAuthentication` objects (`{ type: 'bearer', token: '...' }`, `{ type: 'apiKey', ... }`, etc.).
*   **Dynamic Token Injection**: `OpenAPIConnector` (used internally by AgentB for OpenAPI tools) will pick up these dynamic overrides for the specific API call, overriding any static authentication configured for that provider.
*   **Security**: Your AgentB server acts as a secure gateway. Client applications send requests *to your server*, which then securely attaches the necessary credentials before the agent's tools call the downstream APIs. **Never expose raw user tokens directly to the LLM or store them insecurely.**

This pattern is powerful for multi-tenant applications or scenarios where each user request to your AgentB server might need to use different credentials for the underlying tools/APIs.

**Next Up**: [Creating a Custom Tool](./05-custom-tool.md) that doesn't rely on an OpenAPI specification. 