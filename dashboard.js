/* global Chart */
/**
 * KI Tracker Dashboard
 * Fetches data, renders charts, and provides interactive features
 */

// Data and chart state
let historyData = [];
let chart = null;
let currentRange = 'today';

// DOM Elements
const leadValue = document.getElementById('lead-value');
const boulderValue = document.getElementById('boulder-value');
const leadProgress = document.getElementById('lead-progress');
const boulderProgress = document.getElementById('boulder-progress');
const lastUpdatedEl = document.getElementById('last-updated');
const refreshBtn = document.getElementById('refresh-btn');
const timesGrid = document.getElementById('times-grid');
const filterBtns = document.querySelectorAll('.filter-btn');

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
 * Filters data based on the selected time range
 */
function filterDataByRange(data, range) {
    const now = new Date();
    let cutoff;

    switch (range) {
        case 'today':
            cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case '24h':
            cutoff = new Date(now - 24 * 60 * 60 * 1000);
            break;
        case '7d':
            cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);
            break;
        default:
            cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    return data.filter(entry => new Date(entry.timestamp) >= cutoff);
}

/**
 * Creates or updates the occupancy chart
 */
function updateChart(data) {
    const filteredData = filterDataByRange(data, currentRange);

    const labels = filteredData.map(d => new Date(d.timestamp));
    const leadData = filteredData.map(d => d.lead);
    const boulderData = filteredData.map(d => d.boulder);

    const ctx = document.getElementById('occupancy-chart').getContext('2d');

    if (chart) {
        chart.data.labels = labels;
        chart.data.datasets[0].data = leadData;
        chart.data.datasets[1].data = boulderData;
        chart.update('none');
    } else {
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Lead',
                        data: leadData,
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
                        data: boulderData,
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
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#a1a1b5',
                            usePointStyle: true,
                            padding: 20,
                        }
                    },
                    tooltip: {
                        backgroundColor: '#24243a',
                        titleColor: '#ffffff',
                        bodyColor: '#a1a1b5',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: function (context) {
                                return `${context.dataset.label}: ${context.parsed.y}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: currentRange === '7d' ? 'day' : 'hour',
                            displayFormats: {
                                hour: 'HH:mm',
                                day: 'EEE'
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
                }
            }
        });
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
    updateChart(result.history);
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
