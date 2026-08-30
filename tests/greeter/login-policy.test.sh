#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
test_tmp=$(mktemp -d)
trap 'rm -rf "$test_tmp"' EXIT

fake_bin="$test_tmp/bin"
root="$test_tmp/root"
passwd_fixture="$test_tmp/passwd"
calls="$test_tmp/calls.log"
mkdir -p "$fake_bin" "$root"

cat >"$fake_bin/getent" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

[[ ${1:-} == passwd ]] || exit 2
if (($# == 2)); then
    awk -F: -v name="$2" '$1 == name' "$GREETER_PASSWD_FIXTURE"
else
    cat "$GREETER_PASSWD_FIXTURE"
fi
SH

cat >"$fake_bin/id" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

[[ ${1:-} == -un ]] || exit 2
printf '%s\n' "$GREETER_INVOKER"
SH

cat >"$fake_bin/chown" <<'SH'
#!/usr/bin/env bash
printf 'chown %s\n' "$*" >>"$GREETER_CALLS"
SH

chmod +x "$fake_bin"/*

write_passwd() {
    printf '%s\n' \
        'root:x:0:0:root:/root:/bin/bash' \
        "$@" >"$passwd_fixture"
}

run_select() {
    PATH="$fake_bin:$PATH" \
    GREETER_PASSWD_FIXTURE="$passwd_fixture" \
    GREETER_INVOKER="${GREETER_INVOKER:-root}" \
    GREETER_CALLS="$calls" \
    DF_GREETER_ROOT="$root" \
    "$ROOT/setup/common/greeter/login-policy" --select
}

run_policy() {
    PATH="$fake_bin:$PATH" \
    GREETER_PASSWD_FIXTURE="$passwd_fixture" \
    GREETER_INVOKER="${GREETER_INVOKER:-root}" \
    GREETER_CALLS="$calls" \
    DF_GREETER_ROOT="$root" \
    "$ROOT/setup/common/greeter/login-policy"
}

write_passwd 'alice:x:1000:1000:Alice:/home/alice:/bin/bash' \
    'bob:x:1001:1001:Bob:/home/bob:/bin/bash'

selected=$(GREETER_USER=alice SUDO_USER='' GREETER_INVOKER=root run_select)
[[ $selected == alice ]]

selected=$(GREETER_USER='' SUDO_USER=alice GREETER_INVOKER=root run_select)
[[ $selected == alice ]]

selected=$(GREETER_USER='' SUDO_USER='' GREETER_INVOKER=alice run_select)
[[ $selected == alice ]]

if GREETER_USER=root SUDO_USER='' GREETER_INVOKER=root run_select; then
    echo "root was accepted as the Greeter account" >&2
    exit 1
fi

if GREETER_USER=missing SUDO_USER='' GREETER_INVOKER=root run_select; then
    echo "a missing explicit Greeter account was accepted" >&2
    exit 1
fi

if GREETER_USER='' SUDO_USER='' GREETER_INVOKER=root run_select 2>"$test_tmp/ambiguous.err"; then
    echo "an ambiguous multi-user system was guessed" >&2
    exit 1
fi
grep -F ambiguous "$test_tmp/ambiguous.err" >/dev/null

mkdir -p "$root/etc/sddm.conf.d" "$root/var/lib/sddm" "$root/proc" \
    "$root/usr/share/wayland-sessions"
: >"$root/usr/share/wayland-sessions/hyprland-uwsm.desktop"
write_passwd 'alice:x:1000:1000:Alice:/home/alice:/bin/bash'

GREETER_USER=alice SUDO_USER='' GREETER_INVOKER=root run_policy
grep -Fx '[Users]' "$root/etc/sddm.conf.d/99-omarchy-login.conf" >/dev/null
grep -Fx 'RememberLastUser=true' "$root/etc/sddm.conf.d/99-omarchy-login.conf" >/dev/null
grep -Fx 'RememberLastSession=true' "$root/etc/sddm.conf.d/99-omarchy-login.conf" >/dev/null
grep -Fx 'Session=hyprland-uwsm.desktop' "$root/var/lib/sddm/state.conf" >/dev/null
grep -Fx 'User=alice' "$root/var/lib/sddm/state.conf" >/dev/null
[[ ! -e "$root/etc/sddm.conf.d/autologin.conf" ]]
grep -F "chown -R sddm:sddm $root/var/lib/sddm" "$calls" >/dev/null

for crypttab in absent empty comments; do
    rm -f "$root/etc/crypttab"
    printf '[Autologin]\nUser=someone-else\nSession=other.desktop\n' \
        >"$root/etc/sddm.conf.d/autologin.conf"
    cp "$root/etc/sddm.conf.d/autologin.conf" "$test_tmp/unmanaged-autologin"
    case "$crypttab" in
        empty) : >"$root/etc/crypttab" ;;
        comments) printf '# root\n  # secondary\n\n' >"$root/etc/crypttab" ;;
    esac
    GREETER_USER=alice SUDO_USER='' GREETER_INVOKER=root run_policy
    cmp "$test_tmp/unmanaged-autologin" "$root/etc/sddm.conf.d/autologin.conf"
done

for crypttab in root-encryption secondary-disk; do
    if [[ $crypttab == root-encryption ]]; then
        printf 'cryptroot UUID=abc none luks\n' >"$root/etc/crypttab"
    else
        printf 'data UUID=def none luks\n' >"$root/etc/crypttab"
    fi
    GREETER_USER=alice SUDO_USER='' GREETER_INVOKER=root run_policy
    grep -Fx '[Autologin]' "$root/etc/sddm.conf.d/autologin.conf" >/dev/null
    grep -Fx 'User=alice' "$root/etc/sddm.conf.d/autologin.conf" >/dev/null
    grep -Fx 'Session=hyprland-uwsm.desktop' "$root/etc/sddm.conf.d/autologin.conf" >/dev/null
done

rm "$root/etc/crypttab"
GREETER_USER=alice SUDO_USER='' GREETER_INVOKER=root run_policy
[[ ! -e "$root/etc/sddm.conf.d/autologin.conf" ]]

printf 'BOOT_IMAGE=/vmlinuz-linux cryptdevice=UUID=abc:root root=/dev/mapper/root\n' \
    >"$root/proc/cmdline"
GREETER_USER=alice SUDO_USER='' GREETER_INVOKER=root run_policy
grep -Fx '[Autologin]' "$root/etc/sddm.conf.d/autologin.conf" >/dev/null
grep -Fx 'User=alice' "$root/etc/sddm.conf.d/autologin.conf" >/dev/null
grep -Fx 'Session=hyprland-uwsm.desktop' "$root/etc/sddm.conf.d/autologin.conf" >/dev/null
rm "$root/proc/cmdline"

printf 'cryptroot UUID=abc none luks\n' >"$root/etc/crypttab"
GREETER_USER=alice SUDO_USER='' GREETER_INVOKER=root run_policy
cp "$root/var/lib/sddm/state.conf" "$test_tmp/state.before-rerun"
cp "$root/etc/sddm.conf.d/autologin.conf" "$test_tmp/autologin.before-rerun"
GREETER_USER=alice SUDO_USER='' GREETER_INVOKER=root run_policy
cmp "$test_tmp/state.before-rerun" "$root/var/lib/sddm/state.conf"
cmp "$test_tmp/autologin.before-rerun" "$root/etc/sddm.conf.d/autologin.conf"

echo "PASS: Greeter account and crypttab policy"
