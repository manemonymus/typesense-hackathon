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
    header.innerHTML = `
        <div>
            <h3>Buildings</h3>
            <p>Choose the buildings you want to visit and the time for each stop.</p>
        </div>
        <div class="form-row origin-row">
            <label for="origin-building">Where are you now?</label>
            <select id="origin-building" name="origin-building" onchange="updateBuildingSelections()">
                ${getBuildingOptions("Choose an origin")}
            </select>
        </div>
    `;
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
            <select id="building-name-${index}" name="building-name-${index}" onchange="updateBuildingSelections()">
                ${getBuildingOptions("Choose a building")}
            </select>
        </div>
        <div class="form-row">
            <label for="building-time-${index}">Minutes</label>
            <input type="text" id="building-time-${index}" name="building-time-${index}">
        </div>
        <button type="button" class="remove-button" onclick="this.closest('.building-row').remove()">Remove</button>
    `;
    return row;
}

function getBuildingOptions(placeholder) {
    return `<option value="">${placeholder}</option>` +
        [...buildingPositions.keys()]
            .map((building) => `<option value="${building}">${building}</option>`)
            .join("");
}

function updateBuildingSelections() {
    const origin = document.getElementById("origin-building")?.value;
    const selects = document.querySelectorAll("#enter-building select[id^=\"building-name-\"]");

    selects.forEach((select) => {
        if (select.value === origin) {
            select.value = "";
        }
    });

    const selectedBuildings = new Set(
        [...selects].map((select) => select.value).filter(Boolean)
    );

    selects.forEach((select) => {
        [...select.options].forEach((option) => {
            option.disabled = option.value !== "" && (
                option.value === origin ||
                (selectedBuildings.has(option.value) && option.value !== select.value)
            );
        });
    });
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

    const origin = document.getElementById("origin-building")?.value;
    const buildings = [];
    const times = [];
    let hasError = false;

    rows.forEach((row) => {
        const nameInput = row.querySelector('select[id^="building-name-"]');
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

    if (!origin) {
        result.innerHTML = `<p class="error">Please choose your current location.</p>`;
        return;
    }

    if (hasError || buildings.some((building) => building === origin) ||
        new Set(buildings).size !== buildings.length) {
        result.innerHTML = `<p class="error">Please choose a different building for every stop, and do not choose your origin.</p>`;
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

    const path = generateOptions(totalTime, times, buildings, buildings.length, buildingPositions, origin);
    const pathDisplay = Array.isArray(path) && path.length > 0 ? path.join(" -> ") : "No possible path found.";
    result.innerHTML += `<p><strong>Recommended path:</strong> ${pathDisplay}</p>`;
}

// TODO: Convert building inputs to a dropdown of buildings from the generated list.
function generateBuildingMap(buildingCount) {
    const buildingPositions = new Map();
    const gridWidth = Math.ceil(Math.sqrt(buildingCount));

    for (let index = 0; index < buildingCount; index++) {
        const letter = String.fromCharCode("A".charCodeAt(0) + index);
        buildingPositions.set(`Building ${letter}`, {
            x: index % gridWidth,
            y: Math.floor(index / gridWidth)
        });
    }

    return buildingPositions;
}

const buildingPositions = generateBuildingMap(10);

function generateOptions(totalTime, times, buildings, n, buildingPositions, origin) {
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
        const out = pathfind(path, times, buildings, totalTime, buildingPositions, origin);
        if (out != "N/A") {
            return out;
        }
    }
    
    return generateOptions(totalTime, times, buildings, n - 1, buildingPositions, origin);
}

function pathfind(path, times, buildings, totalTime, buildingPositions, origin) {
    if (!buildingPositions || !buildingPositions.has(origin) ||
        path.some((building) => !buildingPositions.has(building))) {
        return "N/A";
    }

    const allBuildings = [...buildingPositions.keys()];
    const graph = new Map();
    for (const building of allBuildings) {
        graph.set(building, []);
    }

    for (let i = 0; i < allBuildings.length; i++) {
        for (let j = i + 1; j < allBuildings.length; j++) {
            const from = allBuildings[i];
            const to = allBuildings[j];
            const fromPosition = buildingPositions.get(from);
            const toPosition = buildingPositions.get(to);
            const distance = Math.abs(fromPosition.x - toPosition.x) +
                Math.abs(fromPosition.y - toPosition.y);

            if (distance === 1) {
                graph.get(from).push({ building: to, distance });
                graph.get(to).push({ building: from, distance });
            }
        }
    }

    function shortestPath(start, end) {
        const distances = new Map(allBuildings.map((building) => [building, Infinity]));
        const previous = new Map();
        const unvisited = new Set(allBuildings);
        distances.set(start, 0);

        while (unvisited.size > 0) {
            let current = null;
            for (const building of unvisited) {
                if (current === null || distances.get(building) < distances.get(current)) {
                    current = building;
                }
            }

            if (current === null || distances.get(current) === Infinity) {
                break;
            }

            unvisited.delete(current);
            if (current === end) {
                break;
            }

            for (const neighbor of graph.get(current)) {
                const distance = distances.get(current) + neighbor.distance;
                if (distance < distances.get(neighbor.building)) {
                    distances.set(neighbor.building, distance);
                    previous.set(neighbor.building, current);
                }
            }
        }

        const route = [];
        let current = end;
        while (current !== undefined) {
            route.unshift(current);
            if (current === start) {
                break;
            }
            current = previous.get(current);
        }

        return {
            distance: distances.get(end),
            route
        };
    }

    const visitTimes = new Map();
    path.forEach((building) => {
        const buildingIndex = buildings.indexOf(building);
        visitTimes.set(building, times[buildingIndex]);
    });

    const visitTime = path.reduce((total, building) => total + visitTimes.get(building), 0);
    const walkableDistance = Math.max(0, totalTime - visitTime) / 13;
    const start = origin;
    const remainingBuildings = path;
    let bestDistance = Infinity;
    let bestRoute = null;

    function findBestRoute(current, remaining, distance, route) {
        if (remaining.length === 0) {
            const returnTrip = shortestPath(current, start);
            if (!Number.isFinite(returnTrip.distance)) {
                return;
            }

            const totalDistance = distance + returnTrip.distance;
            if (totalDistance < bestDistance) {
                bestDistance = totalDistance;
                bestRoute = [...route, ...returnTrip.route.slice(1)];
            }
            return;
        }

        for (let i = 0; i < remaining.length; i++) {
            const nextBuilding = remaining[i];
            const trip = shortestPath(current, nextBuilding);
            if (!Number.isFinite(trip.distance)) {
                continue;
            }

            findBestRoute(
                nextBuilding,
                remaining.filter((_, index) => index !== i),
                distance + trip.distance,
                [...route, ...trip.route.slice(1)]
            );
        }
    }

    findBestRoute(start, remainingBuildings, 0, [start]);

    if (bestDistance <= walkableDistance) {
        return bestRoute;
    }

    return "N/A";
}
