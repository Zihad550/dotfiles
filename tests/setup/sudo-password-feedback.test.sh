#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
test_tmp="$(mktemp -d)"
trap 'rm -rf "$test_tmp"' EXIT

fake_bin="$test_tmp/bin"
sudoers_dir="$test_tmp/etc/sudoers.d"
setup="$ROOT/setup/common/setup-sudo-password-feedback"
mkdir -p "$fake_bin"

cat >"$fake_bin/visudo" <<'EOF'
#!/usr/bin/env bash
[[ ${FAIL_VISUDO:-0} != 1 ]]
EOF
chmod +x "$fake_bin/visudo"

run_setup() {
    PATH="$fake_bin:$PATH" DF_SUDOERS_DIR="$sudoers_dir" "$setup"
}

run_setup

sudoers_file="$sudoers_dir/password-feedback"
grep -Fx '# Managed by dotfiles setup/common/setup-sudo-password-feedback.' "$sudoers_file" >/dev/null
grep -Fx 'Defaults pwfeedback' "$sudoers_file" >/dev/null
[[ $(stat -c '%a' "$sudoers_file") == 440 ]]

chmod u+w "$sudoers_file"
printf '%s\n' 'stale content' >"$sudoers_file"
run_setup
grep -Fx 'Defaults pwfeedback' "$sudoers_file" >/dev/null
if grep -F 'stale content' "$sudoers_file" >/dev/null; then
    echo "stale sudoers content was preserved" >&2
    exit 1
fi

cp "$sudoers_file" "$test_tmp/before-invalid"
if FAIL_VISUDO=1 run_setup 2>/dev/null; then
    echo "invalid sudoers configuration was installed" >&2
    exit 1
fi
cmp "$test_tmp/before-invalid" "$sudoers_file"

expected_call="run_step \"sudo password feedback\" \"\$DOTFILES_DIR/setup/common/setup-sudo-password-feedback\""
for init in setup/arch-workstation/init setup/arch-devbox/init; do
    grep -F "$expected_call" "$ROOT/$init" >/dev/null
done

echo "PASS: sudo password feedback"
