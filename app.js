const feeRate = 0.02;

let defaultTransactions = [
  { Date: "2026-09-01", Origin: "Kenya", Destination: "Uganda", Amount: "5000", Status: "Success" },
  { Date: "2026-09-01", Origin: "Kenya", Destination: "Tanzania", Amount: "3000", Status: "Success" },
  { Date: "2026-09-01", Origin: "Nigeria", Destination: "Kenya", Amount: "2500", Status: "Pending" }
];

let defaultBacklog = [
  { Task: "Enable Nigeria Corridor", Owner: "John", Priority: "High", DueDate: "2026-09-10", Status: "Open" },
  { Task: "Partner Testing", Owner: "Operations", Priority: "Medium", DueDate: "2026-09-15", Status: "Pending" }
];

function renderDashboard(txData, backlogData) {
  let totalTxCount = txData.length;
  
  // Safely sum amounts, stripping out any currency symbols or letters
  let totalValue = txData.reduce((acc, curr) => {
    let cleanAmount = String(curr.Amount || "0").replace(/[^0-9.-]+/g,"");
    return acc + Number(cleanAmount);
  }, 0);
  
  let corridorMap = {};
  txData.forEach(tx => {
    let key = `${tx.Origin || "Unknown"} → ${tx.Destination || "Unknown"}`;
    let currentStatus = tx.Status || ""; 
    
    if (!corridorMap[key]) {
      corridorMap[key] = { volume: 0, value: 0, status: currentStatus, successes: 0 };
    }
    corridorMap[key].volume += 1;
    
    // Remove non-numeric characters (like $ or KES) before calculating
    let cleanAmount = String(tx.Amount || "0").replace(/[^0-9.-]+/g,"");
    corridorMap[key].value += Number(cleanAmount); 
    
    // Safely check the status without crashing
    if (currentStatus.toLowerCase() === "success" || currentStatus.toLowerCase() === "live") {
      corridorMap[key].successes += 1;
    }
  });

  let activeCorridorsCount = Object.keys(corridorMap).length;
  
  // Normalize checking for both "Due Date" and "DueDate" fields safely
  let openActionsCount = backlogData.filter(x => x.Status && x.Status.toLowerCase() !== "closed" && x.Status.toLowerCase() !== "completed").length;

  let today = new Date();
  let overdue = backlogData.filter(x => {
    let rawDate = x.DueDate || x["Due Date"]; 
    return rawDate && new Date(rawDate) < today && x.Status && x.Status.toLowerCase() !== "closed" && x.Status.toLowerCase() !== "completed";
  }).length;

  let revenue = totalValue * feeRate;

  // DOM Elements Updates
  if(document.getElementById("transactions")) document.getElementById("transactions").innerText = totalTxCount.toLocaleString();
  if(document.getElementById("volume")) document.getElementById("volume").innerText = totalValue.toLocaleString();
  if(document.getElementById("revenue")) document.getElementById("revenue").innerText = "KES " + revenue.toLocaleString();
  if(document.getElementById("successRate")) {
    document.getElementById("successRate").innerText = totalTxCount > 0 ? ((txData.filter(t => (t.Status || "").toLowerCase() === "success").length / totalTxCount) * 100).toFixed(1) + "%" : "0%";
  }
  if(document.getElementById("openActions")) document.getElementById("openActions").innerText = openActionsCount;
  
  let overdueEl = document.getElementById("overdueActions");
  if (overdueEl) {
    overdueEl.innerText = overdue;
  }
  
  if(document.getElementById("activeCorridors")) document.getElementById("activeCorridors").innerText = activeCorridorsCount;

  let topCorridor = Object.entries(corridorMap).sort((a, b) => b[1].value - a[1].value)[0];
  let summaryEl = document.getElementById("summary");
  if (summaryEl) {
    summaryEl.innerHTML = `
      <ul>
        <li>Total Transactions: ${totalTxCount}</li>
        <li>Total Value: KES ${totalValue.toLocaleString()}</li>
        <li>Active Corridors: ${activeCorridorsCount}</li>
        <li>Open Actions: ${openActionsCount}</li>
        <li>Top Corridor: ${topCorridor ? topCorridor[0] : "N/A"}</li>
      </ul>
    `;
  }

  let health = document.getElementById("corridorHealth");
  if (health) {
    health.innerHTML = "";
    for (let [corridor, data] of Object.entries(corridorMap)) {
      let icon = "🟢";
      if (data.status.toLowerCase() === "pending" || data.status.toLowerCase() === "in progress") {
        icon = "🟡";
      }
      if (data.status.toLowerCase() === "failed" || data.status.toLowerCase() === "blocked") {
        icon = "🔴";
      }
      health.innerHTML += `<li>${icon} ${corridor} : ${data.status}</li>`;
    }
  }

  let corridorTableBody = document.querySelector("#corridorTable tbody");
  if (corridorTableBody) {
    corridorTableBody.innerHTML = "";
    for (let [corridor, data] of Object.entries(corridorMap)) {
      corridorTableBody.innerHTML += `
        <tr>
          <td>${corridor}</td>
          <td>${data.volume}</td>
          <td>KES ${data.value.toLocaleString()}</td>
          <td>${data.status}</td>
          <td>Operations</td>
        </tr>
      `;
    }
  }

  let actionTableBody = document.getElementById("actionTable");
  if (actionTableBody) {
    actionTableBody.innerHTML = "";
    backlogData.forEach(action => {
      let rawDate = action.DueDate || action["Due Date"]; 
      actionTableBody.innerHTML += `
        <tr>
          <td>${action.Task || "N/A"}</td>
          <td>${action.Owner || "N/A"}</td>
          <td>${action.Priority || "N/A"}</td>
          <td>${rawDate || "N/A"}</td>
          <td>${action.Status || "N/A"}</td>
        </tr>
      `;
    });
  }
}

// Robust CSV parser with header normalization
function parseCSV(text) {
  let lines = text.trim().split("\n");
  if (lines.length === 0) return [];
  
  let result = [];
  
  // Extract raw headers and clean up quotes/spaces
  let rawHeaders = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
  
  // Normalize headers to strictly match what the dashboard expects
  let headers = rawHeaders.map(h => {
    let clean = h.toLowerCase().replace(/\s+/g, ''); // Lowercase and remove spaces
    
    // Map messy headers to standard Title Case keys
    if (clean === "date") return "Date";
    if (clean === "origin") return "Origin";
    if (clean === "destination") return "Destination";
    if (clean === "amount") return "Amount";
    if (clean === "status") return "Status";
    if (clean === "task") return "Task";
    if (clean === "owner") return "Owner";
    if (clean === "priority") return "Priority";
    if (clean === "duedate") return "DueDate";
    
    return h; // Keep the original name for any unknown columns
  });
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue; // Skip empty rows
    let currentline = lines[i].split(",").map(val => val.trim().replace(/^["']|["']$/g, ""));
    
    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = currentline[j] || "";
    }
    result.push(obj);
  }
  return result;
}

let currentTransactions = defaultTransactions;
let currentBacklog = defaultBacklog;

// Initial Draw
renderDashboard(currentTransactions, currentBacklog);

// Event Listeners
document.getElementById("transactionsFile").addEventListener("change", function(e) {
  let file = e.target.files[0];
  if (!file) return;
  let reader = new FileReader();
  reader.onload = function(evt) {
    let parsed = parseCSV(evt.target.result);
    if (parsed.length > 0) {
      currentTransactions = parsed;
      renderDashboard(currentTransactions, currentBacklog);
    }
  };
  reader.readAsText(file);
});

document.getElementById("backlogFile").addEventListener("change", function(e) {
  let file = e.target.files[0];
  if (!file) return;
  let reader = new FileReader();
  reader.onload = function(evt) {
    let parsed = parseCSV(evt.target.result);
    if (parsed.length > 0) {
      currentBacklog = parsed;
      renderDashboard(currentTransactions, currentBacklog);
    }
  };
  reader.readAsText(file);
});