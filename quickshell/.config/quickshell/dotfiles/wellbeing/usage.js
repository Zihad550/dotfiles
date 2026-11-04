function empty() {
    return { version: 1, paused: false, days: {} };
}

function dayKey(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0")
        + "-" + String(date.getDate()).padStart(2, "0");
}

function parse(text) {
    const data = JSON.parse(text);
    if (!data || data.version !== 1 || typeof data.paused !== "boolean" || !data.days || typeof data.days !== "object" || Array.isArray(data.days))
        throw new Error("Unsupported usage history");
    for (const day of Object.keys(data.days)) {
        if (!dateOf(day) || !data.days[day] || typeof data.days[day] !== "object" || Array.isArray(data.days[day]))
            throw new Error("Invalid usage day");
        for (const app of Object.keys(data.days[day])) {
            if (typeof data.days[day][app] !== "number" || !Number.isFinite(data.days[day][app]) || data.days[day][app] < 0)
                throw new Error("Invalid application duration");
        }
    }
    return data;
}

function record(store, app, start, end) {
    if (!app || end <= start || end - start > 15000)
        return store;
    const next = { version: store.version, paused: store.paused, days: Object.assign({}, store.days) };
    while (start < end) {
        const date = new Date(start);
        const key = dayKey(date);
        const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
        const stop = Math.min(end, midnight);
        next.days[key] = JSON.parse(JSON.stringify(next.days[key] || {}));
        const previous = Object.prototype.hasOwnProperty.call(next.days[key], app) ? next.days[key][app] : 0;
        Object.defineProperty(next.days[key], app, { value: previous + (stop - start), enumerable: true, writable: true, configurable: true });
        start = stop;
    }
    return next;
}

function rows(store, days) {
    const totals = new Map();
    for (const day of days) {
        const apps = store.days[day] || {};
        for (const app of Object.keys(apps))
            totals.set(app, (totals.get(app) || 0) + apps[app]);
    }
    return Array.from(totals, ([app, milliseconds]) => ({ app, milliseconds }))
        .sort((a, b) => b.milliseconds - a.milliseconds || a.app.localeCompare(b.app));
}

function recentDays(now, count) {
    const date = new Date(now);
    const days = [];
    for (let i = 0; i < count; i++)
        days.push(dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - i)));
    return days;
}

function duration(milliseconds) {
    const minutes = Math.floor(milliseconds / 60000);
    if (milliseconds <= 0)
        return "0 min";
    if (minutes < 1)
        return "< 1 min";
    return minutes < 60 ? minutes + " min" : Math.floor(minutes / 60) + "h " + minutes % 60 + "m";
}

function dateOf(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key))
        return null;
    const parts = key.split("-").map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return dayKey(date) === key ? date : null;
}

function between(start, end) {
    const first = dateOf(start);
    const last = dateOf(end);
    if (!first || !last || first > last || (last - first) / 86400000 > 36600)
        return [];
    const days = [];
    for (const date = new Date(first); date <= last; date.setDate(date.getDate() + 1))
        days.push(dayKey(date));
    return days;
}

function range(store, now, preset, start, end) {
    const today = dayKey(new Date(now));
    if (preset === "custom") {
        if (!dateOf(start) || !dateOf(end))
            return [];
        return between(start, end > today ? today : end);
    }
    if (preset === "all") {
        const earliest = Object.keys(store.days).filter(key => key <= today).sort()[0] || today;
        return between(earliest, today);
    }
    return recentDays(now, Number(preset)).reverse();
}

function report(store, days, query, nameOf) {
    const needle = query.trim().toLowerCase();
    const matching = new Map();
    function matches(app) {
        if (!matching.has(app))
            matching.set(app, !needle || app.toLowerCase().includes(needle) || nameOf(app).toLowerCase().includes(needle));
        return matching.get(app);
    }
    const applications = rows(store, days).filter(entry => matches(entry.app));
    const daily = days.map(day => ({ day, milliseconds: rows(store, [day])
        .filter(entry => matches(entry.app)).reduce((sum, entry) => sum + entry.milliseconds, 0) }));
    const total = applications.reduce((sum, entry) => sum + entry.milliseconds, 0);
    const activeDays = daily.filter(day => day.milliseconds > 0).length;
    const busiest = daily.reduce((best, day) => day.milliseconds > best.milliseconds ? day : best,
        { day: "", milliseconds: 0 });
    const history = [];
    for (const day of days.slice().reverse()) {
        const entries = rows(store, [day]).filter(entry => matches(entry.app));
        if (entries.length === 0)
            continue;
        history.push({ heading: true, day, app: "", milliseconds: entries.reduce((sum, entry) => sum + entry.milliseconds, 0) });
        for (const entry of entries)
            history.push({ heading: false, day, app: entry.app, milliseconds: entry.milliseconds });
    }
    const bucketSize = Math.max(1, Math.ceil(daily.length / 31));
    const trend = [];
    for (let i = 0; i < daily.length; i += bucketSize) {
        const bucket = daily.slice(i, i + bucketSize);
        trend.push({ start: bucket[0].day, end: bucket[bucket.length - 1].day,
            milliseconds: bucket.reduce((sum, day) => sum + day.milliseconds, 0) });
    }
    let previous = 0;
    if (days.length) {
        const date = dateOf(days[0]);
        date.setDate(date.getDate() - 1);
        previous = rows(store, recentDays(date.getTime(), days.length)).filter(entry => matches(entry.app))
            .reduce((sum, entry) => sum + entry.milliseconds, 0);
    }
    return { applications, daily, total, average: days.length ? total / days.length : 0,
        activeDays, busiest, history, trend, bucketSize, previous };
}

if (typeof module !== "undefined")
    module.exports = { empty, dayKey, parse, record, rows, recentDays, duration, dateOf, between, range, report };
