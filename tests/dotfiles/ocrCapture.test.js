const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "../..");
const captureScript = path.join(repoRoot, "bin/df-capture-text");

function source(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function writeCommand(directory, name, body) {
    const command = path.join(directory, name);
    fs.writeFileSync(command, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

test("OCR capture streams the selected image through Tesseract to the clipboard", t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "df-ocr-capture-"));
    const commands = path.join(directory, "bin");
    fs.mkdirSync(commands);
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

    writeCommand(commands, "hyprpicker", "exec sleep 30");
    writeCommand(commands, "slurp", "printf '10,20 300x100\\n'");
    writeCommand(commands, "grim", String.raw`[ "$1" = "-g" ] && [ "$2" = "10,20 300x100" ] && [ "$3" = "-" ] || exit 2
printf 'image-bytes'`);
    writeCommand(commands, "tesseract", String.raw`[ "$*" = "stdin stdout --oem 1 --psm 6 -l eng --dpi 300 -c preserve_interword_spaces=1" ] || exit 3
[ "$(cat)" = "image-bytes" ] || exit 4
printf 'recognized text\n'`);
    writeCommand(commands, "wl-copy", "cat >\"$OCR_CAPTURE_TEST_DIR/clipboard\"");
    writeCommand(commands, "notify-send", "printf '%s\\n' \"$*\" >\"$OCR_CAPTURE_TEST_DIR/notification\"");

    const result = spawnSync(captureScript, {
        encoding: "utf8",
        env: {
            ...process.env,
            PATH: `${commands}:${process.env.PATH}`,
            OCR_CAPTURE_TEST_DIR: directory,
        },
    });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(fs.readFileSync(path.join(directory, "clipboard"), "utf8"), "recognized text");
    assert.strictEqual(fs.readFileSync(path.join(directory, "notification"), "utf8"),
        "OCR Copied text from selection to clipboard\n");
});

test("OCR capture is wired into Hyprland and both graphical Arch profiles", () => {
    const bindings = source("hypr/.config/hypr/lua/bindings/system.lua");
    const workstation = source("setup/arch-workstation/packages/pacman-apps");
    const devbox = source("setup/arch-devbox/packages/pacman-apps");

    assert.match(bindings,
        /o\.bind\("SUPER \+ CTRL \+ PRINT", "Extract text from screen", dotfiles_bin \.\. "\/df-capture-text"\)/);

    for (const packages of [workstation, devbox]) {
        assert.match(packages, /^\s*tesseract tesseract-data-eng$/m);
    }
});
