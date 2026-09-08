/* Layover — visit planner
 *
 * Everything is entered in one dialog: an iOS-Clock-style wheel for the start
 * and end of your window, and a Google-Maps-style list of stops where each row
 * is a place plus the minutes you want there. Every field verifies as you type.
 */

const MIN_STOPS = 2;
const MAX_STOPS = 12;
const TIME_STEP = 5;        // minutes between selectable clock values
const DURATION_MIN = 5;
const DURATION_MAX = 720;   // 12h at one stop is already generous
const DEFAULT_DURATION = 60;

const ITEM_H =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--item-h")) || 34;

/* Cylinder geometry for the wheel: each row occupies ROW_ANGLE degrees of a
 * drum of radius CYL_R, which is what gives the Clock app its curved falloff. */
const WHEEL_H =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--wheel-h")) || 170;
const ROW_ANGLE = 24;
const CYL_R = ITEM_H / (2 * Math.tan((ROW_ANGLE / 2) * Math.PI / 180));

/* Rows fade to nothing exactly as they reach the housing edge, so nothing is
 * ever clipped mid-glyph. Anything past that is parked rather than shaped. */
const EDGE_ROWS = WHEEL_H / ITEM_H / 2;
const SHAPED_ROWS = Math.ceil(EDGE_ROWS);

/* ------------------------------------------------------------------ *
 * Wheel
 * ------------------------------------------------------------------ */

/**
 * One scrollable column. Native scrolling and CSS snap do the physics; this
 * class maps scroll offset to a value and bends the rows onto a virtual drum.
 */
class WheelColumn {
    constructor({ label, unit, values, initial, onChange }) {
        this.values = values;
        this.onChange = onChange;
        this.index = Math.max(0, values.findIndex((v) => v.value === initial));
        this.programmatic = false;
        this.frame = 0;
        this.shaped = null;

        this.el = document.createElement("div");
        this.el.className = "wheel";
        this.el.dataset.unit = unit;
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
        this.paintSelected();

        this.el.addEventListener("scroll", () => this.onScroll(), { passive: true });
        this.el.addEventListener("keydown", (e) => this.onKeyDown(e));
    }

    get value() {
        return this.values[this.index].value;
    }

    onScroll() {
        const next = this.clamp(Math.round(this.el.scrollTop / ITEM_H));
        if (next !== this.index) {
            this.index = next;
            this.paintSelected();
        }

        if (!this.frame) {
            this.frame = requestAnimationFrame(() => {
                this.frame = 0;
                this.shape();
            });
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
        const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -4, PageDown: 4 }[e.key];
        if (step === undefined && e.key !== "Home" && e.key !== "End") return;
        e.preventDefault();

        let next = this.index + (step || 0);
        if (e.key === "Home") next = 0;
        if (e.key === "End") next = this.values.length - 1;
        this.setIndex(next, true);
    }

    /** Move to an index. `notify` marks it as a deliberate user change. */
    setIndex(index, notify) {
        const next = this.clamp(index);
        const changed = next !== this.index;
        this.index = next;
        this.paintSelected();
        this.scrollToIndex(!notify);
        if (notify && changed) this.onChange();
    }

    /** Re-align after the dialog becomes visible; hidden elements can't scroll. */
    sync() {
        this.scrollToIndex(true);
        this.shape();
    }

    scrollToIndex(instant) {
        const top = this.index * ITEM_H;
        // Already there (or hidden, where scrolling is a no-op): bailing out
        // without clearing the guard would swallow the next real change.
        if (Math.abs(this.el.scrollTop - top) < 1) {
            this.programmatic = false;
            return;
        }
        this.programmatic = true;
        this.el.scrollTo({ top, behavior: instant ? "auto" : "smooth" });
    }

    paintSelected() {
        this.items.forEach((item, i) => {
            const on = i === this.index;
            item.classList.toggle("selected", on);
            item.setAttribute("aria-selected", String(on));
        });
    }

    /** Bend rows onto the drum, based on the live (fractional) scroll offset. */
    shape() {
        const centre = this.el.scrollTop / ITEM_H;
        const first = Math.max(0, Math.floor(centre) - SHAPED_ROWS);
        const last = Math.min(this.items.length - 1, Math.ceil(centre) + SHAPED_ROWS);

        if (this.shaped) {
            for (let i = this.shaped[0]; i <= this.shaped[1]; i++) {
                if (i < first || i > last) this.park(this.items[i]);
            }
        }

        for (let i = first; i <= last; i++) {
            const item = this.items[i];
            const dist = i - centre;
            if (Math.abs(dist) > SHAPED_ROWS) {
                this.park(item);
                continue;
            }
            const rad = (dist * ROW_ANGLE * Math.PI) / 180;
            // Pull the row from its flat scroll position onto the drum surface.
            const y = CYL_R * Math.sin(rad) - dist * ITEM_H;
            const z = CYL_R * Math.cos(rad) - CYL_R;
            item.style.transform =
                `translateY(${y.toFixed(2)}px) translateZ(${z.toFixed(2)}px) ` +
                `rotateX(${(-dist * ROW_ANGLE).toFixed(2)}deg)`;
            const reach = Math.min(1, Math.abs(dist) / EDGE_ROWS);
            item.style.opacity = Math.max(0, 1 - Math.pow(reach, 1.7)).toFixed(3);
        }

        this.shaped = [first, last];
    }

    park(item) {
        item.style.opacity = "0";
        item.style.transform = "";
    }

    clamp(i) {
        return Math.min(this.values.length - 1, Math.max(0, i));
    }
}

/** Hour / minute / AM-PM columns inside one drum housing. */
class TimeWheel {
    constructor(host, initialMinutes, onChange) {
        const at = fromMinutes(initialMinutes);
        this.onChange = onChange;
        this.columns = {};

        const set = document.createElement("div");
        set.className = "wheel-set";

        const specs = [
            { unit: "hour", label: "Hour", values: hourValues(), initial: at.hour },
            { colon: true },
            { unit: "minute", label: "Minute", values: minuteValues(), initial: at.minute },
            {
                unit: "meridiem",
                label: "AM or PM",
                values: [{ value: "AM", label: "AM" }, { value: "PM", label: "PM" }],
                initial: at.meridiem,
            },
        ];

        specs.forEach((spec) => {
            if (spec.colon) {
                const colon = document.createElement("span");
                colon.className = "wheel-colon";
                colon.textContent = ":";
                colon.setAttribute("aria-hidden", "true");
                set.appendChild(colon);
                return;
            }
            const column = new WheelColumn({ ...spec, onChange: () => this.onChange() });
            this.columns[spec.unit] = column;
            set.appendChild(column.el);
        });

        host.innerHTML = "";
        host.appendChild(set);
        wheels.push(this);
    }

    read() {
        return toMinutes({
            hour: this.columns.hour.value,
            minute: this.columns.minute.value,
            meridiem: this.columns.meridiem.value,
        });
    }

    sync() {
        Object.values(this.columns).forEach((c) => c.sync());
    }
}

/** Every wheel on the page, so they can be re-aligned when the dialog opens. */
const wheels = [];

/* ------------------------------------------------------------------ *
 * Time helpers (clock values are minutes past midnight)
 * ------------------------------------------------------------------ */

function hourValues() {
    return Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: String(i + 1),
    }));
}

function minuteValues() {
    const out = [];
    for (let m = 0; m < 60; m += TIME_STEP) {
        out.push({ value: m, label: String(m).padStart(2, "0") });
    }
    return out;
}

function toMinutes({ hour, minute, meridiem }) {
    return ((hour % 12) + (meridiem === "PM" ? 12 : 0)) * 60 + minute;
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

/**
 * Reads a stay length. Plain minutes are the norm, but "90", "1h30", "1.5h"
 * and "1:30" all mean the same thing, so all of them are accepted.
 */
function parseDuration(raw) {
    const text = String(raw).trim().toLowerCase().replace(/\s+/g, "");
    if (!text) return { error: "How long here?" };

    const patterns = [
        [/^(\d+):([0-5]\d)$/, (m) => +m[1] * 60 + +m[2]],
        [/^(\d+)h(?:ou)?r?s?(\d+)m?(?:in(?:ute)?s?)?$/, (m) => +m[1] * 60 + +m[2]],
        [/^(\d+(?:\.\d+)?)h(?:ou)?r?s?$/, (m) => Math.round(+m[1] * 60)],
        [/^(\d+)m?(?:in(?:ute)?s?)?$/, (m) => +m[1]],
    ];

    for (const [pattern, read] of patterns) {
        const match = text.match(pattern);
        if (!match) continue;
        const minutes = read(match);
        if (!Number.isFinite(minutes)) break;
        if (minutes < DURATION_MIN) return { error: `At least ${DURATION_MIN} minutes.` };
        if (minutes > DURATION_MAX) return { error: `At most ${formatSpan(DURATION_MAX)}.` };
        return { minutes };
    }

    return { error: "Minutes, like 45 or 1h30." };
}

/* ------------------------------------------------------------------ *
 * Elements
 * ------------------------------------------------------------------ */

const dialog = document.getElementById("plannerDialog");
const form = document.getElementById("plannerForm");
const stopList = document.getElementById("locationList");
const rowTemplate = document.getElementById("locationRowTemplate");
const addButton = document.getElementById("addLocation");
const addLabel = addButton.querySelector("[data-add-label]");
const submitButton = document.getElementById("submitPlanner");
const budgetPill = document.getElementById("budgetPill");
const windowHint = document.getElementById("windowHint");
const summary = document.getElementById("formSummary");
const resultBox = document.getElementById("result");

const startSlot = form.querySelector('[data-field="startTime"]');
const endSlot = form.querySelector('[data-field="endTime"]');

/** Rows in the form, in display order. */
const rows = [];
const touchedWindow = new Set();
let submitAttempted = false;

const startWheel = new TimeWheel(document.getElementById("startTimePicker"), 9 * 60, () => {
    touchedWindow.add("start");
    validate();
});

const endWheel = new TimeWheel(document.getElementById("endTimePicker"), 17 * 60, () => {
    touchedWindow.add("end");
    validate();
});

/* ------------------------------------------------------------------ *
 * Stop rows
 * ------------------------------------------------------------------ */

function addRow(defaults = {}) {
    if (rows.length >= MAX_STOPS) return null;

    const el = rowTemplate.content.firstElementChild.cloneNode(true);
    const nameInput = el.querySelector('[data-input="name"]');
    const durationInput = el.querySelector('[data-input="duration"]');

    const row = { el, nameInput, durationInput, touched: false };

    nameInput.value = defaults.name || "";
    durationInput.value = String(defaults.duration || DEFAULT_DURATION);

    [nameInput, durationInput].forEach((input) => {
        input.addEventListener("input", () => {
            row.touched = true;
            validate();
        });
        input.addEventListener("blur", () => {
            row.touched = true;
            validate();
        });
    });

    // Normalise "1h30" to "90" once the field is left, so the row reads cleanly.
    durationInput.addEventListener("blur", () => {
        const parsed = parseDuration(durationInput.value);
        if (parsed.minutes !== undefined) durationInput.value = String(parsed.minutes);
        validate();
    });

    el.querySelector("[data-remove]").addEventListener("click", () => removeRow(row));
    attachReorder(row);

    stopList.appendChild(el);
    rows.push(row);
    refreshRows();
    return row;
}

function removeRow(row) {
    if (rows.length <= MIN_STOPS) return;
    const i = rows.indexOf(row);
    if (i < 0) return;

    rows.splice(i, 1);
    row.el.classList.add("leaving");
    setTimeout(() => row.el.remove(), 150);
    refreshRows();
    validate();
}

/** Keeps markers, remove buttons and the add button in step with the rows. */
function refreshRows() {
    rows.forEach((row, i) => {
        row.el.querySelector("[data-marker-letter]").textContent = markerFor(i);

        const remove = row.el.querySelector("[data-remove]");
        remove.disabled = rows.length <= MIN_STOPS;
        remove.title =
            rows.length <= MIN_STOPS ? `A route needs at least ${MIN_STOPS} stops` : "Remove this stop";

        const handle = row.el.querySelector("[data-handle]");
        handle.style.display = rows.length > MIN_STOPS ? "" : "none";
    });

    const full = rows.length >= MAX_STOPS;
    addButton.disabled = full;
    addLabel.textContent = full ? `Maximum of ${MAX_STOPS} stops` : "Add stop";
}

function markerFor(i) {
    return i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
}

/* ---------- drag to reorder, the way Maps lets you reshuffle waypoints ---------- */

let draggingRow = null;

function attachReorder(row) {
    const handle = row.el.querySelector("[data-handle]");

    handle.addEventListener("pointerdown", () => {
        row.el.draggable = true;
    });
    handle.addEventListener("pointerup", () => {
        if (!draggingRow) row.el.draggable = false;
    });

    row.el.addEventListener("dragstart", (e) => {
        draggingRow = row;
        row.el.classList.add("dragging");
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", ""); // Firefox needs a payload
        }
    });

    row.el.addEventListener("dragend", () => {
        row.el.classList.remove("dragging");
        row.el.draggable = false;
        draggingRow = null;
        adoptDomOrder();
        refreshRows();
        validate();
    });
}

stopList.addEventListener("dragover", (e) => {
    if (!draggingRow) return;
    e.preventDefault();

    const before = [...stopList.children].find((el) => {
        if (el === draggingRow.el || el.classList.contains("leaving")) return false;
        const box = el.getBoundingClientRect();
        return e.clientY < box.top + box.height / 2;
    });

    if (before) stopList.insertBefore(draggingRow.el, before);
    else stopList.appendChild(draggingRow.el);

    refreshRows();
});

stopList.addEventListener("drop", (e) => e.preventDefault());

/** Re-orders the rows array to match what the DOM now shows. */
function adoptDomOrder() {
    const ordered = [...stopList.children]
        .map((el) => rows.find((row) => row.el === el))
        .filter(Boolean);
    if (ordered.length === rows.length) rows.splice(0, rows.length, ...ordered);
}

/* ------------------------------------------------------------------ *
 * Verification
 * ------------------------------------------------------------------ */

function showError(scope, name, message, visible) {
    const el = scope.querySelector(`.error[data-error-for="${name}"]`);
    if (!el) return;
    const shown = Boolean(message) && visible;
    el.textContent = shown ? message : "";
    el.classList.toggle("show", shown);
}

function markInvalid(el, bad) {
    if (el) el.classList.toggle("invalid", Boolean(bad));
}

/**
 * Verifies every field and reflects it in the UI. A field's error only shows
 * once it has been touched, or once submit has been attempted.
 * Returns the parsed plan when valid, otherwise null.
 */
function validate() {
    const start = startWheel.read();
    const end = endWheel.read();
    const span = end - start;
    const problems = [];

    // --- window ---
    let windowError = "";
    if (span <= 0) windowError = "Your end time needs to be after your start time.";
    else if (span < MIN_STOPS * DURATION_MIN) windowError = `${formatSpan(span)} isn't enough for a route.`;
    if (windowError) problems.push(windowError);

    const windowTouched = submitAttempted || touchedWindow.size > 0;
    showError(form, "window", windowError, windowTouched);
    markInvalid(startSlot, windowError && windowTouched);
    markInvalid(endSlot, windowError && windowTouched);

    windowHint.textContent =
        span > 0
            ? `${formatClock(start)} → ${formatClock(end)} · ${formatSpan(span)} to work with`
            : "Pick an end time after your start time";

    // --- stops ---
    const seen = new Map();
    let planned = 0;

    rows.forEach((row, i) => {
        const nameShell = row.el.querySelector('[data-field="name"]');
        const durationShell = row.el.querySelector('[data-field="duration"]');
        const visible = submitAttempted || row.touched;
        const name = row.nameInput.value.trim();

        let nameError = "";
        if (!name) {
            nameError = "Name this stop.";
        } else if (name.length < 2) {
            nameError = "That name is too short.";
        } else {
            const key = name.toLowerCase();
            if (seen.has(key)) nameError = `Already stop ${seen.get(key)}.`;
            else seen.set(key, markerFor(i));
        }

        const parsed = parseDuration(row.durationInput.value);
        if (parsed.minutes !== undefined) planned += parsed.minutes;

        if (nameError) problems.push(nameError);
        if (parsed.error) problems.push(parsed.error);

        showError(row.el, "name", nameError, visible);
        showError(row.el, "duration", parsed.error, visible);
        markInvalid(nameShell, nameError && visible);
        markInvalid(durationShell, parsed.error && visible);
    });

    // --- does it fit? ---
    let budgetError = "";
    if (span > 0 && planned > span) {
        budgetError = `Your stops need ${formatSpan(planned)} — that's ${formatSpan(
            planned - span
        )} more than your window.`;
        problems.push(budgetError);
    }
    showError(form, "locations", budgetError, submitAttempted || rows.some((r) => r.touched));

    budgetPill.textContent = span > 0
        ? `${formatSpan(planned)} of ${formatSpan(span)}`
        : `${formatSpan(planned)} planned`;
    budgetPill.classList.toggle("over", Boolean(budgetError));

    // --- footer ---
    const valid = problems.length === 0;
    submitButton.disabled = !valid;
    summary.textContent = valid
        ? `${rows.length} stops · ${formatSpan(span - planned)} spare for getting around`
        : problems.length === 1
        ? problems[0]
        : `${problems.length} things to sort out first`;
    summary.classList.toggle("bad", !valid && (submitAttempted || touchedWindow.size > 0));
    summary.classList.toggle("good", valid);

    return valid ? { start, end, span, planned } : null;
}

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

function renderSchedule({ start, end, span, planned }) {
    let cursor = start;

    const legs = rows
        .map((row, i) => {
            const minutes = parseDuration(row.durationInput.value).minutes;
            const from = cursor;
            cursor += minutes;
            return `
                <li>
                    <span class="leg-marker">${markerFor(i)}</span>
                    <span class="leg-name">${escapeHtml(row.nameInput.value.trim())}</span>
                    <span class="leg-slot">${formatClock(from)} – ${formatClock(cursor)}</span>
                    <span class="leg-mins">${minutes} min</span>
                </li>`;
        })
        .join("");

    const spare = span - planned;

    resultBox.innerHTML = `
        <div class="schedule">
            <div class="schedule-head">
                <div>
                    <h2>Your day</h2>
                    <p class="schedule-meta">${formatClock(start)} – ${formatClock(end)} · ${
        rows.length
    } stops</p>
                </div>
                <span class="pill">${formatSpan(planned)} of ${formatSpan(span)} booked</span>
            </div>
            <ol>${legs}</ol>
            <p class="schedule-foot">
                <svg class="icon" aria-hidden="true"><use href="#icon-clock"/></svg>
                ${
                    spare > 0
                        ? `${formatSpan(spare)} left for travel, coffee and detours.`
                        : "Back to back — no slack in this one."
                }
            </p>
        </div>`;
    resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function escapeHtml(text) {
    const box = document.createElement("div");
    box.textContent = text;
    return box.innerHTML;
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

function openPlanner() {
    if (!rows.length) {
        for (let i = 0; i < MIN_STOPS; i++) addRow();
    }
    dialog.showModal();
    // Wheels can only be positioned once the dialog has been laid out.
    wheels.forEach((wheel) => wheel.sync());
    validate();
    rows[0].nameInput.focus();
}

document.getElementById("openPlanner").addEventListener("click", openPlanner);
document.getElementById("closePlanner").addEventListener("click", () => dialog.close());
document.getElementById("cancelPlanner").addEventListener("click", () => dialog.close());

addButton.addEventListener("click", () => {
    const row = addRow();
    if (!row) return;
    row.nameInput.focus();
    validate();
});

form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitAttempted = true;
    const plan = validate();
    if (!plan) {
        const firstBad = form.querySelector(".invalid input, .error.show");
        if (firstBad) firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
    }
    renderSchedule(plan);
    dialog.close();
});

// Enter should walk down the list rather than submit a half-filled form.
form.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.dataset.input) return;
    e.preventDefault();
    const i = rows.findIndex((row) => row.el.contains(e.target));
    if (e.target.dataset.input === "name") {
        rows[i].durationInput.focus();
        rows[i].durationInput.select();
    } else if (i > -1 && i < rows.length - 1) {
        rows[i + 1].nameInput.focus();
    } else {
        submitButton.focus();
    }
});
