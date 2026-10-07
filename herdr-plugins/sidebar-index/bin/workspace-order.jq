(.result.workspaces // .workspaces) as $workspaces
| reduce $workspaces[] as $workspace (
    {seen: [], ordered: []};
    $workspace.worktree.repo_key as $key
    | (if $key == null then [] else
        [$workspaces[] | select(.worktree.repo_key == $key)]
       end) as $members
    | ([$members[] | select(.worktree.is_linked_worktree == false)][0]) as $parent
    | if ($members | length) < 2 or $parent == null then
        .ordered += [$workspace]
      elif (.seen | index($key)) == null then
        .seen += [$key]
        | .ordered += [$parent] + [$members[] | select(.workspace_id != $parent.workspace_id)]
      else . end
  )
| .ordered
