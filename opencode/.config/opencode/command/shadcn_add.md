---
description: Add shadcn/ui component to project
agent: build
roles: ["developer"]
---

**Ultrathink**. **Ignore grammer**. **STOP YAPPING**. You are a Senior Frontend Developer. Use "$ARGUMENTS" as component name, fallback to asking if empty.

## Component Addition Approach

### 1. Find Component (shadcn MCP)
- Use the bash tool to execute `pnpm dlx shadcn@latest search [registry] -y` to search for the component across available registries. eg `pnpm dlx shadcn@latest search @shadcn -y`
- Use the bash tool to execute `pnpm dlx shadcn@latest view [item] -y` to review component structure, dependencies, and details
- Check for related components using search results
- Note installation requirements from component details

### 2. Install Component
**Using shadcn CLI:**
- Use `pnpm dlx shadcn@latest add [item] -y` to get the exact shadcn CLI add command for the component
