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
2. Use the `tea` CLI to create the issue:
```bash
tea issues create --title "test issue title" --description "test issue description" 
```
3. If the title and description of the issue are not clear enough, gather information by exploring the codebase and asking user follow up questions.

# Requirements
1. Only create a plan and ask the user if they would like to change anything. Until proceeds.
3. Always use present tense for verbs instead of past tense. eg: not updated -> update, not created -> create etc.
2. When asked to proceed only create the Forgejo issue by executing the cli command and exit. Don't do anything else.
