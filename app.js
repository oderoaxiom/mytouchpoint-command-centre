"use strict";

let currentTransactions = [];
let currentBacklog = [];
let currentQos = {
  Kenya: null,
  Uganda: null,
  Tanzania: null,
  Nigeria: null
};
let qosTrendChart = null;

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

function processDashboardData(txData, backlogData) {
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
  sevenDaysAgo.setDate(now.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const previousWeekStart = new Date(now);
  previousWeekStart.setDate(now.getDate() - 13);
  previousWeekStart.setHours(0, 0, 0, 0);

  const previousWeekEnd = new Date(now);
  previousWeekEnd.setDate(now.getDate() - 7);
  previousWeekEnd.setHours(23, 59, 59, 999);

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

        if (
          txDate >= previousWeekStart &&
          txDate <= previousWeekEnd
        ) {
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

/* =========================================================
WEEKLY QOS MATRIX PARSER
========================================================= */

function normalizeMetricName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseWeeklyQosMatrix(records, country) {
  if (!Array.isArray(records) || records.length === 0) {
    return null;
  }

  const firstRecord = records[0];

  const weekColumns = Object.keys(firstRecord)
    .filter(key => normalizeMetricName(key) !== "week")
    .map(key => ({
      key,
      week: Number(String(key).trim())
    }))
    .filter(item => Number.isFinite(item.week))
    .sort((a, b) => a.week - b.week);

  if (weekColumns.length === 0) {
    return null;
  }

  const latestWeek =
    weekColumns[weekColumns.length - 1];

  function findMetricRow(possibleNames) {
    return records.find(record => {
      const metricName = normalizeMetricName(
        getFieldValue(record, ["WEEK"])
      );

      return possibleNames.some(name => {
        return (
          metricName === normalizeMetricName(name)
        );
      });
    });
  }

  function readMetric(possibleNames) {
    const metricRow =
      findMetricRow(possibleNames);

    if (!metricRow) {
      return null;
    }

    const rawValue =
      metricRow[latestWeek.key];

    if (
      rawValue === undefined ||
      rawValue === null ||
      String(rawValue).trim() === ""
    ) {
      return null;
    }

    return parseAmount(rawValue);
  }

  const successRate = readMetric([
    "Success Rate (%)",
    "Success Rate"
  ]);

  if (successRate === null) {
    return null;
  }

  const successRateRow = findMetricRow([
    "Success Rate (%)",
    "Success Rate"
  ]);

  const history = weekColumns
    .map(weekColumn => {
      if (!successRateRow) {
        return null;
      }

      const rawValue =
        successRateRow[weekColumn.key];

      if (
        rawValue === undefined ||
        rawValue === null ||
        String(rawValue).trim() === ""
      ) {
        return null;
      }

      let weeklySuccessRate =
        parseAmount(rawValue);

      if (
        weeklySuccessRate > 0 &&
        weeklySuccessRate <= 1
      ) {
        weeklySuccessRate *= 100;
      }

      return {
        week: weekColumn.week,
        successRate: weeklySuccessRate
      };
    })
    .filter(item => {
      return (
        item !== null &&
        Number.isFinite(item.successRate)
      );
    });

  return {
    country,
    week: latestWeek.week,

    successRate,
    history,

    failureRate: readMetric([
      "Failure Rate (%)",
      "Failure Rate"
    ]),

    totalVolume: readMetric([
      "TOTAL VOLUME",
      "Total Volume"
    ]),

    successfulVolume: readMetric([
      "VOLUME SUCCESSFUL",
      "Successful Volume"
    ]),

    failedVolume: readMetric([
      "VOLUME FAILED",
      "Failed Volume"
    ]),

    totalTransactions: readMetric([
      "Total № Transactions",
      "Total No Transactions",
      "Total Transactions"
    ]),

    successfulTransactions: readMetric([
      "Successful Transactions"
    ]),

    failedTransactions: readMetric([
      "Failed Transactions"
    ]),

    activeServices: readMetric([
      "Active Services"
    ])
  };
}

function renderWeeklyQosCards() {
  const countryConfig = {
    Kenya: "ke",
    Uganda: "ug",
    Tanzania: "tz",
    Nigeria: "ng"
  };

  const loadedPeriods = [];

  Object.entries(countryConfig).forEach(([country, prefix]) => {
    const qosData = currentQos[country];
    const element = document.getElementById(`${prefix}Qos`);

    if (!element) {
      return;
    }

    element.classList.remove(
      "qos-good",
      "qos-warning",
      "qos-critical"
    );

    if (
      !qosData ||
      qosData.successRate === null ||
      !Number.isFinite(qosData.successRate)
    ) {
      element.textContent = "-";
      element.title = `${country}: no QoS data loaded`;
      return;
    }

    element.textContent =
      `${qosData.successRate.toFixed(1)}%`;

    element.title =
      `${country} | Week ${qosData.week} | ` +
      `${Number(qosData.totalTransactions || 0).toLocaleString()} transactions | ` +
      `${Number(qosData.activeServices || 0).toLocaleString()} active services`;

    loadedPeriods.push({
      country,
      week: qosData.week
    });

    if (qosData.successRate >= 95) {
      element.classList.add("qos-good");
    } else if (qosData.successRate >= 80) {
      element.classList.add("qos-warning");
    } else {
      element.classList.add("qos-critical");
    }
  });

  const reportingPeriod =
    document.getElementById("qosReportingPeriod");

  if (!reportingPeriod) {
    return;
  }

  if (loadedPeriods.length === 0) {
    reportingPeriod.textContent =
      "No QoS data loaded";
    return;
  }

  const uniqueWeeks = [
    ...new Set(
      loadedPeriods.map(item => item.week)
    )
  ];

  if (uniqueWeeks.length === 1) {
    reportingPeriod.textContent =
      `Latest available week: Week ${uniqueWeeks[0]}`;
  } else {
    reportingPeriod.textContent =
      loadedPeriods
        .map(item =>
          `${item.country}: Week ${item.week}`
        )
        .join(" | ");
  }
}

/* =========================================================
INTERACTIVE WEEKLY QOS TREND CHART
========================================================= */

function renderQosTrendChart() {
  const chartElement =
    document.getElementById("qosTrendChart");

  if (!chartElement) {
    return;
  }

  if (typeof echarts === "undefined") {
    chartElement.textContent =
      "The chart library could not be loaded.";

    return;
  }

  if (!qosTrendChart) {
    qosTrendChart =
      echarts.init(chartElement);
  }

  const countryColours = {
    Kenya: "#60a5fa",
    Uganda: "#fbbf24",
    Tanzania: "#4ade80",
    Nigeria: "#c084fc"
  };

  const loadedCountries =
    Object.entries(currentQos).filter(
      ([, qosData]) => {
        return (
          qosData &&
          Array.isArray(qosData.history) &&
          qosData.history.length > 0
        );
      }
    );

  if (loadedCountries.length === 0) {
    qosTrendChart.clear();

    qosTrendChart.setOption({
      title: {
        text:
          "Upload country QoS files to display the weekly trend",
        left: "center",
        top: "middle",

        textStyle: {
          color: "#94a3b8",
          fontSize: 14,
          fontWeight: 500
        }
      },

      xAxis: {
        show: false
      },

      yAxis: {
        show: false
      },

      series: []
    });

    return;
  }

  const allWeeks = [
    ...new Set(
      loadedCountries.flatMap(
        ([, qosData]) => {
          return qosData.history.map(
            item => item.week
          );
        }
      )
    )
  ].sort((first, second) => first - second);

  const chartSeries = loadedCountries.map(
    ([country, qosData]) => {
      const weeklyValues = new Map(
        qosData.history.map(item => [
          item.week,
          item.successRate
        ])
      );

      return {
        name: country,
        type: "line",
        smooth: true,
        connectNulls: false,

        symbol: "circle",
        symbolSize: 8,
        showSymbol: false,

        emphasis: {
          focus: "series"
        },

        lineStyle: {
          width: 3,
          color: countryColours[country]
        },

        itemStyle: {
          color: countryColours[country]
        },

        areaStyle: {
          opacity: 0.06,
          color: countryColours[country]
        },

        data: allWeeks.map(week => {
          return weeklyValues.has(week)
            ? weeklyValues.get(week)
            : null;
        })
      };
    }
  );

  qosTrendChart.setOption(
    {
      backgroundColor: "transparent",

      animation: true,
      animationDuration: 900,
      animationEasing: "cubicOut",

      tooltip: {
        trigger: "axis",

        backgroundColor:
          "rgba(15, 23, 42, 0.96)",

        borderColor:
          "rgba(255, 255, 255, 0.12)",

        borderWidth: 1,

        textStyle: {
          color: "#f8fafc"
        },

        valueFormatter: value => {
          if (
            value === null ||
            value === undefined
          ) {
            return "-";
          }

          return `${Number(value).toFixed(1)}%`;
        }
      },

      legend: {
        top: 8,

        textStyle: {
          color: "#cbd5e1"
        },

        selectedMode: true
      },

      toolbox: {
        top: 4,
        right: 10,

        feature: {
          dataZoom: {
            yAxisIndex: "none"
          },

          restore: {},

          saveAsImage: {
            name:
              "MyTouchPoint-Weekly-QoS-Trend",
            backgroundColor: "#070d1b"
          }
        },

        iconStyle: {
          borderColor: "#94a3b8"
        },

        emphasis: {
          iconStyle: {
            borderColor: "#38bdf8"
          }
        }
      },

      grid: {
        left: 50,
        right: 35,
        top: 75,
        bottom: 65,
        containLabel: true
      },

      xAxis: {
        type: "category",
        boundaryGap: false,

        name: "Reporting Week",

        nameLocation: "middle",
        nameGap: 38,

        nameTextStyle: {
          color: "#94a3b8"
        },

        data: allWeeks.map(
          week => `W${week}`
        ),

        axisLine: {
          lineStyle: {
            color:
              "rgba(255,255,255,0.14)"
          }
        },

        axisTick: {
          show: false
        },

        axisLabel: {
          color: "#94a3b8"
        }
      },

      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        interval: 20,

        name: "Success Rate",

        nameTextStyle: {
          color: "#94a3b8"
        },

        axisLabel: {
          color: "#94a3b8",
          formatter: "{value}%"
        },

        splitLine: {
          lineStyle: {
            color:
              "rgba(255,255,255,0.07)"
          }
        }
      },

      dataZoom: [
        {
          type: "inside",
          start: 0,
          end: 100
        },

        {
          type: "slider",
          height: 18,
          bottom: 8,

          borderColor:
            "rgba(255,255,255,0.08)",

          backgroundColor:
            "rgba(15,23,42,0.45)",

          fillerColor:
            "rgba(56,189,248,0.15)",

          handleStyle: {
            color: "#38bdf8"
          },

          textStyle: {
            color: "#94a3b8"
          }
        }
      ],

      series: chartSeries
    },
    true
  );
}

function renderDashboard(txData, backlogData) {
  const metrics = processDashboardData(txData, backlogData);

  // Update Summary DOM Cards & Action Centre fields
  setDashboardText("openActions", metrics.openBacklogCount);
  setDashboardText("overdueActions", metrics.overdueBacklogCount);
  setDashboardText("followUpsDue", metrics.followUpsDueCount);
  setDashboardText("actionOpenCount", metrics.openBacklogCount);
  setDashboardText("followUpsDueCount", metrics.followUpsDueCount);
  setDashboardText("actionOverdueCount", metrics.overdueBacklogCount);
  setDashboardText("blockedActionsCount", metrics.blockedBacklogCount);

  renderWeeklyQosCards();
  renderQosTrendChart();

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

/* =========================================================
COUNTRY QOS FILE UPLOADS
========================================================= */

const qosUploadConfig = [
  {
    inputId: "keQosFile",
    country: "Kenya"
  },
  {
    inputId: "ugQosFile",
    country: "Uganda"
  },
  {
    inputId: "tzQosFile",
    country: "Tanzania"
  },
  {
    inputId: "ngQosFile",
    country: "Nigeria"
  }
];

qosUploadConfig.forEach(config => {
  const input =
    document.getElementById(config.inputId);

  if (!input) {
    return;
  }

  input.addEventListener(
    "change",
    function (event) {
      const file = event.target.files[0];

      if (!file) {
        return;
      }

      const reader = new FileReader();

      reader.onload = function (loadEvent) {
        const parsedRecords =
          parseCSV(loadEvent.target.result);

        if (parsedRecords.length === 0) {
          window.alert(
            `No valid records were found in the ${config.country} QoS file.`
          );

          return;
        }

        const weeklyQos =
          parseWeeklyQosMatrix(
            parsedRecords,
            config.country
          );

        if (!weeklyQos) {
          window.alert(
            `${config.country} QoS file could not be recognized. ` +
            `Confirm that the first column is WEEK and that the file contains a Success Rate (%) row.`
          );

          return;
        }

        currentQos[config.country] =
          weeklyQos;

        renderDashboard(
          currentTransactions,
          currentBacklog
        );
      };

      reader.onerror = function () {
        window.alert(
          `${config.country} QoS file could not be read.`
        );
      };

      reader.readAsText(file);
    }
  );
});

/* =========================================================
   INITIALIZATION
========================================================= */

renderDashboard(
  currentTransactions,
  currentBacklog
);

window.addEventListener("resize", function () {
  if (qosTrendChart) {
    qosTrendChart.resize();
  }
});