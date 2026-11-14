# session-tree

Experimental Claude Code mod for navigating the current session's conversations.
Run `/sessions` to open the pane. It also opens after `/btw` and `/fork`, and
refreshes once a second while open. In a fullscreen terminal at least 110 columns
wide it docks beside the conversation; Claude places it above the prompt in
smaller terminals and scrollback mode.

The main session stays first, with branches nested under their parents. Click a
name to switch the transcript and direct subsequent messages there; click **Main
session** to return. The pane stays open across switches. Claude controls which
conversations can be viewed; a refusal appears in the pane.

**Stop & close** calls Claude's `TaskStop` tool for that one live branch, then
hides its row. Closing the branch currently in view returns to main. **Hide**
only hides a finished branch. Children remain listed, and **Show hidden** restores
hidden rows without restarting anything. Neither action deletes transcripts.
Closing the pane itself stops polling and leaves branches running. You can also
close it with `/sessions close`.

## Current limits

This uses the installed Claude Code 2.1.319 mod API. Its `agent.list()` includes
background forks, subagents and teammates in this process, with parent IDs and
statuses. Some listed teammates may run elsewhere and refuse navigation.
A plain `/btw` side question is a temporary dialog, not a navigable agent. Turn
it into a fork using Claude's own fork action to give it a row here. Independent
sessions created through a new terminal, `/branch`, or `--fork-session` are not
part of this tree. Engine-owned tasks can disappear from the list after ending;
this prototype does not maintain a transcript archive.

This adds a navigation pane; it leaves Claude's built-in task arrows available.
The mod API does not expose a way to remove those controls. Hidden rows are
session-local. The engine places the dock; this mod cannot choose its side.

## Try it

From the dotfiles repository:

```sh
claude --plugin-dir "$PWD/claude/.claude/mods/session-tree"
```

Then run `/sessions`, create a branch with `/fork`, and select its name. The
prototype is loaded for that invocation only. It is not enabled in user settings.

## Checks

```sh
claude plugin validate claude/.claude/mods/session-tree
claude plugin test claude/.claude/mods/session-tree
```

Tests run the real mod engine and UI descriptions on terminal and desktop,
with host task records mocked. They cover nesting, switching, targeted stopping,
refusals, hiding, updates and polling cleanup. They do not verify terminal
painting or make model requests to create real branches.
