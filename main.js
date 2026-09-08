/* Building Visit Planner
 *
 * All input happens inside a single <dialog>: typed fields for location names,
 * scroll-wheel pickers for every time value, and per-field verification that
 * runs as you go instead of at the end.
 */

const MIN_LOCATIONS = 2;
const MAX_LOCATIONS = 12;
const TIME_STEP = 5;      // minutes between selectable clock values
const DURATION_STEP = 5;  // minutes between selectable stay lengths
const DURATION_MIN = 5;
const DURATION_MAX = 240;

const ITEM_HEIGHT = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--item-h")
) || 36;

/* ------------------------------------------------------------------ *
 * Scroll-wheel picker
 * ------------------------------------------------------------------ */

/**
 * One scrollable column of values. Snapping is done by CSS; this class just
 * maps scroll position <-> selected index and reports settled changes.
 */
class WheelColumn {
    constructor({ label, values, initial, onChange }) {
        this.values = values;
        this.onChange = onChange;
        this.index = Math.max(0, values.findIndex((v) => v.value === initial));
        this.programmatic = false;

        this.el = document.createElement("div");
        this.el.className = "wheel";
        this.el.tabIndex = 0;
        this.el.setAttribute("role", "listbox");
        this.el.setAttribute("aria-label", label);

        const track = document.createElement("div");
        track.className = "wheel-track";

        this.items = values.map((v, i) => {
            const item = document.createElement("div");
            item.className = "wheel-item";
            item.textContent = v.label;
            item.setAttribute("role", "option");
            item.addEventListener("click", () => this.setIndex(i, true));
            track.appendChild(item);
            return item;
        });

        this.el.appendChild(track);
        this.paint();

        this.el.addEventListener("scroll", () => this.onScroll(), { passive: true });
        this.el.addEventListener("keydown", (e) => this.onKeyDown(e));
    }

    get value() {
        return this.values[this.index].value;
    }

    onScroll() {
        const next = this.clamp(Math.round(this.el.scrollTop / ITEM_HEIGHT));
        if (next !== this.index) {
            this.index = next;
            this.paint();
        }
        clearTimeout(this.settleTimer);
        this.settleTimer = setTimeout(() => {
            if (this.programmatic) {
                this.programmatic = false;
                return;
            }
            this.onChange();
        }, 130);
    }

    onKeyDown(e) {
        const jump = { ArrowUp: -1, ArrowDown: 1, PageUp: -3, PageDown: 3 }[e.key];
        if (jump === undefined && e.key !== "Home" && e.key !== "End") return;
        e.preventDefault();

        let next = this.index + (jump || 0);
        if (e.key === "Home") next = 0;
        if (e.key === "End") next = this.values.length - 1;
        this.setIndex(next, true);
    }

    /** Move to an index. `notify` distinguishes user intent from setup. */
    setIndex(index, notify) {
        const next = this.clamp(index);
        const changed = next !== this.index;
        this.index = next;
        this.paint();
        this.scrollToIndex(!notify);
        if (notify && changed) this.onChange();
    }

    setValue(value, notify) {
        const i = this.values.findIndex((v) => v.value === value);
        if (i >= 0) this.setIndex(i, notify);
    }

    /** Re-align the scroll position; needed after the dialog becomes visible. */
    sync() {
        this.scrollToIndex(true);
    }

    scrollToIndex(instant) {
        const top = this.index * ITEM_HEIGHT;
        // Already there (or hidden, so scrolling is a no-op): moving on would
        // leave the guard flag set and swallow the next real change.
        if (Math.abs(this.el.scrollTop - top) < 1) {
            this.programmatic = false;
            return;
        }
        this.programmatic = true;
        this.el.scrollTo({ top, behavior: instant ? "auto" : "smooth" });
    }

    paint() {
        this.items.forEach((item, i) => {
            const on = i === this.index;
            item.classList.toggle("selected", on);
            item.setAttribute("aria-selected", String(on));
        });
    }

    clamp(i) {
        return Math.min(this.values.length - 1, Math.max(0, i));
    }
}

/** Groups columns inside one bordered wheel housing. */
class WheelSet {
    constructor(host, columns, onChange) {
        this.onChange = onChange;
        this.columns = {};

        const set = document.createElement("div");
        set.className = "wheel-set";

        columns.forEach((spec) => {
            if (spec.separator) {
                const sep = document.createElement("span");
                sep.className = "wheel-sep";
                sep.textContent = spec.separator;
                sep.setAttribute("aria-hidden", "true");
                set.appendChild(sep);
                return;
            }
            const col = new WheelColumn({ ...spec, onChange: () => this.onChange() });
            col.el.dataset.unit = spec.unit;
            this.columns[spec.unit] = col;
            set.appendChild(col.el);
        });

        host.innerHTML = "";
        host.appendChild(set);
        registry.push(this);
    }

    sync() {
        Object.values(this.columns).forEach((c) => c.sync());
    }
}

/** Every wheel on the page, so they can be re-aligned when the dialog opens. */
const registry = [];

/* ------------------------------------------------------------------ *
 * Time helpers (all clock values are minutes past midnight)
 * ------------------------------------------------------------------ */

function hourValues() {
    return Array.from({ length: 12 }, (_, i) => {
        const h = i + 1;
        return { value: h, label: String(h).padStart(2, "0") };
    });
}

function minuteValues() {
    const out = [];
    for (let m = 0; m < 60; m += TIME_STEP) {
        out.push({ value: m, label: String(m).padStart(2, "0") });
    }
    return out;
}

function durationValues() {
    const out = [];
    for (let m = DURATION_MIN; m <= DURATION_MAX; m += DURATION_STEP) {
        out.push({ value: m, label: `${m} min` });
    }
    return out;
}

function toMinutes({ hour, minute, meridiem }) {
    const h24 = (hour % 12) + (meridiem === "PM" ? 12 : 0);
    return h24 * 60 + minute;
}

function fromMinutes(total) {
    const h24 = Math.floor(total / 60) % 24;
    return {
        hour: h24 % 12 === 0 ? 12 : h24 % 12,
        minute: total % 60,
        meridiem: h24 < 12 ? "AM" : "PM",
    };
}

function formatClock(total) {
    const { hour, minute, meridiem } = fromMinutes(total);
    return `${hour}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function formatSpan(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
}

function buildTimeWheel(host, initialMinutes, onChange) {
    const start = fromMinutes(initialMinutes);
    const set = new WheelSet(
        host,
        [
            { unit: "hour", label: "Hour", values: hourValues(), initial: start.hour },
            { separator: ":" },
            { unit: "minute", label: "Minute", values: minuteValues(), initial: start.minute },
            {
                unit: "meridiem",
                label: "AM or PM",
                values: [{ value: "AM", label: "AM" }, { value: "PM", label: "PM" }],
                initial: start.meridiem,
            },
        ],
        onChange
    );
    set.read = () =>
        toMinutes({
            hour: set.columns.hour.value,
            minute: set.columns.minute.value,
            meridiem: set.columns.meridiem.value,
        });
    return set;
}

function buildDurationWheel(host, initial, onChange) {
    const set = new WheelSet(
        host,
        [{ unit: "minutes", label: "Minutes at this location", values: durationValues(), initial }],
        onChange
    );
    set.read = () => set.columns.minutes.value;
    return set;
}

/* ------------------------------------------------------------------ *
 * Dialog + form
 * ------------------------------------------------------------------ */

const dialog = document.getElementById("plannerDialog");
const form = document.getElementById("plannerForm");
const locationList = document.getElementById("locationList");
const rowTemplate = document.getElementById("locationRowTemplate");
const addButton = document.getElementById("addLocation");
const submitButton = document.getElementById("submitPlanner");
const budgetPill = document.getElementById("budgetPill");
const windowHint = document.getElementById("windowHint");
const summary = document.getElementById("formSummary");
const resultBox = document.getElementById("result");

/** Rows currently in the form: { el, nameInput, durationWheel, touched }. */
const rows = [];
let submitAttempted = false;

const startWheel = buildTimeWheel(
    document.getElementById("startTimePicker"),
    9 * 60,
    () => {
        touch("startTime");
        validate();
    }
);

const endWheel = buildTimeWheel(
    document.getElementById("endTimePicker"),
    17 * 60,
    () => {
        touch("endTime");
        validate();
    }
);

const touched = new Set();

function touch(name) {
    touched.add(name);
}

/* ---------- rows ---------- */

function addRow(defaults = {}) {
    if (rows.length >= MAX_LOCATIONS) return null;

    const el = rowTemplate.content.firstElementChild.cloneNode(true);
    const nameInput = el.querySelector('[data-input="name"]');
    const durationHost = el.querySelector('[data-role="duration"]');
    const removeButton = el.querySelector("[data-remove]");

    const row = { el, nameInput, touched: false };

    nameInput.value = defaults.name || "";
    nameInput.addEventListener("input", () => {
        row.touched = true;
        validate();
    });
    nameInput.addEventListener("blur", () => {
        row.touched = true;
        validate();
    });

    row.durationWheel = buildDurationWheel(durationHost, defaults.duration || 60, () => {
        row.touched = true;
        validate();
    });

    removeButton.addEventListener("click", () => removeRow(row));

    locationList.appendChild(el);
    rows.push(row);
    renumber();
    return row;
}

function removeRow(row) {
    if (rows.length <= MIN_LOCATIONS) return;
    const i = rows.indexOf(row);
    if (i < 0) return;

    rows.splice(i, 1);
    row.el.classList.add("leaving");
    setTimeout(() => row.el.remove(), 120);
    renumber();
    validate();
}

function renumber() {
    rows.forEach((row, i) => {
        row.el.querySelector("[data-row-index]").textContent = i + 1;
        const remove = row.el.querySelector("[data-remove]");
        remove.disabled = rows.length <= MIN_LOCATIONS;
        remove.title =
            rows.length <= MIN_LOCATIONS
                ? `A plan needs at least ${MIN_LOCATIONS} locations`
                : "Remove this location";
    });
    addButton.disabled = rows.length >= MAX_LOCATIONS;
    addButton.textContent = "";
    const plus = document.createElement("span");
    plus.setAttribute("aria-hidden", "true");
    plus.textContent = "+";
    addButton.append(
        plus,
        rows.length >= MAX_LOCATIONS
            ? ` Maximum of ${MAX_LOCATIONS} locations reached`
            : " Add another location"
    );
}

/* ---------- verification ---------- */

function setError(fieldEl, message) {
    const error = fieldEl.querySelector(".error");
    fieldEl.classList.toggle("invalid", Boolean(message));
    if (error) {
        error.textContent = message || "";
        error.classList.toggle("show", Boolean(message));
    }
}

function showGroupError(name, message) {
    const error = form.querySelector(`.error[data-error-for="${name}"]`);
    if (!error || error.closest("[data-field]")) return;
    error.textContent = message || "";
    error.classList.toggle("show", Boolean(message));
}

/**
 * Verifies every field and reflects the state in the UI. Errors are only
 * shown for fields the user has touched (or after a submit attempt).
 * Returns the parsed plan when valid, otherwise null.
 */
function validate() {
    const start = startWheel.read();
    const end = endWheel.read();
    const windowMinutes = end - start;
    const problems = [];

    const startField = form.querySelector('[data-field="startTime"]');
    const endField = form.querySelector('[data-field="endTime"]');

    let windowError = "";
    if (windowMinutes <= 0) {
        windowError = "End time must be after the start time.";
    } else if (windowMinutes < MIN_LOCATIONS * DURATION_MIN) {
        windowError = `That window is only ${formatSpan(windowMinutes)} long.`;
    }
    if (windowError) problems.push(windowError);

    const showWindow = submitAttempted || touched.has("startTime") || touched.has("endTime");
    setError(startField, "");
    setError(endField, showWindow ? windowError : "");

    windowHint.textContent =
        windowMinutes > 0
            ? `${formatClock(start)} to ${formatClock(end)} — ${formatSpan(windowMinutes)} to work with.`
            : "Pick an end time later than your start time.";

    // Location rows
    const seen = new Map();
    let planned = 0;

    rows.forEach((row, rowIndex) => {
        const nameField = row.el.querySelector('[data-field="name"]');
        const durationField = row.el.querySelector('[data-field="duration"]');
        const name = row.nameInput.value.trim();
        const duration = row.durationWheel.read();
        planned += duration;

        let nameError = "";
        if (!name) {
            nameError = "Give this location a name.";
        } else if (name.length < 2) {
            nameError = "That name is too short.";
        } else {
            const key = name.toLowerCase();
            if (seen.has(key)) {
                nameError = `Already listed as location ${seen.get(key)}.`;
            } else {
                seen.set(key, rowIndex + 1);
            }
        }

        if (nameError) problems.push(nameError);
        setError(nameField, submitAttempted || row.touched ? nameError : "");
        setError(durationField, "");
    });

    // Total stay time against the window
    let budgetError = "";
    if (windowMinutes > 0 && planned > windowMinutes) {
        budgetError = `Your stops add up to ${formatSpan(planned)}, which is ${formatSpan(
            planned - windowMinutes
        )} more than your window.`;
        problems.push(budgetError);
    }
    showGroupError("locations", submitAttempted || touched.size || rows.some((r) => r.touched) ? budgetError : "");

    budgetPill.textContent = `${formatSpan(planned)} planned${
        windowMinutes > 0 ? ` of ${formatSpan(windowMinutes)}` : ""
    }`;
    budgetPill.classList.toggle("over", Boolean(budgetError));

    const valid = problems.length === 0;
    submitButton.disabled = !valid;
    summary.textContent = valid
        ? `Ready — ${rows.length} locations, ${formatSpan(windowMinutes - planned)} of slack.`
        : problems.length === 1
        ? problems[0]
        : `${problems.length} things to fix before this can be scheduled.`;
    summary.classList.toggle("bad", !valid && (submitAttempted || touched.size > 0));
    summary.classList.toggle("good", valid);

    return valid ? { start, end, windowMinutes, planned } : null;
}

/* ---------- schedule output ---------- */

function renderSchedule({ start, end, windowMinutes, planned }) {
    const items = rows.map((row) => ({
        name: row.nameInput.value.trim(),
        duration: row.durationWheel.read(),
    }));

    let cursor = start;
    const list = items
        .map((item) => {
            const from = cursor;
            cursor += item.duration;
            return `
                <li>
                    <span class="slot">${formatClock(from)} – ${formatClock(cursor)}</span>
                    <span class="name">${escapeHtml(item.name)}</span>
                    <span class="mins">${item.duration} min</span>
                </li>`;
        })
        .join("");

    const slack = windowMinutes - planned;

    resultBox.innerHTML = `
        <div class="schedule">
            <h2>Your Schedule</h2>
            <p class="meta">
                ${formatClock(start)} – ${formatClock(end)} &middot;
                ${items.length} locations &middot; ${formatSpan(planned)} of visits
            </p>
            <ol>${list}</ol>
            <p class="leftover">
                ${
                    slack > 0
                        ? `${formatSpan(slack)} left over for travel, food and detours.`
                        : "Every minute of your window is booked."
                }
            </p>
        </div>`;
    resultBox.querySelector(".schedule").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

/* ---------- wiring ---------- */

function openPlanner() {
    if (!rows.length) {
        for (let i = 0; i < MIN_LOCATIONS; i++) addRow();
    }
    dialog.showModal();
    // Wheels can only be positioned once the dialog is laid out.
    registry.forEach((set) => set.sync());
    validate();
    rows[0].nameInput.focus();
}

document.getElementById("openPlanner").addEventListener("click", openPlanner);
document.getElementById("closePlanner").addEventListener("click", () => dialog.close());
document.getElementById("cancelPlanner").addEventListener("click", () => dialog.close());

addButton.addEventListener("click", () => {
    const row = addRow();
    if (!row) return;
    row.durationWheel.sync();
    row.nameInput.focus();
    validate();
});

form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitAttempted = true;
    const plan = validate();
    if (!plan) {
        const firstInvalid = form.querySelector(".field.invalid input, .error.show");
        if (firstInvalid) firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
    }
    renderSchedule(plan);
    dialog.close();
});

// Enter inside a name field should move on, not submit a half-filled form.
form.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.dataset.input !== "name") return;
    e.preventDefault();
    const i = rows.findIndex((row) => row.nameInput === e.target);
    if (i > -1 && i < rows.length - 1) rows[i + 1].nameInput.focus();
    else submitButton.focus();
});
