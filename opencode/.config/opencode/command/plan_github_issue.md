---
  agent: plan
---

 **ULTRA THINK**. **IGNORE GRAMMAR**. **STOP YAPPING**. Now Analyze codebase then create plan to complete the github issue. Use the bash tool to execute `gh issue view $ARGUMENTS \
  --json author,body,comments,labels,title \
  --template '
Title: {{.title}}
Author: {{.author.login}}
Labels:
{{range .labels}}- {{.name}}
{{end}}
Body:
{{.body}}
Comments:
{{range .comments}}
[{{.author.login}}]: {{.body}}
{{end}}
'` to fetch the issue details.
