#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
test_tmp=$(mktemp -d)
trap 'rm -rf "$test_tmp"' EXIT

fake_bin="$test_tmp/bin"
root="$test_tmp/root"
setup="$ROOT/setup/arch-hyprland/setup-packages/setup-sudo-tries"
mkdir -p "$fake_bin" "$root/etc/pam.d" "$root/etc/security" \
    "$root/etc/sudoers.d"

cat >"$fake_bin/visudo" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "$fake_bin/visudo"

run_policy() {
    PATH="$fake_bin:$PATH" \
    DF_AUTH_ROOT="$root" \
    "$setup"
}

write_fixture() {
    printf '%s\n' \
        '# local faillock settings' \
        '# deny = 3' \
        '# unlock_time = 600' \
        'audit' \
        'fail_interval = 45' \
        >"$root/etc/security/faillock.conf"
    printf '%s\n' \
        '#%PAM-1.0' \
        'auth       required                    pam_faillock.so      preauth' \
        '-auth      [success=2 default=ignore]  pam_systemd_home.so' \
        'auth       [success=1 default=bad]     pam_unix.so          try_first_pass nullok' \
        'auth       [default=die]               pam_faillock.so      authfail' \
        'auth       optional                    pam_permit.so' \
        'auth       required                    pam_env.so' \
        'auth       required                    pam_faillock.so      authsucc' \
        'account    required                    pam_unix.so' \
        >"$root/etc/pam.d/system-auth"
    printf '%s\n' \
        '#%PAM-1.0' \
        'auth        required    pam_env.so' \
        'auth        required    pam_faillock.so preauth' \
        'auth        required    pam_shells.so' \
        'auth        required    pam_nologin.so' \
        'auth        required    pam_permit.so' \
        '-auth       optional    pam_gnome_keyring.so' \
        '-password   optional    pam_gnome_keyring.so' \
        'account     include     system-local-login' \
        >"$root/etc/pam.d/sddm-autologin"
}

write_fixture
run_policy

grep -Fx 'deny = 10' "$root/etc/security/faillock.conf" >/dev/null
grep -Fx 'unlock_time = 120' "$root/etc/security/faillock.conf" >/dev/null
grep -Fx 'audit' "$root/etc/security/faillock.conf" >/dev/null
grep -Fx 'fail_interval = 45' "$root/etc/security/faillock.conf" >/dev/null
[[ $(grep -Ec '^[[:space:]]*deny[[:space:]]*=' "$root/etc/security/faillock.conf") == 1 ]]
[[ $(grep -Ec '^[[:space:]]*unlock_time[[:space:]]*=' "$root/etc/security/faillock.conf") == 1 ]]
grep -F 'pam_faillock.so preauth silent deny=10 unlock_time=120' \
    "$root/etc/pam.d/system-auth" >/dev/null
grep -F 'pam_faillock.so authfail deny=10 unlock_time=120' \
    "$root/etc/pam.d/system-auth" >/dev/null
[[ $(grep -Ec '^[[:space:]]*auth[[:space:]]+.*pam_faillock\.so.*preauth' \
    "$root/etc/pam.d/system-auth") == 1 ]]
[[ $(grep -Ec '^[[:space:]]*auth[[:space:]]+.*pam_faillock\.so.*authfail' \
    "$root/etc/pam.d/system-auth") == 1 ]]
[[ $(grep -Ec '^[[:space:]]*auth[[:space:]]+.*pam_faillock\.so.*authsucc' \
    "$root/etc/pam.d/system-auth") == 1 ]]
[[ $(grep -Ec '^[[:space:]]*auth[[:space:]]+.*pam_faillock\.so.*preauth' \
    "$root/etc/pam.d/sddm-autologin") == 0 ]]
[[ $(grep -Ec '^[[:space:]]*auth[[:space:]]+.*pam_faillock\.so.*authsucc' \
    "$root/etc/pam.d/sddm-autologin") == 1 ]]
grep -Fx 'Defaults passwd_tries=10' "$root/etc/sudoers.d/passwd-tries" >/dev/null

backup_root="$root/var/lib/dotfiles/auth-backups"
backup_dir=$(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -print -quit)
[[ -n $backup_dir ]]
grep -F '# deny = 3' "$backup_dir/faillock.conf" >/dev/null
grep -F 'pam_faillock.so      preauth' "$backup_dir/system-auth" >/dev/null
grep -F 'pam_faillock.so preauth' "$backup_dir/sddm-autologin" >/dev/null

cp "$root/etc/pam.d/system-auth" "$test_tmp/system-auth.before-rerun"
cp "$root/etc/pam.d/sddm-autologin" "$test_tmp/sddm.before-rerun"
cp "$root/etc/security/faillock.conf" "$test_tmp/faillock.before-rerun"
run_policy
cmp "$test_tmp/system-auth.before-rerun" "$root/etc/pam.d/system-auth"
cmp "$test_tmp/sddm.before-rerun" "$root/etc/pam.d/sddm-autologin"
cmp "$test_tmp/faillock.before-rerun" "$root/etc/security/faillock.conf"
[[ $(grep -Ec '^[[:space:]]*auth[[:space:]]+.*pam_faillock\.so.*preauth' \
    "$root/etc/pam.d/sddm-autologin") == 0 ]]
[[ $(grep -Ec '^[[:space:]]*auth[[:space:]]+.*pam_faillock\.so.*authsucc' \
    "$root/etc/pam.d/sddm-autologin") == 1 ]]

write_fixture
printf '%s\n' 'deny = 7' 'unlock_time = 900' 'audit' 'fail_interval = 30' \
    >"$root/etc/security/faillock.conf"
run_policy
grep -Fx 'deny = 10' "$root/etc/security/faillock.conf" >/dev/null
grep -Fx 'unlock_time = 120' "$root/etc/security/faillock.conf" >/dev/null
grep -Fx 'audit' "$root/etc/security/faillock.conf" >/dev/null
grep -Fx 'fail_interval = 30' "$root/etc/security/faillock.conf" >/dev/null
[[ $(grep -Ec '^[[:space:]]*deny[[:space:]]*=' "$root/etc/security/faillock.conf") == 1 ]]
[[ $(grep -Ec '^[[:space:]]*unlock_time[[:space:]]*=' "$root/etc/security/faillock.conf") == 1 ]]

write_fixture
printf '%s\n' \
    '#%PAM-1.0' \
    'auth required pam_faillock.so preauth' \
    'auth required pam_faillock.so unknown' \
    'auth [default=die] pam_faillock.so authfail' \
    'auth optional pam_permit.so' \
    >"$root/etc/pam.d/system-auth"
cp "$root/etc/security/faillock.conf" "$test_tmp/malformed-faillock"
cp "$root/etc/pam.d/system-auth" "$test_tmp/malformed-system-auth"
cp "$root/etc/pam.d/sddm-autologin" "$test_tmp/malformed-sddm"
backup_count_before=$(find "$root/var/lib/dotfiles/auth-backups" \
    -mindepth 1 -maxdepth 1 -type d | wc -l)
if run_policy 2>"$test_tmp/malformed.err"; then
    echo "unknown PAM structure was accepted" >&2
    exit 1
fi
cmp "$test_tmp/malformed-faillock" "$root/etc/security/faillock.conf"
cmp "$test_tmp/malformed-system-auth" "$root/etc/pam.d/system-auth"
cmp "$test_tmp/malformed-sddm" "$root/etc/pam.d/sddm-autologin"
backup_count_after=$(find "$root/var/lib/dotfiles/auth-backups" \
    -mindepth 1 -maxdepth 1 -type d | wc -l)
[[ $backup_count_before == "$backup_count_after" ]]
grep -F 'unknown' "$test_tmp/malformed.err" >/dev/null

echo "PASS: system authentication lockout policy"
