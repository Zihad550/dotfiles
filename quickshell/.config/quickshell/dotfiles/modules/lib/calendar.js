// Date arithmetic for the Calendar Panel. The panel owns locale formatting;
// keeping this module free of Qt makes its edge cases testable under Node.

var MS_PER_DAY = 86400000
var WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

function pad2(value) {
    var number = Number(value)
    return (number < 10 ? "0" : "") + number
}

function dateKey(year, month, day) {
    return Number(year) + "-" + pad2(Number(month) + 1) + "-" + pad2(Number(day))
}

function keyForDate(date) {
    if (!date || isNaN(date.getTime()))
        return ""
    return dateKey(date.getFullYear(), date.getMonth(), date.getDate())
}

function isLeapYear(year) {
    var value = Number(year)
    return value % 4 === 0 && (value % 100 !== 0 || value % 400 === 0)
}

function daysInMonth(year, month) {
    return new Date(Date.UTC(Number(year), Number(month) + 1, 0)).getUTCDate()
}

function coerceWeekStart(value) {
    if (value === undefined || value === null)
        return null
    if (typeof value === "number")
        return isFinite(value) ? ((Math.round(value) % 7) + 7) % 7 : null

    var text = String(value).trim().toLowerCase()
    if (text === "")
        return null
    for (var index = 0; index < WEEKDAY_NAMES.length; index++) {
        if (WEEKDAY_NAMES[index] === text || WEEKDAY_NAMES[index].slice(0, 3) === text)
            return index
    }
    var parsed = parseInt(text, 10)
    return isFinite(parsed) ? ((parsed % 7) + 7) % 7 : null
}

// A missing or malformed preference follows the locale's first day. The
// one-argument form keeps the old helper's Monday fallback for callers that
// only need to normalize a numeric value.
function normalizedWeekStart(value, fallback) {
    var configured = coerceWeekStart(value)
    if (configured !== null)
        return configured
    var fallbackStart = coerceWeekStart(fallback)
    return fallbackStart === null ? 1 : fallbackStart
}

function normalizeWeekStart(value) {
    return normalizedWeekStart(value, 1)
}

function weekStartSettingName(index) {
    return WEEKDAY_NAMES[normalizedWeekStart(index, 1)]
}

function toggledWeekStart(index) {
    return normalizedWeekStart(index, 1) === 1 ? 0 : 1
}

function weekdayOrder(weekStart) {
    var start = normalizeWeekStart(weekStart)
    var weekdays = []
    for (var index = 0; index < 7; index++)
        weekdays.push((start + index) % 7)
    return weekdays
}

// ISO-8601 week number. The week owning Thursday is the ISO week for a date,
// which also handles the first and last few days of a calendar year correctly.
function isoWeek(year, month, day) {
    var date = new Date(Date.UTC(Number(year), Number(month), Number(day)))
    var weekday = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - weekday)
    var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    return Math.ceil(((date.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7)
}

function isoWeekYear(year, month, day) {
    var date = new Date(Date.UTC(Number(year), Number(month), Number(day)))
    var weekday = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - weekday)
    return date.getUTCFullYear()
}

function isoWeekInfo(year, month, day) {
    return {
        week: isoWeek(year, month, day),
        year: isoWeekYear(year, month, day),
    }
}

function dayOfYear(year, month, day) {
    return Math.round((Date.UTC(year, month, day) - Date.UTC(year, 0, 1)) / MS_PER_DAY) + 1
}

function daysInYear(year) {
    return dayOfYear(year, 11, 31)
}

// Fraction of the calendar-year interval elapsed. Using the interval between
// January 1 and December 31 makes both endpoints exact, including leap years.
function yearProgress(year, month, day) {
    var total = daysInYear(year)
    if (total <= 0)
        return 0
    var span = Math.max(1, total - 1)
    return Math.max(0, Math.min(1, (dayOfYear(year, month, day) - 1) / span))
}

function yearProgressPercent(year, month, day) {
    return Math.round(yearProgress(year, month, day) * 100)
}

// Always return six rows of seven cells. UTC dates keep the grid stable over
// daylight-saving transitions in the local timezone.
function monthGrid(year, month, weekStart, todayKey) {
    // Preserve the original three-argument convenience form:
    // monthGrid(year, month, todayKey).
    if (todayKey === undefined && typeof weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        todayKey = weekStart
        weekStart = 1
    }

    var first = new Date(Date.UTC(year, month, 1))
    var displayedYear = first.getUTCFullYear()
    var displayedMonth = first.getUTCMonth()
    var start = normalizeWeekStart(weekStart)
    var leading = (first.getUTCDay() - start + 7) % 7
    var cursor = new Date(Date.UTC(displayedYear, displayedMonth, 1 - leading))
    var today = String(todayKey || "")
    var weeks = []

    for (var weekIndex = 0; weekIndex < 6; weekIndex++) {
        var days = []
        var thursday = null
        for (var dayIndex = 0; dayIndex < 7; dayIndex++) {
            var cellYear = cursor.getUTCFullYear()
            var cellMonth = cursor.getUTCMonth()
            var cellDay = cursor.getUTCDate()
            var weekday = cursor.getUTCDay()
            var key = dateKey(cellYear, cellMonth, cellDay)
            if (weekday === 4)
                thursday = { year: cellYear, month: cellMonth, day: cellDay }
            days.push({
                key: key,
                year: cellYear,
                month: cellMonth,
                day: cellDay,
                weekday: weekday,
                inMonth: cellYear === displayedYear && cellMonth === displayedMonth,
                weekend: weekday === 0 || weekday === 6,
                today: key === today,
            })
            cursor.setUTCDate(cursor.getUTCDate() + 1)
        }

        // Number a row by the ISO week containing its Thursday. This keeps
        // Sunday-first rows aligned with Monday-first rows at year edges.
        var anchor = thursday || days[0]
        var info = isoWeekInfo(anchor.year, anchor.month, anchor.day)
        weeks.push({ week: info.week, isoWeek: info.week, isoYear: info.year, days: days })
    }
    return weeks
}

function stepMonth(year, month, delta) {
    var target = new Date(Date.UTC(Number(year), Number(month) + Number(delta), 1))
    return { year: target.getUTCFullYear(), month: target.getUTCMonth() }
}

if (typeof module !== "undefined") {
    module.exports = {
        dateKey: dateKey,
        keyForDate: keyForDate,
        isLeapYear: isLeapYear,
        daysInMonth: daysInMonth,
        normalizedWeekStart: normalizedWeekStart,
        normalizeWeekStart: normalizeWeekStart,
        weekStartSettingName: weekStartSettingName,
        toggledWeekStart: toggledWeekStart,
        weekdayOrder: weekdayOrder,
        isoWeek: isoWeek,
        isoWeekYear: isoWeekYear,
        isoWeekInfo: isoWeekInfo,
        dayOfYear: dayOfYear,
        daysInYear: daysInYear,
        yearProgress: yearProgress,
        yearProgressPercent: yearProgressPercent,
        monthGrid: monthGrid,
        stepMonth: stepMonth,
    }
}
