/* ═══════════════════════════════════════════════════
   FitSlot API Client – api.js
   Lightweight fetch wrapper for /api/* endpoints
═══════════════════════════════════════════════════ */

const API_BASE = '/api';

function getToken() {
    return localStorage.getItem('fitslot_token');
}

async function request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(API_BASE + path, opts);

    if (res.status === 401) {
        // Token expired or invalid – redirect to login
        localStorage.removeItem('fitslot_token');
        localStorage.removeItem('fitslot_user');
        const role = localStorage.getItem('fitslot_role');
        localStorage.removeItem('fitslot_role');
        window.location.href = role === 'admin' ? '/admin/login.html' : '/login.html';
        return;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data;
}

const api = {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),

    // Auth
    login: (email, password) => request('POST', '/auth/login', { email, password }),
    register: (data) => request('POST', '/auth/register', data),
    me: () => request('GET', '/auth/me'),

    // Slots
    getSlots: (date) => request('GET', `/slots${date ? `?date=${date}` : ''}`),
    getSlot: (id) => request('GET', `/slots/${id}`),
    getStudents: (id, dt) => request('GET', `/slots/${id}/students?date=${dt}`),
    getCategories: () => request('GET', '/slots/categories/all'),

    // Bookings
    book: (slotId, date, categoryIds) =>
        request('POST', '/bookings', { slot_id: slotId, date, category_ids: categoryIds }),
    getBookings: (params = {}) => {
        const q = new URLSearchParams(params).toString();
        return request('GET', `/bookings${q ? '?' + q : ''}`);
    },
    cancelBooking: (id) => request('DELETE', `/bookings/${id}`),
    adminBookings: (date, slotId) => {
        const q = new URLSearchParams({ date, ...(slotId && { slot_id: slotId }) }).toString();
        return request('GET', `/bookings/admin/all?${q}`);
    },

    // Attendance
    getAttendance: (slotId, date) => request('GET', `/attendance?slot_id=${slotId}&date=${date}`),
    markAttendance: (entries) => request('POST', '/attendance/mark', { entries }),

    // Analytics
    getSummary: (date) => request('GET', `/analytics/summary${date ? `?date=${date}` : ''}`),
    getCategoryStats: (days) => request('GET', `/analytics/categories?days=${days || 30}`),
    getNoShows: () => request('GET', '/analytics/noshows'),
    getStudentStats: () => request('GET', '/analytics/students'),

    // Notifications
    getNotifications: () => request('GET', '/notifications'),
    markRead: (id) => request('PATCH', `/notifications/${id}/read`),
    markAllRead: () => request('PATCH', '/notifications/read-all'),

    // Users (admin)
    getUsers: () => request('GET', '/users'),
    unblockUser: (id) => request('PATCH', `/users/${id}/unblock`),
};

window.api = api;
