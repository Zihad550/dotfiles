const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const DisplayArrange = require("../../quickshell/.config/quickshell/dotfiles/modules/lib/displayArrange.js");

const root = path.resolve(__dirname, "../..");
const source = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

function monitor(name, x, y, w, h) {
    return { name: name, x: x, y: y, w: w, h: h };
}

test("parseMonitors keeps enabled named outputs and uses logical sizes", () => {
    const monitors = DisplayArrange.parseMonitors(JSON.stringify([
        {
            name: "eDP-1",
            description: "Laptop panel",
            width: 2880,
            height: 1800,
            refreshRate: 59.951,
            scale: 2,
            transform: 0,
            x: 0,
            y: 0,
            disabled: false
        },
        {
            name: "HDMI-A-1",
            description: "External",
            width: 1920,
            height: 1080,
            refreshRate: 75,
            scale: 1,
            transform: 1,
            x: 1440,
            y: -200
        },
        {
            name: "",
            width: 1920,
            height: 1080,
            scale: 1,
            transform: 0,
            x: 0,
            y: 0
        },
        {
            name: "DP-1",
            width: 2560,
            height: 1440,
            scale: 1,
            transform: 0,
            x: 0,
            y: 0,
            disabled: true
        }
    ]));

    assert.strictEqual(monitors.length, 2);
    assert.deepStrictEqual(monitors[0], {
        name: "eDP-1",
        description: "Laptop panel",
        x: 0,
        y: 0,
        w: 1440,
        h: 900,
        width: 2880,
        height: 1800,
        refreshRate: 59.951,
        scale: 2,
        transform: 0
    });
    assert.strictEqual(monitors[1].name, "HDMI-A-1");
    assert.strictEqual(monitors[1].w, 1080);
    assert.strictEqual(monitors[1].h, 1920);
    assert.strictEqual(monitors[1].x, 1440);
    assert.strictEqual(monitors[1].y, -200);
    assert.strictEqual(monitors[1].description, "External");
});

test("parseMonitors swaps logical width and height for odd transforms", () => {
    for (const transform of [1, 3, 5, 7]) {
        const monitors = DisplayArrange.parseMonitors(JSON.stringify([
            { name: "DP-1", width: 1920, height: 1080, scale: 1, transform: transform }
        ]));
        assert.strictEqual(monitors[0].w, 1080, `transform ${transform}`);
        assert.strictEqual(monitors[0].h, 1920, `transform ${transform}`);
    }

    for (const transform of [0, 2, 4, 6]) {
        const monitors = DisplayArrange.parseMonitors(JSON.stringify([
            { name: "DP-1", width: 1920, height: 1080, scale: 1, transform: transform }
        ]));
        assert.strictEqual(monitors[0].w, 1920, `transform ${transform}`);
        assert.strictEqual(monitors[0].h, 1080, `transform ${transform}`);
    }
});

test("invalid monitor listings become an empty list", () => {
    assert.deepStrictEqual(DisplayArrange.parseMonitors("not json"), []);
    assert.deepStrictEqual(DisplayArrange.parseMonitors(""), []);
    assert.deepStrictEqual(DisplayArrange.parseMonitors("null"), []);
    assert.deepStrictEqual(DisplayArrange.parseMonitors(JSON.stringify([{ name: "" }, null])), []);
});

test("snapping places a monitor flush on each edge of the anchor", () => {
    const anchor = monitor("anchor", 0, 0, 1000, 800);

    assert.deepStrictEqual(
        DisplayArrange.snapToEdge(anchor, monitor("moving", 1500, 100, 800, 600)),
        { x: 1000, y: 100, edge: "right" });
    assert.deepStrictEqual(
        DisplayArrange.snapToEdge(anchor, monitor("moving", -1200, 100, 800, 600)),
        { x: -800, y: 100, edge: "left" });
    assert.deepStrictEqual(
        DisplayArrange.snapToEdge(anchor, monitor("moving", 100, -1000, 800, 600)),
        { x: 100, y: -600, edge: "top" });
    assert.deepStrictEqual(
        DisplayArrange.snapToEdge(anchor, monitor("moving", 100, 1000, 800, 600)),
        { x: 100, y: 800, edge: "bottom" });
});

test("snapping follows the drop along an edge but keeps one pixel of overlap", () => {
    const anchor = monitor("anchor", 0, 0, 1000, 800);

    const low = DisplayArrange.snapToEdge(anchor, monitor("moving", 1500, -700, 800, 600));
    assert.strictEqual(low.y, -599, "the shared edge must still overlap by one pixel");

    const high = DisplayArrange.snapToEdge(anchor, monitor("moving", 1500, 1000, 800, 600));
    assert.strictEqual(high.y, 799, "the shared edge must still overlap by one pixel");

    const mid = DisplayArrange.snapToEdge(anchor, monitor("moving", 1500, 500, 800, 600));
    assert.strictEqual(mid.y, 500, "an offset far from an alignment stays where dropped");
});

test("snapping aligns to start, center or end within 64 layout pixels", () => {
    const anchor = monitor("anchor", 0, 0, 1000, 1000);
    const moving = y => monitor("moving", 1500, y, 800, 100);

    assert.strictEqual(DisplayArrange.snapToEdge(anchor, moving(10)).y, 0);
    assert.strictEqual(DisplayArrange.snapToEdge(anchor, moving(64)).y, 0);
    assert.strictEqual(DisplayArrange.snapToEdge(anchor, moving(65)).y, 65);
    assert.strictEqual(DisplayArrange.snapToEdge(anchor, moving(400)).y, 450);
    assert.strictEqual(DisplayArrange.snapToEdge(anchor, moving(930)).y, 900);

    const verticalAnchor = monitor("anchor", 0, 0, 1000, 800);
    const topMoving = x => monitor("moving", x, -1000, 100, 600);
    assert.strictEqual(DisplayArrange.snapToEdge(verticalAnchor, topMoving(10)).x, 0);
    assert.strictEqual(DisplayArrange.snapToEdge(verticalAnchor, topMoving(500)).x, 450);
    assert.strictEqual(DisplayArrange.snapToEdge(verticalAnchor, topMoving(930)).x, 900);
});

test("the anchor is the other monitor nearest the dropped rectangle's center", () => {
    const monitors = [
        monitor("left", 0, 0, 1000, 800),
        monitor("right", 3000, 0, 1000, 800),
        monitor("below", 0, 2000, 1000, 800)
    ];

    assert.strictEqual(
        DisplayArrange.nearestAnchor(monitors, "moving", monitor("moving", 2900, 100, 400, 400)).name,
        "right");
    assert.strictEqual(
        DisplayArrange.nearestAnchor(monitors, "moving", monitor("moving", 200, 2100, 400, 400)).name,
        "below");
    assert.strictEqual(
        DisplayArrange.nearestAnchor([monitors[0]], "left", monitor("moving", 0, 0, 100, 100)),
        null);
});

test("place snaps a monitor, rejects third-monitor overlap and normalizes", () => {
    const monitors = [
        monitor("A", 0, 0, 1000, 800),
        monitor("B", 2000, 0, 1000, 800),
        monitor("M", 0, 0, 1600, 600)
    ];

    const rejected = DisplayArrange.place(monitors, "M", monitor("M", 0, 0, 1600, 600));
    assert.strictEqual(rejected.ok, false);
    assert.strictEqual(rejected.blocker.name, "B");
    assert.deepStrictEqual(rejected.monitors, monitors);
    assert.strictEqual(rejected.monitors[2].x, 0, "the caller keeps the previous position");

    const placed = DisplayArrange.place(monitors.slice(0, 2).concat([
        monitor("M", -300, -200, 400, 300)
    ]), "M", monitor("M", -300, -200, 400, 300));
    assert.strictEqual(placed.ok, true);
    assert.strictEqual(placed.anchor.name, "A");
    assert.strictEqual(placed.edge, "left");
    assert.strictEqual(placed.monitors.find(m => m.name === "A").x, 400);
    assert.strictEqual(placed.monitors.find(m => m.name === "A").y, 200);
    assert.strictEqual(placed.monitors.find(m => m.name === "M").x, 0);
    assert.strictEqual(placed.monitors.find(m => m.name === "M").y, 0);
});

test("normalize shifts every position so the minimum x and y are zero", () => {
    const normalized = DisplayArrange.normalize([
        monitor("A", -300, 200, 500, 400),
        monitor("B", 200, -100, 800, 600)
    ]);

    assert.deepStrictEqual(normalized.map(m => ({ name: m.name, x: m.x, y: m.y })), [
        { name: "A", x: 0, y: 300 },
        { name: "B", x: 500, y: 0 }
    ]);
    assert.deepStrictEqual(DisplayArrange.normalize([]), []);
});

test("luaChunk emits one hl.monitor line per enabled monitor", () => {
    const chunk = DisplayArrange.luaChunk([
        {
            name: "eDP-1",
            width: 2880,
            height: 1800,
            refreshRate: 59.951,
            scale: 1.5,
            transform: 1,
            x: 0,
            y: 0
        },
        {
            name: "HDMI-A-1",
            width: 1920,
            height: 1080,
            refreshRate: 75,
            scale: 1,
            transform: 0,
            x: -1920,
            y: 200
        }
    ]);

    assert.strictEqual(chunk, [
        "hl.monitor({ output = 'eDP-1', mode = '2880x1800@59.951', position = '0x0', scale = 1.5, transform = 1 })",
        "hl.monitor({ output = 'HDMI-A-1', mode = '1920x1080@75', position = '-1920x200', scale = 1, transform = 0 })"
    ].join("\n"));
});

test("luaChunk trims numbers and refuses unsafe output names", () => {
    const chunk = DisplayArrange.luaChunk([
        {
            name: "DP-1",
            width: 2560,
            height: 1440,
            refreshRate: 59.9999,
            scale: 1.333333,
            transform: 0,
            x: 0,
            y: 0
        }
    ]);
    assert.strictEqual(chunk,
        "hl.monitor({ output = 'DP-1', mode = '2560x1440@60', position = '0x0', scale = 1.33, transform = 0 })");

    assert.strictEqual(DisplayArrange.luaChunk([
        {
            name: "bad name",
            width: 1920,
            height: 1080,
            refreshRate: 60,
            scale: 1,
            transform: 0,
            x: 0,
            y: 0
        }
    ]), "");
    assert.strictEqual(DisplayArrange.luaChunk([]), "");
});

test("SUPER+CTRL+SHIFT+D opens the Arrange overlay", () => {
    const bindings = source("hypr/.config/hypr/lua/bindings/utilities.lua");
    const shell = source("quickshell/.config/quickshell/dotfiles/shell.qml");

    assert.match(bindings,
        /SUPER \+ CTRL \+ SHIFT \+ D", "Arrange displays", hl\.dsp\.global\("display:arrange"\)/);
    assert.match(shell, /appid: "display"\s*name: "arrange"[\s\S]*?DisplayArrangeState\.toggle\(\)/);
    assert.strictEqual((shell.match(/\bDisplayArrange\s*\{\s*\}/g) || []).length, 1);
});

test("the Display panel exposes an Arrange row that opens the overlay", () => {
    const panel = source("quickshell/.config/quickshell/dotfiles/modules/DisplayPanel.qml");

    assert.match(panel, /text: "Arrange…"/);
    assert.match(panel, /root\.selectedIndex === root\.displays\.length/);
    assert.match(panel, /Math\.min\(root\.displays\.length, root\.selectedIndex \+ delta\)/);
    assert.match(panel, /root\.dismiss\(\);\s*DisplayArrangeState\.open\(\)/);
});

test("DisplayArrange applies with hyprctl eval and saves through df-hypr-display-layout", () => {
    const overlay = source("quickshell/.config/quickshell/dotfiles/modules/DisplayArrange.qml");

    assert.match(overlay, /\["hyprctl", "eval", chunk\]/);
    assert.match(overlay, /output !== "ok"/);
    assert.match(overlay, /\/dotfiles\/bin\/df-hypr-display-layout/);
    assert.match(overlay, /currentVariantProcess\.command = \[root\.layoutScript, "current"\]/);
    assert.match(overlay, /if \(exitCode !== 0\) \{\s*root\.saving = false;[\s\S]*?return;/);
    assert.match(overlay, /saveProcess\.command = \[root\.layoutScript, "save", root\.pendingVariant\]/);
    assert.match(overlay, /"arranged"/);
    assert.match(overlay, /WlrLayershell\.layer: WlrLayer\.Overlay/);
    assert.match(overlay, /WlrKeyboardFocus\.Exclusive/);
    assert.match(overlay, /Connect a second display to arrange/);
    assert.match(overlay, /if \(result\.ok\) \{\s*root\.monitors = result\.monitors/);
});

test("df-hypr-display-layout documents the current command", () => {
    const script = source("bin/df-hypr-display-layout");

    assert.match(script, /cmd_current\(\)/);
    assert.match(script, /^current\)/m);
    assert.match(script, /resolve_variant "\$layouts" "\$sig" ""/);
    assert.match(script, /^  current$/m);
});

test("df-hypr-display-layout current propagates read and resolution failures", () => {
    const script = source("bin/df-hypr-display-layout");
    const body = script.match(/cmd_current\(\) \{([\s\S]*?)\n\}/);

    assert.ok(body, "cmd_current is defined");
    assert.match(body[1], /mons=\$\(monitors_json\) \|\| return 1/);
    assert.match(body[1], /layouts=\$\(read_layouts\) \|\| return 1/);
    assert.match(body[1], /variant=\$\(resolve_variant "\$layouts" "\$sig" ""\) \|\| return 1/);
});
