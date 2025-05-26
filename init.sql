    CREATE TABLE IF NOT EXISTS offboarding (
        id SERIAL PRIMARY KEY,
        employee_name VARCHAR(30) NOT NULL,
        position VARCHAR(30) NOT NULL,
        department VARCHAR(50) NOT NULL,
        employee_id VARCHAR(7) NOT NULL UNIQUE,
        feedback TEXT NOT NULL,
        final_salary NUMERIC(10, 2) NOT NULL,
        bonus NUMERIC(10, 2) NOT NULL,
        acknowledgment TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );