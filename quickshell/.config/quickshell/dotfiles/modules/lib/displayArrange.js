var NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
var ALIGN_TOLERANCE = 64;

function number(value, fallback) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : fallback;
}

function parseMonitors(text) {
    if (typeof text !== "string" || text.trim() === "")
        return [];

    try {
        var monitors = JSON.parse(text);
        if (!Array.isArray(monitors))
            return [];

        return monitors.filter(function (monitor) {
            return monitor && typeof monitor.name === "string" && monitor.name !== ""
                && monitor.disabled !== true;
        }).map(function (monitor) {
            var scale = number(monitor.scale, 1);
            if (scale <= 0)
                scale = 1;

            var width = number(monitor.width, 0);
            var height = number(monitor.height, 0);
            var transform = Math.round(number(monitor.transform, 0));
            var w = Math.round(width / scale);
            var h = Math.round(height / scale);
            if (Math.abs(transform) % 2 === 1) {
                var swap = w;
                w = h;
                h = swap;
            }

            return {
                name: monitor.name,
                description: typeof monitor.description === "string" ? monitor.description : "",
                x: number(monitor.x, 0),
                y: number(monitor.y, 0),
                w: w,
                h: h,
                width: width,
                height: height,
                refreshRate: number(monitor.refreshRate, 0),
                scale: scale,
                transform: transform
            };
        });
    } catch (error) {
        return [];
    }
}

function centerOf(rect) {
    return {
        x: rect.x + rect.w / 2,
        y: rect.y + rect.h / 2
    };
}

function distanceToRect(point, rect) {
    var dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.w));
    var dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.h));
    return Math.sqrt(dx * dx + dy * dy);
}

function nearestAnchor(monitors, movingName, rect) {
    if (!Array.isArray(monitors) || !rect)
        return null;

    var point = centerOf(rect);
    var best = null;
    var bestDistance = Infinity;
    for (var i = 0; i < monitors.length; i++) {
        var monitor = monitors[i];
        if (!monitor || monitor.name === movingName)
            continue;
        var distance = distanceToRect(point, monitor);
        if (distance < bestDistance) {
            best = monitor;
            bestDistance = distance;
        }
    }
    return best;
}

function clampOffset(value, start, anchorSize, movingSize) {
    var min = start - movingSize + 1;
    var max = start + anchorSize - 1;
    return Math.max(min, Math.min(max, value));
}

function alignedOffset(value, start, anchorSize, movingSize) {
    var clamped = clampOffset(value, start, anchorSize, movingSize);
    var candidates = [
        start,
        Math.round(start + (anchorSize - movingSize) / 2),
        start + anchorSize - movingSize
    ];
    var best = clamped;
    var bestDistance = ALIGN_TOLERANCE + 1;
    for (var i = 0; i < candidates.length; i++) {
        var distance = Math.abs(clamped - candidates[i]);
        if (distance < bestDistance) {
            best = candidates[i];
            bestDistance = distance;
        }
    }
    return bestDistance <= ALIGN_TOLERANCE ? best : clamped;
}

function snapToEdge(anchor, rect) {
    var anchorCenter = centerOf(anchor);
    var rectCenter = centerOf(rect);
    var dx = rectCenter.x - anchorCenter.x;
    var dy = rectCenter.y - anchorCenter.y;
    var halfWidth = Math.max(1, anchor.w / 2);
    var halfHeight = Math.max(1, anchor.h / 2);
    var horizontal = Math.abs(dx) / halfWidth >= Math.abs(dy) / halfHeight;

    if (horizontal) {
        var y = alignedOffset(rect.y, anchor.y, anchor.h, rect.h);
        if (dx >= 0)
            return { x: anchor.x + anchor.w, y: y, edge: "right" };
        return { x: anchor.x - rect.w, y: y, edge: "left" };
    }

    var x = alignedOffset(rect.x, anchor.x, anchor.w, rect.w);
    if (dy >= 0)
        return { x: x, y: anchor.y + anchor.h, edge: "bottom" };
    return { x: x, y: anchor.y - rect.h, edge: "top" };
}

function overlaps(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w
        && a.y < b.y + b.h && b.y < a.y + a.h;
}

function cloneMonitor(monitor) {
    return {
        name: monitor.name,
        description: monitor.description,
        x: monitor.x,
        y: monitor.y,
        w: monitor.w,
        h: monitor.h,
        width: monitor.width,
        height: monitor.height,
        refreshRate: monitor.refreshRate,
        scale: monitor.scale,
        transform: monitor.transform
    };
}

function normalize(monitors) {
    if (!Array.isArray(monitors) || monitors.length === 0)
        return [];

    var minX = Infinity;
    var minY = Infinity;
    for (var i = 0; i < monitors.length; i++) {
        minX = Math.min(minX, monitors[i].x);
        minY = Math.min(minY, monitors[i].y);
    }

    return monitors.map(function (monitor) {
        var copy = cloneMonitor(monitor);
        copy.x = monitor.x - minX;
        copy.y = monitor.y - minY;
        return copy;
    });
}

function place(monitors, movingName, rect) {
    if (!Array.isArray(monitors) || !rect)
        return { ok: false, monitors: monitors, anchor: null, edge: "", blocker: null };

    var anchor = nearestAnchor(monitors, movingName, rect);
    if (!anchor)
        return { ok: false, monitors: monitors, anchor: null, edge: "", blocker: null };

    var snapped = snapToEdge(anchor, rect);
    var placed = monitors.map(function (monitor) {
        if (monitor.name !== movingName)
            return monitor;
        var copy = cloneMonitor(monitor);
        copy.x = snapped.x;
        copy.y = snapped.y;
        return copy;
    });

    var moving = null;
    for (var i = 0; i < placed.length; i++) {
        if (placed[i].name === movingName) {
            moving = placed[i];
            break;
        }
    }
    if (!moving)
        return { ok: false, monitors: monitors, anchor: anchor, edge: snapped.edge, blocker: null };

    for (var j = 0; j < placed.length; j++) {
        var other = placed[j];
        if (other.name === movingName)
            continue;
        if (overlaps(moving, other)) {
            return {
                ok: false,
                monitors: monitors,
                anchor: anchor,
                edge: snapped.edge,
                blocker: other
            };
        }
    }

    var normalized = normalize(placed);
    var normalizedAnchor = null;
    for (var k = 0; k < normalized.length; k++) {
        if (normalized[k].name === anchor.name) {
            normalizedAnchor = normalized[k];
            break;
        }
    }

    return {
        ok: true,
        monitors: normalized,
        anchor: normalizedAnchor,
        edge: snapped.edge,
        blocker: null
    };
}

function trim(value, decimals) {
    var factor = Math.pow(10, decimals);
    var rounded = Math.round(value * factor) / factor;
    var text = String(rounded);
    if (text.indexOf("e") !== -1)
        text = rounded.toFixed(decimals);
    if (text.indexOf(".") !== -1)
        text = text.replace(/0+$/, "").replace(/\.$/, "");
    return text;
}

function luaChunk(monitors) {
    if (!Array.isArray(monitors))
        return "";

    var lines = [];
    for (var i = 0; i < monitors.length; i++) {
        var monitor = monitors[i];
        if (!monitor || monitor.disabled === true)
            continue;
        if (typeof monitor.name !== "string" || !NAME_PATTERN.test(monitor.name))
            return "";

        var transform = monitor.transform === undefined ? 0 : monitor.transform;
        lines.push("hl.monitor({ output = '" + monitor.name
            + "', mode = '" + monitor.width + "x" + monitor.height + "@"
            + trim(number(monitor.refreshRate, 0), 3)
            + "', position = '" + monitor.x + "x" + monitor.y
            + "', scale = " + trim(number(monitor.scale, 1), 2)
            + ", transform = " + transform + " })");
    }
    return lines.join("\n");
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        parseMonitors: parseMonitors,
        cloneMonitor: cloneMonitor,
        nearestAnchor: nearestAnchor,
        snapToEdge: snapToEdge,
        place: place,
        normalize: normalize,
        luaChunk: luaChunk
    };
}
