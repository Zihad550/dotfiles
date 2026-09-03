// Date arithmetic for the Calendar Panel. The panel owns locale formatting;
// keeping this module free of Qt makes its edge cases testable under Node.


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

function normalizeWeekStart(value) {
    if (typeof value === "number" && isFinite(value))
        return ((Math.round(value) % 7) + 7) % 7
    return 1
}

function weekdayOrder(weekStart) {
    var start = normalizeWeekStart(weekStart)
    var weekdays = []
    for (var index = 0; index < 7; index++)
        weekdays.push((start + index) % 7)
    return weekdays
}

// Always return six rows of seven cells. UTC dates keep the grid stable over
// daylight-saving transitions in the local timezone.
function monthGrid(year, month, weekStart, todayKey) {
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
        for (var dayIndex = 0; dayIndex < 7; dayIndex++) {
            var cellYear = cursor.getUTCFullYear()
            var cellMonth = cursor.getUTCMonth()
            var cellDay = cursor.getUTCDate()
            var weekday = cursor.getUTCDay()
            var key = dateKey(cellYear, cellMonth, cellDay)
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

        weeks.push({ days: days })
    }
    return weeks
}

if (typeof module !== "undefined") {
    module.exports = {
        dateKey: dateKey,
        keyForDate: keyForDate,
        isLeapYear: isLeapYear,
        daysInMonth: daysInMonth,
        weekdayOrder: weekdayOrder,
        monthGrid: monthGrid,
    }
}
