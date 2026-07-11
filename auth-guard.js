// ============================================================================
// STRATA - AUTHENTICATION GUARD & GLOBAL HEADER LOADER
// ============================================================================

(async function() {
    if (!supabase) {
        console.error("Supabase client is not loaded.");
        return;
    }
    
    // 1. Fetch active session
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
        // No session: redirect to landing/auth page
        window.location.href = "index.html";
        return;
    }
    
    // 2. Fetch profile from database profiles table (secured by RLS)
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
        
    if (profileError || !profile) {
        console.error("Failed to load user profile:", profileError);
        // Force logout to clean up corrupted or missing profile state
        await supabase.auth.signOut();
        window.location.href = "index.html";
        return;
    }
    
    // Update last active login timestamp
    const { error: updateError } = await supabase.from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', profile.id);
        
    if (updateError) {
        console.error("Failed to update last login timestamp:", updateError);
    }
        
    // Save to window scope for page-specific JS access
    window.currentUser = profile;
    window.currentSession = session;
    
    // 3. Admin Access Control Check
    const path = window.location.pathname;
    const isEditingAdmin = path.endsWith('admin.html') || path.endsWith('/admin');
    if (isEditingAdmin && profile.role !== 'admin') {
        window.location.href = "dashboard.html";
        return;
    }
    
    // 4. Load Global Header (Option b)
    await injectGlobalHeader(profile);
    
    // 5. Dispatch Event notifying page controllers that session is ready
    document.dispatchEvent(new CustomEvent('authReady', { 
        detail: { profile, session } 
    }));
})();

// Dynamically fetch and render the shared header structure
async function injectGlobalHeader(profile) {
    const headerRoot = document.getElementById('header-root');
    if (!headerRoot) return;
    
    try {
        const response = await fetch('header.html');
        if (!response.ok) throw new Error("Failed to retrieve header.html");
        
        const html = await response.text();
        headerRoot.innerHTML = html;
        
        // Populate profile name
        const nameEl = document.getElementById('user-display-name');
        if (nameEl) nameEl.textContent = profile.name;
        
        // Populate current display date
        const dateEl = document.getElementById('current-date');
        if (dateEl) {
            const today = new Date();
            dateEl.textContent = today.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
        
        // Reveal Admin link if role permits
        const adminLink = document.getElementById('nav-admin');
        if (adminLink && profile.role === 'admin') {
            adminLink.classList.remove('hidden');
        }
        
        // Highlight active navigation tab
        const currentPath = window.location.pathname;
        if (currentPath.endsWith('dashboard.html') || currentPath.endsWith('/dashboard')) {
            document.getElementById('nav-dashboard')?.classList.add('active');
        } else if (currentPath.endsWith('account.html') || currentPath.endsWith('/account')) {
            document.getElementById('nav-account')?.classList.add('active');
        } else if (currentPath.endsWith('admin.html') || currentPath.endsWith('/admin')) {
            document.getElementById('nav-admin')?.classList.add('active');
        }
        
        // Bind Logout Event
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                const { error } = await supabase.auth.signOut();
                if (error) {
                    alert("Error signing out: " + error.message);
                } else {
                    window.location.href = "index.html";
                }
            });
        }
    } catch (err) {
        console.error("injectGlobalHeader Error:", err);
    }
}
