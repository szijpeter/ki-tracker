/* global Chart */
/**
 * KI Tracker Dashboard
 * Fetches data, renders charts, and provides interactive features
 */

// Data and chart state
let historyData = [];
let charts = []; // Array to hold all active chart instances
let currentRange = '1d';

// Constants
const GYM_HOURS = { start: 9, end: 22 };

// DOM Elements
const leadValue = document.getElementById('lead-value');
const boulderValue = document.getElementById('boulder-value');
const leadProgress = document.getElementById('lead-progress');
const boulderProgress = document.getElementById('boulder-progress');
const lastUpdatedEl = document.getElementById('last-updated');
const refreshBtn = document.getElementById('refresh-btn');
const timesGrid = document.getElementById('times-grid');
const filterBtns = document.querySelectorAll('.filter-btn');
const chartsContainer = document.getElementById('charts-container');

/**
 * Fetches the history data from the JSON file
 */
async function fetchData() {
    try {
        const [historyResponse, statusResponse] = await Promise.all([
            fetch('./data/history.json?' + Date.now()),
            fetch('./data/status.json?' + Date.now()).catch(() => ({ ok: false }))
        ]);

        if (!historyResponse.ok) throw new Error('Failed to fetch data');

        historyData = await historyResponse.json();
        const statusData = statusResponse.ok ? await statusResponse.json() : null;

        return { history: historyData, status: statusData };
    } catch (error) {
        console.error('Error fetching data:', error);
        return { history: [], status: null };
    }
}

/**
 * Updates the current status cards with the latest data
 */
function updateCurrentStatus(data, status) {
    if (!data || data.length === 0) {
        leadValue.textContent = '--';
        boulderValue.textContent = '--';
        lastUpdatedEl.textContent = 'No data available';
        return;
    }

    const latest = data[data.length - 1];

    // Animate the value changes
    animateValue(leadValue, latest.lead ?? '--');
    animateValue(boulderValue, latest.boulder ?? '--');

    // Update progress bars
    leadProgress.style.width = `${latest.lead ?? 0}%`;
    boulderProgress.style.width = `${latest.boulder ?? 0}%`;

    // Update status text
    if (status && !status.success) {
        lastUpdatedEl.textContent = `Error: ${status.message || 'Collection failed'}`;
        lastUpdatedEl.style.color = '#ef4444'; // Red color for error
    } else {
        lastUpdatedEl.style.color = ''; // Reset color

        // Use status timestamp if available, otherwise use data timestamp
        const lastRun = status ? new Date(status.lastRun) : new Date(latest.timestamp);
        const now = new Date();
        const diffMinutes = Math.floor((now - lastRun) / 60000);

        if (diffMinutes < 1) {
            lastUpdatedEl.textContent = 'Updated just now';
        } else if (diffMinutes < 60) {
            lastUpdatedEl.textContent = `Updated ${diffMinutes} min ago`;
        } else {
            lastUpdatedEl.textContent = `Updated at ${lastRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
    }
}

/**
 * Animates a value change with a brief flash effect
 */
function animateValue(element, newValue) {
    const currentValue = element.textContent;
    if (currentValue !== String(newValue)) {
        element.style.transform = 'scale(1.1)';
        element.textContent = newValue;
        setTimeout(() => {
            element.style.transform = 'scale(1)';
        }, 150);
    }
}

/**
 * Groups data by day (YYYY-MM-DD)
 */
function groupDataByDay(data) {
    const groups = {};
    data.forEach(entry => {
        const date = new Date(entry.timestamp);
        const key = date.toISOString().split('T')[0];
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(entry);
    });
    return groups;
}

/**
 * Normalizes data for a single day to ensure consistent X-axis
 * Injects 0 values at opening/closing times if missing
 */
function normalizeDayData(rawData, dateStr) {
    // Create base date for this chart
    const baseDate = new Date(dateStr);
    const startOfDay = new Date(baseDate);
    startOfDay.setHours(GYM_HOURS.start, 0, 0, 0);
    const endOfDay = new Date(baseDate);
    endOfDay.setHours(GYM_HOURS.end, 0, 0, 0);

    let data = [...rawData];

    // Check if we need to inject start point
    if (data.length === 0 || new Date(data[0].timestamp) > startOfDay) {
        data.unshift({
            timestamp: startOfDay.toISOString(),
            lead: 0,
            boulder: 0
        });
    }

    // Check if we need to inject end point (only for past days or if gym is closed)
    // For today, we don't force an end point if it's currently earlier than closing time
    const now = new Date();
    const isToday = baseDate.toDateString() === now.toDateString();

    // logic: if it's a past day, force end point. 
    // if it's today and current time is past closing, force end point.
    if (!isToday || (isToday && now.getHours() >= GYM_HOURS.end)) {
        if (data.length > 0 && new Date(data[data.length - 1].timestamp) < endOfDay) {
            data.push({
                timestamp: endOfDay.toISOString(),
                lead: 0,
                boulder: 0
            });
        }
    }

    return {
        labels: data.map(d => new Date(d.timestamp)),
        leadData: data.map(d => d.lead),
        boulderData: data.map(d => d.boulder),
        minTime: startOfDay,
        maxTime: endOfDay
    };
}

/**
 * Synchronizes tooltips across multiple charts
 */
function syncTooltips(activeChart, tooltipModel) {
    const dataIndex = tooltipModel.dataPoints?.[0]?.dataIndex;
    if (dataIndex == null) return;

    charts.forEach(chart => {
        if (chart !== activeChart && !chart.destroyed) {
            // Need to check if this chart actually has data at this index
            const meta = chart.getDatasetMeta(0);
            if (meta.data[dataIndex]) {
                chart.setActiveElements([
                    { datasetIndex: 0, index: dataIndex },
                    { datasetIndex: 1, index: dataIndex }
                ]);
                chart.tooltip.setActiveElements([
                    { datasetIndex: 0, index: dataIndex },
                    { datasetIndex: 1, index: dataIndex }
                ], { x: 0, y: 0 });
                chart.update('none');
            }
        }
    });
}

/**
 * Creates a single day chart instance
 */
function createDayChart(canvasCtx, dayData, minTime, maxTime) {
    return new Chart(canvasCtx, {
        type: 'line',
        data: {
            labels: dayData.labels,
            datasets: [
                {
                    label: 'Lead',
                    data: dayData.leadData,
                    borderColor: '#818cf8',
                    backgroundColor: 'rgba(129, 140, 248, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                },
                {
                    label: 'Boulder',
                    data: dayData.boulderData,
                    borderColor: '#fbbf24',
                    backgroundColor: 'rgba(251, 191, 36, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: false // Hide legend to save space on small charts
                },
                tooltip: {
                    backgroundColor: '#24243a',
                    titleColor: '#ffffff',
                    bodyColor: '#a1a1b5',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    // external: true, // We trigger syncing manually via onHover/interaction
                    callbacks: {
                        label: function (context) {
                            return `${context.dataset.label}: ${context.parsed.y}%`;
                        },
                        title: function (context) {
                            // Format time only
                            const date = new Date(context[0].parsed.x);
                            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        }
                    }
                }
            },
            onHover: (event, elements, chart) => {
                // Trigger sync logic here if needed, but 'interaction' mode handles standard tooltips.
                // For true external sync, we rely on the tooltip plugin's hooks or custom events.
                // However, Chart.js doesn't have a simple 'onTooltipShow' event.
                // A common workaround is hooking into the tooltip call.
            },
            scales: {
                x: {
                    type: 'time',
                    min: minTime,
                    max: maxTime,
                    time: {
                        unit: 'hour',
                        displayFormats: {
                            hour: 'HH:mm'
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                    },
                    ticks: {
                        color: '#6b6b80',
                        maxTicksLimit: 8,
                    }
                },
                y: {
                    min: 0,
                    max: 100,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                    },
                    ticks: {
                        color: '#6b6b80',
                        callback: value => value + '%'
                    }
                }
            },
            // Hook for external hook synchronization
            plugins: {
                tooltip: {
                    // We override the internal hook to broadcast changes
                    external: function (context) {
                        // Default tooltip rendering is disabled if external is true,
                        // but we want *both* default rendering AND custom syncing.
                        // So we don't set external: true, but we could shim interaction logic.
                        // Instead, we 'll try adding a custom plugin.
                    }
                }
            }
        },
        plugins: [{
            id: 'syncTooltip',
            afterEvent: (chart, args) => {
                if (args.event.type === 'mousemove' || args.event.type === 'mouseout') {
                    // Start synchronization
                    const activeElements = chart.getActiveElements();
                    if (activeElements.length > 0) {
                        // Find the data index
                        const dataIndex = activeElements[0].index;

                        // Sync to other charts
                        charts.forEach(c => {
                            if (c !== chart && !c.destroyed) {
                                const meta = c.getDatasetMeta(0);
                                // Only show if data index exists for this chart (handling potentially different lengths if not normalized identically)
                                if (meta.data[dataIndex]) {
                                    c.setActiveElements([
                                        { datasetIndex: 0, index: dataIndex },
                                        { datasetIndex: 1, index: dataIndex }
                                    ]);
                                    c.tooltip.setActiveElements([
                                        { datasetIndex: 0, index: dataIndex },
                                        { datasetIndex: 1, index: dataIndex }
                                    ], { x: 0, y: 0 }); // coords ignored usually
                                    c.update('none');
                                }
                            }
                        });
                    } else {
                        // Clear other charts
                        charts.forEach(c => {
                            if (c !== chart && !c.destroyed) {
                                c.setActiveElements([]);
                                c.tooltip.setActiveElements([], { x: 0, y: 0 });
                                c.update('none');
                            }
                        });
                    }
                }
            }
        }]
    });
}

/**
 * Renders the Single Day View
 */
function renderSingleDayView(groupedData) {
    chartsContainer.className = 'charts-container'; // default layout

    // Get today's data
    const todayKey = new Date().toISOString().split('T')[0];
    const rawTodayData = groupedData[todayKey] || [];

    const dayWrapper = document.createElement('div');
    dayWrapper.className = 'day-chart-wrapper';

    const dateLabel = document.createElement('div');
    dateLabel.className = 'date-label';
    dateLabel.textContent = 'Today';
    dayWrapper.appendChild(dateLabel);

    const canvas = document.createElement('canvas');
    dayWrapper.appendChild(canvas);
    chartsContainer.appendChild(dayWrapper);

    const normalized = normalizeDayData(rawTodayData, todayKey);
    const chart = createDayChart(canvas.getContext('2d'), normalized, normalized.minTime, normalized.maxTime);
    charts.push(chart);
}

/**
 * Renders the Two Day View
 */
function renderTwoDayView(groupedData) {
    chartsContainer.className = 'charts-container two-day';

    const sortedKeys = Object.keys(groupedData).sort().reverse();
    // We want today and yesterday. If today is missing (e.g. early morning), we might still want to show it?
    // Let's assume we always want Today + Yesterday
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const daysToShow = [today, yesterday];

    daysToShow.forEach((date, i) => {
        const key = date.toISOString().split('T')[0];
        const rawData = groupedData[key] || [];

        const dayWrapper = document.createElement('div');
        dayWrapper.className = 'day-chart-wrapper';

        const dateLabel = document.createElement('div');
        dateLabel.className = 'date-label';
        dateLabel.textContent = i === 0 ? 'Today' : 'Yesterday';
        dayWrapper.appendChild(dateLabel);

        const canvas = document.createElement('canvas');
        dayWrapper.appendChild(canvas);
        chartsContainer.appendChild(dayWrapper);

        const normalized = normalizeDayData(rawData, key);
        const chart = createDayChart(canvas.getContext('2d'), normalized, normalized.minTime, normalized.maxTime);
        charts.push(chart);
    });
}

/**
 * Renders the Weekly View
 */
function renderWeeklyView(groupedData) {
    chartsContainer.className = 'charts-container week';

    const today = new Date();
    const daysToShow = [];

    // Generate last 7 days including today
    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        daysToShow.push(d);
    }

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    daysToShow.forEach((date, i) => {
        const key = date.toISOString().split('T')[0];
        const rawData = groupedData[key] || [];

        const dayWrapper = document.createElement('div');
        dayWrapper.className = 'day-chart-wrapper';

        const dateLabel = document.createElement('div');
        dateLabel.className = 'date-label';
        dateLabel.textContent = i === 0 ? 'Today' : daysOfWeek[date.getDay()];
        dayWrapper.appendChild(dateLabel);

        const canvas = document.createElement('canvas');
        dayWrapper.appendChild(canvas);
        chartsContainer.appendChild(dayWrapper);

        const normalized = normalizeDayData(rawData, key);
        const chart = createDayChart(canvas.getContext('2d'), normalized, normalized.minTime, normalized.maxTime);
        charts.push(chart);
    });
}

/**
 * Main function to update charts based on selected view
 */
function updateChart(data) {
    // 1. Destroy existing charts
    charts.forEach(chart => chart.destroy());
    charts = [];
    chartsContainer.innerHTML = '';

    // 2. Group data
    const groupedData = groupDataByDay(data);

    // 3. Render appropriate view
    switch (currentRange) {
        case '1d':
            renderSingleDayView(groupedData);
            break;
        case '2d':
            renderTwoDayView(groupedData);
            break;
        case '7d':
            renderWeeklyView(groupedData);
            break;
        default:
            renderSingleDayView(groupedData);
    }
}

/**
 * Calculates and displays best times to visit
 */
function updateBestTimes(data) {
    // Group by hour and calculate averages
    const hourlyAverages = {};

    data.forEach(entry => {
        const hour = new Date(entry.timestamp).getHours();
        if (!hourlyAverages[hour]) {
            hourlyAverages[hour] = { lead: [], boulder: [] };
        }
        if (entry.lead != null) hourlyAverages[hour].lead.push(entry.lead);
        if (entry.boulder != null) hourlyAverages[hour].boulder.push(entry.boulder);
    });

    // Calculate averages and sort by occupancy
    const hourlyData = Object.entries(hourlyAverages)
        .map(([hour, values]) => ({
            hour: parseInt(hour),
            leadAvg: values.lead.length ? Math.round(values.lead.reduce((a, b) => a + b, 0) / values.lead.length) : null,
            boulderAvg: values.boulder.length ? Math.round(values.boulder.reduce((a, b) => a + b, 0) / values.boulder.length) : null,
        }))
        .filter(h => h.leadAvg !== null || h.boulderAvg !== null)
        .map(h => ({
            ...h,
            avgOccupancy: Math.round(((h.leadAvg ?? 0) + (h.boulderAvg ?? 0)) / 2)
        }))
        .sort((a, b) => a.avgOccupancy - b.avgOccupancy);

    // Display top times
    timesGrid.innerHTML = '';

    if (hourlyData.length === 0) {
        timesGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1;">Not enough data yet</p>';
        return;
    }

    // Show best 4 hours
    const bestHours = hourlyData.slice(0, 4);

    bestHours.forEach(({ hour, avgOccupancy }) => {
        const slot = document.createElement('div');
        slot.className = `time-slot ${avgOccupancy < 30 ? 'good' : avgOccupancy < 60 ? 'medium' : 'busy'}`;
        slot.innerHTML = `
      <div class="time">${String(hour).padStart(2, '0')}:00</div>
      <div class="avg">~${avgOccupancy}% avg</div>
    `;
        timesGrid.appendChild(slot);
    });
}

/**
 * Refreshes all data and updates the UI
 */
async function refresh() {
    refreshBtn.classList.add('loading');

    const result = await fetchData();
    updateCurrentStatus(result.history, result.status);
    updateChart(result.history); // Uses currentRange global
    updateBestTimes(result.history);

    setTimeout(() => {
        refreshBtn.classList.remove('loading');
    }, 500);
}

/**
 * Handles time filter button clicks
 */
function handleFilterClick(event) {
    const range = event.target.dataset.range;
    if (!range) return;

    currentRange = range;

    // Update active button state
    filterBtns.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    // Update chart with new range
    updateChart(historyData);
}

// Event Listeners
refreshBtn.addEventListener('click', refresh);
filterBtns.forEach(btn => btn.addEventListener('click', handleFilterClick));

// Initial load
refresh();

// Auto-refresh every 5 minutes
setInterval(refresh, 5 * 60 * 1000);
