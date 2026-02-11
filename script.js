// Data derived from Python analysis of JSON files
// Linear Regression for Generation: Gen = m * Fuel% + c
const TEMP_DATA = {
    6500: { shield: 143000, burnRate: 0.000276, m: -28557, c: 3332740 },
    7000: { shield: 149000, burnRate: 0.000276, m: -30205, c: 3520893 },
    7500: { shield: 155000, burnRate: 0.000276, m: -31647, c: 3685093 },
    8000: { shield: 161000, burnRate: 0.000276, m: -32925, c: 3829279 },
    8500: { shield: 265000, burnRate: 0.000291, m: -33143, c: 3874247 } // High shield jump
};

const REACTORS_COUNT = 5;
let useTicks = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initReactors();
    document.getElementById('unitToggle').addEventListener('change', (e) => {
        useTicks = e.target.checked;
        recalcAll();
    });
});

function initReactors() {
    const container = document.getElementById('reactorsContainer');
    
    for (let i = 1; i <= REACTORS_COUNT; i++) {
        const card = document.createElement('div');
        card.className = 'glass-panel reactor-card';
        card.innerHTML = `
            <div class="card-header">
                <span class="reactor-title">Reactor #${i}</span>
                <span class="status-indicator">ONLINE</span>
            </div>
            
            <div class="input-group">
                <label>Температура (°C)</label>
                <select class="r-temp" onchange="recalcAll()">
                    <option value="6500">6500</option>
                    <option value="7000">7000</option>
                    <option value="7500">7500</option>
                    <option value="8000" selected>8000</option>
                    <option value="8500">8500</option>
                </select>
            </div>

            <div class="control-row">
                <div class="input-group" style="flex:1">
                    <label>Топливо (%)</label>
                    <input type="number" class="r-fuel" value="100" min="0" max="100" step="0.1" oninput="recalcAll()">
                </div>
                <div class="input-group" style="flex:1">
                    <label>Время симуляции (мин)</label>
                    <input type="number" class="r-time" value="60" min="1" oninput="recalcAll()">
                </div>
            </div>

            <div class="result-grid">
                <div class="result-item">
                    <span>Выработка (RF/t)</span>
                    <span class="val-gen">0</span>
                </div>
                <div class="result-item">
                    <span>Расход щита (RF/t)</span>
                    <span class="val-shield">0</span>
                </div>
                <div class="result-item" style="grid-column: span 2">
                    <span>Чистая прибыль (RF/t)</span>
                    <span class="val-net" style="color: var(--energy-color)">0</span>
                </div>
                <div class="result-item" style="grid-column: span 2; border-top: 1px solid rgba(255,255,255,0.1); padding-top:10px">
                    <span>Всего за период</span>
                    <span class="val-total">0</span>
                </div>
                <div class="result-item">
                    <span>Осталось топлива</span>
                    <span class="val-fuel-left">0%</span>
                </div>
                <div class="result-item">
                    <span>Время до 0%</span>
                    <span class="val-time-left">0h 0m</span>
                </div>
            </div>
            
            <div class="progress-bar-container">
                <div class="progress-fill r-bar" style="width: 100%"></div>
            </div>
        `;
        container.appendChild(card);
    }
    recalcAll();
}

function recalcAll() {
    let globalTotalEnergy = 0;
    let globalNetRf = 0;
    let globalShieldRf = 0;

    const cards = document.querySelectorAll('.reactor-card');
    
    cards.forEach(card => {
        const temp = parseInt(card.querySelector('.r-temp').value);
        const startFuel = parseFloat(card.querySelector('.r-fuel').value);
        const simTimeMinutes = parseFloat(card.querySelector('.r-time').value);
        
        const data = TEMP_DATA[temp];
        
        // 1. Instant Stats (at Start Fuel)
        // Formula: Gen = m * Fuel + c (Remember m is negative)
        const currentGen = (data.m * startFuel) + data.c;
        const currentShield = data.shield;
        const currentNet = currentGen - currentShield;

        // 2. Simulation Logic
        const simTimeSeconds = simTimeMinutes * 60;
        const fuelConsumedPercent = data.burnRate * simTimeSeconds;
        let endFuel = startFuel - fuelConsumedPercent;
        
        let actualSimSeconds = simTimeSeconds;
        if (endFuel < 0) {
            endFuel = 0;
            // Calculate time until empty
            actualSimSeconds = startFuel / data.burnRate;
        }

        // Average generation over the period (Linear integration)
        // Start Gen at fuel_start, End Gen at fuel_end
        const genStart = (data.m * startFuel) + data.c;
        const genEnd = (data.m * endFuel) + data.c;
        const avgGen = (genStart + genEnd) / 2;
        
        const totalTicks = actualSimSeconds * 20;
        const totalGenerated = avgGen * totalTicks;
        const totalShieldCost = currentShield * totalTicks;
        const totalNet = totalGenerated - totalShieldCost; // Net over period

        // 3. Time until empty (from current state)
        const secondsToEmpty = startFuel / data.burnRate;

        // Update UI Card
        card.querySelector('.val-gen').textContent = formatNum(currentGen);
        card.querySelector('.val-shield').textContent = formatNum(currentShield);
        card.querySelector('.val-net').textContent = formatNum(currentNet);
        card.querySelector('.val-total').textContent = formatEnergy(totalNet); // Showing Net Total
        card.querySelector('.val-fuel-left').textContent = endFuel.toFixed(1) + '%';
        card.querySelector('.val-time-left').textContent = formatTime(secondsToEmpty);
        
        // Visual Bar
        card.querySelector('.r-bar').style.width = Math.max(0, endFuel) + '%';
        card.querySelector('.r-bar').style.backgroundColor = endFuel < 10 ? '#ff3b30' : '#ff9f0a';

        // Add to Globals
        globalTotalEnergy += totalNet;
        globalNetRf += currentNet;
        globalShieldRf += currentShield;
    });

    // Update Global Dashboard
    document.getElementById('totalEnergy').textContent = formatEnergy(globalTotalEnergy);
    document.getElementById('totalNet').textContent = formatNum(globalNetRf);
    document.getElementById('totalShield').textContent = formatNum(globalShieldRf);
}

// Helpers
function formatNum(num) {
    if (useTicks) return Math.round(num).toLocaleString() + " RF/t";
    // If seconds, multiply by 20
    return formatEnergy(num * 20) + "/s";
}

function formatEnergy(num) {
    if (num > 1e12) return (num / 1e12).toFixed(2) + " TRF";
    if (num > 1e9) return (num / 1e9).toFixed(2) + " BRF";
    if (num > 1e6) return (num / 1e6).toFixed(2) + " MRF";
    return Math.round(num).toLocaleString() + " RF";
}

function formatTime(seconds) {
    if (useTicks) return Math.round(seconds * 20).toLocaleString() + " t";
    
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}
