/* ═══════════════════════════════════════════════════
   FitSlot Auth Helpers – auth.js
   Session management and route guards
═══════════════════════════════════════════════════ */

const Auth = {
    setSession(token, user) {
        localStorage.setItem('fitslot_token', token);
        localStorage.setItem('fitslot_user', JSON.stringify(user));
        localStorage.setItem('fitslot_role', user.role);
    },

    clearSession() {
        localStorage.removeItem('fitslot_token');
        localStorage.removeItem('fitslot_user');
        localStorage.removeItem('fitslot_role');
    },

    getUser() {
        try { return JSON.parse(localStorage.getItem('fitslot_user')); }
        catch { return null; }
    },

    getToken() { return localStorage.getItem('fitslot_token'); },
    getRole() { return localStorage.getItem('fitslot_role'); },
    isLoggedIn() { return !!this.getToken(); },

    requireStudent() {
        if (!this.isLoggedIn() || this.getRole() !== 'student') {
            window.location.href = '/login.html';
            return false;
        }
        return true;
    },

    requireAdmin() {
        if (!this.isLoggedIn() || this.getRole() !== 'admin') {
            window.location.href = '/admin/login.html';
            return false;
        }
        return true;
    },

    logout() {
        const role = this.getRole();
        this.clearSession();
        window.location.href = role === 'admin' ? '/admin/login.html' : '/login.html';
    },

    // Populate sidebar user info
    populateSidebar() {
        const user = this.getUser();
        if (!user) return;
        const nameEl = document.getElementById('sidebar-name');
        const roleEl = document.getElementById('sidebar-role');
        const avatarEl = document.getElementById('sidebar-avatar');
        if (nameEl) nameEl.textContent = user.name;
        if (roleEl) roleEl.textContent = user.role;
        if (avatarEl) avatarEl.textContent = user.name ? user.name.charAt(0).toUpperCase() : '?';
    },

    populateTopbar() {
        const user = this.getUser();
        if (!user) return;
        const el = document.getElementById('topbar-name');
        if (el) el.textContent = user.name;
    },

    // ── Handle Google OAuth redirect (JWT passed in URL query params) ──────────
    // Called on dashboard.html / admin/dashboard.html after Google login
    captureGoogleToken() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        if (!token) return false;

        const user = {
            id: parseInt(params.get('id')),
            name: decodeURIComponent(params.get('name') || ''),
            email: decodeURIComponent(params.get('email') || ''),
            role: params.get('role') || 'student',
        };

        this.setSession(token, user);

        // Clean up the URL (remove token from address bar)
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        return true;
    }
};

// Initialize sidebar + mobile menu if elements present
document.addEventListener('DOMContentLoaded', () => {
    // Capture Google OAuth token if present in URL
    Auth.captureGoogleToken();

    Auth.populateSidebar();
    Auth.populateTopbar();

    // Logout buttons
    document.querySelectorAll('[data-action="logout"]').forEach(btn => {
        btn.addEventListener('click', () => Auth.logout());
    });

    // Mobile hamburger
    const hamburger = document.getElementById('hamburger');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (hamburger && sidebar) {
        hamburger.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            backdrop?.classList.toggle('open');
        });
        backdrop?.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            backdrop.classList.remove('open');
        });
    }
});

window.Auth = Auth;
