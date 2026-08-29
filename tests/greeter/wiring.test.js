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
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");

function source(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const inits = ["setup/arch-devbox/init", "setup/arch-hyprland/init"];
const greeterSetup = "setup/common/setup-greeter";

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

    assert.match(setup, /pacman -S[^\n]*--needed[^\n]*\bsddm\b/,
        "without --needed a re-run reinstalls the package every time");
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

test("the decision to leave the Greeter unthemed is recorded as an ADR", () => {
    const adrs = fs.readdirSync(path.join(repoRoot, "docs/adr"))
        .filter(name => /greeter/.test(name));

    assert.strictEqual(adrs.length, 1,
        "the stock theme is the question that keeps getting reopened; it needs one place to land");
    const adr = source(`docs/adr/${adrs[0]}`);
    assert.match(adr, /sddm/i);
    assert.match(adr, /theme/i);
});
