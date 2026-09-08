function getSchedule() {

    let start_time = prompt("Enter the start time in HH:MM format:");

    let end_time = prompt("Enter the end time in HH:MM format:");

    let no_of_buildings = parseInt(
        prompt("Enter the number of buildings you want to visit:")
    );

    let buildings = [];
    let times = [];

    for (let i = 0; i < no_of_buildings; i++) {

        let building_name = prompt(
            "Enter the name of building " + (i + 1) + ":"
        );

        let building_time = prompt(
            "Enter the time you want to spend in " +
            building_name +
            " in minutes:"
        );

        buildings.push(building_name);
        times.push(parseInt(building_time));
    }

    // Display the information on the webpage
    let result = document.getElementById("result");

    result.innerHTML = `
        <h2>Your Schedule</h2>
        <p><strong>Start time:</strong> ${start_time}</p>
        <p><strong>End time:</strong> ${end_time}</p>

        <h3>Buildings</h3>
        <ul id="buildingList"></ul>
    `;

    let buildingList = document.getElementById("buildingList");

    for (let i = 0; i < buildings.length; i++) {
        buildingList.innerHTML += `
            <li>
                <span>${buildings[i]}</span>
                <span>${times[i]} minutes</span>
            </li>
        `;
    }
}