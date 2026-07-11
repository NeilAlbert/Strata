// ============================================================================
// STRATA - ADMIN CONSOLE WORKSPACE (admin.js)
// ============================================================================

let currentUser = null;
let allUsers = [];

document.addEventListener('authReady', async (e) => {
    currentUser = e.detail.profile;
    initAdminPage();
});

// Toast Helper
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

function initAdminPage() {
    initAdminControls();
    loadAdminStats();
    loadAdminUsers();
}

function initAdminControls() {
    const searchInput = document.getElementById('user-search');
    const roleFilter = document.getElementById('user-role-filter');
    const planFilter = document.getElementById('user-plan-filter');
    
    if (searchInput) searchInput.addEventListener('input', renderAdminUsers);
    if (roleFilter) roleFilter.addEventListener('change', renderAdminUsers);
    if (planFilter) planFilter.addEventListener('change', renderAdminUsers);
}

async function loadAdminStats() {
    if (!currentUser || currentUser.role !== 'admin' || !supabase) return;
    
    const { data, error } = await supabase.rpc('get_platform_stats');
    
    if (error) {
        console.error("Error loading platform stats:", error);
        showToast("Error loading platform stats: " + error.message);
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
        
        // Toggle user plan
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
            
            // Delete user
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
