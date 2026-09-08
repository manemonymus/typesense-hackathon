let start_time=prompt("Enter the start time in HH:MM format:");
let end_time=prompt("Enter the end time in HH:MM format:");

let no_of_buildings=prompt("Enter the number of buildings you want to visit:");

let buildings = [];
let times = [];

for (let i = 0; i < no_of_buildings; i++) {
    let building_name=prompt("Enter the name of building " + (i + 1) + ":");
    let building_time=prompt("Enter the time you want to spend in " + building_name + " in minutes:");
    buildings.push(building_name);
    times.push(parseInt(building_time));
}
