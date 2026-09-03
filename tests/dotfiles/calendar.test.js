const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const calendar = require("../../quickshell/.config/quickshell/dotfiles/modules/lib/calendar.js");

const repoRoot = path.resolve(__dirname, "../..");
const quickshellRoot = path.join(repoRoot, "quickshell/.config/quickshell/dotfiles");

function source(relativePath) {
    return fs.readFileSync(path.join(quickshellRoot, relativePath), "utf8");
}

test("calendar arithmetic handles leap dates", () => {
    assert.equal(calendar.isLeapYear(2024), true);
    assert.equal(calendar.isLeapYear(2100), false);
    assert.equal(calendar.daysInMonth(2024, 1), 29);
    assert.equal(calendar.daysInMonth(2023, 1), 28);
});

test("date keys are stable and independent of locale formatting", () => {
    assert.equal(calendar.dateKey(2026, 0, 5), "2026-01-05");
    assert.equal(calendar.keyForDate(new Date(2026, 6, 26)), "2026-07-26");
    assert.equal(calendar.keyForDate(new Date("invalid")), "");
});

test("monthGrid always returns six complete weeks with adjacent dates", () => {
    const weeks = calendar.monthGrid(2026, 6, 1, "2026-07-26");
    assert.equal(weeks.length, 6);
    assert.ok(weeks.every(week => week.days.length === 7));
    assert.deepStrictEqual(
        weeks[0].days.map(day => day.day),
        [29, 30, 1, 2, 3, 4, 5],
    );
    assert.deepStrictEqual(
        weeks[0].days.map(day => day.inMonth),
        [false, false, true, true, true, true, true],
    );
    assert.deepStrictEqual(
        weeks.flatMap(week => week.days).filter(day => day.today).map(day => day.key),
        ["2026-07-26"],
    );
    assert.ok(weeks.flatMap(week => week.days).every(day => !Object.hasOwn(day, "selected")));
    assert.deepStrictEqual(
        weeks[5].days.map(day => day.day),
        [3, 4, 5, 6, 7, 8, 9],
    );
});

test("monthGrid marks a leap day and supports Sunday-first ordering", () => {
    const leapMonth = calendar.monthGrid(2024, 1, 1, "2024-02-29");
    const leapDay = leapMonth.flatMap(week => week.days).find(day => day.key === "2024-02-29");
    assert.ok(leapDay);
    assert.equal(leapDay.inMonth, true);
    assert.equal(leapDay.today, true);

    const sunday = calendar.monthGrid(2026, 6, 0, "");
    assert.deepStrictEqual(
        sunday[0].days.map(day => day.day),
        [28, 29, 30, 1, 2, 3, 4],
    );
    assert.deepStrictEqual(calendar.weekdayOrder(0), [0, 1, 2, 3, 4, 5, 6]);
    assert.deepStrictEqual(calendar.weekdayOrder(1), [1, 2, 3, 4, 5, 6, 0]);
});

test("calendar navigation rolls across years", () => {
    assert.deepStrictEqual(calendar.stepMonth(2026, 0, -1), { year: 2025, month: 11 });
    assert.deepStrictEqual(calendar.stepMonth(2026, 11, 1), { year: 2027, month: 0 });
    assert.deepStrictEqual(calendar.stepMonth(2026, 6, 12), { year: 2027, month: 6 });
});

test("week start preferences follow locale until explicitly set", () => {
    assert.equal(calendar.normalizedWeekStart(undefined, 0), 0);
    assert.equal(calendar.normalizedWeekStart("garbage", 0), 0);
    assert.equal(calendar.normalizedWeekStart("monday", 0), 1);
    assert.equal(calendar.normalizedWeekStart("SUN", 1), 0);
    assert.equal(calendar.weekStartSettingName(0), "sunday");
    assert.equal(calendar.weekStartSettingName(1), "monday");
    assert.equal(calendar.toggledWeekStart(0), 1);
    assert.equal(calendar.toggledWeekStart(1), 0);
});

test("ISO weeks carry their ISO year at both calendar-year boundaries", () => {
    assert.deepStrictEqual(calendar.isoWeekInfo(2021, 0, 1), { week: 53, year: 2020 });
    assert.deepStrictEqual(calendar.isoWeekInfo(2022, 0, 1), { week: 52, year: 2021 });
    assert.deepStrictEqual(calendar.isoWeekInfo(2026, 0, 1), { week: 1, year: 2026 });
    assert.deepStrictEqual(calendar.monthGrid(2021, 0, 0, "")[0], {
        week: 53,
        isoWeek: 53,
        isoYear: 2020,
        days: calendar.monthGrid(2021, 0, 0, "")[0].days,
    });
});

test("year progress uses the supplied year, including leap years and endpoints", () => {
    assert.equal(calendar.daysInYear(2024), 366);
    assert.equal(calendar.daysInYear(2026), 365);
    assert.equal(calendar.yearProgress(2026, 0, 1), 0);
    assert.equal(calendar.yearProgress(2026, 11, 31), 1);
    assert.equal(calendar.yearProgress(2024, 0, 1), 0);
    assert.equal(calendar.yearProgress(2024, 11, 31), 1);
    assert.equal(calendar.yearProgressPercent(2026, 0, 1), 0);
    assert.equal(calendar.yearProgressPercent(2026, 11, 31), 100);
    assert.equal(calendar.yearProgressPercent(2024, 11, 31), 100);
});

test("the clock preserves its presentation and only left click opens Calendar Panel", () => {
    const clock = source("modules/Clock.qml");
    assert.match(clock, /horizontalCenterOffset:\s*8\.75/);
    assert.match(clock, /ddd, dd\. MMM hh:mm AP/);
    assert.match(clock, /precision:\s*SystemClock\.Minutes/);
    assert.match(clock, /acceptedButtons:\s*Qt\.LeftButton/);
    assert.match(clock, /onClicked:\s*calendarPanel\.toggle\(\)/);
    assert.doesNotMatch(clock, /onEntered|hover.*open|Qt\.RightButton|Qt\.MiddleButton/);
});

test("Calendar Panel browses, persists week ordering, and keeps day cells read-only", () => {
    const panel = source("modules/CalendarPanel.qml");
    assert.match(panel, /anchor\.item:\s*root\.target/);
    assert.match(panel, /anchor\.rect\.y:\s*root\.target \? root\.target\.height/);
    assert.match(panel, /color:\s*Theme\.background/);
    assert.match(panel, /border\.color:\s*Theme\.accent/);
    assert.match(panel, /HyprlandFocusGrab\s*\{[\s\S]*active:\s*root\.shown/);
    assert.match(panel, /Keys\.onEscapePressed:\s*root\.close\(\)/);
    assert.match(panel, /function toggle\(\)/);
    assert.match(panel, /root\.labelLocale\.monthName/);
    assert.match(panel, /root\.labelLocale\.dayName/);
    assert.match(panel, /opacity:\s*modelData\.inMonth \? 1 : 0\.38/);
    assert.match(panel, /border\.width:\s*modelData\.today \? 1 : 0/);
    assert.match(panel, /property int viewYear/);
    assert.match(panel, /property int viewMonth/);
    assert.match(panel, /function moveMonth\(delta/);
    assert.match(panel, /function moveYear\(delta/);
    assert.match(panel, /Keys\.onPressed/);
    assert.match(panel, /Qt\.Key_Left/);
    assert.match(panel, /Qt\.Key_Right/);
    assert.match(panel, /Qt\.Key_Up/);
    assert.match(panel, /Qt\.Key_Down/);
    assert.match(panel, /Qt\.Key_T/);
    assert.match(panel, /Qt\.Key_W/);
    assert.match(panel, /if \(event\.angleDelta\.y === 0\)/);
    assert.match(panel, /event\.angleDelta\.y > 0 \? -1 : 1/);
    // WheelHandler never fires on this Wayland/Qt build; only MouseArea.onWheel does.
    assert.doesNotMatch(panel, /WheelHandler\s*\{/);
    assert.match(panel, /MouseArea \{[\s\S]*?acceptedButtons: Qt\.NoButton[\s\S]*?onWheel:[\s\S]*?root\.moveMonth/);
    assert.match(panel, /modelData\.week/);
    assert.match(panel, /yearDone: Calendar\.yearProgress\(/);
    assert.match(panel, /function toggleWeekStart\(\)/);
    assert.match(panel, /CalendarState\.setWeekStart/);
    assert.match(panel, /root\.viewYear = root\.today\.getFullYear\(\)/);
    assert.match(panel, /root\.viewMonth = root\.today\.getMonth\(\)/);
    assert.match(panel, /weekStartToggleLabel/);

    const gridStart = panel.indexOf("model: modelData.days");
    const gridEnd = panel.indexOf("height: 24", gridStart);
    const dayCell = panel.slice(gridStart, gridEnd);
    assert.doesNotMatch(dayCell, /MouseArea|TapHandler|onClicked/);
});

test("CalendarState is a shared file-backed singleton in the dotfiles state directory", () => {
    const state = source("CalendarState.qml");
    const panel = panelSourceForState();
    const bar = source("modules/Bar.qml");
    assert.match(state, /pragma Singleton/);
    assert.match(state, /\.local\/state\/dotfiles/);
    assert.match(state, /calendar-week-start/);
    assert.match(state, /watchChanges:\s*true/);
    assert.match(state, /function setWeekStart\(value/);
    assert.match(state, /mkdir -p/);
    assert.match(state, /onFileChanged:\s*reload\(\)/);
    assert.doesNotMatch(state, /root\.(writeProcess|weekStartFile)\b/);
    assert.match(panel, /CalendarState\.weekStartSetting/);
    assert.match(panel, /CalendarState\.setWeekStart/);
    assert.doesNotMatch(panel, /property\s+(?:string|int|bool)\s+(?:saved)?WeekStart/);
    assert.match(bar, /Clock\s*\{/);
});

function panelSourceForState() {
    return source("modules/CalendarPanel.qml");
}

test("the calendar port records the pinned Omarchy source boundary", () => {
    const provenance = source("modules/calendar-PROVENANCE.md");
    assert.match(provenance, /4\.0\.0\.alpha/);
    assert.match(provenance, /83881e979b35468c3e7d60b171e319ede61a88fd/);
    assert.match(provenance, /shell\/plugins\/panels\/clock\/Model\.js/);
    assert.match(provenance, /shell\/plugins\/panels\/clock\/Panel\.qml/);
    assert.match(provenance, /MIT license/i);
    assert.match(provenance, /David Heinemeier Hansson/);
    assert.match(provenance, /Permission is hereby granted/);
    assert.match(provenance, /adapt/i);
    assert.match(provenance, /omitted|omit/i);
    assert.doesNotMatch(source("modules/Clock.qml"), /resources\/omarchy/);
    assert.doesNotMatch(source("modules/CalendarPanel.qml"), /resources\/omarchy/);
    assert.doesNotMatch(source("modules/lib/calendar.js"), /resources\/omarchy/);
});
