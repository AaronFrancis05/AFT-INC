# Epic: API and MCP integrations

Back to the [scope index](index.md).

Customers and their AI agents use AFT and their subscribed projects from their own apps, through API keys and MCP. Edge case IDs refer to the catalog in [PLAN.md](../../PLAN.md).

## Slice 6: API and MCP

### 75. API gateway routing and key auth · needs a decision · GA
One front door for the APIs of subscribed projects.
**Done when:** a valid key with the right entitlement reaches the project's API; a down or slow project fails fast with an error that names it (M3).
- [ ] Design it (spec): `/architect api gateway routing and key auth`

### 76. Gateway rate limits and metering · needs a decision · GA
Fair use and accurate billing on every API call.
**Done when:** each key and workspace has limits with clean 429 responses (X7), and every call, allowed or rejected, produces a usage event (M8).
- [ ] Design it (spec): `/architect gateway rate limits and metering`

### 77. MCP server foundation · needs a decision · GA
AFT's own MCP server, reachable by any MCP client with secure sign in.
**Done when:** an MCP client connects over the standard HTTP transport, signs in through OAuth, refreshes or re authorizes when a token expires or is revoked (M1), and unsupported protocol versions are refused cleanly (M7).
- [ ] Design it (spec): `/architect mcp server foundation`

### 78. MCP catalog and account tools · needs a decision · GA
Tools to browse projects, check subscriptions, and read usage.
**Done when:** the tools return correct data for the signed in workspace, and an exhausted entitlement returns a structured error with an upgrade link, never a crash or a partial charge (M2).
- [ ] Design it (spec): `/architect mcp catalog and account tools`

### 79. MCP job tools · needs a decision · GA
Start long running work (generations, deploys) and follow it from an agent.
**Done when:** long tools return a job id at once with progress updates and a status tool (M4), and media results come back as links, never inline blobs (M5).
- [ ] Design it (spec): `/architect mcp job tools`

### 80. Project MCP gateway · needs a decision · GA
Subscribed projects' own MCP servers are reachable through AFT.
**Done when:** only reviewed, allowlisted tools from each project are exposed, with their descriptions pinned per version (M6); entitlement is checked and use is metered; a down project fails fast with its name (M3).
- [ ] Design it (spec): `/architect project mcp gateway`

### 81. Connections UI · needs a decision
Customers connect their AI tools and apps in a few clicks.
**Done when:** the dashboard shows ready to paste setup for common MCP clients, lists connected clients, and lets the user revoke each one.
- [ ] Design it (spec): `/architect connections ui`

### 82. Developer docs · needs a decision
Public docs for the API, MCP tools, and the integration contract.
**Done when:** docs cover authentication, every API endpoint and MCP tool with examples, errors, and limits, and they are generated from the real definitions so they cannot drift.
- [ ] Design it (spec): `/architect developer docs`
