// api/auth.js — handles all auth routes: /api/auth/login, register, logout, me, change-password
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const cookie = require('cookie');
const { Pool } = require('pg');

const SECRET = process.env.JWT_SECRET || 'eloan_pro_secret_2025';

// DB
let pool;
function getPool() {
    if (!pool) pool = new Pool({
        host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER, password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME, ssl: { rejectUnauthorized: false },
        max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000,
    });
    return pool;
}

// Auth helpers
function setAuthCookie(res, user) {
    const token = jwt.sign(
        { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
        SECRET, { expiresIn: '7d' }
    );
    res.setHeader('Set-Cookie', cookie.serialize('eloan_token', token, {
        httpOnly: true, secure: true, sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, path: '/'
    }));
}
function clearAuthCookie(res) {
    res.setHeader('Set-Cookie', cookie.serialize('eloan_token', '', { httpOnly: true, maxAge: 0, path: '/' }));
}
function getUser(req) {
    try {
        const cookies = cookie.parse(req.headers.cookie || '');
        if (!cookies.eloan_token) return null;
        return jwt.verify(cookies.eloan_token, SECRET);
    } catch { return null; }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const action = req.query.action;
    const db = getPool();

    try {
        // POST /api/auth?action=login
        if (action === 'login' && req.method === 'POST') {
            const { email, password } = req.body;
            if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
            const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
            if (!rows.length) return res.status(401).json({ error: 'Invalid email or password.' });
            const user = rows[0];
            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) return res.status(401).json({ error: 'Invalid email or password.' });
            setAuthCookie(res, user);
            return res.json({ success: true, user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role } });
        }

        // POST /api/auth?action=register
        if (action === 'register' && req.method === 'POST') {
            const { full_name, email, phone, address, password } = req.body;
            if (!full_name || !email || !password) return res.status(400).json({ error: 'Name, email and password required.' });
            const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
            if (existing.rows.length) return res.status(409).json({ error: 'Email already registered.' });
            const hash = await bcrypt.hash(password, 10);
            await db.query('INSERT INTO users (full_name, email, phone, address, password_hash) VALUES ($1,$2,$3,$4,$5)',
                [full_name, email, phone || null, address || null, hash]);
            return res.json({ success: true });
        }

        // POST /api/auth?action=logout
        if (action === 'logout') {
            clearAuthCookie(res);
            return res.json({ success: true });
        }

        // GET /api/auth?action=me
        if (action === 'me' && req.method === 'GET') {
            const user = getUser(req);
            if (!user) return res.status(401).json({ error: 'Not logged in.' });
            return res.json({ user });
        }

        // POST /api/auth?action=change-password
        if (action === 'change-password' && req.method === 'POST') {
            const user = getUser(req);
            if (!user) return res.status(401).json({ error: 'Not logged in.' });
            const { old_password, new_password } = req.body;
            if (!old_password || !new_password) return res.status(400).json({ error: 'All fields required.' });
            if (new_password.length < 6) return res.status(400).json({ error: 'Min 6 characters.' });
            const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [user.id]);
            const match = await bcrypt.compare(old_password, rows[0].password_hash);
            if (!match) return res.status(400).json({ error: 'Current password is incorrect.' });
            const hash = await bcrypt.hash(new_password, 10);
            await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
            return res.json({ success: true });
        }

        res.status(404).json({ error: 'Unknown action.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
