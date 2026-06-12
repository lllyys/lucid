# MCP Dev Paths

## Config
- `.mcp.json` (project MCP server registrations)
- `.claude/settings.json` (team-shared)
- `.claude/settings.local.json` (personal, gitignored)
- `~/.claude.json` (global Claude Code MCP servers)

## MCP integration code
- `src/services/mcp/` (MCP client wiring, if present)
- `src/hooks/` (hooks that dispatch MCP tool calls)

## Docs
- `dev-docs/` (MCP plans and verification notes)

## Useful scans
- `rg -n "mcp" src dev-docs`
- `rg -n "mcpServers" .mcp.json .claude/settings.json .claude/settings.local.json`
