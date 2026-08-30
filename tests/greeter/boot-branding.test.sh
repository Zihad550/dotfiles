#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
test_tmp=$(mktemp -d)
trap 'rm -rf "$test_tmp"' EXIT

fake_bin="$test_tmp/bin"
root="$test_tmp/root"
calls="$test_tmp/calls.log"
mkdir -p "$fake_bin" "$root/etc/default" "$root/etc" "$root/boot/grub"

cat >"$fake_bin/mkinitcpio" <<'SH'
#!/usr/bin/env bash
printf 'mkinitcpio %s\n' "$*" >>"$TEST_CALLS"
if [[ ${TEST_FAIL_REBUILD:-0} == 1 ]]; then
    exit 42
fi
SH
cat >"$fake_bin/grub-mkconfig" <<'SH'
#!/usr/bin/env bash
printf 'grub-mkconfig %s\n' "$*" >>"$TEST_CALLS"
if [[ ${TEST_FAIL_REBUILD:-0} == 1 ]]; then
    exit 43
fi
SH
cat >"$fake_bin/plymouth-set-default-theme" <<'SH'
#!/usr/bin/env bash
printf 'plymouth-set-default-theme %s\n' "$*" >>"$TEST_CALLS"
SH
cat >"$fake_bin/magick" <<'SH'
#!/usr/bin/env bash
if [[ ${1:-} == identify ]]; then
    [[ ${TEST_BAD_IMAGE:-0} == 1 ]] && exit 1
    printf '%s PNG\n' "${2:-image}"
    exit 0
fi
source_image="$1"
target_image="${@: -1}"
printf 'magick %s\n' "$*" >>"$TEST_CALLS"
[[ $source_image == "$target_image" ]] || cp "$source_image" "$target_image"
SH
chmod +x "$fake_bin"/*

run_apply() {
    PATH="$fake_bin:$PATH" \
    TEST_CALLS="$calls" \
    DOTFILES_DIR="$ROOT" \
    DF_BOOT_BRANDING_ROOT="$root" \
    "$ROOT/setup/common/boot-branding/apply"
}

write_fixture() {
    local hooks=$1 grub_args=$2
    printf 'HOOKS=(base udev %s filesystems fsck)\n' "$hooks" >"$root/etc/mkinitcpio.conf"
    printf 'GRUB_CMDLINE_LINUX_DEFAULT="%s"\nGRUB_TIMEOUT=5\n' "$grub_args" >"$root/etc/default/grub"
}

write_fixture 'autodetect' 'quiet loglevel=3'
run_apply
grep -Fx 'HOOKS=(base udev plymouth autodetect filesystems fsck)' "$root/etc/mkinitcpio.conf" >/dev/null
grep -Fx 'GRUB_CMDLINE_LINUX_DEFAULT="quiet loglevel=3 splash"' "$root/etc/default/grub" >/dev/null
[[ -f "$root/usr/share/plymouth/themes/omarchy/omarchy.script" ]]
[[ -f "$root/etc/plymouth/plymouthd.conf" ]]
[[ -d "$root/var/lib/dotfiles/greeter-backups" ]]

run_apply
[[ $(grep -o 'plymouth' "$root/etc/mkinitcpio.conf" | wc -l) == 1 ]]
[[ $(grep -o 'splash' "$root/etc/default/grub" | wc -l) == 1 ]]

write_fixture 'autodetect' 'cryptdevice=UUID=abc root=/dev/mapper/root'
run_apply
grep -Fx 'GRUB_CMDLINE_LINUX_DEFAULT="cryptdevice=UUID=abc root=/dev/mapper/root splash"' \
    "$root/etc/default/grub" >/dev/null

printf 'HOOKS=(base systemd autodetect filesystems fsck)\n' >"$root/etc/mkinitcpio.conf"
run_apply
grep -Fx 'HOOKS=(base systemd plymouth autodetect filesystems fsck)' \
    "$root/etc/mkinitcpio.conf" >/dev/null

printf 'HOOKS=(base plymouth autodetect filesystems fsck)\n' >"$root/etc/mkinitcpio.conf"
cp "$root/etc/mkinitcpio.conf" "$test_tmp/unknown-with-plymouth"
if run_apply 2>"$test_tmp/unknown-with-plymouth.err"; then
    echo "an unknown hook family was accepted because plymouth was already present" >&2
    exit 1
fi
cmp "$test_tmp/unknown-with-plymouth" "$root/etc/mkinitcpio.conf"

before_hooks=$(cat "$root/etc/mkinitcpio.conf")
before_grub=$(cat "$root/etc/default/grub")
printf 'HOOKS=(base autodetect filesystems)\n' >"$root/etc/mkinitcpio.conf"
cp "$root/etc/mkinitcpio.conf" "$test_tmp/unknown-hooks"
if run_apply 2>"$test_tmp/unknown.err"; then
    exit 1
fi
cmp "$test_tmp/unknown-hooks" "$root/etc/mkinitcpio.conf"
printf '%s\n' "$before_hooks" >"$root/etc/mkinitcpio.conf"
printf '%s\n' "$before_grub" >"$root/etc/default/grub"

rm "$root/etc/default/grub"
if run_apply 2>"$test_tmp/grub.err"; then
    exit 1
fi
[[ ! -f "$root/etc/default/grub" ]]
printf 'GRUB_CMDLINE_LINUX_DEFAULT="quiet"\n' >"$root/etc/default/grub"

write_fixture 'autodetect' 'quiet'
printf 'previous initramfs\n' >"$root/boot/initramfs-linux.img"
cp "$root/etc/mkinitcpio.conf" "$test_tmp/hooks.before-failure"
cp "$root/etc/default/grub" "$test_tmp/grub.before-failure"
cp "$root/boot/initramfs-linux.img" "$test_tmp/initramfs.before-failure"
export TEST_FAIL_REBUILD=1
run_apply 2>"$test_tmp/rebuild.err" && exit 1
unset TEST_FAIL_REBUILD
cmp "$test_tmp/hooks.before-failure" "$root/etc/mkinitcpio.conf"
cmp "$test_tmp/grub.before-failure" "$root/etc/default/grub"
cmp "$test_tmp/initramfs.before-failure" "$root/boot/initramfs-linux.img"
grep -F 'rolling back' "$test_tmp/rebuild.err" >/dev/null

logo="$test_tmp/logo.png"
cp "$ROOT/setup/common/greeter/omarchy/logo.png" "$logo"
PATH="$fake_bin:$PATH" TEST_CALLS="$calls" DOTFILES_DIR="$ROOT" \
DF_BOOT_BRANDING_ROOT="$root" "$ROOT/setup/common/boot-branding/set" '#112233' 'aabbcc' "$logo"
grep -F 'color: "#112233"' "$root/usr/share/sddm/themes/omarchy/Main.qml" >/dev/null
grep -F 'Window.SetBackgroundTopColor(0.067, 0.133, 0.200);' \
    "$root/usr/share/plymouth/themes/omarchy/omarchy.script" >/dev/null
grep -F 'Window.SetBackgroundBottomColor(0.067, 0.133, 0.200);' \
    "$root/usr/share/plymouth/themes/omarchy/omarchy.script" >/dev/null
grep -F -- '+level-colors #aabbcc,#aabbcc' "$calls" >/dev/null
for asset in bullet.png entry.png lock.png; do
    cmp "$root/usr/share/plymouth/themes/omarchy/$asset" \
        "$root/usr/share/sddm/themes/omarchy/$asset"
done
cmp "$logo" "$root/usr/share/sddm/themes/omarchy/logo.png"

cp -a "$root/usr/share/plymouth/themes/omarchy" "$test_tmp/plymouth.before-failure"
cp -a "$root/usr/share/sddm/themes/omarchy" "$test_tmp/sddm.before-failure"
export TEST_FAIL_REBUILD=1
if PATH="$fake_bin:$PATH" TEST_CALLS="$calls" DOTFILES_DIR="$ROOT" \
    DF_BOOT_BRANDING_ROOT="$root" "$ROOT/setup/common/boot-branding/set" \
    '#445566' '112233' "$logo" 2>"$test_tmp/custom-rebuild.err"; then
    exit 1
fi
unset TEST_FAIL_REBUILD
diff -ru "$test_tmp/plymouth.before-failure" \
    "$root/usr/share/plymouth/themes/omarchy" >/dev/null
diff -ru "$test_tmp/sddm.before-failure" \
    "$root/usr/share/sddm/themes/omarchy" >/dev/null
grep -F 'rolling back' "$test_tmp/custom-rebuild.err" >/dev/null

cp "$test_tmp/plymouth.before-failure/logo.png" "$test_tmp/unreadable.png"
export TEST_BAD_IMAGE=1
if PATH="$fake_bin:$PATH" TEST_CALLS="$calls" DOTFILES_DIR="$ROOT" \
    DF_BOOT_BRANDING_ROOT="$root" "$ROOT/setup/common/boot-branding/set" \
    '#445566' '112233' "$test_tmp/unreadable.png" 2>"$test_tmp/image.err"; then
    exit 1
fi
unset TEST_BAD_IMAGE
grep -F 'not a readable image' "$test_tmp/image.err" >/dev/null
diff -ru "$test_tmp/plymouth.before-failure" \
    "$root/usr/share/plymouth/themes/omarchy" >/dev/null

touch "$root/usr/share/plymouth/themes/omarchy/stale.png"
touch "$root/usr/share/sddm/themes/omarchy/stale.png"
PATH="$fake_bin:$PATH" TEST_CALLS="$calls" DOTFILES_DIR="$ROOT" \
DF_BOOT_BRANDING_ROOT="$root" "$ROOT/setup/common/boot-branding/set" '#334455' 'ddeeff' "$logo"
[[ ! -e "$root/usr/share/plymouth/themes/omarchy/stale.png" ]]
[[ ! -e "$root/usr/share/sddm/themes/omarchy/stale.png" ]]
grep -F 'color: "#334455"' "$root/usr/share/sddm/themes/omarchy/Main.qml" >/dev/null
grep -F 'Window.SetBackgroundTopColor(0.200, 0.267, 0.333);' \
    "$root/usr/share/plymouth/themes/omarchy/omarchy.script" >/dev/null

ln -s "$logo" "$test_tmp/logo-link.png"
if PATH="$fake_bin:$PATH" DOTFILES_DIR="$ROOT" DF_BOOT_BRANDING_ROOT="$root" \
    "$ROOT/setup/common/boot-branding/set" '#112233' 'aabbcc' "$test_tmp/logo-link.png"; then
    exit 1
fi

echo "PASS: Boot Branding fixture transformations and rollback"
