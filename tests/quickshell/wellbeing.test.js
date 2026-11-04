const test = require("node:test");
const assert = require("node:assert/strict");
const usage = require("../../quickshell/.config/quickshell/dotfiles/wellbeing/usage.js");

test("focus time splits at local midnight and aggregates the week", () => {
    const start = new Date(2026, 9, 28, 23, 59, 58).getTime();
    let store = usage.record(usage.empty(), "terminal", start, start + 4000);
    store = usage.record(store, "browser", start + 4000, start + 5000);
    assert.equal(store.days["2026-10-28"].terminal, 2000);
    assert.equal(store.days["2026-10-29"].terminal, 2000);
    assert.deepEqual(usage.rows(store, usage.recentDays(start + 5000, 7)), [
        { app: "terminal", milliseconds: 4000 }, { app: "browser", milliseconds: 1000 },
    ]);
    assert.deepEqual(usage.rows(store, ["2026-10-29"])[0], { app: "terminal", milliseconds: 2000 });
});

test("unfocused time, suspend gaps and backwards clocks add nothing", () => {
    const store = usage.empty();
    for (const [app, start, end] of [["", 0, 1000], ["editor", 0, 20000], ["editor", 1000, 0]])
        assert.equal(usage.record(store, app, start, end), store);
});

test("history round trips and rejects corrupt or future formats", () => {
    const now = Date.now();
    const first = usage.record(usage.empty(), "__proto__", now, now + 1000);
    const store = usage.record(first, "__proto__", now + 1000, now + 2000);
    assert.equal(usage.rows(store, usage.recentDays(now, 1))[0].milliseconds, 2000);
    assert.deepEqual(usage.parse(JSON.stringify(store)), store);
    for (const text of ["invalid", '{}', '{"version":2,"paused":false,"days":{}}',
        '{"version":1,"paused":false,"days":{"2026-10-28":{"app":-1}}}',
        '{"version":1,"paused":false,"days":{"2026-10-28":{"app":"1000"}}}'])
        assert.throws(() => usage.parse(text));
});

test("keeps history beyond a year without mutating previous snapshots", () => {
    let store = usage.empty();
    for (let i = 0; i < 400; i++) {
        const start = new Date(2026, 8, i + 1).getTime();
        store = usage.record(store, "editor", start, start + 1000);
    }
    assert.equal(Object.keys(store.days).length, 400);
    assert.equal(store.days["2026-09-01"].editor, 1000);
    const before = JSON.stringify(store);
    usage.record(store, "editor", new Date(2026, 8, 1).getTime(), new Date(2026, 8, 1).getTime() + 2000);
    assert.equal(JSON.stringify(store), before);
});


test("date ranges handle leap days, invalid input and custom future bounds", () => {
    assert.deepEqual(usage.between("2024-02-28", "2024-03-01"), ["2024-02-28", "2024-02-29", "2024-03-01"]);
    for (const [start, end] of [["2026-02-30", "2026-03-01"], ["2026-10-29", "2026-10-28"], ["bad", "2026-10-28"]])
        assert.deepEqual(usage.between(start, end), []);
    const now = new Date(2026, 9, 28).getTime();
    assert.equal(usage.range(usage.empty(), now, "365").length, 365);
    assert.deepEqual(usage.range(usage.empty(), now, "custom", "2026-10-27", "2026-11-01"), ["2026-10-27", "2026-10-28"]);
    assert.deepEqual(usage.range(usage.empty(), now, "custom", "2026-10-27", "zzz"), []);
});

test("analytics and daily history share date and application filters", () => {
    const store = { version: 1, paused: false, days: {
        "2026-10-25": { editor: 60000 },
        "2026-10-27": { editor: 120000, browser: 60000 },
        "2026-10-28": { browser: 180000 },
    } };
    const days = usage.between("2026-10-27", "2026-10-28");
    const report = usage.report(store, days, "", id => id);
    assert.equal(report.total, 360000);
    assert.equal(report.average, 180000);
    assert.equal(report.activeDays, 2);
    assert.equal(report.previous, 60000);
    assert.equal(report.busiest.day, "2026-10-27");
    assert.equal(report.history[0].day, "2026-10-28");
    const filtered = usage.report(store, days, "Code", id => id === "editor" ? "Code Editor" : "Browser");
    assert.equal(filtered.total, 120000);
    assert.equal(filtered.average, 60000);
    assert.equal(filtered.activeDays, 1);
    assert.equal(filtered.previous, 60000);
    assert.deepEqual(filtered.history.map(row => row.app), ["", "editor"]);
    assert.equal(usage.report(store, days, "missing", id => id).history.length, 0);
    assert.equal(usage.report(store, [], "", id => id).average, 0);
});

test("annual trend buckets preserve totals and never exceed 31 bars", () => {
    const days = usage.recentDays(new Date(2026, 9, 28).getTime(), 365).reverse();
    const store = usage.empty();
    for (const day of days)
        store.days[day] = { editor: 60000 };
    const report = usage.report(store, days, "", id => id);
    assert.ok(report.trend.length <= 31);
    assert.equal(report.trend.reduce((sum, bucket) => sum + bucket.milliseconds, 0), report.total);
    assert.equal(report.average, 60000);
    assert.equal(report.trend[0].start, days[0]);
    assert.equal(report.trend[report.trend.length - 1].end, days[364]);
});
