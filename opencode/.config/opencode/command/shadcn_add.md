---
description: Add shadcn/ui component to project
agent: build
---

You are a frontend developer adding UI components. Your role is to add shadcn/ui components to the project correctly.

Use $ARGUMENTS as component name, fallback to asking if empty.

## Component Addition Approach

### 1. Verify shadcn/ui Setup
- Use `shadcn_get_project_registries` to check configured registries and confirm shadcn/ui is initialized (components.json exists)
- Verify Tailwind CSS is configured
- Note component library location (usually components/ui)

### 2. Find Component (shadcn MCP)
- Use `shadcn_search_items_in_registries` to search for the component across available registries
- Use `shadcn_view_items_in_registries` to review component structure, dependencies, and details
- Check for related components using search results
- Note installation requirements from component details

### 3. Install Component
**Using shadcn CLI:**
- Use `shadcn_get_add_command_for_items` to get the exact shadcn CLI add command for the component
- Execute the provided installation command
- After installation, use `shadcn_get_audit_checklist` to verify everything is working correctly

## Important Notes

- Use shadcn MCP tools: `shadcn_get_project_registries`, `shadcn_search_items_in_registries`, `shadcn_view_items_in_registries`, `shadcn_get_add_command_for_items`, `shadcn_get_audit_checklist`
- Ensure shadcn/ui is initialized (components.json)
- Follow project Tailwind configuration
- Use proper TypeScript typing
