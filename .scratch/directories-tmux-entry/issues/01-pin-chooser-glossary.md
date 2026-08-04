# 01 — Pin "Chooser" in the glossary

**What to build:** The CONTEXT.md glossary gains a canonical definition of
**Chooser** — the nested, unranked list a secondary Action opens (the
directories Provider's sub-menu) — and its boundary against **Prompt**. The
feature's core term gets a single meaning, so the remaining tickets can speak
the vocabulary instead of inventing it.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] CONTEXT.md defines **Chooser** with an _Avoid_ list, in the format the
      existing glossary entries use
- [x] The definition distinguishes the Chooser from the **Prompt** (a
      one-line answer in place) and from a **Surface** (its own entry point),
      so a future reader cannot blur the three
- [x] The definition is consistent with how the directories Provider has used
      the word in its module since ticket 12 — no retroactive renaming
- [ ] Landed as its own commit, so the feature's later diffs carry no glossary
      noise
