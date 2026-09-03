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
  let totalValue = txData.reduce((acc, curr) => acc + Number(curr.Amount || 0), 0);
  
  let corridorMap = {};
  txData.forEach(tx => {
    let key = `${tx.Origin} → ${tx.Destination}`;
    if (!corridorMap[key]) {
      corridorMap[key] = { volume: 0, value: 0, status: tx.Status, successes: 0 };
    }
    corridorMap[key].volume += 1;
    corridorMap[key].value += Number(currValue = curr.Amount || 0);
    if (tx.Status.toLowerCase() === "success" || tx.Status.toLowerCase() === "live") {
      corridorMap[key].successes += 1;
    }
  });

  // Re-adjusting the inner value addition logic properly
  txData.forEach(tx => {
    let key = `${tx.Origin} → ${tx.Destination}`;
    corridorMap[key].value = txData.filter(t => `${t.Origin} → ${t.Destination}` === key).reduce((sum, t) => sum + Number(t.Amount || 0), 0);
  });

  let activeCorridorsCount = Object.keys(corridorMap).length;
  let openActionsCount = backlogData.filter(x => x.Status.toLowerCase() !== "closed" && x.Status.toLowerCase() !== "completed").length;

  let today = new Date();
  let overdue = backlogData.filter(x => new Date(x.DueDate) < today && x.Status.toLowerCase() !== "closed").length;

  let revenue = totalValue * feeRate;

  document.getElementById("transactions").innerText = totalTxCount.toLocaleString();
  document.getElementById("volume").innerText = totalValue.toLocaleString();
  document.getElementById("revenue").innerText = "KES " + revenue.toLocaleString();
  document.getElementById("successRate").innerText = totalTxCount > 0 ? ((txData.filter(t => t.Status.toLowerCase() === "success").length / totalTxCount) * 100).toFixed(1) + "%" : "0%";
  document.getElementById("openActions").innerText = openActionsCount;
  
  let overdueEl = document.getElementById("overdueActions");
  if (overdueEl) {
    overdueEl.innerText = overdue;
  }
  
  document.getElementById("activeCorridors").innerText = activeCorridorsCount;

  let topCorridor = Object.entries(corridorMap).sort((a, b) => b[1].value - a[1].value)[0];
  let summaryEl = document.getElementById("summary");
  summaryEl.innerHTML = `
    <ul>
      <li>Total Transactions: ${totalTxCount}</li>
      <li>Total Value: KES ${totalValue.toLocaleString()}</li>
      <li>Active Corridors: ${activeCorridorsCount}</li>
      <li>Open Actions: ${openActionsCount}</li>
      <li>Top Corridor: ${topCorridor ? topCorridor[0] : "N/A"}</li>
    </ul>
  `;

  let health = document.getElementById("corridorHealth");
  if (health) {
    health.innerHTML = "";
    for (let [corridor, data] of Object.entries(corridorMap)) {
      let icon = "🟢";
      if (data.status.toLowerCase() === "pending") {
        icon = "🟡";
      }
      if (data.status.toLowerCase() === "failed") {
        icon = "🔴";
      }
      health.innerHTML += `
        <li>${icon} ${corridor} : ${data.status}</li>
      `;
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
      actionTableBody.innerHTML += `
        <tr>
          <td>${action.Task}</td>
          <td>${action.Owner}</td>
          <td>${action.Priority}</td>
          <td>${action.DueDate}</td>
          <td>${action.Status}</td>
        </tr>
      `;
    });
  }
}

function parseCSV(text) {
  let lines = text.trim().split("\n");
  let result = [];
  let headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
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

renderDashboard(currentTransactions, currentBacklog);

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