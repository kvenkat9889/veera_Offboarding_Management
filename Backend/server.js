const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');

// Load environment variables from server.env
dotenv.config({ path: './server.env' });

const app = express();
const port = 3021;

// Middleware
app.use(cors({
    origin: ['http://98.80.67.100:9032', 'http://98.80.67.100:9033'],     // Allow multiple origins
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(morgan('combined')); // Logging middleware

// PostgreSQL database configuration
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to PostgreSQL:', err.stack);
        process.exit(1);
    } else {
        console.log('Connected to PostgreSQL database');
        release();
    }
});

// Create offboarding table if it doesn't exist
const createTableQuery = `
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
`;

pool.query(createTableQuery)
    .then(() => console.log('Offboarding table created or already exists'))
    .catch(err => {
        console.error('Error creating offboarding table:', err.stack);
        process.exit(1);
    });

// API endpoint to handle form submission
app.post('/api/offboarding/submit', async (req, res, next) => {
    console.log('Received POST request to /api/offboarding/submit:', req.body);
    const {
        empName,
        position,
        department,
        empId,
        feedback,
        finalSalary,
        bonus,
        acknowledgment
    } = req.body;

    // Server-side validation
    if (!empName || !/^[A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)*$/.test(empName)) {
        return res.status(400).json({ error: 'Invalid employee name' });
    }
    if (!position || !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(position)) {
        return res.status(400).json({ error: 'Invalid position' });
    }
    if (!department || !['Engineering', 'Marketing', 'HR', 'Finance'].includes(department)) {
        return res.status(400).json({ error: 'Invalid department' });
    }
    if (!empId || !/^ATS0(?!000)\d{3}$/.test(empId)) {
        return res.status(400).json({ error: 'Invalid employee ID' });
    }
    if (!feedback || feedback.length > 500 || /^[0-9\s\W_]+$/.test(feedback)) {
        return res.status(400).json({ error: 'Invalid feedback' });
    }
    if (!acknowledgment || acknowledgment.length > 300 || /^[0-9\s\W_]+$/.test(acknowledgment)) {
        return res.status(400).json({ error: 'Invalid acknowledgment' });
    }
    if (isNaN(finalSalary) || finalSalary < 1000 || finalSalary > 1000000) {
        return res.status(400).json({ error: 'Invalid final salary' });
    }
    if (isNaN(bonus) || bonus < 0 || bonus > 100000) {
        return res.status(400).json({ error: 'Invalid bonus amount' });
    }

    // Insert data into PostgreSQL
    const insertQuery = `
        INSERT INTO offboarding (employee_name, position, department, employee_id, feedback, final_salary, bonus, acknowledgment)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id;
    `;
    const values = [empName, position, department, empId, feedback, finalSalary, bonus, acknowledgment];

    try {
        const result = await pool.query(insertQuery, values);
        console.log('Data inserted successfully, ID:', result.rows[0].id);
        res.status(200).json({ message: 'Offboarding form submitted successfully', id: result.rows[0].id });
    } catch (error) {
        if (error.code === '23505') {
            console.log('Duplicate employee ID:', empId);
            res.status(400).json({ error: 'Employee ID already exists' });
        } else {
            console.error('Error inserting data:', error.stack);
            next(error);
        }
    }
});

// API endpoint to retrieve all offboarding records
app.get('/api/offboarding', async (req, res, next) => {
    console.log('Received GET request to /api/offboarding');
    try {
        const query = `
            SELECT 
                employee_name AS "empName",
                position,
                department,
                employee_id AS "empId",
                feedback,
                final_salary AS "finalSalary",
                bonus,
                acknowledgment
            FROM offboarding
            ORDER BY created_at DESC;
        `;
        const result = await pool.query(query);
        console.log('Fetched records:', result.rows.length);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching offboarding data:', error.stack);
        next(error);
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(500).json({ error: 'Internal server error. Please try again later.' });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});
