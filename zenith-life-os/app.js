/**
 * Zenith Life Engine vs 2.0 (PWA Upgrade)
 */

const STATE_KEY = 'zenith_v2_state';

class ZenithEngine {
    constructor() {
        this.state = this.loadState() || {
            user: { name: 'Traveler', energy: 100 },
            tasks: [], // Array of task objects
            history: [], // Array of completed task objects {id, title, completedAt}
            settings: { theme: 'void' }
        };

        this.currentFocus = null;
        this.calendarDate = new Date(); // Date being viewed

        this.init();
    }

    /**
     * Initialize the system
     */
    init() {
        this.registerServiceWorker();
        this.bindEvents();
        this.refreshUI();
        this.startHeartbeat();
        this.updateGreeting();

        // PWA Install Prompt Listener
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            const promptBtn = document.getElementById('installPrompt');
            if (promptBtn) {
                promptBtn.style.display = 'block';
                promptBtn.onclick = () => {
                    this.deferredPrompt.prompt();
                    this.deferredPrompt.userChoice.then((choiceResult) => {
                        if (choiceResult.outcome === 'accepted') {
                            promptBtn.style.display = 'none';
                        }
                        this.deferredPrompt = null;
                    });
                };
            }
        });
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js')
                .then(reg => console.log('Zenith SW registered', reg))
                .catch(err => console.log('Zenith SW failed', err));
        }
    }

    loadState() {
        const saved = localStorage.getItem(STATE_KEY);
        // Migration logic if needed, simplify for now
        return saved ? JSON.parse(saved) : null;
    }

    saveState() {
        localStorage.setItem(STATE_KEY, JSON.stringify(this.state));
        this.refreshUI();
    }

    startHeartbeat() {
        setInterval(() => {
            this.updateGreeting();
        }, 60000);
    }

    // --- LOGIC ---

    parseInput(text) {
        let task = {
            id: Date.now(),
            title: text,
            createdAt: new Date().toISOString(),
            due: null,
            priority: 1, // 1: Normal, 2: High, 3: Critical
            status: 'pending'
        };

        const lower = text.toLowerCase();
        const now = new Date();

        // Detect Time/Date keywords simple
        if (lower.includes('mañana')) {
            const tmr = new Date(now);
            tmr.setDate(tmr.getDate() + 1);
            tmr.setHours(9, 0, 0, 0);
            task.due = tmr.toISOString();
        } else if (lower.includes('hoy')) {
            const today = new Date(now);
            today.setHours(20, 0, 0, 0); // End of day
            task.due = today.toISOString();
        }

        // Detect Urgency
        if (lower.includes('urgente') || lower.includes('ahora') || lower.includes('ya')) {
            task.priority = 3;
            // Clean title slightly
            task.title = task.title.replace(/(urgente|ahora|ya)/gi, '').trim();
        }

        return task;
    }

    addTask(text) {
        if (!text || typeof text !== 'string') {
            text = document.getElementById('taskInput').value;
        }

        if (!text.trim()) return;

        const task = this.parseInput(text);

        // Add to state
        this.state.tasks.push(task);

        // If no current focus, set it
        if (!this.currentFocus) {
            this.currentFocus = task;
        } else {
            // If new task is urgent (> priority of current), usurp
            if (task.priority > this.currentFocus.priority) {
                this.currentFocus = task; // New King
            }
        }

        this.saveState();
        this.refreshUI();
        this.closeModal();
    }

    setFocus(task) {
        this.currentFocus = task;
        this.refreshUI();
    }

    completeCurrent() {
        if (!this.currentFocus) return;

        const completedTask = {
            ...this.currentFocus,
            status: 'completed',
            completedAt: new Date().toISOString()
        };

        // Add to history
        this.state.history.unshift(completedTask); // Add to top

        // Remove from active tasks
        this.state.tasks = this.state.tasks.filter(t => t.id !== this.currentFocus.id);

        // Pick next task
        this.promoteNextTask();

        this.saveState();

        // Celebration?
        // alert("¡Excelente trabajo!"); // Too annoying, let UI handle it
    }

    deferCurrent() {
        if (!this.currentFocus) return;

        // Move to end of queue, reduce priority if it was high so it doesn't immediately return
        const task = this.currentFocus;
        task.priority = 1;

        this.state.tasks = this.state.tasks.filter(t => t.id !== task.id);
        this.state.tasks.push(task);

        this.promoteNextTask();
        this.saveState();
    }

    promoteNextTask() {
        // Sort remaining tasks by priority then due date
        this.state.tasks.sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return b.id - a.id; // FIFO as fallback
        });

        if (this.state.tasks.length > 0) {
            this.currentFocus = this.state.tasks[0];
        } else {
            this.currentFocus = null;
        }
    }

    // --- UI ---

    refreshUI() {
        this.renderDashboard();
        this.renderCalendar();
        this.renderHistory();
        this.updateStats();
    }

    renderDashboard() {
        const focusEl = document.getElementById('currentTask');
        const orb = document.getElementById('focusOrb');
        const controls = document.getElementById('focusControls');
        const zenTask = document.getElementById('zenTaskDisplay');

        if (this.currentFocus) {
            focusEl.textContent = this.currentFocus.title;
            zenTask.textContent = this.currentFocus.title;
            orb.style.animation = 'pulse 2s infinite ease-in-out';
            orb.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.4), rgba(139, 92, 246, 0.4))';
            controls.style.display = 'flex';
        } else {
            focusEl.textContent = "Todo en orden. Disfruta.";
            zenTask.textContent = "Nada pendiente. Respira.";
            orb.style.animation = 'float 6s infinite ease-in-out';
            orb.style.background = 'rgba(255, 255, 255, 0.05)'; // Dimmed
            controls.style.display = 'none';
        }

        // Render Quick Stream
        const list = document.getElementById('quickStreamList');
        list.innerHTML = '';

        const upcoming = this.state.tasks.filter(t => t.id !== (this.currentFocus ? this.currentFocus.id : null)).slice(0, 3);

        if (upcoming.length === 0) {
            list.innerHTML = '<li class="empty-state">Nada pendiente.</li>';
        } else {
            upcoming.forEach(task => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${task.title}</span>`;
                // Add click to focus
                li.onclick = () => {
                    // Find full task object
                    const fullTask = this.state.tasks.find(t => t.id === task.id);
                    if (fullTask) this.setFocus(fullTask);
                };
                li.style.cursor = 'pointer';
                li.title = "Haz clic para enfocar";
                list.appendChild(li);
            });
        }
    }

    renderCalendar() {
        /*
          Builds a simple month grid.
        */
        const grid = document.getElementById('calendarGrid');
        const monthLabel = document.getElementById('currentMonthLabel');
        if (!grid) return;

        grid.innerHTML = '';

        const year = this.calendarDate.getFullYear();
        const month = this.calendarDate.getMonth(); // 0-11

        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        monthLabel.textContent = `${monthNames[month]} ${year}`;

        // Get first day of month
        const firstDay = new Date(year, month, 1).getDay(); // 0 (Sun) - 6 (Sat)
        // Adjust for Monday start (Spanish standard)
        const startOffset = firstDay === 0 ? 6 : firstDay - 1;

        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Empty slots
        for (let i = 0; i < startOffset; i++) {
            const div = document.createElement('div');
            div.className = 'calendar-day empty';
            grid.appendChild(div);
        }

        // Days
        for (let day = 1; day <= daysInMonth; day++) {
            const div = document.createElement('div');
            div.className = 'calendar-day glass';
            div.textContent = day;

            // Check for tasks completed or due on this day
            const dateStr = new Date(year, month, day).toDateString();

            // Find history items for this day
            const historyCount = this.state.history.filter(h => new Date(h.completedAt).toDateString() === dateStr).length;

            if (historyCount > 0) {
                const dot = document.createElement('div');
                dot.className = 'day-dot';
                div.appendChild(dot);
            }

            div.onclick = () => {
                // Highlight active
                document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('active'));
                div.classList.add('active');
                this.showDayDetails(day, month, year);
            };

            grid.appendChild(div);
        }
    }

    showDayDetails(day, month, year) {
        const list = document.getElementById('dayTaskList');
        list.innerHTML = '';

        const dateStr = new Date(year, month, day).toDateString();

        // Filter history
        const done = this.state.history.filter(h => new Date(h.completedAt).toDateString() === dateStr);

        if (done.length === 0) {
            list.innerHTML = '<li class="empty-state">Ningún logro registrado este día.</li>';
            return;
        }

        done.forEach(task => {
            const li = document.createElement('li');
            li.style.color = 'var(--text-secondary)';
            li.innerHTML = `<span>${task.title}</span> <span style="color:var(--success)">✓</span>`;
            list.appendChild(li);
        });
    }

    changeMonth(delta) {
        this.calendarDate.setMonth(this.calendarDate.getMonth() + delta);
        this.renderCalendar();
    }

    renderHistory() {
        const container = document.getElementById('historyList');
        if (!container) return;
        container.innerHTML = '';

        if (this.state.history.length === 0) {
            container.innerHTML = '<p class="empty-state">Tu viaje acaba de comenzar.</p>';
            return;
        }

        // Show last 20 items
        this.state.history.slice(0, 20).forEach(task => {
            const div = document.createElement('div');
            div.className = 'history-item';

            const date = new Date(task.completedAt);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            div.innerHTML = `
                <div class="history-date">${dateStr}</div>
                <div class="history-title">${task.title}</div>
            `;
            container.appendChild(div);
        });
    }

    updateStats() {
        // Calculate Life Percentage
        // Base 50% + (completed * 2)% - (pending * 5)% 
        let score = 50 + (this.state.history.length * 2) - (this.state.tasks.length * 5);
        if (score > 100) score = 100;
        if (score < 0) score = 0;

        document.getElementById('lifePercentage').textContent = `${score}%`;

        // Progress bar visual match
        const fill = document.querySelector('.fill');
        if (fill) fill.style.width = `${score}%`;

        // Completed today
        const todayStr = new Date().toDateString();
        const completedToday = this.state.history.filter(h => new Date(h.completedAt).toDateString() === todayStr).length;
        document.getElementById('statsCompletedToday').textContent = completedToday;
    }

    // --- NAVIGATION ---

    showModal() {
        const modal = document.querySelector('.modal-overlay');
        modal.classList.add('active');
        setTimeout(() => document.getElementById('taskInput').focus(), 100);
    }

    closeModal() {
        document.querySelector('.modal-overlay').classList.remove('active');
        document.getElementById('taskInput').value = '';
    }

    bindEvents() {
        // Navigation
        document.querySelectorAll('.nav-links li').forEach(item => {
            item.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
                item.classList.add('active'); // Use item not e.currentTarget usually safer in loop context
                const viewId = item.getAttribute('data-view');
                this.switchView(viewId);
            });
        });

        // Add
        document.getElementById('addEventBtn').addEventListener('click', () => this.showModal());

        // Input
        document.getElementById('taskInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addTask(e.target.value);
            }
        });
    }

    switchView(viewName) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById(viewName + 'View');
        if (target) {
            target.classList.add('active');
            if (viewName === 'calendar') this.renderCalendar();
            if (viewName === 'logbook') this.renderHistory();
        }
    }

    exitFocus() {
        this.switchView('dashboard');
        // Reset nav active state manually
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
        document.querySelector('[data-view="dashboard"]').classList.add('active');
    }

    updateGreeting() {
        const hour = new Date().getHours();
        const el = document.getElementById('greetingText');
        if (!el) return;
        if (hour < 12) el.textContent = 'Buenos días.';
        else if (hour < 20) el.textContent = 'Buenas tardes.';
        else el.textContent = 'Buenas noches.';
    }
}

// Global init
const app = new ZenithEngine();
window.app = app;
