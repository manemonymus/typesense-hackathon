// Step 1: build one name/time input row per building, based on "num-buildings"
function enterBuildingNames() {
    const numBuildings = Number(document.getElementById("num-buildings").value);
    const container = document.getElementById("enter-building");
    container.innerHTML = "";

    if (!Number.isInteger(numBuildings) || numBuildings < 1 || numBuildings > 10) {
        container.innerHTML = `<p class="error">Please retry with an integer from 1 to 10 buildings.</p>`;
        return;
    }

    const header = document.createElement("div");
    header.className = "form-section-header";
    header.innerHTML = `<h3>Buildings</h3><p>Enter a name and time (minutes) for each stop.</p>`;
    container.appendChild(header);

    for (let i = 0; i < numBuildings; i++) {
        container.appendChild(createBuildingRow(i));
    }
}

// Creates a single "building-row" with unique ids so we can read it back later
function createBuildingRow(index) {
    const row = document.createElement("div");
    row.className = "building-row";
    row.innerHTML = `
        <div class="form-row">
            <label for="building-name-${index}">Building name</label>
            <input type="text" id="building-name-${index}" name="building-name-${index}">
        </div>
        <div class="form-row">
            <label for="building-time-${index}">Minutes</label>
            <input type="text" id="building-time-${index}" name="building-time-${index}">
        </div>
        <button type="button" class="remove-button" onclick="this.closest('.building-row').remove()">Remove</button>
    `;
    return row;
}

function findDifference(startTime, endTime) {
    const timePattern = /^(\d{2}):(\d{2})$/;
    const startMatch = startTime.match(timePattern);
    const endMatch = endTime.match(timePattern);

    if (!startMatch || !endMatch) {
        return null;
    }

    const startHours = parseInt(startMatch[1], 10);
    const startMinutes = parseInt(startMatch[2], 10);
    const endHours = parseInt(endMatch[1], 10);
    const endMinutes = parseInt(endMatch[2], 10);

    if (
        startHours > 23 || startMinutes > 59 ||
        endHours > 23 || endMinutes > 59
    ) {
        return null;
    }

    const startTotalMinutes = startHours * 60 + startMinutes;
    let endTotalMinutes = endHours * 60 + endMinutes;

    if (endTotalMinutes < startTotalMinutes) {
        endTotalMinutes += 24 * 60;
    }

    return endTotalMinutes - startTotalMinutes;
}

// Step 2: read start/end time + every building row, then render the schedule
function getSchedule(event) {
    event.preventDefault();

    const start_time = document.getElementById("s-time").value;
    const end_time = document.getElementById("e-time").value;
    const totalTime = findDifference(start_time, end_time);
    const result = document.getElementById("result");

    if (totalTime === null) {
        result.innerHTML = `<p class="error">Please enter start and end times in HH:MM format, using valid 24-hour times.</p>`;
        return;
    }

    const rows = document.querySelectorAll("#enter-building .building-row");

    if (rows.length === 0) {
        result.innerHTML = `<p class="error">Add at least one building before creating a schedule.</p>`;
        return;
    }

    const buildings = [];
    const times = [];
    let hasError = false;

    rows.forEach((row) => {
        const nameInput = row.querySelector('input[id^="building-name-"]');
        const timeInput = row.querySelector('input[id^="building-time-"]');
        const name = nameInput.value.trim();
        const time = parseInt(timeInput.value);

        if (!name || isNaN(time)) {
            hasError = true;
            return;
        }
        buildings.push(name);
        times.push(time);
    });

    if (hasError) {
        result.innerHTML = `<p class="error">Please fill in a name and a numeric time for every building.</p>`;
        return;
    }

    result.innerHTML = `
        <h2>Your Schedule</h2>
        <p><strong>Start time:</strong> ${start_time}</p>
        <p><strong>End time:</strong> ${end_time}</p>
        <p><strong>Total available time:</strong> ${totalTime} minutes</p>
        <h3>Buildings</h3>
        <ul id="buildingList"></ul>
    `;

    const buildingList = document.getElementById("buildingList");
    for (let i = 0; i < buildings.length; i++) {
        buildingList.innerHTML += `
            <li>
                <span>${buildings[i]}</span>
                <span>${times[i]} minutes</span>
            </li>
        `;
    }

    generateOptions(totalTime, times, buildings, buildings.length);
}

function generateOptions(totalTime, times, buildings, n) {
    if (n < 1) {
        return [];
    }

    const pathList = [];

    function buildPaths(startIndex, currentPath) {
        if (currentPath.length === n) {
            pathList.push([...currentPath]);
            return;
        }

        for (let i = startIndex; i < buildings.length; i++) {
            currentPath.push(buildings[i]);
            buildPaths(i + 1, currentPath);
            currentPath.pop();
        }
    }

    buildPaths(0, []);

    for (const path of pathList) {
        if (pathfind(path, times, totalTime)) {
            return path;
        }
    }

    if (n === 1) {
        return [];
    }

    return generateOptions(totalTime, times, buildings, n - 1);
}

function pathfind(path, times, totalTime) {
    
}
