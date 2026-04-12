---
name: tea-create-issue
displayName: Create Forgejo issue
description: Create a Forgejo issue by using user provided instructions and also by exploring the current codebase.
version: 1.0.0
author: Jehad
tags: [forgejo, issues, management]
---
# Instructions
1. Only include title and description for the issue.
2. First, identify the correct login and repo by running:
```bash
# List configured Forgejo logins
tea login list

# List repos available under the active login
tea repos list
```
3. Use the `tea` CLI to create the issue:
```bash
tea issues create --repo <owner>/<repo> --title "test issue title" --description "test issue description" --login <login-name>
```
4. If the title and description of the issue are not clear enough, gather information by exploring the codebase and asking user follow up questions.

# Requirements
1. Only create a plan and ask the user if they would like to change anything. Until proceeds.
2. When asked to proceed only create the Forgejo issue and exit. Don't do anything else.

# Reference Commands
| Command | Description |
|---|---|
| `tea login list` | List all configured Forgejo/Gitea logins |
| `tea repos list` | List repos for the active login |
| `tea issues list --repo <owner>/<repo>` | List existing issues in a repo |
| `tea issues create ...` | Create a new issue |
