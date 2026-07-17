export function renderDailyForecast(days, containerId = 'dailyPanel') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('[dailyForecast] container not found:', containerId);
        return;
    }

    container.innerHTML = ''; // clear placeholder

    days.forEach(day => {
        const dayEl = document.createElement('div');
        dayEl.className = 'daily-forecast-item';

        dayEl.innerHTML = `
            <div class="daily-date">${new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}</div>
            <div class="daily-icon"><img src="${day.day.condition.icon}" alt=""></div>
            <div class="daily-bar">
                <span class="min">${Math.round(day.day.mintemp_c)}°</span>
                <div class="temp-bar">
                    <div class="fill" style="width:${(day.day.maxtemp_c - day.day.mintemp_c)}%;"></div>
                </div>
                <span class="max">${Math.round(day.day.maxtemp_c)}°</span>
            </div>
        `;

        container.appendChild(dayEl);
    });
}