// ============================================================================
// STRATA - ACCOUNT SETTINGS WORKSPACE (account.js)
// ============================================================================

let currentUser = null;

document.addEventListener('authReady', async (e) => {
    currentUser = e.detail.profile;
    initAccountPage();
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

function initAccountPage() {
    const nameInput = document.getElementById('profile-name');
    const studentIdInput = document.getElementById('profile-student-id');
    const roleInput = document.getElementById('profile-role');
    
    if (nameInput) nameInput.value = currentUser.name;
    if (studentIdInput) studentIdInput.value = currentUser.student_id;
    if (roleInput) roleInput.value = currentUser.role;
    
    renderPlanInfo();
    
    // Bind buttons
    const upgradeBtn = document.getElementById('upgrade-plan-btn');
    const downgradeBtn = document.getElementById('downgrade-plan-btn');
    
    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', async () => {
            const { error } = await supabase
                .from('profiles')
                .update({ plan: 'premium' })
                .eq('id', currentUser.id);
                
            if (error) {
                showToast("Upgrade failed: " + error.message);
            } else {
                currentUser.plan = 'premium';
                renderPlanInfo();
                showToast("Upgraded to Premium tier successfully!");
            }
        });
    }
    
    if (downgradeBtn) {
        downgradeBtn.addEventListener('click', async () => {
            const { error } = await supabase
                .from('profiles')
                .update({ plan: 'free' })
                .eq('id', currentUser.id);
                
            if (error) {
                showToast("Downgrade failed: " + error.message);
            } else {
                currentUser.plan = 'free';
                renderPlanInfo();
                showToast("Downgraded to Free tier successfully.");
            }
        });
    }
}

function renderPlanInfo() {
    const planDisplay = document.getElementById('current-plan-display');
    const badgeDisplay = document.getElementById('plan-badge-display');
    
    if (!planDisplay || !badgeDisplay) return;
    
    const isPremium = currentUser.plan === 'premium';
    planDisplay.textContent = isPremium ? "Premium Tier" : "Free Tier";
    
    badgeDisplay.className = `plan-badge ${currentUser.plan}`;
    badgeDisplay.textContent = currentUser.plan;
    
    // Disable active button option to prevent duplicate updates
    const upgradeBtn = document.getElementById('upgrade-plan-btn');
    const downgradeBtn = document.getElementById('downgrade-plan-btn');
    
    if (upgradeBtn) {
        upgradeBtn.disabled = isPremium;
        upgradeBtn.style.opacity = isPremium ? "0.5" : "1";
        upgradeBtn.style.cursor = isPremium ? "not-allowed" : "pointer";
    }
    if (downgradeBtn) {
        downgradeBtn.disabled = !isPremium;
        downgradeBtn.style.opacity = !isPremium ? "0.5" : "1";
        downgradeBtn.style.cursor = !isPremium ? "not-allowed" : "pointer";
    }
}
