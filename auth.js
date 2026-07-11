// ============================================================================
// STRATA - AUTHENTICATION PAGE CLIENT (index.html)
// ============================================================================

(async function() {
    // If user is already authenticated, skip login and redirect to dashboard
    if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            window.location.href = "dashboard.html";
            return;
        }
    }
    
    // Bind auth interface controls once loaded
    initAuthPage();
})();

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

function showLoginForm() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const toggleLoginTab = document.getElementById('toggle-login-tab');
    const toggleSignupTab = document.getElementById('toggle-signup-tab');
    
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    toggleLoginTab.classList.add('active');
    toggleSignupTab.classList.remove('active');
    clearAuthErrors();
}

function showSignupForm() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const toggleLoginTab = document.getElementById('toggle-login-tab');
    const toggleSignupTab = document.getElementById('toggle-signup-tab');
    
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
    toggleLoginTab.classList.remove('active');
    toggleSignupTab.classList.add('active');
    clearAuthErrors();
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

function initAuthPage() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const toggleLoginTab = document.getElementById('toggle-login-tab');
    const toggleSignupTab = document.getElementById('toggle-signup-tab');
    const linkToSignup = document.getElementById('link-to-signup');
    const linkToLogin = document.getElementById('link-to-login');
    
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
    
    // Login Submission
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
            
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });
            
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
            
            if (error) {
                setFieldError('login-password-error', error.message);
                return;
            }
            
            // Redirect directly to dashboard on successful login
            window.location.href = "dashboard.html";
        });
    }
    
    // Signup Submission
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
            
            const { data, error } = await supabase.auth.signUp({
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
            
            // Redirect directly to dashboard on successful signup
            window.location.href = "dashboard.html";
        });
    }
}
