// KPI Data
let totalTransactions = 1542;
let transactionValue = 185000;
let openFollowUps = 12;
let activeCorridors = 3;

// Update KPI Cards
document.getElementById("transactions").innerText = totalTransactions.toLocaleString();
document.getElementById("value").innerText = "$" + transactionValue.toLocaleString();
document.getElementById("followups").innerText = openFollowUps;
document.getElementById("corridors").innerText = activeCorridors;

// Action Tracker Data
const actions = [
  {
    task: "Enable Nigeria Corridor",
    owner: "Product",
    status: "In Progress"
  },
  {
    task: "Partner Testing",
    owner: "Operations",
    status: "Pending"
  },
  {
    task: "Management Update",
    owner: "John Odero",
    status: "Open"
  }
];

// Populate Action Tracker
const table = document.getElementById("actionTable");

actions.forEach(action => {
  table.innerHTML += `
    <tr>
      <td>${action.task}</td>
      <td>${action.owner}</td>
      <td>${action.status}</td>
    </tr>
  `;
});