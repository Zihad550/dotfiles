// The Greeter's wiring, asserted against source text.
//
//     node --test "tests/greeter/*.test.js"
//
// The Greeter has no runtime this repo can drive: it is a package, a unit, and
// the documentation that tells a reader which suspend paths still exist. Those
// are the failures worth catching -- a box that installs two display managers,
// or a README that still counts a path this change deleted.

const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");

function source(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const inits = ["setup/arch-devbox/init", "setup/arch-hyprland/init"];
const greeterSetup = "setup/common/setup-greeter";
const greeterRoot = "setup/common/greeter";
const brandingRoot = "setup/common/boot-branding";
const pinnedCommit = "83881e979b35468c3e7d60b171e319ede61a88fd";

test("both boxes install the Greeter through the shared setup script", () => {
    inits.forEach(init => {
        assert.match(source(init), new RegExp(`run_step "greeter" [^\\n]*${greeterSetup}`),
            `${init} installs a Greeter of its own -- the two would drift`);
    });
});

test("no setup path installs or enables gdm any more", () => {
    [...inits, greeterSetup, "setup/common/setup-no-sleep"].forEach(script => {
        assert.doesNotMatch(source(script), /(pacman -S|systemctl enable)[^\n]*\bgdm\b/,
            `${script} still brings gdm back on the next run`);
    });
});

test("the Greeter setup is idempotent and installs sddm", () => {
    const setup = source(greeterSetup);

    assert.match(setup, /pacman -S[\s\S]*?--needed[\s\S]*?\bsddm\b/,
        "without --needed a re-run reinstalls the package every time");
    assert.match(setup, /\bqt6-wayland\b/);
    assert.match(setup, /\bqt6-imageformats\b/);
    assert.match(setup, /\bttf-jetbrains-mono-nerd\b/,
        "the Greeter uses the official Arch Nerd Font package");
    assert.match(setup, /systemctl enable --force sddm\.service/,
        "without --force a re-run dies on a display-manager.service alias left behind by "
        + "the run before it, and no later run can repair that");
});

test("the Greeter setup removes gdm rather than leaving two display managers enabled", () => {
    const setup = source(greeterSetup);

    assert.match(setup, /systemctl disable gdm\.service/,
        "display-manager.service points at whichever was enabled last; leaving gdm enabled "
        + "leaves which greeter boots up to ordering");
    assert.match(setup, /pacman -R[^\n]*\bgdm\b/);
});

test("the Greeter does not own the Desktop Keyring through SDDM PAM", () => {
    const setup = source(greeterSetup);

    assert.ok(setup.includes("pam_gnome_keyring\\.so/d"),
        "SDDM must not create a second keyring through its login hooks");
    assert.match(setup, /sddm-autologin/,
        "the persistent autologin PAM stack must keep the same keyring boundary");
    assert.match(setup, /-auth\.\*pam_gnome_keyring/);
    assert.match(setup, /-password\.\*pam_gnome_keyring/);
});

test("the pinned Omarchy Greeter is vendored instead of reading the ignored checkout", () => {
    const setup = source(greeterSetup);
    const apply = source(`${greeterRoot}/apply`);
    const provenance = source(`${greeterRoot}/PROVENANCE.md`);

    assert.doesNotMatch(setup, /resources\/omarchy/);
    assert.doesNotMatch(apply, /resources\/omarchy/);
    assert.match(provenance, new RegExp(pinnedCommit));
    assert.match(provenance, /4\.0\.0\.alpha/);
    assert.match(provenance, /local adaptation/i);
});

test("the vendored Greeter contains every pinned upstream asset byte-for-byte", () => {
    const assets = {
        "hyprland.lua": "353fe59d7d46b21946cdc48000eef7b131e9e577c1d6117f07c3137cdbf0fe67",
        "omarchy/Main.qml": "aa578ec8a6269079e2141842073821fa24940fa4495a13815fa0754652e6027f",
        "omarchy/bullet.png": "875ea8297db71415aeef2e03a5ccd67997a13c16f794d4e4929a9d669aaa7327",
        "omarchy/entry-failed.png": "f8f3ab148ea6c7e0580d918593fecfb6784d2c4859b9d1822c5f0ba7e8090e83",
        "omarchy/entry.png": "494587957a28b0a69c7e1477a535f7a11d9b1790e9b7db7c77ed5fb231dfce4c",
        "omarchy/lock-failed.png": "e30c49a41e6b2c8d26ea6410c9551ecf927492682d8ba35d7c7543af603f26a9",
        "omarchy/lock.png": "36be04a15773170b656bdadfa129dc14695e296abed3ac62247e23dbf213d836",
        "omarchy/logo.png": "ba8f1547a02ab5db64fe3923d0b834a220e2c3798c1674374a0eb92a18dfddfb",
        "omarchy/metadata.desktop": "d7a94b02b897c3356c07ee31e6543924baf1a7ee2c2205b97fc4d0db915e5ea2",
        "omarchy/theme.conf": "a371ee2822ab833c1349cbe193bf4b9292d6ab6b49a22b525fc1dcd95aa933c1",
        "etc/sddm.conf.d/10-wayland.conf": "711c05e5cfa836ff25deaf433b521d975f026bc189a3cbb6892b9822297c90b6",
        "etc/sddm.conf.d/10-theme.conf": "61ae32f59f5ae343b37c0c5f79306d0dcd8691a8ad2dd062904aaab2733a62bd",
    };

    for (const [relativePath, expectedHash] of Object.entries(assets)) {
        const filePath = path.join(repoRoot, greeterRoot, relativePath);
        assert.strictEqual(fs.existsSync(filePath), true, `${relativePath} is vendored`);
        const actualHash = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
        assert.strictEqual(actualHash, expectedHash, `${relativePath} changed from the pin`);
    }
});

test("Greeter setup validates before activation and exposes refresh/reset recovery", () => {
    const setup = source(greeterSetup);
    const validate = source(`${greeterRoot}/validate`);
    const apply = source(`${greeterRoot}/apply`);
    const refresh = source("bin/df-greeter-refresh");
    const reset = source("bin/df-greeter-reset");

    assert.match(setup, /GREETER_DIR.*validate/);
    assert.match(validate, /metadata\.desktop/);
    assert.match(validate, /identify|file/);
    assert.match(validate, /qmllint/);
    assert.match(validate, /hyprland.*--verify-config|--verify-config.*hyprland/);
    assert.match(apply, /\/usr\/share\/sddm\/themes\/omarchy/);
    assert.match(apply, /\/etc\/sddm\.conf\.d/);
    assert.match(refresh, /greeter\/apply/);
    assert.match(reset, /\/usr\/share\/sddm\/themes\/omarchy/);
    assert.match(reset, /10-wayland\.conf/);
    assert.match(reset, /10-theme\.conf/);
    assert.doesNotMatch(reset, /systemctl restart|systemctl stop|systemctl disable/,
        "reset must not log a user out while providing recovery");
});

test("both Arch boxes install the Desktop Keyring's Secret Service client", () => {
    ["setup/arch-hyprland/packages/pacman-apps", "setup/arch-devbox/packages/pacman-apps"]
        .forEach(packages => {
            assert.match(source(packages), /gnome-keyring\s+libsecret\s+seahorse/,
                `${packages} must keep the complete keyring stack`);
        });
});

test("keyring setup creates defaults without overwriting existing credentials", () => {
    const keyring = source("setup/arch-hyprland/keyring");

    assert.match(keyring, /if \[\[ ! -f "\$KEYRING_FILE" \]\]/);
    assert.match(keyring, /if \[\[ ! -f "\$DEFAULT_FILE" \]\]/);
    assert.match(keyring, /ctime=\$\(date \+%s\)/,
        "new keyrings must contain a real creation time");
});

test("the no-sleep setup no longer sets a greeter power policy", () => {
    const setup = source("setup/common/setup-no-sleep");

    assert.doesNotMatch(setup, /gsettings/,
        "sddm's greeter runs no GNOME settings daemon, so this could only ever fail silently");
    assert.doesNotMatch(setup, /\bgdm\b/i);
});

test("the suspend model is documented as three paths, in every document that counts them", () => {
    const shared = source("setup/common/README.md");

    assert.match(shared, /Three independent mechanisms can suspend/,
        "the shared README is where the count is defined; the box READMEs cite it");
    assert.doesNotMatch(shared, /display manager's power policy/,
        "that path is gone -- a fourth entry here is a reader looking for a setting nobody writes");

    ["setup/arch-devbox/README.md", "setup/ubuntu-devbox/README.md"].forEach(readme => {
        assert.doesNotMatch(source(readme), /\bgdm\b/i,
            `${readme} defines this box by reference to a greeter it no longer installs`);
    });
    assert.doesNotMatch(source("setup/arch-devbox/README.md"), /four (suspend paths|sources)/,
        "the count moved to three");
});

test("Boot Branding and the pinned Greeter decision are documented", () => {
    const oldAdr = source("docs/adr/0020-greeter-stays-stock-themed.md");
    const newAdr = source("docs/adr/0024-pinned-omarchy-greeter.md");
    const context = source("CONTEXT.md");

    assert.match(oldAdr, /superseded by.*0024/i);
    assert.match(newAdr, /Boot Branding/);
    assert.match(newAdr, new RegExp(pinnedCommit));
    assert.match(context, /\*\*Boot Branding\*\*/);
});

test("Boot Branding is installed before custom Greeter activation", () => {
    const setup = source(greeterSetup);
    const apply = source(`${brandingRoot}/apply`);
    const lib = source(`${brandingRoot}/lib`);

    assert.match(setup, /pacman -S[\s\S]*?--needed[\s\S]*?\bplymouth\b/);
    assert.match(setup, /\bimagemagick\b/);
    assert.ok(setup.indexOf("$BOOT_BRANDING_DIR/apply") < setup.indexOf("$GREETER_DIR/apply"),
        "SDDM must not activate before the boot rebuild succeeds");
    assert.match(lib, /plymouth-set-default-theme omarchy/);
    assert.match(lib, /mkinitcpio -P/);
    assert.match(lib, /grub-mkconfig -o/);
    assert.match(lib, /greeter-backups/);
    assert.match(lib, /rolling back/);
    assert.match(apply, /commit_boot_branding/);
});

test("Boot Branding exposes guarded customization and recovery commands", () => {
    const set = source("setup/common/boot-branding/set");
    const setBin = source("bin/df-boot-branding-set");
    const reset = source("bin/df-boot-branding-reset");
    const lib = source(`${brandingRoot}/lib`);
    const provenance = source(`${brandingRoot}/PROVENANCE.md`);

    assert.match(set, /\[\[:xdigit:\]\]\{6\}/);
    assert.match(set, /-L \$logo/);
    assert.match(set, /commit_boot_branding/);
    assert.match(lib, /sddm_target/);
    assert.match(setBin, /boot-branding\/set/);
    assert.match(reset, /boot-branding\/apply/);
    assert.match(reset, /greeter\/apply/);
    assert.doesNotMatch(reset, /systemctl (restart|stop|disable)|reboot/);
    assert.match(provenance, new RegExp(pinnedCommit));
    assert.match(provenance, /GRUB/);
});

test("the single-owner login policy follows successful Greeter installation", () => {
    const setup = source(greeterSetup);
    const policy = source(`${greeterRoot}/login-policy`);

    assert.ok(setup.indexOf("$GREETER_DIR/apply") < setup.indexOf("$GREETER_DIR/login-policy"),
        "account and autologin policy must wait for Greeter installation");
    assert.match(policy, /GREETER_USER/);
    assert.match(policy, /SUDO_USER/);
    assert.match(policy, /id -un/);
    assert.match(policy, /ambiguous Greeter account/);
    assert.match(policy, /RememberLastUser=true/);
    assert.match(policy, /RememberLastSession=true/);
    assert.match(policy, /omarchy\.desktop/);
    assert.match(policy, /hyprland-uwsm\.desktop/);
    assert.match(policy, /crypttab/);
    assert.match(policy, /has_encrypted_root/);
    assert.match(policy, /cryptdevice/);
    assert.match(policy, /rd\\\.luks/);
    assert.match(policy, /autologin\.conf/);
    assert.doesNotMatch(policy, /first.?owner|one.?shot/i,
        "the existing-account port must not provision a first-owner autologin");
});

test("system authentication policy runs after SDDM installation", () => {
    inits.forEach(init => {
        const setup = source(init);
        assert.match(setup, /run_step "system authentication lockout" [^\n]*setup-sudo-tries/);
        assert.ok(setup.indexOf('run_step "greeter"') < setup.indexOf('setup-sudo-tries'),
            `${init} must install SDDM before patching sddm-autologin`);
    });
});

test("the Plymouth theme contains the pinned upstream assets", () => {
    const assets = {
        "plymouth/bullet.png": "875ea8297db71415aeef2e03a5ccd67997a13c16f794d4e4929a9d669aaa7327",
        "plymouth/entry.png": "494587957a28b0a69c7e1477a535f7a11d9b1790e9b7db7c77ed5fb231dfce4c",
        "plymouth/lock.png": "36be04a15773170b656bdadfa129dc14695e296abed3ac62247e23dbf213d836",
        "plymouth/logo.png": "ba8f1547a02ab5db64fe3923d0b834a220e2c3798c1674374a0eb92a18dfddfb",
        "plymouth/omarchy.plymouth": "e53f4c2f1258b85c6a070219eb335c2970bbb56e9b7a57d2f9913af69a35ffbc",
        "plymouth/omarchy.script": "7f4c1e615759eb72b0787e15b20d06a6b90aa460063227394390f4832322a0fe",
    };

    for (const [relativePath, expectedHash] of Object.entries(assets)) {
        const filePath = path.join(repoRoot, brandingRoot, relativePath);
        assert.strictEqual(fs.existsSync(filePath), true, `${relativePath} is vendored`);
        const actualHash = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
        assert.strictEqual(actualHash, expectedHash, `${relativePath} changed from the pin`);
    }
});
