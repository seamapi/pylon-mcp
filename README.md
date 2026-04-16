# pylon-mcp

<img src="https://raw.githubusercontent.com/justinbeckwith/pylon-mcp/main/pylon-mcp.png" alt="pylon-mcp" width="400" />

MCP (Model Context Protocol) server for [Pylon](https://www.usepylon.com/) customer support platform.

## Installation

```bash
corepack enable
pnpm install
pnpm run build
```

## Configuration

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Pylon API token:
   ```
   PYLON_API_TOKEN=your_api_token_here
   ```

You can generate an API token from the [Pylon dashboard](https://app.usepylon.com/settings/api-tokens). Note: Only Admin users can create API tokens.

## Usage

### With Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "pylon": {
      "command": "node",
      "args": [
        "--env-file",
        "/path/to/pylon-mcp/.env",
        "/path/to/pylon-mcp/dist/index.js"
      ]
    }
  }
}
```

### With Claude Code

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "pylon": {
      "command": "node",
      "args": [
        "--env-file",
        "/path/to/pylon-mcp/.env",
        "/path/to/pylon-mcp/dist/index.js"
      ]
    }
  }
}
```

### With Claude Managed Agents

The server supports Streamable HTTP transport for use with [Claude Managed Agents](https://docs.anthropic.com/en/docs/agents-and-tools/managed-agents). This lets a managed agent connect to the server over HTTP instead of stdio.

#### 1. Start the server in HTTP mode

```bash
MCP_TRANSPORT=http PORT=3000 PYLON_API_TOKEN=your_token node dist/index.js
```

Or using the convenience script:

```bash
PYLON_API_TOKEN=your_token pnpm start:http
```

The server listens on `http://localhost:3000/mcp` by default. A `/health` endpoint is also available for monitoring. Deploy this to a host reachable by Anthropic's infrastructure (e.g. Fly, Railway, your cloud provider).

#### 2. Configure the managed agent

When creating your agent, declare the MCP server and include `mcp_toolset` in tools:

```python
agent = client.beta.agents.create(
    name="Pylon Support Agent",
    model="claude-opus-4-7",
    system="You are a customer support agent with access to Pylon.",
    mcp_servers=[
        {"type": "url", "name": "pylon", "url": "https://your-host/mcp"}
    ],
    tools=[
        {"type": "agent_toolset_20260401"},
        {"type": "mcp_toolset", "mcp_server_name": "pylon"},
    ],
)
```

#### 3. Start a session

```python
session = client.beta.sessions.create(
    agent=agent.id,
    environment_id=environment.id,
)
```

#### Environment variables

| Variable | Description | Default |
|---|---|---|
| `PYLON_API_TOKEN` | Pylon API token (required) | — |
| `MCP_TRANSPORT` | Transport mode: `stdio` or `http` | `stdio` |
| `PORT` | HTTP server port (only used when `MCP_TRANSPORT=http`) | `3000` |

## Available Tools

### Organization

- `pylon_get_organization` - Get information about your Pylon organization

### Accounts

- `pylon_list_accounts` - List all accounts with pagination
- `pylon_get_account` - Get a specific account by ID (includes custom fields)
- `pylon_create_account` - Create a new account (supports custom fields)
- `pylon_update_account` - Update an existing account (supports custom fields)
- `pylon_update_multiple_accounts` - Update multiple accounts at once (1-100), with owner, tags, and custom fields
- `pylon_delete_account` - Delete an account
- `pylon_search_accounts` - Search accounts with filters

### Contacts

- `pylon_list_contacts` - List all contacts with pagination
- `pylon_get_contact` - Get a specific contact by ID
- `pylon_create_contact` - Create a new contact
- `pylon_update_contact` - Update an existing contact
- `pylon_delete_contact` - Delete a contact
- `pylon_search_contacts` - Search contacts with filters

### Issues

- `pylon_list_issues` - List issues within a time range
- `pylon_get_issue` - Get a specific issue by ID
- `pylon_get_issue_body` - Get the full body content of an issue
- `pylon_create_issue` - Create a new issue/ticket
- `pylon_update_issue` - Update an existing issue (supports custom fields)
- `pylon_delete_issue` - Delete an issue
- `pylon_search_issues` - Search issues with filters
- `pylon_snooze_issue` - Snooze an issue until a specific time
- `pylon_get_issue_followers` - Get issue followers
- `pylon_update_issue_followers` - Add/remove issue followers
- `pylon_get_issue_threads` - Get all internal threads on an issue
- `pylon_create_issue_thread` - Create an internal thread on an issue

### Messages

- `pylon_get_issue_messages` - Get all messages on an issue
- `pylon_reply_to_issue` - Send a customer-facing reply on an issue
- `pylon_create_internal_note` - Post an internal note on an issue thread
- `pylon_redact_message` - Redact a message from an issue
- `pylon_delete_message` - Delete a message from an issue

### Tags

- `pylon_list_tags` - List all tags
- `pylon_get_tag` - Get a specific tag by ID
- `pylon_create_tag` - Create a new tag
- `pylon_update_tag` - Update an existing tag
- `pylon_delete_tag` - Delete a tag

### Teams

- `pylon_list_teams` - List all teams
- `pylon_get_team` - Get a specific team by ID
- `pylon_create_team` - Create a new team
- `pylon_update_team` - Update an existing team

### Knowledge Base

- `pylon_list_knowledge_bases` - List all knowledge bases
- `pylon_get_knowledge_base` - Get a knowledge base by ID
- `pylon_list_kb_collections` - List collections in a knowledge base
- `pylon_create_kb_collection` - Create a collection
- `pylon_delete_kb_collection` - Delete a collection
- `pylon_list_kb_articles` - List articles in a knowledge base
- `pylon_get_kb_article` - Get an article by ID
- `pylon_create_kb_article` - Create an article
- `pylon_update_kb_article` - Update an article
- `pylon_delete_kb_article` - Delete an article
- `pylon_create_kb_route_redirect` - Create a route redirect

## Requirements

- Node.js 24+
- Pylon API token (Admin access required)

## License

MIT
