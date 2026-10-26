var pages = [
    { id: "appearance", group: "Style", title: "Appearance", icon: "◐", description: "Make this desktop yours.", keywords: "theme wallpaper background colors font family typography" },
    { id: "windows", group: "Style", title: "Windows", icon: "▣", description: "Space, shape, and motion.", keywords: "hyprland gaps borders rounding animations blur shadows" },
    { id: "input", group: "Setup", title: "Keyboard & Mouse", icon: "⌨", description: "Choose how you move through your desktop.", keywords: "keyboard layout mouse pointer sensitivity touchpad scroll focus" },
    { id: "displays", group: "Setup", title: "Displays", icon: "▤", description: "Give every screen its place.", keywords: "monitor arrangement layout brightness" },
    { id: "defaults", group: "Setup", title: "Default Apps", icon: "▦", description: "The right app for every task.", keywords: "browser terminal editor files roles applications" },
    { id: "tailscale", group: "Setup", title: "Tailscale DNS", icon: "⇄", description: "Choose which domains Tailscale answers.", keywords: "tailscale dns domain magicdns tailnet split resolver" },
    { id: "panels", group: "Panels", title: "Bar & Panels", icon: "☷", description: "Keep the things you need within reach.", keywords: "bar height clock time workspaces kanata voice network bluetooth audio power" }
];

function row(key, title, description, kind, extra) {
    return Object.assign({ key: key, title: title, description: description, kind: kind }, extra || {});
}

function sections(page, data) {
    switch (page) {
    case "appearance":
        return [{ title: "Personalization", rows: [
            row("theme", "Desktop theme", "Colors update across your desktop and supported apps.", "theme", { choices: data.themes || [] }),
            row("wallpaper", "Wallpaper", "Choose an image from your computer.", "wallpaper"),
            row("font", "Font family", "Monospace font for Quickshell, Ghostty, and Zed.", "font", { choices: data.fonts || [] })
        ] }];
    case "windows":
        return [
            { title: "Window geometry", rows: [
                row("general.gaps_in", "Inner gaps", "Space between tiled windows, in pixels.", "number", { min: 0, max: 40 }),
                row("general.gaps_out", "Outer gaps", "Space around the edges of your screen, in pixels.", "number", { min: 0, max: 80 }),
                row("general.border_size", "Border width", "Window border thickness, in pixels.", "number", { min: 0, max: 10 }),
                row("decoration.rounding", "Rounded corners", "Corner radius, in pixels.", "number", { min: 0, max: 30 })
            ] },
            { title: "Effects", rows: [
                row("animations.enabled", "Animations", "Animate windows and workspace transitions.", "toggle"),
                row("decoration.dim_inactive", "Dim inactive windows", "Help the focused window stand out.", "toggle"),
                row("decoration.blur.enabled", "Background blur", "Blur behind translucent windows.", "toggle"),
                row("decoration.shadow.enabled", "Window shadows", "Add depth around window edges.", "toggle")
            ] }
        ];
    case "input":
        return [
            { title: "Keyboard", rows: [
                row("input.kb_layout", "Keyboard layout", "Use XKB layout codes, separated by commas (for example us,bd).", "text")
            ] },
            { title: "Pointer & touchpad", rows: [
                row("input.sensitivity", "Pointer speed", "Choose a value from −1 (slower) to 1 (faster).", "speed"),
                row("input.follow_mouse", "Focus follows pointer", "Choose when moving the pointer changes window focus.", "choice", { choices: [
                    { label: "Click to focus", value: 0 }, { label: "Focus and refocus", value: 1 }, { label: "Focus only", value: 2 }
                ] }),
                row("input.touchpad.natural_scroll", "Natural scrolling", "Content follows your fingers on the touchpad.", "toggle")
            ] }
        ];
    case "displays":
        return [{ title: "Connected displays", rows: [
            row("arrange", "Arrange displays", "Move screens, set their scale, and save a layout.", "action", { action: "arrange", label: "Arrange…" }),
            row("display-panel", "Display controls", "Enable or disable outputs from the Display panel.", "action", { action: "displays", label: "Open panel" }),
            row("brightness", "Brightness", "Adjust brightness in Quick Settings.", "action", { action: "quick", label: "Open panel" })
        ] }];
    case "defaults":
        return [{ title: "Applications", rows: (data.defaults?.roles || []).map(function(role) {
            return row(role.key, role.name, role.stale ? "Your previous selection is unavailable. Choose an installed app." : role.description,
                "default-app", { choices: (role.candidates || []).map(function(candidate) {
                    return { label: candidate.name, value: candidate.key };
                }), selected: role.resolved });
        }) }];
    case "tailscale":
        return [
            { title: "Add a domain", rows: [
                row("tailscale.add", "Domain", "Enter a domain or paste a link on it. It and its subdomains resolve through Tailscale DNS; adding one asks for your password.", "domain-add")
            ] },
            { title: "Answered by Tailscale", rows: (data.tailscaleDomains || []).map(function(domain) {
                return row("tailscale.domain." + domain, domain, "Including subdomains, through 100.100.100.100.", "tailscale-domain");
            }), empty: "No domains yet. Your default DNS answers every lookup." }
        ];
    case "panels":
        return [
            { title: "Top bar", rows: [
                row("panels.barHeight", "Bar height", "Height of the top bar, in pixels.", "number", { min: 24, max: 56 }),
                row("panels.workspaces", "Workspaces", "Show workspace buttons on the left.", "toggle"),
                row("panels.clock", "Clock & calendar", "Show the clock and its calendar button.", "toggle"),
                row("panels.clock24h", "24-hour time", "Use 24-hour time in the bar clock.", "toggle"),
                row("panels.kanata", "Keyboard layer", "Show the Kanata keyboard layer indicator.", "toggle"),
                row("panels.voxtype", "Voice typing", "Show voice typing status when active.", "toggle")
            ] },
            { title: "Quick Settings panels", rows: [
                row("audio", "Sound", "Volume, microphones, and audio devices.", "action", { action: "audio", label: "Open panel" }),
                row("network", "Network", "Wi-Fi connections and network status.", "action", { action: "network", label: "Open panel" }),
                row("bluetooth", "Bluetooth", "Pair and manage Bluetooth devices.", "action", { action: "bluetooth", label: "Open panel" }),
                row("power", "Power", "Suspend, restart, and end the session.", "action", { action: "power", label: "Open panel" })
            ] }
        ];
    }
    return [];
}

function matches(page, query, data) {
    var text = page.title + " " + page.group + " " + page.keywords;
    sections(page.id, data || {}).forEach(function(section) {
        section.rows.forEach(function(entry) { text += " " + entry.title + " " + entry.description; });
    });
    return text.toLowerCase().includes(query.trim().toLowerCase());
}
