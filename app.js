// ============================================================================
// STRATA - STUDENT TIME MANAGEMENT ADVISOR
// SUPABASE BACKEND INTEGRATION & ADMINISTRATIVE CONTROLLER
// ============================================================================

// ============================================================================
// SUPABASE CLIENT INITIALIZATION & SECURITY STATEMENT
// ============================================================================
/*
 * SECURITY STATEMENT:
 * The Supabase anon/public key below is safe to expose in frontend code because
 * Row Level Security (RLS) policies are active on every database table in Supabase.
 * RLS enforces access control at the database level, meaning that a user can only
 * select, insert, update, or delete their own data in profiles and tasks.
 *
 * CRITICAL CONSTRAINT:
 * This security model only holds true if RLS is enabled and policies are correctly
 * configured and tested for all tables (profiles, tasks, subscription_events) in the
 * database. We must never expose the service_role key in client-side code under any
 * circumstance.
 */
const SUPABASE_URL = "https://uhncfkodfbujttyykdjs.supabase.co"; // Replace with your Supabase URL
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVobmNma29kZmJ1anR0eXlrZGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MjM1NTgsImV4cCI6MjA5OTI5OTU1OH0.lNae77FnLHVpM5ry6CmREwAIT6t3FpD3JML55wN2kbQ"; // Replace with your Supabase Anon Key

// Initialize the Supabase client
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Warn user if Supabase is not configured yet
if (!supabase || SUPABASE_URL.includes("your-supabase-project-url")) {
    console.warn("Strata: Supabase client is not fully configured. Please specify your SUPABASE_URL and SUPABASE_ANON_KEY in app.js.");
}

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

// Active Session State Variables (Backend Swapped to Supabase)
let currentUser = null; // Stores the profiles row of the logged-in user
let tasks = [];         // Loaded dynamically from public.tasks via Supabase
let streakCount = 0;    // Loaded from profiles.streak_count
let lastCompletionDate = ""; // Loaded from profiles.last_completion_date
let currentTipIndex = 0;
let tipInterval;
let allUsers = [];      // Admin registry list (only loaded for admin role)

// ============================================================================
// HELPER UTILITIES
// ============================================================================

// Calculate relative date string YYYY-MM-DD
function getRelativeDateString(daysFromToday) {
    const today = new Date();
    today.setDate(today.getDate() + daysFromToday);
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Get Today's Date String YYYY-MM-DD
function getTodayDateString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Get difference in days (local time)
function getDaysDifference(dueDateStr) {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const due = new Date(dueDateStr + 'T00:00:00'); // enforce local time parsing
    due.setHours(0,0,0,0);
    
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Format date to human-readable format
function formatDisplayDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Escape HTML string
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

// Get Deadline text badge content
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

// Parse Student ID or Email input
function parseIdInput(input) {
    const trimmed = input.trim();
    if (trimmed.includes('@')) {
        const studentId = trimmed.split('@')[0];
        return { email: trimmed, studentId: studentId };
    } else {
        return { email: `${trimmed.toLowerCase()}@strata.univ`, studentId: trimmed };
    }
}

// Map task database row to JS format
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
// STATE LOAD & DATABASE SYNC
// ============================================================================

// Fetch and render user tasks from Supabase tasks table
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
    
    // Map back into client formats
    tasks = dbTasks.map(mapTaskFromDb);
    
    // Render Components
    renderTodayStrata();
    renderScheduleLists();
    renderCompletedTasks();
    
    const todayPlan = getTodayPlanTasks();
    updateProgress(todayPlan);
}

// Get All Tasks scheduled for Today
function getTodayPlanTasks() {
    return tasks.filter(task => {
        const diff = getDaysDifference(task.dueDate);
        const isTodayOrOverdue = diff <= 0;
        return isTodayOrOverdue || task.focusToday;
    });
}

// ============================================================================
// CRUD TASK OPERATIONS (SUPABASE CLIENT SWAPPED)
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
    
    // Lock in Focus Streak parameters
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
// BALANCED CAIRN STREAK PERSISTENCE
// ============================================================================

async function checkStreakLiveness() {
    if (!currentUser || !supabase) return;
    
    const today = getTodayDateString();
    const yesterday = getRelativeDateString(-1);
    
    // Refresh latest profiles data
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('streak_count, last_completion_date')
        .eq('id', currentUser.id)
        .single();
        
    if (error || !profile) return;
    
    let currentStreak = profile.streak_count || 0;
    let lastDate = profile.last_completion_date;
    
    if (lastDate && lastDate !== today && lastDate !== yesterday) {
        // Streak broken
        currentStreak = 0;
        await supabase
            .from('profiles')
            .update({ streak_count: 0 })
            .eq('id', currentUser.id);
    }
    
    streakCount = currentStreak;
    lastCompletionDate = lastDate;
    updateStreakVisuals(streakCount);
}

async function updateStreakOnCompletion() {
    if (!currentUser || !supabase) return;
    
    const today = getTodayDateString();
    const yesterday = getRelativeDateString(-1);
    
    // Refresh latest profiles data
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('streak_count, last_completion_date')
        .eq('id', currentUser.id)
        .single();
        
    if (error || !profile) return;
    
    let newStreak = profile.streak_count || 0;
    let lastDate = profile.last_completion_date;
    
    if (lastDate === today) {
        // Streak already locked today
        return;
    }
    
    if (lastDate === yesterday) {
        newStreak++;
    } else {
        newStreak = 1;
    }
    
    lastDate = today;
    
    // Save to profiles
    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            streak_count: newStreak,
            last_completion_date: lastDate
        })
        .eq('id', currentUser.id);
        
    if (!updateError) {
        streakCount = newStreak;
        lastCompletionDate = lastDate;
        updateStreakVisuals(streakCount);
    }
}

// Render Streak Cairn Icon & text
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
// INTERFACE RENDERING LOGIC
// ============================================================================

// Progress Circle Ring rendering
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

// Strata Stack Rendering
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
    
    // Draw Ruler ticks
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

// Advisor Box Recommendations engine
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

// Render This Week / Upcoming lists
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
        if (diff <= 0) return; // Due today or overdue, stays in Strata
        
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

// Generate DOM task card
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

// Completed tasks section render
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
// FOCUS STRATEGIES CAROUSEL
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
// TASK CREATOR FORM
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
        
        // Reset inputs
        document.getElementById('task-title').value = '';
        document.getElementById('task-course').value = '';
        deadlineInput.value = todayStr;
        form.querySelector('input[name="priority"][value="medium"]').checked = true;
        
        showToast(`Created: "${title}" (${course})`);
    });
}

// ============================================================================
// AUTHENTICATION STATE & CONTROLS (SUPABASE CLIENT SWAPPED)
// ============================================================================

function showLoginForm() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const toggleLoginTab = document.getElementById('toggle-login-tab');
    const toggleSignupTab = document.getElementById('toggle-signup-tab');
    
    if (loginForm && signupForm) {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        toggleLoginTab.classList.add('active');
        toggleSignupTab.classList.remove('active');
        clearAuthErrors();
    }
}

function showSignupForm() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const toggleLoginTab = document.getElementById('toggle-login-tab');
    const toggleSignupTab = document.getElementById('toggle-signup-tab');
    
    if (loginForm && signupForm) {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        toggleLoginTab.classList.remove('active');
        toggleSignupTab.classList.add('active');
        clearAuthErrors();
    }
}

function clearAuthErrors() {
    document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
}

function setFieldError(fieldId, errorText) {
    const errorEl = document.getElementById(fieldId);
    if (errorEl) {
        errorEl.textContent = errorText;
    }
}

function initAuth() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const toggleLoginTab = document.getElementById('toggle-login-tab');
    const toggleSignupTab = document.getElementById('toggle-signup-tab');
    const linkToSignup = document.getElementById('link-to-signup');
    const linkToLogin = document.getElementById('link-to-login');
    const logoutBtn = document.getElementById('logout-btn');
    
    if (toggleLoginTab) toggleLoginTab.addEventListener('click', showLoginForm);
    if (toggleSignupTab) toggleSignupTab.addEventListener('click', showSignupForm);
    if (linkToSignup) linkToSignup.addEventListener('click', (e) => { e.preventDefault(); showSignupForm(); });
    if (linkToLogin) linkToLogin.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });
    
    const inputs = document.querySelectorAll('.auth-card input');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            const errorEl = document.getElementById(input.id + '-error');
            if (errorEl) errorEl.textContent = '';
        });
    });
    
    // Login Submission (Supabase Swap)
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearAuthErrors();
            
            const rawId = document.getElementById('login-id').value;
            const password = document.getElementById('login-password').value;
            
            if (!rawId || !password) return;
            
            const { email } = parseIdInput(rawId);
            
            const submitBtn = loginForm.querySelector('.submit-btn');
            const origText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span>Logging in...</span>';
            submitBtn.disabled = true;
            
            const { error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });
            
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
            
            if (error) {
                setFieldError('login-password-error', error.message);
                return;
            }
            
            loginForm.reset();
            showToast("Logged in successfully");
        });
    }
    
    // Signup Submission (Supabase Swap)
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearAuthErrors();
            
            const name = document.getElementById('signup-name').value.trim();
            const rawId = document.getElementById('signup-id').value;
            const password = document.getElementById('signup-password').value;
            const confirm = document.getElementById('signup-confirm').value;
            
            let hasError = false;
            
            if (password.length < 6) {
                setFieldError('signup-password-error', 'Password must be at least 6 characters');
                hasError = true;
            }
            
            if (password !== confirm) {
                setFieldError('signup-confirm-error', 'Passwords don\'t match');
                hasError = true;
            }
            
            if (hasError) return;
            
            const { email, studentId } = parseIdInput(rawId);
            
            const submitBtn = signupForm.querySelector('.submit-btn');
            const origText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span>Creating Account...</span>';
            submitBtn.disabled = true;
            
            const { error } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        name: name,
                        student_id: studentId
                    }
                }
            });
            
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
            
            if (error) {
                setFieldError('signup-id-error', error.message);
                return;
            }
            
            signupForm.reset();
            showToast("Sign up successful. Welcome!");
        });
    }
    
    // Logout Action
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (supabase) {
                const { error } = await supabase.auth.signOut();
                if (error) {
                    showToast("Error signing out: " + error.message);
                } else {
                    window.location.hash = '';
                    window.history.pushState(null, "", "/");
                    showToast("Logged out successfully");
                }
            }
        });
    }
}

// ============================================================================
// ROUTING & ACCESS CONTROL (ADMIN GATEWAY)
// ============================================================================

function handleRouting() {
    const authView = document.getElementById('auth-view');
    const dashboardView = document.getElementById('dashboard-view');
    const adminView = document.getElementById('admin-view');
    const adminToggleBtn = document.getElementById('admin-toggle-btn');
    
    if (!currentUser) {
        authView.classList.remove('hidden');
        dashboardView.classList.add('hidden');
        adminView.classList.add('hidden');
        return;
    }
    
    const hash = window.location.hash;
    const path = window.location.pathname;
    const wantsAdmin = (hash === '#admin' || path.endsWith('/admin'));
    
    if (wantsAdmin) {
        if (currentUser.role === 'admin') {
            // Authorized Admin View Transition
            dashboardView.classList.add('hidden');
            adminView.classList.remove('hidden');
            
            adminToggleBtn.innerHTML = `
                <span>Dashboard</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px;">
                    <rect x="3" y="3" width="7" height="9"/>
                    <rect x="14" y="3" width="7" height="5"/>
                    <rect x="14" y="12" width="7" height="9"/>
                    <rect x="3" y="16" width="7" height="5"/>
                </svg>
            `;
            adminToggleBtn.title = "Return to Dashboard";
            
            // Fetch platform metrics & user registry
            loadAdminStats();
            loadAdminUsers();
        } else {
            // Access Denied Security Redirect
            showToast("Access Denied: Administrative privileges required.");
            window.location.hash = '';
            window.history.pushState(null, "", "/");
            switchToMainDashboard();
        }
    } else {
        switchToMainDashboard();
    }
}

function switchToMainDashboard() {
    const dashboardView = document.getElementById('dashboard-view');
    const adminView = document.getElementById('admin-view');
    const adminToggleBtn = document.getElementById('admin-toggle-btn');
    
    dashboardView.classList.remove('hidden');
    adminView.classList.add('hidden');
    
    if (currentUser && currentUser.role === 'admin') {
        adminToggleBtn.innerHTML = `
            <span>Admin Panel</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px;">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
        `;
        adminToggleBtn.title = "Open Admin Panel";
    }
}

// ============================================================================
// ADMIN CONSOLE CONTROLLERS
// ============================================================================

async function loadAdminStats() {
    if (!currentUser || currentUser.role !== 'admin' || !supabase) return;
    
    // Fetch stats using secure database RPC (bypasses RLS aggregates limit securely)
    const { data, error } = await supabase.rpc('get_platform_stats');
    
    if (error) {
        console.error("Error loading platform stats:", error);
        return;
    }
    
    if (data && data.length > 0) {
        const stats = data[0];
        document.getElementById('stat-total-users').textContent = stats.total_users;
        document.getElementById('stat-active-users').textContent = stats.active_users_7d;
        document.getElementById('stat-premium-users').innerHTML = `
            ${stats.premium_users} 
            <span class="stat-subtext">/ ${stats.free_users} free</span>
        `;
        document.getElementById('stat-total-tasks').textContent = stats.total_tasks;
        
        const rate = stats.total_tasks > 0 ? Math.round((stats.completed_tasks / stats.total_tasks) * 100) : 0;
        document.getElementById('stat-completion-rate').textContent = `${rate}%`;
    }
}

async function loadAdminUsers() {
    if (!currentUser || currentUser.role !== 'admin' || !supabase) return;
    
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name', { ascending: true });
        
    if (error) {
        showToast("Error loading user registry: " + error.message);
        return;
    }
    
    allUsers = profiles;
    renderAdminUsers();
}

function renderAdminUsers() {
    const tbody = document.getElementById('admin-users-tbody');
    if (!tbody) return;
    
    const searchQuery = document.getElementById('user-search').value.toLowerCase().trim();
    const roleFilter = document.getElementById('user-role-filter').value;
    const planFilter = document.getElementById('user-plan-filter').value;
    
    const filtered = allUsers.filter(user => {
        const nameMatch = user.name.toLowerCase().includes(searchQuery);
        const idMatch = user.student_id.toLowerCase().includes(searchQuery);
        const queryMatch = !searchQuery || nameMatch || idMatch;
        const roleMatch = roleFilter === 'all' || user.role === roleFilter;
        const planMatch = planFilter === 'all' || user.plan === planFilter;
        return queryMatch && roleMatch && planMatch;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="table-empty-state">No matching users found.</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = '';
    filtered.forEach(user => {
        const tr = document.createElement('tr');
        const isSelf = user.id === currentUser.id;
        
        const joinedDate = new Date(user.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const lastActive = new Date(user.last_login_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const deleteButton = isSelf ? 
            `<button class="action-btn danger" disabled style="opacity: 0.4; cursor: not-allowed;">Delete</button>` : 
            `<button class="action-btn danger delete-user-btn" data-id="${user.id}">Delete</button>`;
            
        const togglePlanText = user.plan === 'premium' ? 'Make Free' : 'Make Premium';
        const toggleRoleText = user.role === 'admin' ? 'Make User' : 'Make Admin';
        
        tr.innerHTML = `
            <td><strong>${escapeHTML(user.name)}</strong>${isSelf ? ' <span style="font-size: 0.7rem; opacity: 0.6;">(You)</span>' : ''}</td>
            <td><code>${escapeHTML(user.student_id)}</code></td>
            <td><span class="plan-badge ${user.plan}">${user.plan}</span></td>
            <td><span class="role-badge ${user.role}">${user.role}</span></td>
            <td style="color: var(--color-steel); font-family: 'JetBrains Mono', monospace; font-size: 0.75rem;">${joinedDate}</td>
            <td style="color: var(--color-steel); font-family: 'JetBrains Mono', monospace; font-size: 0.75rem;">${lastActive}</td>
            <td>
                <div class="actions-cell">
                    <button class="action-btn toggle-plan-btn">${togglePlanText}</button>
                    <button class="action-btn toggle-role-btn" ${isSelf ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>${toggleRoleText}</button>
                    ${deleteButton}
                </div>
            </td>
        `;
        
        // Toggle user billing plan
        tr.querySelector('.toggle-plan-btn').addEventListener('click', async () => {
            const nextPlan = user.plan === 'premium' ? 'free' : 'premium';
            const { error } = await supabase
                .from('profiles')
                .update({ plan: nextPlan })
                .eq('id', user.id);
                
            if (error) {
                showToast("Error updating plan: " + error.message);
            } else {
                showToast(`Updated ${user.name} to ${nextPlan} plan`);
                await loadAdminUsers();
                await loadAdminStats();
            }
        });
        
        // Toggle administrative role
        if (!isSelf) {
            tr.querySelector('.toggle-role-btn').addEventListener('click', async () => {
                const nextRole = user.role === 'admin' ? 'user' : 'admin';
                const { error } = await supabase
                    .from('profiles')
                    .update({ role: nextRole })
                    .eq('id', user.id);
                    
                if (error) {
                    showToast("Error updating role: " + error.message);
                } else {
                    showToast(`Updated ${user.name} to ${nextRole} role`);
                    await loadAdminUsers();
                    await loadAdminStats();
                }
            });
            
            // Delete user account via secure RPC (cascades to public tables)
            tr.querySelector('.delete-user-btn').addEventListener('click', async () => {
                if (confirm(`Are you absolutely sure you want to permanently delete the account for ${user.name}? This action is irreversible.`)) {
                    const { error } = await supabase.rpc('delete_user', { user_uuid: user.id });
                    
                    if (error) {
                        showToast("Error deleting user: " + error.message);
                    } else {
                        showToast(`Deleted user account: ${user.name}`);
                        await loadAdminUsers();
                        await loadAdminStats();
                    }
                }
            });
        }
        
        tbody.appendChild(tr);
    });
}

function initAdminControls() {
    const searchInput = document.getElementById('user-search');
    const roleFilter = document.getElementById('user-role-filter');
    const planFilter = document.getElementById('user-plan-filter');
    
    if (searchInput) searchInput.addEventListener('input', renderAdminUsers);
    if (roleFilter) roleFilter.addEventListener('change', renderAdminUsers);
    if (planFilter) planFilter.addEventListener('change', renderAdminUsers);
}

// ============================================================================
// APPLICATION INITIALIZATION & REACTIVE STATE HANDLER
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Set Header display date
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
        dateEl.textContent = formatDisplayDate(getTodayDateString());
    }
    
    // Bind base elements
    initAuth();
    initTips();
    initForm();
    initAdminControls();
    
    // Bind admin console button
    const adminToggleBtn = document.getElementById('admin-toggle-btn');
    if (adminToggleBtn) {
        adminToggleBtn.addEventListener('click', () => {
            const isCurrentlyAdmin = window.location.hash === '#admin' || window.location.pathname.endsWith('/admin');
            if (isCurrentlyAdmin) {
                window.location.hash = '';
                window.history.pushState(null, "", "/");
                handleRouting();
            } else {
                window.location.hash = '#admin';
                handleRouting();
            }
        });
    }
    
    // Handle manual routing updates
    window.addEventListener('hashchange', handleRouting);
    window.addEventListener('popstate', handleRouting);
    
    // Listen to Supabase Auth State Changes (Reactive Engine)
    if (supabase) {
        supabase.auth.onAuthStateChange(async (event, session) => {
            const authView = document.getElementById('auth-view');
            const dashboardView = document.getElementById('dashboard-view');
            const adminView = document.getElementById('admin-view');
            const appHeader = document.getElementById('app-header');
            
            if (session) {
                // User is authenticated
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();
                    
                if (error || !profile) {
                    console.error("Failed to load user profile:", error);
                    showToast("Failed to load user profile records.");
                    await supabase.auth.signOut();
                    return;
                }
                
                currentUser = profile;
                
                // Track last login timestamp
                await supabase.from('profiles')
                    .update({ last_login_at: new Date().toISOString() })
                    .eq('id', profile.id);
                
                // Load credentials in header
                document.getElementById('user-display-name').textContent = profile.name;
                appHeader.classList.remove('hidden');
                
                // Show admin button if role permits
                if (profile.role === 'admin') {
                    adminToggleBtn.classList.remove('hidden');
                } else {
                    adminToggleBtn.classList.add('hidden');
                }
                
                // Initialize Router Gate
                handleRouting();
                
                // Process streaks & render
                await checkStreakLiveness();
                await fetchAndRenderTasks();
            } else {
                // User is logged out
                currentUser = null;
                tasks = [];
                streakCount = 0;
                lastCompletionDate = "";
                
                authView.classList.remove('hidden');
                dashboardView.classList.add('hidden');
                adminView.classList.add('hidden');
                appHeader.classList.add('hidden');
                
                showLoginForm();
            }
        });
    } else {
        showToast("Supabase configuration missing or invalid. Check console.");
    }
});
