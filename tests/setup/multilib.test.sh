#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
setup_dir="$repo_root/setup/arch-workstation/setup-packages"
test_dir=$(mktemp -d)
trap 'rm -rf -- "$test_dir"' EXIT

mkdir "$test_dir/bin"
cat >"$test_dir/bin/sudo" <<'SH'
#!/usr/bin/env bash
exec "$@"
SH
cat >"$test_dir/bin/pacman" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$TRACE"
exit "${MOCK_PACMAN_STATUS:-0}"
SH
chmod +x "$test_dir/bin/"*
export PATH="$test_dir/bin:$PATH"
export DOTFILES_PACMAN_CONF="$test_dir/pacman.conf"
export TRACE="$test_dir/trace"

assert_enabled() {
    pacman-conf --config "$DOTFILES_PACMAN_CONF" --repo-list | grep -qx multilib
}

cat >"$DOTFILES_PACMAN_CONF" <<'CONF'
[options]
Architecture = auto
#[multilib-testing]
#Include = /etc/pacman.d/mirrorlist
#[multilib]
#Include = /etc/pacman.d/mirrorlist
CONF
cp "$DOTFILES_PACMAN_CONF" "$test_dir/original"
"$setup_dir/setup-multilib" >/dev/null
assert_enabled
cmp "$test_dir/original" "$DOTFILES_PACMAN_CONF.multilib.bak"
head -n 6 "$DOTFILES_PACMAN_CONF" | cmp "$test_dir/original" -
[[ $(cat "$TRACE") == "--config $DOTFILES_PACMAN_CONF -Syu --noconfirm" ]]

cp "$DOTFILES_PACMAN_CONF" "$test_dir/enabled"
"$setup_dir/setup-multilib" >/dev/null
cmp "$test_dir/enabled" "$DOTFILES_PACMAN_CONF"
cmp "$test_dir/original" "$DOTFILES_PACMAN_CONF.multilib.bak"
[[ $(wc -l <"$TRACE") == 2 ]]

printf '[options]\nArchitecture = auto' >"$DOTFILES_PACMAN_CONF"
"$setup_dir/setup-multilib" >/dev/null
assert_enabled

printf '[multilib]\nServer = https://example.invalid/packages\n' >"$test_dir/repos.conf"
printf '[options]\nInclude = %s\n' "$test_dir/repos.conf" >"$DOTFILES_PACMAN_CONF"
cp "$DOTFILES_PACMAN_CONF" "$test_dir/included"
"$setup_dir/setup-multilib" >/dev/null
cmp "$test_dir/included" "$DOTFILES_PACMAN_CONF"
assert_enabled

printf '[options]\nArchitecture = auto\n' >"$DOTFILES_PACMAN_CONF"
export MOCK_PACMAN_STATUS=1
if "$setup_dir/setup-steam" >/dev/null 2>&1; then
    echo "Steam setup ignored the failed upgrade." >&2
    exit 1
fi
assert_enabled
[[ $(tail -n 1 "$TRACE") == "--config $DOTFILES_PACMAN_CONF -Syu --noconfirm" ]]
unset MOCK_PACMAN_STATUS
cp "$DOTFILES_PACMAN_CONF" "$test_dir/after-failure"
"$setup_dir/setup-multilib" >/dev/null
cmp "$test_dir/after-failure" "$DOTFILES_PACMAN_CONF"

printf '[options]\nInclude = %s/missing\n' "$test_dir" >"$DOTFILES_PACMAN_CONF"
cp "$DOTFILES_PACMAN_CONF" "$test_dir/invalid"
trace_lines=$(wc -l <"$TRACE")
if "$setup_dir/setup-multilib" >/dev/null 2>&1; then
    echo "Multilib setup accepted an invalid config." >&2
    exit 1
fi
cmp "$test_dir/invalid" "$DOTFILES_PACMAN_CONF"
[[ $(wc -l <"$TRACE") == "$trace_lines" ]]

echo "Passed: enable, preserve, rerun, missing block, included repo, failed upgrade/retry, invalid config."
