"use strict";

let currentTransactions = [];
let currentBacklog = [];
let currentQos = [];

/* =========================================================
   HELPER FUNCTIONS
========================================================= */

function setDashboardText(elementId, text) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = text;
  }
}

function calculateGrowth(current, previous) {
  if (previous === 0) {
    return current > 0 ? null : 0;
  }

  return ((current - previous) / previous) * 100;
}

function formatGrowth(value) {
  if (value === null) {
    return "New";
  }

  if (!Number.isFinite(value)) {
    return "-";
  }

  const sign = value > 0 ? "+" : "";

  return `${sign}${value.toFixed(1)}%`;
}

function updateLastRefreshTimestamp() {
  const now = new Date();

  const timestamp = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(now);

  setDashboardText("lastRefresh", timestamp);
}

/* =========================================================
   CSV PARSER
========================================================= */

function parseCSV(text) {
  const rows = [];

  let row = [];
  let value = "";
  let insideQuotes = false;

  const source = String(text || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        value += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }

      continue;
    }

    if (character === "," && !insideQuotes) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if (
      (character === "\n" || character === "\r") &&
      !insideQuotes
    ) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(value.trim());

      if (row.some(cell => cell !== "")) {
        rows.push(row);
      }

      row = [];
      value = "";
      continue;
    }

    value += character;
  }

  row.push(value.trim());

  if (row.some(cell => cell !== "")) {
    rows.push(row);
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map(header => header.trim());

  return rows.slice(1).map(values => {
    const record = {};

    headers.forEach((header, index) => {
      record[header] = values[index] || "";
    });

    return record;
  });
}

/* =========================================================
   CALCULATION ENGINE & DASHBOARD RENDERER
========================================================= */

function getFieldValue(record, possibleKeys) {
  if (!record) return "";
  const recordKeys = Object.keys(record);
  for (const key of possibleKeys) {
    const targetKey = recordKeys.find(k => k.trim().toLowerCase() === key.toLowerCase());
    if (targetKey && record[targetKey] !== undefined && record[targetKey] !== "") {
      return String(record[targetKey]).trim();
    }
  }
  return "";
}

const CURRENCY_MAP = {
  Kenya: "KES",
  Uganda: "UGX",
  Tanzania: "TZS",
  Rwanda: "RWF",
  Nigeria: "NGN",
  Ghana: "GHS",
  SouthAfrica: "ZAR",
  UK: "GBP",
  USA: "USD"
};

function getLocalCurrency(country) {
  if (!country) return "";
  const cleanCountry = country.replace(/\s+/g, "");
  return CURRENCY_MAP[cleanCountry] || CURRENCY_MAP[country] || "";
}

function parseAmount(val) {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const clean = String(val || "").replace(/[^0-9.-]+/g, "");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function parseRecordDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function processDashboardData(txData, backlogData, qosData) {
  const transactionDates = txData
    .map(tx => parseRecordDate(getFieldValue(tx, ["Day", "Date"])))
    .filter(Boolean)
    .sort((a, b) => b - a);

  const now = transactionDates[0] || new Date();
  now.setHours(23, 59, 59, 999);

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDate = now.getDate();

  const mtdStart = new Date(currentYear, currentMonth, 1);
  const prevMonthStart = new Date(currentYear, currentMonth - 1, 1);

  const lastDayOfPreviousMonth = new Date(
    currentYear,
    currentMonth,
    0
  ).getDate();

  const previousComparisonDay = Math.min(
    currentDate,
    lastDayOfPreviousMonth
  );

  const prevMonthSameDay = new Date(
    currentYear,
    currentMonth - 1,
    previousComparisonDay,
    23,
    59,
    59,
    999
  );

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(now.getDate() - 14);

  const countryStats = {};
  const productStats = {};

  const validTxList = txData.filter(tx => {
    return Boolean(parseRecordDate(getFieldValue(tx, ["Day", "Date"])));
  });

  validTxList.forEach(tx => {
    const country = getFieldValue(tx, ["Country", "country", "Market"]);
    const product = getFieldValue(tx, ["Product", "product", "Service", "ServiceType", "TransactionType"]) || "Unassigned";

    if (!countryStats[country] && country) {
      countryStats[country] = {
        mtdVolume: 0,
        mtdRevenue: 0,
        mtdTxCount: 0,
        prevMtdVolume: 0,
        prevMtdRevenue: 0,
        prevMtdTxCount: 0,
        currWeekVolume: 0,
        currWeekRevenue: 0,
        currWeekTxCount: 0,
        prevWeekVolume: 0,
        prevWeekRevenue: 0,
        prevWeekTxCount: 0,
        currency: getLocalCurrency(country)
      };
    }

    const productKey = `${country}|${product}`;

    if (country && !productStats[productKey]) {
      productStats[productKey] = {
        country,
        product,
        currency: getLocalCurrency(country),
        mtdVolume: 0,
        mtdRevenue: 0,
        mtdTxCount: 0
      };
    }

    const amount = parseAmount(getFieldValue(tx, ["amount", "value", "txamount", "Volume"]));
    const revenue = parseAmount(getFieldValue(tx, ["Rev InTouch", "RevInTouch", "Revenue"]));
    const txDate = parseRecordDate(getFieldValue(tx, ["Day", "Date"]));

    if (country) {
      const cData = countryStats[country];

      if (txDate) {
        if (txDate >= mtdStart && txDate <= now) {
          cData.mtdVolume += amount;
          cData.mtdRevenue += revenue;
          cData.mtdTxCount += 1;
        }

        if (txDate >= prevMonthStart && txDate <= prevMonthSameDay) {
          cData.prevMtdVolume += amount;
          cData.prevMtdRevenue += revenue;
          cData.prevMtdTxCount += 1;
        }

        if (txDate >= sevenDaysAgo && txDate <= now) {
          cData.currWeekVolume += amount;
          cData.currWeekRevenue += revenue;
          cData.currWeekTxCount += 1;
        }

        if (txDate >= fourteenDaysAgo && txDate < sevenDaysAgo) {
          cData.prevWeekVolume += amount;
          cData.prevWeekRevenue += revenue;
          cData.prevWeekTxCount += 1;
        }
      } else {
        cData.mtdVolume += amount;
        cData.mtdRevenue += revenue;
        cData.mtdTxCount += 1;
      }
    }

    if (country && productStats[productKey]) {
      if (txDate) {
        if (txDate >= mtdStart && txDate <= now) {
          productStats[productKey].mtdVolume += amount;
          productStats[productKey].mtdRevenue += revenue;
          productStats[productKey].mtdTxCount += 1;
        }
      } else {
        productStats[productKey].mtdVolume += amount;
        productStats[productKey].mtdRevenue += revenue;
        productStats[productKey].mtdTxCount += 1;
      }
    }
  });

  const countrySummaries = [];
  const watchlist = [];

  Object.keys(countryStats).forEach(country => {
    const stats = countryStats[country];
    const momVolumeGrowth = calculateGrowth(stats.mtdVolume, stats.prevMtdVolume);
    const wowVolumeGrowth = calculateGrowth(stats.currWeekVolume, stats.prevWeekVolume);
    const wowTxGrowth = calculateGrowth(stats.currWeekTxCount, stats.prevWeekTxCount);

    const momRevenueGrowth = calculateGrowth(stats.mtdRevenue, stats.prevMtdRevenue);
    const wowRevenueGrowth = calculateGrowth(stats.currWeekRevenue, stats.prevWeekRevenue);

    countrySummaries.push({
      country,
      currency: stats.currency,
      mtdVolume: stats.mtdVolume,
      mtdRevenue: stats.mtdRevenue,
      mtdTxCount: stats.mtdTxCount,
      momGrowth: momVolumeGrowth,
      wowGrowth: wowVolumeGrowth,
      weeklyTransactionGrowth: wowTxGrowth,
      momRevenueGrowth,
      wowRevenueGrowth
    });

    if (wowTxGrowth !== null && (wowTxGrowth < -10 || wowTxGrowth > 25)) {
      watchlist.push({
        country,
        weeklyTransactionGrowth: wowTxGrowth,
        weeklyVolumeGrowth: wowVolumeGrowth
      });
    }
  });

  const productSummaries = Object.values(productStats)
    .sort((a, b) => {
      const countryComparison = a.country.localeCompare(b.country);

      if (countryComparison !== 0) {
        return countryComparison;
      }

      return b.mtdTxCount - a.mtdTxCount;
    });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const openBacklog = backlogData.filter(item => {
    const status = getFieldValue(item, ["status", "taskstatus", "state", "Status"]).toLowerCase();
    return (
      status !== "closed" &&
      status !== "complete" &&
      status !== "completed" &&
      status !== "resolved"
    );
  });

  const overdueBacklog = openBacklog.filter(item => {
    const rawDate = getFieldValue(item, ["duedate", "due date", "due", "DueDate"]);
    const dueDate = parseRecordDate(rawDate);
    return dueDate && dueDate < today;
  });

  const blockedBacklog = openBacklog.filter(item => {
    const status = getFieldValue(item, ["Status", "status"]).toLowerCase();
    return status.includes("blocked");
  });

  const followUpsDue = openBacklog.filter(item => {
    const rawFollowUp = getFieldValue(item, ["FollowUpDate", "Follow Up Date", "Next Follow Up"]);
    const followUpDate = parseRecordDate(rawFollowUp);

    if (followUpDate) {
      return followUpDate <= today;
    }

    const dueDate = parseRecordDate(getFieldValue(item, ["DueDate", "Due Date"]));
    if (!dueDate) {
      return false;
    }

    const sevenDaysAhead = new Date(today);
    sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);

    return dueDate >= today && dueDate <= sevenDaysAhead;
  });

  return {
    countrySummaries,
    productSummaries,
    watchlist,
    openBacklogCount: openBacklog.length,
    overdueBacklogCount: overdueBacklog.length,
    followUpsDueCount: followUpsDue.length,
    blockedBacklogCount: blockedBacklog.length
  };
}

function renderDashboard(txData, backlogData) {
  const metrics = processDashboardData(txData, backlogData, currentQos);

  // Update Summary DOM Cards & Action Centre fields
  setDashboardText("openActions", metrics.openBacklogCount);
  setDashboardText("overdueActions", metrics.overdueBacklogCount);
  setDashboardText("followUpsDue", metrics.followUpsDueCount);
  setDashboardText("actionOpenCount", metrics.openBacklogCount);
  setDashboardText("followUpsDueCount", metrics.followUpsDueCount);
  setDashboardText("actionOverdueCount", metrics.overdueBacklogCount);
  setDashboardText("blockedActionsCount", metrics.blockedBacklogCount);

  // QoS Rendering
  const qosConfig = {
    Kenya: "ke",
    Uganda: "ug",
    Tanzania: "tz",
    Nigeria: "ng"
  };

  Object.entries(qosConfig).forEach(([country, prefix]) => {
    const records = currentQos.filter(item => {
      const itemCountry = getFieldValue(item, [
        "Country",
        "Market",
        "Corridor"
      ]);

      return itemCountry.toLowerCase() === country.toLowerCase();
    });

    const values = records
      .map(item => {
        const rawValue = getFieldValue(item, [
          "QoS",
          "QOS",
          "Availability",
          "Success Rate",
          "Percentage"
        ]);

        if (rawValue === "") {
          return null;
        }

        let value = parseAmount(rawValue);

        if (value > 0 && value <= 1) {
          value *= 100;
        }

        return value;
      })
      .filter(value => value !== null && Number.isFinite(value));

    const element = document.getElementById(`${prefix}Qos`);

    if (!element || values.length === 0) {
      setDashboardText(`${prefix}Qos`, "-");
      return;
    }

    const qos =
      values.reduce((sum, value) => sum + value, 0) /
      values.length;

    element.classList.remove(
      "qos-good",
      "qos-warning",
      "qos-critical"
    );

    if (qos >= 99) {
      element.classList.add("qos-good");
    } else if (qos >= 95) {
      element.classList.add("qos-warning");
    } else {
      element.classList.add("qos-critical");
    }

    element.textContent = `${qos.toFixed(1)}%`;
  });

  // Country Cards Setup
  const countryConfig = {
    Kenya: {
      prefix: "ke",
      currency: "KES"
    },
    Uganda: {
      prefix: "ug",
      currency: "UGX"
    },
    Tanzania: {
      prefix: "tz",
      currency: "TZS"
    },
    Nigeria: {
      prefix: "ng",
      currency: "NGN"
    }
  };

  Object.entries(countryConfig).forEach(([country, config]) => {
    const summary = metrics.countrySummaries.find(
      item => item.country.toLowerCase() === country.toLowerCase()
    );

    if (!summary) {
      setDashboardText(`${config.prefix}Health`, "No transaction data");
      setDashboardText(`${config.prefix}Tx`, "0");
      setDashboardText(`${config.prefix}Vol`, `${config.currency} 0`);
      setDashboardText(`${config.prefix}Rev`, `${config.currency} 0`);
      setDashboardText(`${config.prefix}WoW`, "-");
      setDashboardText(`${config.prefix}MoM`, "-");
      return;
    }

    setDashboardText(`${config.prefix}Tx`, summary.mtdTxCount.toLocaleString());
    setDashboardText(`${config.prefix}Vol`, `${config.currency} ${summary.mtdVolume.toLocaleString()}`);
    setDashboardText(`${config.prefix}Rev`, `${config.currency} ${summary.mtdRevenue.toLocaleString()}`);
    setDashboardText(`${config.prefix}WoW`, `Vol ${formatGrowth(summary.wowGrowth)} | Rev ${formatGrowth(summary.wowRevenueGrowth)}`);
    setDashboardText(`${config.prefix}MoM`, `Vol ${formatGrowth(summary.momGrowth)} | Rev ${formatGrowth(summary.momRevenueGrowth)}`);

    let health = "🟢 Healthy";

    if (summary.wowGrowth !== null && summary.wowGrowth < -10) {
      health = "🔴 Attention";
    } else if (summary.wowGrowth !== null && summary.wowGrowth < 0) {
      health = "🟡 Watch";
    }

    setDashboardText(`${config.prefix}Health`, health);
  });

  // Growth Watchlist Rendering
  const availableMarkets = metrics.countrySummaries.filter(
    item => item.mtdTxCount > 0
  );

  const topRevenueGrowth = [...availableMarkets]
    .filter(item => item.momRevenueGrowth !== null)
    .sort(
      (a, b) =>
        b.momRevenueGrowth - a.momRevenueGrowth
    )[0];

  const mostActiveMarket = [...availableMarkets].sort(
    (a, b) => b.mtdTxCount - a.mtdTxCount
  )[0];

  const fastestGrowingMarket = [...availableMarkets]
    .filter(item => item.weeklyTransactionGrowth !== null)
    .sort(
      (a, b) =>
        b.weeklyTransactionGrowth -
        a.weeklyTransactionGrowth
    )[0];

  setDashboardText(
    "topPerformer",
    topRevenueGrowth
      ? `${topRevenueGrowth.country} ${formatGrowth(
          topRevenueGrowth.momRevenueGrowth
        )}`
      : "-"
  );

  setDashboardText(
    "mostActiveCountry",
    mostActiveMarket
      ? `${mostActiveMarket.country} ${mostActiveMarket.mtdTxCount.toLocaleString()} tx`
      : "-"
  );

  setDashboardText(
    "fastestGrowing",
    fastestGrowingMarket
      ? `${fastestGrowingMarket.country} ${formatGrowth(
          fastestGrowingMarket.weeklyTransactionGrowth
        )}`
      : "-"
  );

  // Executive Insight Rendering
  const insightEl = document.getElementById("executiveInsight");

  if (insightEl) {
    const mostActive = [...metrics.countrySummaries]
      .sort(
        (a, b) => b.mtdTxCount - a.mtdTxCount
      )[0];

    const mostActiveText = mostActive
      ? `${mostActive.country} is the most active market with ${mostActive.mtdTxCount.toLocaleString()} MTD transactions.`
      : "Transaction data has not yet been loaded.";

    insightEl.textContent =
      `${mostActiveText} ` +
      `${metrics.openBacklogCount} actions are open, ` +
      `including ${metrics.overdueBacklogCount} overdue, ` +
      `${metrics.followUpsDueCount} due for follow-up and ` +
      `${metrics.blockedBacklogCount} blocked.`;
  }

  // Product Snapshot Rendering
  const productSnapshotBody = document.getElementById("productSnapshot");

  if (productSnapshotBody) {
    productSnapshotBody.innerHTML = "";

    if (metrics.productSummaries.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");

      cell.colSpan = 5;
      cell.textContent = "No product data available.";

      row.appendChild(cell);
      productSnapshotBody.appendChild(row);
    } else {
      metrics.productSummaries.forEach(prod => {
        const row = document.createElement("tr");

        const values = [
          prod.country,
          prod.product,
          prod.mtdTxCount.toLocaleString(),
          `${prod.currency} ${prod.mtdVolume.toLocaleString()}`,
          `${prod.currency} ${prod.mtdRevenue.toLocaleString()}`
        ];

        values.forEach(value => {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.appendChild(cell);
        });

        productSnapshotBody.appendChild(row);
      });
    }
  }

  updateLastRefreshTimestamp();
}

/* =========================================================
   FILE UPLOAD LISTENERS
========================================================= */

const txFileInput = document.getElementById("transactionsFile");
if (txFileInput) {
  txFileInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      const parsed = parseCSV(evt.target.result);
      if (parsed.length === 0) {
        window.alert("No valid transaction records were found.");
        return;
      }

      currentTransactions = parsed;
      renderDashboard(currentTransactions, currentBacklog);
    };
    reader.onerror = function () {
      window.alert("The Transactions CSV could not be read.");
    };
    reader.readAsText(file);
  });
}

const backlogFileInput = document.getElementById("backlogFile");
if (backlogFileInput) {
  backlogFileInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      const parsed = parseCSV(evt.target.result);
      if (parsed.length === 0) {
        window.alert("No valid backlog records were found.");
        return;
      }

      currentBacklog = parsed;
      renderDashboard(currentTransactions, currentBacklog);
    };
    reader.onerror = function () {
      window.alert("The Backlog CSV could not be read.");
    };
    reader.readAsText(file);
  });
}

const qosFileInput = document.getElementById("qosFile");
if (qosFileInput) {
  qosFileInput.addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (loadEvent) {
      const parsed = parseCSV(loadEvent.target.result);
      if (parsed.length === 0) {
        window.alert("No valid QoS records were found.");
        return;
      }

      currentQos = parsed;
      renderDashboard(currentTransactions, currentBacklog);
    };
    reader.onerror = function () {
      window.alert("The QoS CSV could not be read.");
    };
    reader.readAsText(file);
  });
}

/* =========================================================
   INITIALIZATION
========================================================= */

renderDashboard(
  currentTransactions,
  currentBacklog
);