// public/js/api.js
const API = {
    async request(method, path, data) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        };
        if (data) opts.body = JSON.stringify(data);
        const res  = await fetch(path, opts);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Request failed');
        return json;
    },
    get:  (path)       => API.request('GET',  path),
    post: (path, data) => API.request('POST', path, data),
    put:  (path, data) => API.request('PUT',  path, data),

    // Auth shortcuts
    auth: {
        login:          (data) => API.post('/api/auth?action=login', data),
        register:       (data) => API.post('/api/auth?action=register', data),
        logout:         ()     => API.post('/api/auth?action=logout'),
        me:             ()     => API.get('/api/auth?action=me'),
        changePassword: (data) => API.post('/api/auth?action=change-password', data),
    },
    // Loans shortcuts
    loans: {
        types:        ()       => API.get('/api/loans?action=types'),
        addType:      (data)   => API.post('/api/loans?action=types', data),
        apply:        (data)   => API.post('/api/loans?action=apply', data),
        my:           ()       => API.get('/api/loans?action=my'),
        all:          ()       => API.get('/api/loans?action=all'),
        stats:        ()       => API.get('/api/loans?action=stats'),
        customers:    ()       => API.get('/api/loans?action=customers'),
        updateStatus: (data)   => API.put('/api/loans?action=status', data),
        payments:     (loan_id)=> API.get(`/api/loans?action=payments&loan_id=${loan_id}`),
        pay:          (data)   => API.put('/api/loans?action=pay', data),
    }
};
