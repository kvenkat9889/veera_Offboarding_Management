const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const port = 3100;

// Enhanced CORS configuration
app.use(cors({
    origin: [
        'http://44.223.23.145:8200', 
        'http://44.223.23.145:8201',
        'http://127.0.0.1:5501', 
        'http://127.0.0.1:5503',
        'http://localhost:8200',
        'http://localhost:8201'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());
app.use(morgan('combined'));

// Database connection configuration with retry logic
const poolConfig = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'postgres',
  database: process.env.DB_NAME || 'offboarding_db',
  password: process.env.DB_PASSWORD || 'admin123',
  port: process.env.DB_PORT || 5432,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 20
};

const pool = new Pool(poolConfig);

// Enhanced database connection with retries
const connectWithRetry = async (maxAttempts = 5, delay = 5000) => {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const client = await pool.connect();
      console.log('✅ Successfully connected to PostgreSQL database');
      client.release();
      return true;
    } catch (err) {
      attempts++;
      console.error(`⚠️ Connection attempt ${attempts}/${maxAttempts} failed:`, err.message);
      
      if (attempts < maxAttempts) {
        console.log(`⌛ Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('❌ Max connection attempts reached. Exiting...');
        throw err;
      }
    }
  }
};

// Database table schema
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

// Initialize database
const initializeDatabase = async () => {
  try {
    await connectWithRetry();
    
    // Create table if not exists
    await pool.query(createTableQuery);
    console.log('✔️ Offboarding table verified/created');
    
    return true;
  } catch (err) {
    console.error('❌ Database initialization failed:', err.stack);
    process.exit(1);
  }
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: pool.totalCount > 0 ? 'connected' : 'disconnected'
  });
});

// Submit offboarding form
app.post('/api/offboarding/submit', async (req, res) => {
  console.log('📨 Received POST request to /api/offboarding/submit:', req.body);
  
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

  // Input validation
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

  const insertQuery = `
      INSERT INTO offboarding (
          employee_name, 
          position, 
          department, 
          employee_id, 
          feedback, 
          final_salary, 
          bonus, 
          acknowledgment
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id;
  `;
  
  const values = [
    empName, 
    position, 
    department, 
    empId, 
    feedback, 
    finalSalary, 
    bonus, 
    acknowledgment
  ];

  try {
    const result = await pool.query(insertQuery, values);
    console.log('✅ Data inserted successfully, ID:', result.rows[0].id);
    res.status(201).json({ 
      message: 'Offboarding form submitted successfully', 
      id: result.rows[0].id 
    });
  } catch (error) {
    if (error.code === '23505') {
      console.log('⚠️ Duplicate employee ID:', empId);
      res.status(409).json({ error: 'Employee ID already exists' });
    } else {
      console.error('❌ Error inserting data:', error.stack);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Get all offboarding records
app.get('/api/offboarding', async (req, res) => {
  console.log('📨 Received GET request to /api/offboarding');
  
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
            acknowledgment,
            created_at AS "createdAt"
        FROM offboarding
        ORDER BY created_at DESC;
    `;
    
    const result = await pool.query(query);
    console.log(`📊 Fetched ${result.rows.length} records`);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching offboarding data:', error.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🔥 Server error:', err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message
  });
});

// Start server after DB initialization
initializeDatabase().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://0.0.0.0:${port}`);
    console.log(`🔗 Health check: http://0.0.0.0:${port}/api/health`);
  });
}).catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Shutting down gracefully...');
  pool.end(() => {
    console.log('🔌 Database connection pool closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received. Shutting down gracefully...');
  pool.end(() => {
    console.log('🔌 Database connection pool closed');
    process.exit(0);
  });
});
