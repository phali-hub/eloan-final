-- eLoan Pro — PostgreSQL Schema for Supabase
-- Paste into Supabase SQL Editor and click Run

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    full_name     VARCHAR(100)  NOT NULL,
    email         VARCHAR(100)  UNIQUE NOT NULL,
    phone         VARCHAR(20),
    address       TEXT,
    password_hash VARCHAR(255)  NOT NULL,
    role          VARCHAR(20)   DEFAULT 'customer',
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loan_types (
    id                 SERIAL PRIMARY KEY,
    name               VARCHAR(100)  NOT NULL,
    interest_rate      DECIMAL(5,2)  NOT NULL,
    max_amount         DECIMAL(15,2) NOT NULL,
    max_tenure_months  INT           NOT NULL,
    description        TEXT
);

CREATE TABLE IF NOT EXISTS loans (
    id              SERIAL PRIMARY KEY,
    user_id         INT           NOT NULL,
    loan_type_id    INT           NOT NULL,
    amount          DECIMAL(15,2) NOT NULL,
    tenure_months   INT           NOT NULL,
    purpose         TEXT,
    monthly_emi     DECIMAL(15,2),
    status          VARCHAR(20)   DEFAULT 'pending',
    applied_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)      REFERENCES users(id),
    FOREIGN KEY (loan_type_id) REFERENCES loan_types(id)
);

CREATE TABLE IF NOT EXISTS payments (
    id           SERIAL PRIMARY KEY,
    loan_id      INT           NOT NULL,
    amount       DECIMAL(15,2) NOT NULL,
    payment_date DATE          NOT NULL,
    status       VARCHAR(20)   DEFAULT 'pending',
    FOREIGN KEY (loan_id) REFERENCES loans(id)
);

INSERT INTO loan_types (name, interest_rate, max_amount, max_tenure_months, description) VALUES
('Personal Loan',  12.50,   500000.00,  60,  'Unsecured loan for any personal purpose'),
('Home Loan',       8.75,  5000000.00, 360,  'Purchase or construct your home'),
('Car Loan',        9.50,  1000000.00,  84,  'Buy a new or used vehicle'),
('Education Loan',  7.00,  2000000.00, 120,  'Fund your higher education'),
('Business Loan',  14.00, 10000000.00,  60,  'Start or expand your business');

INSERT INTO users (full_name, email, phone, address, password_hash, role)
VALUES ('Admin User','admin@eloan.com','0000000000','Bank HQ',
'$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi','admin');
