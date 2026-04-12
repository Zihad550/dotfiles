---
name: tea-get-issue
displayName: Get Forgejo issue information
description: Get Forgejo issue information by using the provided issue id and the tea CLI
version: 1.0.0
author: Jehad
tags: [forgejo, issues, management]
---

# Instructions
1. First, identify the correct login and repo by running:
```bash
# List configured Forgejo logins
tea login list

# List repos available under the active login
tea repos list
```
2. Use the `tea` CLI to get issue information:
```bash
# Get basic issue info
tea issues get <issue-id> --repo <owner>/<repo> --login <login-name>

# Get issue comments
tea issues get <issue-id> --repo <owner>/<repo> --login <login-name> --comments
```
3. Since `tea` does not support custom `--template` formatting like `gh`, combine both commands and present the output in this structured format manually:
```
Title: <title>
Author: <author>
Labels: <labels>
Body:
<body>
Comments:
[<author>]: <comment body>...
```

4. Don't hesitate to ask the user for information if you are uncertain about something (issue id, repo, login name).

# Requirements
1. Only get the issue information.
2. Ask the user what they want to do with it.

# Reference Commands
| Command | Description |
|---|---|
| `tea login list` | List all configured Forgejo/Gitea logins |
| `tea repos list` | List repos for the active login |
| `tea issues list --repo <owner>/<repo>` | List issues in a repo |
| `tea issues get <id> --repo <owner>/<repo>` | Get a specific issue |
| `tea issues get <id> --repo <owner>/<repo> --comments` | Get issue with comments |
