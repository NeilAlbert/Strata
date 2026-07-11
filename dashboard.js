// ============================================================================
// STRATA - DASHBOARD WORKSPACE CONTROLLER (dashboard.js)
// ============================================================================

// Focus Strategy Tips Array
const focusTips = [
    {
        title: "The Pomodoro Technique",
        text: "Work with deep focus for 25 minutes, then reward yourself with a 5-minute break. After completing four cycles, take a longer 15–30 minute break to recharge."
    },
    {
        title: "Task Batching",
        text: "Group similar small tasks (like responding to emails, organizing folders, or quick review questions) into a single block. This reduces context switching and saves energy."
    },
    {
        title: "Eat the Frog",
        text: "Identify your most challenging or high-priority task for the day and complete it first. Once it's cleared, the rest of your day will feel significantly lighter and less stressful."
    },
    {
        title: "90-Minute Focus Blocks",
        text: "Align your work with your brain's natural ultradian rhythm. Focus intensely for 90 minutes, then take a 20-minute mental break completely away from screens."
    },
    {
        title: "The 2-Minute Rule",
        text: "If an incoming administrative or small task will take less than two minutes to complete, do it immediately. This keeps minor tasks from accumulating and cluttering your mind."
    },
    {
        title: "Minimize Context Switching",
        text: "It takes an average of 23 minutes to regain deep focus after a distraction. Silence notifications, close extra tabs, and commit to one single task at a time."
    },
    {
        title: "Time Boxing",
        text: "Allocate a fixed, strict time limit (a box) to a task. This constraints perfectionism, creates healthy urgency, and prevents tasks from dragging on indefinitely."
    }
];

// Active State Variables
let currentUser = null;
let tasks = [];
let streakCount = 0;
let lastCompletionDate = "";
let currentTipIndex = 0;
let tipInterval;

// Listen for Auth Session Ready from Auth Guard
document.addEventListener('authReady', async (e) => {
    currentUser = e.detail.profile;
    
    // Launch workspace components
    initTips();
    initForm();
    await checkStreakLiveness();
    await fetchAndRenderTasks();
});

// ============================================================================
// DATE & FORMAT HELPER UTILITIES
// ============================================================================

function getRelativeDateString(daysFromToday) {
    const today = new Date();
    today.setDate(today.getDate() + daysFromToday);
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getTodayDateString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getDaysDifference(dueDateStr) {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const due = new Date(dueDateStr + 'T00:00:00');
    due.setHours(0,0,0,0);
    
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function getDeadlineLabel(dueDateStr) {
    const diff = getDaysDifference(dueDateStr);
    if (diff < 0) {
        return `Overdue ${Math.abs(diff)}d`;
    } else if (diff === 0) {
        return 'Today';
    } else if (diff === 1) {
        return 'Tomorrow';
    } else {
        return `In ${diff}d`;
    }
}

function mapTaskFromDb(dbTask) {
    return {
        id: dbTask.id,
        title: dbTask.title,
        course: dbTask.subject,
        dueDate: dbTask.deadline,
        priority: dbTask.priority,
        completed: dbTask.done,
        focusToday: dbTask.focus_today
    };
}

// Rule-Based Time Allocation Advisor
function calculateSuggestedHours(priority, dueDate) {
    const diffDays = getDaysDifference(dueDate);
    
    if (diffDays < 0) {
        if (priority === 'high') return { hours: 4.0, reason: 'Task is overdue. Allocate intensive time immediately to catch up.' };
        if (priority === 'medium') return { hours: 2.0, reason: 'Task is overdue. Finish and submit today.' };
        return { hours: 1.0, reason: 'Overdue task. Clear it from your dashboard.' };
    } else if (diffDays === 0) {
        if (priority === 'high') return { hours: 4.5, reason: 'High priority task due today. Requires immediate, deep focus.' };
        if (priority === 'medium') return { hours: 2.5, reason: 'Medium priority task due today. Complete and submit.' };
        return { hours: 1.0, reason: 'Low priority task due today. Spend a quick block to wrap it up.' };
    } else if (diffDays === 1) {
        if (priority === 'high') return { hours: 4.0, reason: 'High priority task due tomorrow. Complete major parts today.' };
        if (priority === 'medium') return { hours: 2.5, reason: 'Medium priority task due tomorrow. Solid focus block recommended.' };
        return { hours: 1.0, reason: 'Low priority task due tomorrow. Dedicate a short block to wrap up.' };
    } else if (diffDays === 2) {
        if (priority === 'high') return { hours: 3.0, reason: 'High priority task due in 2 days. Maintain consistent progress.' };
        if (priority === 'medium') return { hours: 1.75, reason: 'Medium priority task due in 2 days. Good slot for deep study.' };
        return { hours: 0.75, reason: 'Low priority task due in 2 days. Quick check-in.' };
    } else if (diffDays <= 5) {
        if (priority === 'high') return { hours: 2.0, reason: 'High priority task due this week. Work ahead to avoid compression.' };
        if (priority === 'medium') return { hours: 1.25, reason: 'Medium priority task due in a few days. Break it down into parts.' };
        return { hours: 0.5, reason: 'Low priority task due in a few days. Quick revision.' };
    } else if (diffDays <= 7) {
        if (priority === 'high') return { hours: 1.5, reason: 'High priority task due this week. Slow and steady progress.' };
        if (priority === 'medium') return { hours: 1.0, reason: 'Medium priority task due this week. Review and start drafting.' };
        return { hours: 0.5, reason: 'Low priority task due this week. Keep on your radar.' };
    } else {
        if (priority === 'high') return { hours: 1.0, reason: 'High priority milestone next week. Start early for a head start.' };
        if (priority === 'medium') return { hours: 0.5, reason: 'Medium priority task due next week. Outline thoughts.' };
        return { hours: 0.25, reason: 'Low priority task due next week. File away into long-term plan.' };
    }
}

// Toast Notifications helper
function showToast(message) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-sky)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>${escapeHTML(message)}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
        if (container.children.length === 0) {
            container.remove();
        }
    }, 3000);
}

// Particle Burst Confetti Effect (Satisfying Task Complete check)
function triggerConfetti(x, y, color) {
    const container = document.body;
    for (let i = 0; i < 16; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.backgroundColor = color;
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        
        const angle = Math.random() * Math.PI * 2;
        const velocity = 3 + Math.random() * 5;
        const xVel = Math.cos(angle) * velocity;
        const yVel = Math.sin(angle) * velocity;
        
        container.appendChild(particle);
        
        let posX = x;
        let posY = y;
        let opacity = 1;
        
        const animation = setInterval(() => {
            posX += xVel;
            posY += yVel + 0.15; // gravity pull
            opacity -= 0.03;
            
            particle.style.left = `${posX}px`;
            particle.style.top = `${posY}px`;
            particle.style.opacity = opacity;
            
            if (opacity <= 0) {
                clearInterval(animation);
                particle.remove();
            }
        }, 16);
    }
}

// ============================================================================
// STATE SYNC & FETCH
// ============================================================================

async function fetchAndRenderTasks() {
    if (!currentUser || !supabase) return;
    
    const { data: dbTasks, error } = await supabase
        .from('tasks')
        .select('*')
        .order('deadline', { ascending: true });
        
    if (error) {
        console.error("Error loading tasks:", error);
        showToast("Error loading tasks: " + error.message);
        return;
    }
    
    tasks = dbTasks.map(mapTaskFromDb);
    
    renderTodayStrata();
    renderScheduleLists();
    renderCompletedTasks();
    
    const todayPlan = getTodayPlanTasks();
    updateProgress(todayPlan);
}

function getTodayPlanTasks() {
    return tasks.filter(task => {
        const diff = getDaysDifference(task.dueDate);
        const isTodayOrOverdue = diff <= 0;
        return isTodayOrOverdue || task.focusToday;
    });
}

// ============================================================================
// CRUD TASK OPERATIONS (SUPABASE CLIENT BACKED)
// ============================================================================

async function completeTask(id) {
    if (!currentUser || !supabase) return;
    
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const { error } = await supabase
        .from('tasks')
        .update({ done: true })
        .eq('id', id);
        
    if (error) {
        showToast("Error completing task: " + error.message);
        return;
    }
    
    await updateStreakOnCompletion();
    await fetchAndRenderTasks();
    showToast(`Completed: "${task.title}"`);
}

async function undoCompleteTask(id) {
    if (!currentUser || !supabase) return;
    
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const { error } = await supabase
        .from('tasks')
        .update({ done: false })
        .eq('id', id);
        
    if (error) {
        showToast("Error restoring task: " + error.message);
        return;
    }
    
    await fetchAndRenderTasks();
    showToast(`Undone: "${task.title}"`);
}

async function deleteTask(id) {
    if (!currentUser || !supabase) return;
    
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id);
        
    if (error) {
        showToast("Error deleting task: " + error.message);
        return;
    }
    
    await fetchAndRenderTasks();
    showToast(`Deleted: "${task.title}"`);
}

async function toggleFocusToday(id) {
    if (!currentUser || !supabase) return;
    
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    
    const nextFocusState = !task.focusToday;

    const { error } = await supabase
        .from('tasks')
        .update({ focus_today: nextFocusState })
        .eq('id', id);
        
    if (error) {
        showToast("Error updating focus: " + error.message);
        return;
    }
    
    await fetchAndRenderTasks();
    showToast(nextFocusState ? `Added "${task.title}" to Today's Focus.` : `Removed "${task.title}" from Today's Focus.`);
}

// ============================================================================
// BALANCED STREAK SYSTEM
// ============================================================================

async function checkStreakLiveness() {
    if (!currentUser || !supabase) return;
    
    const today = getTodayDateString();
    const yesterday = getRelativeDateString(-1);
    
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('streak_count, last_completion_date')
        .eq('id', currentUser.id)
        .single();
        
    if (error) {
        console.error("Error checking streak liveness:", error);
        showToast("Error updating streak: " + error.message);
        return;
    }
    
    if (!profile) return;
    
    let currentStreak = profile.streak_count || 0;
    let lastDate = profile.last_completion_date;
    
    if (lastDate && lastDate !== today && lastDate !== yesterday) {
        currentStreak = 0;
        const { error: resetError } = await supabase
            .from('profiles')
            .update({ streak_count: 0 })
            .eq('id', currentUser.id);
            
        if (resetError) {
            console.error("Error resetting streak count:", resetError);
            showToast("Error resetting streak: " + resetError.message);
        }
    }
    
    streakCount = currentStreak;
    lastCompletionDate = lastDate;
    updateStreakVisuals(streakCount);
}

async function updateStreakOnCompletion() {
    if (!currentUser || !supabase) return;
    
    const today = getTodayDateString();
    const yesterday = getRelativeDateString(-1);
    
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('streak_count, last_completion_date')
        .eq('id', currentUser.id)
        .single();
        
    if (error) {
        console.error("Error fetching profile for streak increment:", error);
        showToast("Error updating streak: " + error.message);
        return;
    }
    
    if (!profile) return;
    
    let newStreak = profile.streak_count || 0;
    let lastDate = profile.last_completion_date;
    
    if (lastDate === today) return;
    
    if (lastDate === yesterday) {
        newStreak++;
    } else {
        newStreak = 1;
    }
    
    lastDate = today;
    
    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            streak_count: newStreak,
            last_completion_date: lastDate
        })
        .eq('id', currentUser.id);
        
    if (updateError) {
        console.error("Error saving updated streak:", updateError);
        showToast("Error saving streak: " + updateError.message);
    } else {
        streakCount = newStreak;
        lastCompletionDate = lastDate;
        updateStreakVisuals(streakCount);
    }
}

function updateStreakVisuals(streak) {
    const container = document.getElementById('cairn-container');
    if (!container) return;
    
    const fill1 = streak >= 1 ? 'var(--color-pale)' : 'none';
    const opacity1 = streak >= 1 ? '1' : '0.15';
    const fill2 = streak >= 2 ? 'var(--color-steel)' : 'none';
    const opacity2 = streak >= 2 ? '1' : '0.15';
    const fill3 = streak >= 3 ? 'var(--color-sky)' : 'none';
    const opacity3 = streak >= 3 ? '1' : '0.15';
    const fill4 = streak >= 4 ? 'var(--color-ink)' : 'none';
    const opacity4 = streak >= 4 ? '1' : '0.15';
    
    const glowClass = streak >= 4 ? 'cairn-glow' : '';
    const starSvg = streak >= 4 ? `
        <path d="M12 2.5l.8 1.2 1.2.8-1.2.8-.8 1.2-.8-1.2-1.2-.8 1.2-.8z" fill="var(--color-sky)" style="transform-origin: 12px 4px; animation: pulseSlow 2s infinite ease-in-out;" />
    ` : '';

    container.innerHTML = `
        <svg class="cairn-icon ${glowClass}" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            ${starSvg}
            <path d="M4 19c0-1 3.5-1.8 8-1.8s8 .8 8 1.8c0 1-3.5 1.8-8 1.8s-8-.8-8-1.8z" fill="${fill1}" stroke-opacity="${opacity1}" fill-opacity="${opacity1}" />
            <path d="M6 14.5c0-.8 2.7-1.5 6-1.5s6 .7 6 1.5c0 .8-2.7 1.5-6 1.5s-6-.7-6-1.5z" fill="${fill2}" stroke-opacity="${opacity2}" fill-opacity="${opacity2}" />
            <path d="M7.5 10.5c0-.7 2-1.2 4.5-1.2s4.5.5 4.5 1.2c0 .7-2 1.2-4.5 1.2s-4.5-.5-4.5-1.2z" fill="${fill3}" stroke-opacity="${opacity3}" fill-opacity="${opacity3}" />
            <path d="M9.5 7c0-.5 1.1-.8 2.5-.8s2.5.3 2.5.8c0 .5-1.1.8-2.5.8s-2.5-.3-2.5-.8z" fill="${fill4}" stroke-opacity="${opacity4}" fill-opacity="${opacity4}" />
        </svg>
    `;
    
    document.getElementById('streak-value').textContent = `${streak} Day Streak`;
    
    let label = 'Complete tasks to start a streak';
    if (streak === 1) label = 'Streak started. Keep it up tomorrow!';
    else if (streak > 1 && streak < 4) label = 'Building balance. Consistent progress!';
    else if (streak >= 4) label = 'Strata aligned. Complete zen focus!';
    
    document.getElementById('streak-label-text').textContent = label;
}

// ============================================================================
// COMPONENT RENDER ENGINES
// ============================================================================

function updateProgress(todayTasks) {
    const total = todayTasks.length;
    const completed = todayTasks.filter(t => t.completed).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    document.getElementById('progress-percent-val').textContent = `${percentage}%`;
    
    const circle = document.getElementById('progress-circle');
    if (circle) {
        const radius = circle.r.baseVal.value;
        const circumference = 2 * Math.PI * radius;
        
        circle.style.strokeDasharray = `${circumference} ${circumference}`;
        const offset = circumference - (percentage / 100) * circumference;
        circle.style.strokeDashoffset = offset;
    }
    
    const statsText = document.getElementById('stats-summary-text');
    if (total === 0) {
        statsText.textContent = 'No tasks scheduled today.';
    } else {
        statsText.textContent = `${completed} of ${total} tasks completed today.`;
    }
}

function renderTodayStrata() {
    const strataContainer = document.getElementById('strata-container');
    const ruler = document.getElementById('strata-ruler');
    const totalHoursVal = document.getElementById('total-hours-value');
    
    if (!strataContainer || !ruler) return;
    
    const todayTasks = tasks.filter(task => {
        const diff = getDaysDifference(task.dueDate);
        const isTodayOrOverdue = diff <= 0;
        return !task.completed && (isTodayOrOverdue || task.focusToday);
    });
    
    const priorityWeight = { high: 3, medium: 2, low: 1 };
    todayTasks.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);
    
    let totalHours = 0;
    todayTasks.forEach(task => {
        const suggestion = calculateSuggestedHours(task.priority, task.dueDate);
        task.suggestedHours = suggestion.hours;
        task.suggestionReason = suggestion.reason;
        totalHours += suggestion.hours;
    });
    
    totalHoursVal.textContent = totalHours.toFixed(1);
    
    if (todayTasks.length === 0) {
        strataContainer.innerHTML = `
            <div class="strata-empty-state" id="strata-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
                    <line x1="16" y1="8" x2="2" y2="22" />
                    <line x1="17.5" y1="15" x2="9" y2="15" />
                </svg>
                <h3>Your Strata is Clear</h3>
                <p>No tasks scheduled for today. Add a new task, or toggle "Focus Today" on upcoming tasks below to fill your day.</p>
            </div>
        `;
        ruler.innerHTML = '';
        updateAdvisorBox(todayTasks, totalHours);
        return;
    }
    
    strataContainer.innerHTML = '';
    
    todayTasks.forEach(task => {
        const pct = (task.suggestedHours / totalHours) * 100;
        
        const layer = document.createElement('div');
        layer.className = 'strata-layer';
        layer.setAttribute('data-priority', task.priority);
        layer.style.height = `${pct}%`;
        
        let priorityColor = 'var(--color-pale)';
        if (task.priority === 'medium') priorityColor = 'var(--color-steel)';
        if (task.priority === 'high') priorityColor = 'var(--color-sky)';
        
        layer.innerHTML = `
            <div class="strata-info">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="strata-course-badge">${escapeHTML(task.course)}</span>
                    <span class="strata-title" title="${escapeHTML(task.title)}">${escapeHTML(task.title)}</span>
                </div>
                <div class="strata-meta">
                    <span class="strata-suggested-time" title="${escapeHTML(task.suggestionReason)}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        ${task.suggestedHours.toFixed(1)} hrs
                    </span>
                    <span class="strata-deadline-indicator">${getDeadlineLabel(task.dueDate)}</span>
                </div>
            </div>
            <div class="strata-actions-wrapper">
                <div class="strata-actions">
                    <button class="strata-delete-btn" data-id="${task.id}" title="Delete task">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>
                <label class="complete-checkbox-container" title="Mark as complete">
                    <input type="checkbox" data-id="${task.id}" class="strata-check">
                    <span class="checkmark"></span>
                </label>
            </div>
        `;
        
        strataContainer.appendChild(layer);
        
        const checkbox = layer.querySelector('.strata-check');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                const rect = checkbox.getBoundingClientRect();
                const x = rect.left + rect.width / 2 + window.scrollX;
                const y = rect.top + rect.height / 2 + window.scrollY;
                
                triggerConfetti(x, y, priorityColor);
                
                setTimeout(() => {
                    completeTask(task.id);
                }, 300);
            }
        });
        
        layer.querySelector('.strata-delete-btn').addEventListener('click', () => {
            deleteTask(task.id);
        });
    });
    
    // Draw Ruler
    ruler.innerHTML = '';
    const steps = Math.floor(totalHours);
    for (let h = 0; h <= steps; h++) {
        const tick = document.createElement('div');
        tick.className = 'ruler-tick';
        tick.style.top = `${(h / totalHours) * 100}%`;
        tick.innerHTML = `
            <span class="tick-label">${h}h</span>
            <span class="tick-line"></span>
        `;
        ruler.appendChild(tick);
    }
    
    if (totalHours % 1 !== 0) {
        const tick = document.createElement('div');
        tick.className = 'ruler-tick final-tick';
        tick.style.top = '100%';
        tick.innerHTML = `
            <span class="tick-label">${totalHours.toFixed(1)}h</span>
            <span class="tick-line"></span>
        `;
        ruler.appendChild(tick);
    }
    
    updateAdvisorBox(todayTasks, totalHours);
}

function updateAdvisorBox(todayTasks, totalHours) {
    const textEl = document.getElementById('advisor-text');
    if (!textEl) return;
    
    if (todayTasks.length === 0) {
        textEl.textContent = "Your strata is clear. This is a perfect opportunity to rest, review notes, or pull in upcoming tasks from 'This Week' to get ahead.";
        return;
    }
    
    const overdue = todayTasks.filter(t => getDaysDifference(t.dueDate) < 0);
    const highPriority = todayTasks.filter(t => t.priority === 'high');
    const dueToday = todayTasks.filter(t => getDaysDifference(t.dueDate) === 0);
    
    let recommendation = "";
    
    if (totalHours > 8) {
        recommendation += `⚠️ **High Workload Warning**: Your total suggested time today is **${totalHours.toFixed(1)} hours**, which exceeds a healthy 8-hour daily limit. We strongly advise turning off "Focus Today" for future tasks to avoid burnout. `;
    } else if (totalHours > 5) {
        recommendation += `📅 **Focused Work Day**: You have **${totalHours.toFixed(1)} hours** of focus planned. Ensure you take 10-minute breaks between blocks. `;
    } else {
        recommendation += `🌱 **Balanced Workload**: A manageable **${totalHours.toFixed(1)} hours** is planned. `;
    }
    
    if (overdue.length > 0) {
        recommendation += `First priority: tackle overdue task **${overdue[0].course} — ${overdue[0].title}** to stop accumulating academic debt. `;
    } else if (dueToday.length > 0) {
        const highestDue = dueToday.sort((a,b) => (b.priority === 'high' ? 1 : 0) - (a.priority === 'high' ? 1 : 0))[0];
        recommendation += `Start with **${highestDue.course} — ${highestDue.title}**, which is due today. `;
    } else if (highPriority.length > 0) {
        recommendation += `Allocate your peak focus hours to high-priority **${highPriority[0].course} — ${highPriority[0].title}** for maximum returns today. `;
    } else {
        recommendation += "Begin with your longest task while your focus is fresh, and wrap up shorter tasks at the end.";
    }
    
    textEl.innerHTML = recommendation.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function renderScheduleLists() {
    const weekList = document.getElementById('week-task-list');
    const upcomingList = document.getElementById('upcoming-task-list');
    const weekCountBadge = document.getElementById('week-count-badge');
    const upcomingCountBadge = document.getElementById('upcoming-count-badge');
    
    if (!weekList || !upcomingList) return;
    
    const weekTasks = [];
    const upcomingTasks = [];
    
    tasks.forEach(task => {
        if (task.completed) return;
        
        const diff = getDaysDifference(task.dueDate);
        if (diff <= 0) return;
        
        const suggestion = calculateSuggestedHours(task.priority, task.dueDate);
        task.suggestedHours = suggestion.hours;
        
        if (diff >= 1 && diff <= 7) {
            weekTasks.push(task);
        } else if (diff > 7) {
            upcomingTasks.push(task);
        }
    });
    
    const priorityWeight = { high: 3, medium: 2, low: 1 };
    const sortFunc = (a, b) => {
        const diffA = getDaysDifference(a.dueDate);
        const diffB = getDaysDifference(b.dueDate);
        if (diffA !== diffB) return diffA - diffB;
        return priorityWeight[b.priority] - priorityWeight[a.priority];
    };
    
    weekTasks.sort(sortFunc);
    upcomingTasks.sort(sortFunc);
    
    weekCountBadge.textContent = weekTasks.length;
    upcomingCountBadge.textContent = upcomingTasks.length;
    
    if (weekTasks.length === 0) {
        weekList.innerHTML = `<div class="list-empty-state">No tasks due this week.</div>`;
    } else {
        weekList.innerHTML = '';
        weekTasks.forEach(task => {
            weekList.appendChild(createTaskCard(task));
        });
    }
    
    if (upcomingTasks.length === 0) {
        upcomingList.innerHTML = `<div class="list-empty-state">No long-term tasks planned.</div>`;
    } else {
        upcomingList.innerHTML = '';
        upcomingTasks.forEach(task => {
            upcomingList.appendChild(createTaskCard(task));
        });
    }
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = `task-card ${task.focusToday ? 'focus-active' : ''}`;
    card.setAttribute('data-priority', task.priority);
    
    const deadlineLabel = getDeadlineLabel(task.dueDate);
    const pinIconSvg = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="3.5" fill="${task.focusToday ? 'currentColor' : 'none'}"/>
        </svg>
    `;
    
    card.innerHTML = `
        <div class="task-card-info">
            <div class="task-card-header">
                <span class="task-card-course">${escapeHTML(task.course)}</span>
                <span class="task-card-title" title="${escapeHTML(task.title)}">${escapeHTML(task.title)}</span>
            </div>
            <div class="task-card-meta">
                <span class="task-card-suggested" title="Suggested focus time per day">${task.suggestedHours.toFixed(1)} hrs/day</span>
                <span class="task-card-deadline">${deadlineLabel}</span>
            </div>
        </div>
        <div class="task-card-actions">
            <button class="focus-btn" title="${task.focusToday ? 'Remove from Today\'s Focus Strata' : 'Add to Today\'s Focus Strata'}">
                ${pinIconSvg}
            </button>
            <button class="quick-check-btn" title="Complete task">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
        </div>
    `;
    
    card.querySelector('.focus-btn').addEventListener('click', () => {
        toggleFocusToday(task.id);
    });
    
    card.querySelector('.quick-check-btn').addEventListener('click', () => {
        const btn = card.querySelector('.quick-check-btn');
        const rect = btn.getBoundingClientRect();
        const x = rect.left + rect.width / 2 + window.scrollX;
        const y = rect.top + rect.height / 2 + window.scrollY;
        
        let priorityColor = 'var(--color-pale)';
        if (task.priority === 'medium') priorityColor = 'var(--color-steel)';
        if (task.priority === 'high') priorityColor = 'var(--color-sky)';
        
        triggerConfetti(x, y, priorityColor);
        
        setTimeout(() => {
            completeTask(task.id);
        }, 300);
    });
    
    return card;
}

function renderCompletedTasks() {
    const listContainer = document.querySelector('.schedule-lists-container');
    if (!listContainer) return;
    
    let completedSection = document.getElementById('completed-section');
    if (!completedSection) {
        completedSection = document.createElement('div');
        completedSection.id = 'completed-section';
        completedSection.className = 'list-section completed-tasks-section';
        listContainer.appendChild(completedSection);
    }
    
    const completedTasks = tasks.filter(t => t.completed);
    
    if (completedTasks.length === 0) {
        completedSection.style.display = 'none';
        return;
    }
    
    completedSection.style.display = 'flex';
    completedSection.innerHTML = `
        <h3 class="list-section-title">
            <span>Completed</span>
            <span class="list-count-badge" style="background-color: var(--color-ink); color: var(--color-mist);">${completedTasks.length}</span>
        </h3>
        <div class="task-list completed-tasks-list">
            <!-- Render completed rows -->
        </div>
    `;
    
    const completedList = completedSection.querySelector('.completed-tasks-list');
    
    completedTasks.forEach(task => {
        const card = document.createElement('div');
        card.className = 'task-card task-card-completed';
        card.setAttribute('data-priority', task.priority);
        
        card.innerHTML = `
            <div class="task-card-info">
                <div class="task-card-header">
                    <span class="task-card-course" style="color: var(--color-steel); font-size: 0.65rem;">${escapeHTML(task.course)}</span>
                    <span class="task-card-title">${escapeHTML(task.title)}</span>
                </div>
                <div class="task-card-meta">
                    <span>Cleared today</span>
                </div>
            </div>
            <button class="undo-btn" title="Undo complete" style="background:none; border:none; color: var(--color-steel); cursor:pointer; padding:6px; display:flex; align-items:center; justify-content:center; transition: color 0.2s;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>
            </button>
        `;
        
        const undoBtn = card.querySelector('.undo-btn');
        undoBtn.addEventListener('mouseenter', () => undoBtn.style.color = 'var(--color-sky)');
        undoBtn.addEventListener('mouseleave', () => undoBtn.style.color = 'var(--color-steel)');
        undoBtn.addEventListener('click', () => {
            undoCompleteTask(task.id);
        });
        
        completedList.appendChild(card);
    });
}

// ============================================================================
// TIPS SLIDER
// ============================================================================

function initTips() {
    const prevBtn = document.getElementById('prev-tip-btn');
    const nextBtn = document.getElementById('next-tip-btn');
    if (!prevBtn || !nextBtn) return;
    
    showTip(0);
    startTipRotation();
    
    prevBtn.addEventListener('click', () => {
        clearInterval(tipInterval);
        currentTipIndex = (currentTipIndex - 1 + focusTips.length) % focusTips.length;
        showTip(currentTipIndex);
        startTipRotation();
    });
    
    nextBtn.addEventListener('click', () => {
        clearInterval(tipInterval);
        currentTipIndex = (currentTipIndex + 1) % focusTips.length;
        showTip(currentTipIndex);
        startTipRotation();
    });
}

function startTipRotation() {
    tipInterval = setInterval(() => {
        currentTipIndex = (currentTipIndex + 1) % focusTips.length;
        showTip(currentTipIndex);
    }, 15000);
}

function showTip(index) {
    const tipContainer = document.getElementById('tip-container');
    const titleEl = document.getElementById('tip-title');
    const textEl = document.getElementById('tip-text');
    
    if (!tipContainer || !titleEl || !textEl) return;
    
    tipContainer.style.opacity = '0';
    tipContainer.style.transform = 'translateY(5px)';
    
    setTimeout(() => {
        const tip = focusTips[index];
        titleEl.textContent = tip.title;
        textEl.textContent = tip.text;
        
        tipContainer.style.opacity = '1';
        tipContainer.style.transform = 'translateY(0)';
    }, 200);
}

// ============================================================================
// FORM BINDER
// ============================================================================

function initForm() {
    const form = document.getElementById('add-task-form');
    if (!form) return;
    
    const deadlineInput = document.getElementById('task-deadline');
    const todayStr = getTodayDateString();
    deadlineInput.value = todayStr;
    deadlineInput.min = todayStr;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = document.getElementById('task-title').value.trim();
        const course = document.getElementById('task-course').value.trim();
        const deadline = document.getElementById('task-deadline').value;
        const priority = form.querySelector('input[name="priority"]:checked').value;
        
        if (!title || !course || !deadline) return;
        
        const diff = getDaysDifference(deadline);
        const focusToday = diff <= 0;
        
        const { error } = await supabase
            .from('tasks')
            .insert({
                user_id: currentUser.id,
                title: title,
                subject: course,
                deadline: deadline,
                priority: priority,
                done: false,
                focus_today: focusToday
            });
            
        if (error) {
            showToast("Error creating task: " + error.message);
            return;
        }
        
        await fetchAndRenderTasks();
        
        document.getElementById('task-title').value = '';
        document.getElementById('task-course').value = '';
        deadlineInput.value = todayStr;
        form.querySelector('input[name="priority"][value="medium"]').checked = true;
        
        showToast(`Created: "${title}" (${course})`);
    });
}
