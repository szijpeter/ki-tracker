/* global Chart */
/**
 * KI Tracker Dashboard
 * Fetches data, renders charts, and provides interactive features
 */

// Data and chart state
let historyData = [];
let charts = []; // Array to hold all active chart instances

let currentRange = '1d';
let visibleDatasets = { lead: true, boulder: true };

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
const leadCard = document.querySelector('.status-card.lead');
const boulderCard = document.querySelector('.status-card.boulder');

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
/**
 * Interpolates value between two points
 */
function interpolateValue(start, end, factor) {
    if (start === null || end === null) return 0;
    return start + (end - start) * factor;
}

/**
 * Gets interpolated Lead/Boulder values for a specific timestamp
 */
function getInterpolatedValues(chart, timeValue) {
    const time = new Date(timeValue).getTime();
    const timestamps = chart.data.labels.map(d => d.getTime());

    // Find enclosing timestamps
    let index = -1;
    for (let i = 0; i < timestamps.length - 1; i++) {
        if (time >= timestamps[i] && time <= timestamps[i + 1]) {
            index = i;
            break;
        }
    }

    // If not found (out of bounds), return null
    if (index === -1) return null;

    const tStart = timestamps[index];
    const tEnd = timestamps[index + 1];
    const range = tEnd - tStart;
    const factor = range === 0 ? 0 : (time - tStart) / range;

    const leadDataset = chart.data.datasets.find(d => d.label === 'Lead');
    const boulderDataset = chart.data.datasets.find(d => d.label === 'Boulder');

    if (!leadDataset || !boulderDataset) return null;

    return {
        lead: interpolateValue(leadDataset.data[index], leadDataset.data[index + 1], factor),
        boulder: interpolateValue(boulderDataset.data[index], boulderDataset.data[index + 1], factor)
    };
}

/**
 * Custom Plugin for Interpolation & Sync
 */
const interpolationPlugin = {
    id: 'interpolation',
    afterInit: (chart) => {
        chart.crosshair = { x: null, time: null, active: false };
    },
    afterEvent: (chart, args) => {
        const { inChartArea } = args;
        const { type, x } = args.event;

        // Ensure crosshair object exists
        if (!chart.crosshair) chart.crosshair = { x: null, time: null, active: false };

        // We only care about mouse events for interaction
        if ((type === 'mousemove' || type === 'mouseout') && inChartArea) {

            if (type === 'mousemove') {
                const time = chart.scales.x.getValueForPixel(x);
                chart.crosshair = { x, time, active: true };

                // Sync other charts
                syncCharts(chart, time);
            } else {
                chart.crosshair = { active: false };
                syncCharts(chart, null);
            }

            // Force redraw to update crosshair
            chart.draw();
        } else if (type === 'mouseout') {
            chart.crosshair = { active: false };
            syncCharts(chart, null);
            chart.draw();
        }
    },
    beforeDatasetsDraw: (chart) => {
        const { ctx, chartArea, scales } = chart;

        // Safety check
        if (!chart.crosshair) return;

        const { active, time } = chart.crosshair;

        if (active && time) {
            const x = scales.x.getPixelForValue(time);

            // Get interpolated values
            const values = getInterpolatedValues(chart, time);
            if (!values) return;

            const leadVisible = chart.isDatasetVisible(0);
            const boulderVisible = chart.isDatasetVisible(1);

            // Prepare text and measure widths for positioning
            const leadValueText = `${Math.round(values.lead)}%`;
            const boulderValueText = `${Math.round(values.boulder)}%`;
            const timeStr = new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            ctx.save();
            ctx.font = '600 11px Inter';
            const leadValueWidth = ctx.measureText(leadValueText).width;
            const boulderValueWidth = ctx.measureText(boulderValueText).width;

            ctx.font = '500 10px Inter';
            const timeWidth = ctx.measureText(timeStr).width;

            // Check if Lead and Boulder value labels would overlap (both at same x position)
            const valueLabelsOverlap = leadVisible && boulderVisible;

            // Helper function to clamp text position within chart bounds
            const clampTextX = (xPos, textWidth) => {
                const halfWidth = textWidth / 2;
                const minX = chartArea.left + halfWidth;
                const maxX = chartArea.right - halfWidth;
                return Math.max(minX, Math.min(maxX, xPos));
            };

            // 1. Draw Vertical Line (white dashed, like a crosshair)
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.stroke();

            // 2. Draw Lead value label at top
            if (leadVisible) {
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(129, 140, 248, 1)';
                ctx.font = '600 11px Inter';
                ctx.textAlign = 'center';
                const clampedX = clampTextX(x, leadValueWidth);
                ctx.fillText(leadValueText, clampedX, chartArea.top - 8);
            }

            // 3. Draw Boulder value label at top (pushed down if overlapping)
            if (boulderVisible) {
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(251, 191, 36, 1)';
                ctx.font = '600 11px Inter';
                ctx.textAlign = 'center';
                const topOffset = valueLabelsOverlap ? 14 : 0;
                const clampedX = clampTextX(x, boulderValueWidth);
                ctx.fillText(boulderValueText, clampedX, chartArea.top - 8 + topOffset);
            }

            // 4. Draw time label at bottom
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = '500 10px Inter';
            ctx.textAlign = 'center';
            const clampedTimeX = clampTextX(x, timeWidth);
            ctx.fillText(timeStr, clampedTimeX, chartArea.bottom + 14);

            ctx.restore();
        }
    }
};

/**
 * Synchronizes charts by Time of Day
 */
function syncCharts(sourceChart, time) {
    // Extract time of day from source
    let hours = 0, minutes = 0;
    if (time) {
        const d = new Date(time);
        hours = d.getHours();
        minutes = d.getMinutes();
    }

    charts.forEach(chart => {
        if (chart === sourceChart) return;
        if (chart.destroyed) return;

        // Ensure crosshair object exists before accessing it
        if (!chart.crosshair) {
            chart.crosshair = { x: null, time: null, active: false };
        }

        if (time === null) {
            chart.crosshair = { active: false };
        } else {
            // Map to this chart's date
            const minTime = chart.scales.x.min;
            const targetDate = new Date(minTime);
            targetDate.setHours(hours, minutes, 0, 0);
            const targetTime = targetDate.getTime();

            // Check if within bounds (gym hours)
            if (targetTime >= chart.scales.x.min && targetTime <= chart.scales.x.max) {
                chart.crosshair = {
                    active: true,
                    time: targetTime
                };
            } else {
                chart.crosshair = { active: false };
            }
        }
        chart.draw();
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
                    fill: true, // Fill area under line
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 0, // No points on hover
                    hidden: !visibleDatasets.lead
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
                    pointHoverRadius: 0,
                    hidden: !visibleDatasets.boulder
                }
            ]
        },
        options: {
            layout: {
                padding: {
                    top: 25
                }
            },
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false, // Disable default tooltip
                }
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
                        display: false, // Cleaner look without Y axis labels? User asked for "clean solution". 
                        // Actually let's keep them but maybe minimal. 
                        // User said "tooltip are a bit too cluttering". Y axis is fine.
                        color: '#6b6b80',
                        callback: value => value + '%'
                    }
                }
            }
        },
        plugins: [interpolationPlugin]
    });
}

/**
 * Calculates the peak Lead and Boulder values for a single day's data
 * @param {Array} dayData - Array of data entries for the day
 * @returns {Object} Object with maxLead, maxBoulder, maxLeadTime, maxBoulderTime
 */
function calculatePeaksForDay(dayData) {
    const validLeadEntries = dayData.filter(e => e.lead != null && e.lead > 0);
    const validBoulderEntries = dayData.filter(e => e.boulder != null && e.boulder > 0);

    let maxLead = null;
    let maxLeadTime = null;
    let maxBoulder = null;
    let maxBoulderTime = null;

    if (validLeadEntries.length > 0) {
        const maxEntry = validLeadEntries.reduce((max, e) => e.lead > max.lead ? e : max);
        maxLead = maxEntry.lead;
        maxLeadTime = new Date(maxEntry.timestamp);
    }

    if (validBoulderEntries.length > 0) {
        const maxEntry = validBoulderEntries.reduce((max, e) => e.boulder > max.boulder ? e : max);
        maxBoulder = maxEntry.boulder;
        maxBoulderTime = new Date(maxEntry.timestamp);
    }

    return { maxLead, maxBoulder, maxLeadTime, maxBoulderTime };
}

/**
 * Formats a date into a prominent day label (e.g., "Sunday, Jan 18")
 */
function formatDayLabel(date, showTodayPrefix = false) {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = daysOfWeek[date.getDay()];
    const dateFormatted = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    if (showTodayPrefix && isToday) {
        return `Today — ${dayName}, ${dateFormatted}`;
    }
    return `${dayName}, ${dateFormatted}`;
}

/**
 * Renders the Single Day View
 */
function renderSingleDayView(groupedData) {
    chartsContainer.className = 'charts-container'; // default layout

    // Get today's data
    const today = new Date();
    const todayKey = today.toISOString().split('T')[0];
    const rawTodayData = groupedData[todayKey] || [];

    const dayWrapper = document.createElement('div');
    dayWrapper.className = 'day-chart-wrapper';

    const dateLabel = document.createElement('div');
    dateLabel.className = 'date-label';
    dateLabel.textContent = formatDayLabel(today, true);
    dayWrapper.appendChild(dateLabel);

    const canvas = document.createElement('canvas');
    dayWrapper.appendChild(canvas);
    chartsContainer.appendChild(dayWrapper);

    const normalized = normalizeDayData(rawTodayData, todayKey);
    const peaks = calculatePeaksForDay(rawTodayData);
    const chart = createDayChartWithPeakHighlight(
        canvas.getContext('2d'),
        normalized,
        normalized.minTime,
        normalized.maxTime,
        peaks.maxLead,
        peaks.maxBoulder,
        peaks.maxLeadTime,
        peaks.maxBoulderTime
    );
    charts.push(chart);
}

/**
 * Renders the Two Day View
 */
function renderTwoDayView(groupedData) {
    chartsContainer.className = 'charts-container two-day';

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
        dateLabel.textContent = formatDayLabel(date, i === 0);
        dayWrapper.appendChild(dateLabel);

        const canvas = document.createElement('canvas');
        dayWrapper.appendChild(canvas);
        chartsContainer.appendChild(dayWrapper);

        const normalized = normalizeDayData(rawData, key);
        const peaks = calculatePeaksForDay(rawData);
        const chart = createDayChartWithPeakHighlight(
            canvas.getContext('2d'),
            normalized,
            normalized.minTime,
            normalized.maxTime,
            peaks.maxLead,
            peaks.maxBoulder,
            peaks.maxLeadTime,
            peaks.maxBoulderTime
        );
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

    daysToShow.forEach((date, i) => {
        const key = date.toISOString().split('T')[0];
        const rawData = groupedData[key] || [];

        const dayWrapper = document.createElement('div');
        dayWrapper.className = 'day-chart-wrapper';

        const dateLabel = document.createElement('div');
        dateLabel.className = 'date-label';
        dateLabel.textContent = formatDayLabel(date, i === 0);
        dayWrapper.appendChild(dateLabel);

        const canvas = document.createElement('canvas');
        dayWrapper.appendChild(canvas);
        chartsContainer.appendChild(dayWrapper);

        const normalized = normalizeDayData(rawData, key);
        const peaks = calculatePeaksForDay(rawData);
        const chart = createDayChartWithPeakHighlight(
            canvas.getContext('2d'),
            normalized,
            normalized.minTime,
            normalized.maxTime,
            peaks.maxLead,
            peaks.maxBoulder,
            peaks.maxLeadTime,
            peaks.maxBoulderTime
        );
        charts.push(chart);
    });
}

/**
 * Calculates the max Lead and Boulder values for each day
 * @param {Array} data - Raw history data
 * @param {number} daysToInclude - Number of days to include
 * @returns {Array} Array of { date, dateStr, maxLead, maxBoulder, maxLeadTime, maxBoulderTime, dayEntries }
 */
function calculateDailyMax(data, daysToInclude) {
    const today = new Date();
    const results = [];

    for (let i = 0; i < daysToInclude; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        // Filter entries for this day
        const dayEntries = data.filter(entry => {
            const entryDate = new Date(entry.timestamp).toISOString().split('T')[0];
            return entryDate === dateStr;
        });

        // Calculate max values (ignore null/0 values from closed hours)
        const validLeadEntries = dayEntries.filter(e => e.lead != null && e.lead > 0);
        const validBoulderEntries = dayEntries.filter(e => e.boulder != null && e.boulder > 0);

        let maxLead = null;
        let maxLeadTime = null;
        let maxBoulder = null;
        let maxBoulderTime = null;

        if (validLeadEntries.length > 0) {
            const maxEntry = validLeadEntries.reduce((max, e) => e.lead > max.lead ? e : max);
            maxLead = maxEntry.lead;
            maxLeadTime = new Date(maxEntry.timestamp);
        }

        if (validBoulderEntries.length > 0) {
            const maxEntry = validBoulderEntries.reduce((max, e) => e.boulder > max.boulder ? e : max);
            maxBoulder = maxEntry.boulder;
            maxBoulderTime = new Date(maxEntry.timestamp);
        }

        results.push({
            date,
            dateStr,
            maxLead,
            maxBoulder,
            maxLeadTime,
            maxBoulderTime,
            dayEntries
        });
    }

    // Reverse to show oldest to newest (left to right)
    return results.reverse();
}

/**
 * Creates a bar chart for max occupancy data with click-to-drill-down
 * @param {CanvasRenderingContext2D} canvasCtx - Canvas context
 * @param {Array} dailyMaxData - Array of daily max data
 * @param {string} title - Chart title
 * @param {Function} onDayClick - Callback when a day is clicked
 */
function createMaxChart(canvasCtx, dailyMaxData, title, onDayClick) {
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date().toISOString().split('T')[0];

    // Create multi-line labels: Day name on line 1, date on line 2, TODAY on line 3 (for today only)
    const labels = dailyMaxData.map(d => {
        const date = new Date(d.dateStr);
        const dayName = daysOfWeek[date.getDay()];
        const dayNum = date.getDate();
        const month = date.toLocaleDateString([], { month: 'short' });
        // For today: show day name, date, then TODAY on separate lines
        if (d.dateStr === today) {
            return [dayName, `${dayNum} ${month}`, 'TODAY'];
        }
        // For other days: day name on line 1, date on line 2
        return [dayName, `${dayNum} ${month}`];
    });

    const chart = new Chart(canvasCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Lead Max',
                    data: dailyMaxData.map(d => d.maxLead),
                    backgroundColor: 'rgba(129, 140, 248, 0.7)',
                    borderColor: '#818cf8',
                    borderWidth: 1,
                    borderRadius: 4,
                    hidden: !visibleDatasets.lead
                },
                {
                    label: 'Boulder Max',
                    data: dailyMaxData.map(d => d.maxBoulder),
                    backgroundColor: 'rgba(251, 191, 36, 0.7)',
                    borderColor: '#fbbf24',
                    borderWidth: 1,
                    borderRadius: 4,
                    hidden: !visibleDatasets.boulder
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (event, elements) => {
                if (elements.length > 0 && onDayClick) {
                    const index = elements[0].index;
                    const dayData = dailyMaxData[index];
                    onDayClick(dayData);
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        label: context => {
                            const index = context.dataIndex;
                            const dayData = dailyMaxData[index];
                            const value = context.parsed.y;

                            if (context.dataset.label === 'Lead Max' && dayData.maxLeadTime) {
                                const time = dayData.maxLeadTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                return `Lead Max: ${value}% (at ${time})`;
                            } else if (context.dataset.label === 'Boulder Max' && dayData.maxBoulderTime) {
                                const time = dayData.maxBoulderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                return `Boulder Max: ${value}% (at ${time})`;
                            }
                            return `${context.dataset.label}: ${value}%`;
                        },
                        footer: () => 'Click to see daily details'
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        autoSkip: false,
                        color: '#e0e0f0',
                        font: {
                            weight: 600,
                            size: 10
                        },
                        maxRotation: 0,
                        minRotation: 0
                    }
                },
                y: {
                    min: 0,
                    max: 100,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#6b6b80',
                        callback: value => value + '%'
                    }
                }
            }
        }
    });

    // Change cursor to pointer on hover over bars
    canvasCtx.canvas.style.cursor = 'pointer';

    return chart;
}

/**
 * Creates a day chart with peak value highlights (vertical red line at peak time)
 */
function createDayChartWithPeakHighlight(canvasCtx, dayData, minTime, maxTime, maxLead, maxBoulder, maxLeadTime, maxBoulderTime) {
    // Plugin to draw vertical peak lines
    const peakLinesPlugin = {
        id: 'peakLines',
        afterDatasetsDraw: (chart) => {
            const { ctx, chartArea, scales } = chart;

            ctx.save();

            // Calculate positions first to detect overlap
            const leadVisible = maxLead && maxLeadTime && chart.isDatasetVisible(0);
            const boulderVisible = maxBoulder && maxBoulderTime && chart.isDatasetVisible(1);

            const xLead = leadVisible ? scales.x.getPixelForValue(maxLeadTime.getTime()) : null;
            const xBoulder = boulderVisible ? scales.x.getPixelForValue(maxBoulderTime.getTime()) : null;

            // Measure text widths for accurate overlap detection
            ctx.font = '600 11px Inter';
            const leadValueText = `${maxLead}%`;
            const boulderValueText = `${maxBoulder}%`;
            const leadValueWidth = leadVisible ? ctx.measureText(leadValueText).width : 0;
            const boulderValueWidth = boulderVisible ? ctx.measureText(boulderValueText).width : 0;

            ctx.font = '500 10px Inter';
            const leadTimeText = leadVisible ? maxLeadTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const boulderTimeText = boulderVisible ? maxBoulderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const leadTimeWidth = leadVisible ? ctx.measureText(leadTimeText).width : 0;
            const boulderTimeWidth = boulderVisible ? ctx.measureText(boulderTimeText).width : 0;

            // Calculate if labels would actually overlap based on text width
            // Labels overlap if the distance between centers is less than half of each label's width combined
            const valueLabelsOverlap = xLead && xBoulder &&
                Math.abs(xBoulder - xLead) < (leadValueWidth / 2 + boulderValueWidth / 2 + 4);
            const timeLabelsOverlap = xLead && xBoulder &&
                Math.abs(xBoulder - xLead) < (leadTimeWidth / 2 + boulderTimeWidth / 2 + 4);

            // Helper function to clamp text position within chart bounds
            const clampTextX = (x, textWidth, align) => {
                const halfWidth = textWidth / 2;
                const minX = chartArea.left + halfWidth;
                const maxX = chartArea.right - halfWidth;
                return Math.max(minX, Math.min(maxX, x));
            };

            // Draw Lead peak line (vertical at time of peak)
            if (leadVisible && xLead >= chartArea.left && xLead <= chartArea.right) {
                ctx.setLineDash([6, 4]);
                ctx.lineWidth = 2;
                ctx.strokeStyle = 'rgba(129, 140, 248, 0.8)'; // Lead purple
                ctx.beginPath();
                ctx.moveTo(xLead, chartArea.top);
                ctx.lineTo(xLead, chartArea.bottom);
                ctx.stroke();

                // Value label at top - Lead always stays at normal position
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(129, 140, 248, 1)';
                ctx.font = '600 11px Inter';
                ctx.textAlign = 'center';
                const clampedValueX = clampTextX(xLead, leadValueWidth, 'center');
                ctx.fillText(leadValueText, clampedValueX, chartArea.top - 8);

                // Time label at bottom - Lead always stays at normal position
                ctx.fillStyle = 'rgba(129, 140, 248, 0.9)';
                ctx.font = '500 10px Inter';
                const clampedTimeX = clampTextX(xLead, leadTimeWidth, 'center');
                ctx.fillText(leadTimeText, clampedTimeX, chartArea.bottom + 14);
            }

            // Draw Boulder peak line (vertical at time of peak)
            if (boulderVisible && xBoulder >= chartArea.left && xBoulder <= chartArea.right) {
                ctx.setLineDash([6, 4]);
                ctx.lineWidth = 2;
                ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)'; // Boulder yellow
                ctx.beginPath();
                ctx.moveTo(xBoulder, chartArea.top);
                ctx.lineTo(xBoulder, chartArea.bottom);
                ctx.stroke();

                // Value label at top - Boulder gets pushed down if overlapping with Lead
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(251, 191, 36, 1)';
                ctx.font = '600 11px Inter';
                ctx.textAlign = 'center';
                // Push Boulder down when overlapping (>= handles the case when peaks are at same time)
                const topOffset = valueLabelsOverlap ? 14 : 0;
                const clampedValueX = clampTextX(xBoulder, boulderValueWidth, 'center');
                ctx.fillText(boulderValueText, clampedValueX, chartArea.top - 8 + topOffset);

                // Time label at bottom - Boulder gets pushed up (closer to chart) if overlapping
                ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
                ctx.font = '500 10px Inter';
                const bottomOffset = timeLabelsOverlap ? -12 : 0;
                const clampedTimeX = clampTextX(xBoulder, boulderTimeWidth, 'center');
                ctx.fillText(boulderTimeText, clampedTimeX, chartArea.bottom + 14 + bottomOffset);
            }

            ctx.restore();
        }
    };

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
                    pointHoverRadius: 0,
                    hidden: !visibleDatasets.lead
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
                    pointHoverRadius: 0,
                    hidden: !visibleDatasets.boulder
                }
            ]
        },
        options: {
            layout: {
                padding: {
                    top: 25
                }
            },
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                }
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
            }
        },
        plugins: [interpolationPlugin, peakLinesPlugin]
    });
}

/**
 * Renders a drill-down day view below the max chart
 */
function renderDrillDownDayView(dayData, container) {
    // Remove existing drill-down if any
    const existingDrillDown = container.querySelector('.drill-down-wrapper');
    if (existingDrillDown) {
        existingDrillDown.remove();
        // Also remove the chart from the charts array
        const index = charts.findIndex(c => c.canvas && c.canvas.parentElement?.classList.contains('drill-down-chart'));
        if (index !== -1) {
            charts[index].destroy();
            charts.splice(index, 1);
        }
    }

    // Create drill-down wrapper
    const drillDownWrapper = document.createElement('div');
    drillDownWrapper.className = 'drill-down-wrapper';
    drillDownWrapper.style.marginTop = '1rem';
    drillDownWrapper.style.paddingTop = '1rem';
    drillDownWrapper.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';

    const chartWrapper = document.createElement('div');
    chartWrapper.className = 'day-chart-wrapper drill-down-chart';

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const date = new Date(dayData.dateStr);
    const dayName = daysOfWeek[date.getDay()];
    const dateFormatted = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

    const titleLabel = document.createElement('div');
    titleLabel.className = 'date-label';
    titleLabel.textContent = `${dayName}, ${dateFormatted}`;
    chartWrapper.appendChild(titleLabel);

    const canvas = document.createElement('canvas');
    chartWrapper.appendChild(canvas);
    drillDownWrapper.appendChild(chartWrapper);
    container.appendChild(drillDownWrapper);

    // Normalize day data
    const normalized = normalizeDayData(dayData.dayEntries, dayData.dateStr);

    // Create chart with peak highlight
    const chart = createDayChartWithPeakHighlight(
        canvas.getContext('2d'),
        normalized,
        normalized.minTime,
        normalized.maxTime,
        dayData.maxLead,
        dayData.maxBoulder,
        dayData.maxLeadTime,
        dayData.maxBoulderTime
    );
    charts.push(chart);
}

/**
 * Renders the Max/Week View - Bar chart showing max occupancy for the last 7 days
 */
function renderMaxWeekView(data) {
    chartsContainer.className = 'charts-container';

    const dailyMaxData = calculateDailyMax(data, 7);

    const chartWrapper = document.createElement('div');
    chartWrapper.className = 'day-chart-wrapper';

    const titleLabel = document.createElement('div');
    titleLabel.className = 'date-label';
    titleLabel.textContent = 'Daily Peak Occupancy (Last 7 Days) — Click a bar for details';
    chartWrapper.appendChild(titleLabel);

    const canvas = document.createElement('canvas');
    chartWrapper.appendChild(canvas);
    chartsContainer.appendChild(chartWrapper);

    const onDayClick = (dayData) => {
        if (dayData.dayEntries && dayData.dayEntries.length > 0) {
            renderDrillDownDayView(dayData, chartsContainer);
        }
    };

    const chart = createMaxChart(canvas.getContext('2d'), dailyMaxData, 'Last 7 Days', onDayClick);
    charts.push(chart);
}

/**
 * Renders the Max/Month View - Bar chart showing max occupancy for the last 30 days
 */
function renderMaxMonthView(data) {
    chartsContainer.className = 'charts-container';

    const dailyMaxData = calculateDailyMax(data, 30);

    const chartWrapper = document.createElement('div');
    chartWrapper.className = 'day-chart-wrapper';

    const titleLabel = document.createElement('div');
    titleLabel.className = 'date-label';
    titleLabel.textContent = 'Daily Peak Occupancy (Last 30 Days) — Click a bar for details';
    chartWrapper.appendChild(titleLabel);

    const canvas = document.createElement('canvas');
    chartWrapper.appendChild(canvas);
    chartsContainer.appendChild(chartWrapper);

    const onDayClick = (dayData) => {
        if (dayData.dayEntries && dayData.dayEntries.length > 0) {
            renderDrillDownDayView(dayData, chartsContainer);
        }
    };

    const chart = createMaxChart(canvas.getContext('2d'), dailyMaxData, 'Last 30 Days', onDayClick);
    charts.push(chart);
}

/**
 * Main function to update charts based on selected view
 */
function updateChart(data) {
    try {
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
            case 'maxWeek':
                renderMaxWeekView(data);
                break;
            case 'maxMonth':
                renderMaxMonthView(data);
                break;
            default:
                renderSingleDayView(groupedData);
        }
    } catch (error) {
        showError('Render Error: ' + error.message);
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

if (leadCard) {
    leadCard.addEventListener('click', () => toggleDataset('lead'));
}
if (boulderCard) {
    boulderCard.addEventListener('click', () => toggleDataset('boulder'));
}

/**
 * Toggles the visibility of a dataset
 */
function toggleDataset(type) {
    visibleDatasets[type] = !visibleDatasets[type];

    // Update visual state of button
    const card = type === 'lead' ? leadCard : boulderCard;
    if (visibleDatasets[type]) {
        card.classList.remove('inactive');
    } else {
        card.classList.add('inactive');
    }

    // Update all charts
    charts.forEach(chart => {
        const index = type === 'lead' ? 0 : 1;
        chart.setDatasetVisibility(index, visibleDatasets[type]);
        chart.update('none'); // Optimize update
    });
}

// Initial load
try {
    if (typeof Chart === 'undefined') {
        throw new Error('Chart.js library not loaded');
    }
    refresh();
} catch (error) {
    showError('Startup Error: ' + error.message);
}

// Auto-refresh every 5 minutes
setInterval(() => {
    try {
        refresh();
    } catch (error) {
        console.error('Auto-refresh failed:', error);
    }
}, 5 * 60 * 1000);

/**
 * Displays an error message in the chart container
 */
function showError(message) {
    if (chartsContainer) {
        chartsContainer.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #ef4444;">
                <p>⚠️ Unable to load visualization</p>
                <p style="font-size: 0.8rem; margin-top: 0.5rem; opacity: 0.8;">${message}</p>
            </div>
        `;
    }
    console.error(message);
}
