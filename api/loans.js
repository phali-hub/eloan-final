// api/loans.js — handles all loan routes via ?action=
const jwt    = require('jsonwebtoken');
const cookie = require('cookie');
const { Pool } = require('pg');

const SECRET = process.env.JWT_SECRET || 'eloan_pro_secret_2025';

let pool;
function getPool() {
    if (!pool) pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 5,
    });
    return pool;
}

function getUser(req) {
    try {
        const cookies = cookie.parse(req.headers.cookie || '');
        if (!cookies.eloan_token) return null;
        return jwt.verify(cookies.eloan_token, SECRET);
    } catch { return null; }
}
function requireAuth(req, res) {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: 'Not logged in.' }); return null; }
    return user;
}
function requireAdmin(req, res) {
    const user = getUser(req);
    if (!user || user.role !== 'admin') { res.status(403).json({ error: 'Admins only.' }); return null; }
    return user;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const action = req.query.action;
    const db = getPool();

    try {
        // GET /api/loans?action=types  — public
        if (action === 'types' && req.method === 'GET') {
            const { rows } = await db.query('SELECT * FROM loan_types ORDER BY name');
            return res.json(rows);
        }

        // POST /api/loans?action=types  — admin only
        if (action === 'types' && req.method === 'POST') {
            const admin = requireAdmin(req, res);
            if (!admin) return;
            const { name, interest_rate, max_amount, max_tenure_months, description } = req.body;
            if (!name || !interest_rate || !max_amount || !max_tenure_months)
                return res.status(400).json({ error: 'All fields required.' });
            await db.query(
                'INSERT INTO loan_types (name, interest_rate, max_amount, max_tenure_months, description) VALUES ($1,$2,$3,$4,$5)',
                [name, interest_rate, max_amount, max_tenure_months, description || '']
            );
            return res.json({ success: true });
        }

        // POST /api/loans?action=apply
        if (action === 'apply' && req.method === 'POST') {
            const user = requireAuth(req, res);
            if (!user) return;
            const { loan_type_id, amount, tenure_months, purpose } = req.body;
            if (!loan_type_id || !amount || !tenure_months)
                return res.status(400).json({ error: 'All fields required.' });
            const { rows: typeRows } = await db.query('SELECT * FROM loan_types WHERE id = $1', [loan_type_id]);
            if (!typeRows.length) return res.status(400).json({ error: 'Invalid loan type.' });
            const type = typeRows[0];
            const r   = type.interest_rate / 100 / 12;
            const emi = (amount * r * Math.pow(1 + r, tenure_months)) / (Math.pow(1 + r, tenure_months) - 1);
            const result = await db.query(
                'INSERT INTO loans (user_id, loan_type_id, amount, tenure_months, purpose, monthly_emi) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
                [user.id, loan_type_id, amount, tenure_months, purpose || '', parseFloat(emi.toFixed(2))]
            );
            return res.json({ success: true, loan_id: result.rows[0].id, monthly_emi: emi.toFixed(2) });
        }

        // GET /api/loans?action=my
        if (action === 'my' && req.method === 'GET') {
            const user = requireAuth(req, res);
            if (!user) return;
            const { rows } = await db.query(
                `SELECT l.*, lt.name AS loan_type_name, lt.interest_rate
                 FROM loans l JOIN loan_types lt ON l.loan_type_id = lt.id
                 WHERE l.user_id = $1 ORDER BY l.applied_at DESC`, [user.id]
            );
            return res.json(rows);
        }

        // GET /api/loans?action=all  — admin
        if (action === 'all' && req.method === 'GET') {
            const admin = requireAdmin(req, res);
            if (!admin) return;
            const { rows } = await db.query(
                `SELECT l.*, lt.name AS loan_type_name, u.full_name, u.email
                 FROM loans l
                 JOIN loan_types lt ON l.loan_type_id = lt.id
                 JOIN users u ON l.user_id = u.id
                 ORDER BY l.applied_at DESC`
            );
            return res.json(rows);
        }

        // GET /api/loans?action=stats  — admin
        if (action === 'stats' && req.method === 'GET') {
            const admin = requireAdmin(req, res);
            if (!admin) return;
            const { rows: [{ total_loans }] }  = await db.query('SELECT COUNT(*) AS total_loans FROM loans');
            const { rows: [{ pending }] }      = await db.query("SELECT COUNT(*) AS pending FROM loans WHERE status='pending'");
            const { rows: [{ approved }] }     = await db.query("SELECT COUNT(*) AS approved FROM loans WHERE status IN ('approved','disbursed')");
            const { rows: [{ customers }] }    = await db.query("SELECT COUNT(*) AS customers FROM users WHERE role='customer'");
            const { rows: [{ total_amount }] } = await db.query("SELECT COALESCE(SUM(amount),0) AS total_amount FROM loans WHERE status='disbursed'");
            return res.json({ total_loans, pending, approved, customers, total_amount });
        }

        // GET /api/loans?action=customers  — admin
        if (action === 'customers' && req.method === 'GET') {
            const admin = requireAdmin(req, res);
            if (!admin) return;
            const { rows } = await db.query(
                "SELECT id, full_name, email, phone, address, created_at FROM users WHERE role='customer' ORDER BY created_at DESC"
            );
            return res.json(rows);
        }

        // PUT /api/loans?action=status  — admin
        if (action === 'status' && req.method === 'PUT') {
            const admin = requireAdmin(req, res);
            if (!admin) return;
            const { id, status } = req.body;
            if (!id || !status) return res.status(400).json({ error: 'id and status required.' });
            await db.query('UPDATE loans SET status=$1, updated_at=NOW() WHERE id=$2', [status, id]);
            if (status === 'disbursed') {
                const { rows: loans } = await db.query('SELECT * FROM loans WHERE id=$1', [id]);
                const loan  = loans[0];
                const today = new Date();
                for (let i = 1; i <= loan.tenure_months; i++) {
                    const d = new Date(today.getFullYear(), today.getMonth() + i, today.getDate());
                    await db.query(
                        "INSERT INTO payments (loan_id, amount, payment_date, status) VALUES ($1,$2,$3,'pending')",
                        [loan.id, loan.monthly_emi, d.toISOString().split('T')[0]]
                    );
                }
            }
            return res.json({ success: true });
        }

        // GET /api/loans?action=payments&loan_id=X
        if (action === 'payments' && req.method === 'GET') {
            const user = requireAuth(req, res);
            if (!user) return;
            const { loan_id } = req.query;
            if (!loan_id) return res.status(400).json({ error: 'loan_id required.' });
            const { rows } = await db.query(
                'SELECT * FROM payments WHERE loan_id=$1 ORDER BY payment_date ASC', [loan_id]
            );
            return res.json(rows);
        }

        // PUT /api/loans?action=pay
        if (action === 'pay' && req.method === 'PUT') {
            const admin = requireAdmin(req, res);
            if (!admin) return;
            const { payment_id } = req.body;
            if (!payment_id) return res.status(400).json({ error: 'payment_id required.' });
            await db.query("UPDATE payments SET status='paid' WHERE id=$1", [payment_id]);
            return res.json({ success: true });
        }

        res.status(404).json({ error: 'Unknown action.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
