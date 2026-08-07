const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || ''
};

let pool;

async function getPool() {
  if (pool) return pool;

  // First connect without database to create it if needed
  const connection = await mysql.createConnection(dbConfig);
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'assetflow_db'}\`;`);
  await connection.end();

  // Create standard connection pool
  pool = mysql.createPool({
    ...dbConfig,
    database: process.env.DB_NAME || 'assetflow_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  return pool;
}

async function query(sql, params) {
  const activePool = await getPool();
  const cleanParams = Array.isArray(params) 
    ? params.map(p => (p === undefined ? null : p)) 
    : params;
  const [results] = await activePool.execute(sql, cleanParams);
  return results;
}

async function addColumnIfNotExists(tableName, columnName, columnDefinition) {
  try {
    const cols = await query(`SHOW COLUMNS FROM \`${tableName}\` LIKE '${columnName}'`);
    if (cols.length === 0) {
      console.log(`Adding missing column '${columnName}' to '${tableName}' table...`);
      await query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnDefinition}`);
    }
  } catch (err) {
    console.error(`Notice migrating column '${columnName}' on '${tableName}':`, err.message);
  }
}

async function initializeDatabase() {
  console.log('Initializing database tables...');

  // Note: Tables will only be created if they do not exist. Data will persist across restarts.
  
  // 1. Departments Table
  await query(`
    CREATE TABLE IF NOT EXISTS departments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(191) NOT NULL UNIQUE,
      headName VARCHAR(255) NULL,
      headEmail VARCHAR(255) NULL
    ) ENGINE=InnoDB;
  `);

  // 2. Users Table
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(191) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      fullName VARCHAR(255) NOT NULL,
      role VARCHAR(100) NOT NULL,
      department VARCHAR(100),
      avatar VARCHAR(255),
      isVerified BOOLEAN DEFAULT TRUE,
      status VARCHAR(100) DEFAULT 'Active',
      transitionDetails TEXT
    ) ENGINE=InnoDB;
  `);

  // 3. Organization Table
  await query(`
    CREATE TABLE IF NOT EXISTS organization (
      id INT PRIMARY KEY DEFAULT 1,
      orgName VARCHAR(255) NOT NULL,
      taxId VARCHAR(100),
      address TEXT,
      timeZone VARCHAR(100),
      currency VARCHAR(50),
      fiscalYear VARCHAR(50)
    ) ENGINE=InnoDB;
  `);

  // 4. Assets Table
  await query(`
    CREATE TABLE IF NOT EXISTS assets (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(100) NOT NULL,
      serial VARCHAR(255) UNIQUE,
      status VARCHAR(100) NOT NULL,
      value DECIMAL(15, 2) NOT NULL,
      location VARCHAR(255),
      owner VARCHAR(255)
    ) ENGINE=InnoDB;
  `);

  // 5. Allocations Table
  await query(`
    CREATE TABLE IF NOT EXISTS allocations (
      id VARCHAR(50) PRIMARY KEY,
      assetId VARCHAR(50) NULL,
      assetName VARCHAR(255) NOT NULL,
      allocatedTo VARCHAR(255) NOT NULL,
      date VARCHAR(100) NOT NULL,
      status VARCHAR(100) NOT NULL,
      department VARCHAR(100) NOT NULL,
      requestedBy VARCHAR(255) NULL,
      requestedByEmail VARCHAR(255) NULL,
      targetRole VARCHAR(100) NULL,
      notes TEXT NULL
    ) ENGINE=InnoDB;
  `);

  // 6. Bookings Table
  await query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id VARCHAR(50) PRIMARY KEY,
      resourceName VARCHAR(255) NOT NULL,
      bookedBy VARCHAR(255) NOT NULL,
      date VARCHAR(100) NOT NULL,
      startTime VARCHAR(100) NOT NULL,
      endTime VARCHAR(100) NOT NULL,
      status VARCHAR(100) NOT NULL,
      department VARCHAR(100) NOT NULL
    ) ENGINE=InnoDB;
  `);

  // 7. Maintenance Table
  await query(`
    CREATE TABLE IF NOT EXISTS maintenance (
      id VARCHAR(50) PRIMARY KEY,
      assetId VARCHAR(50) NOT NULL,
      assetName VARCHAR(255) NOT NULL,
      type VARCHAR(100) NOT NULL,
      description TEXT,
      cost DECIMAL(15, 2) NOT NULL,
      date VARCHAR(100) NOT NULL,
      status VARCHAR(100) NOT NULL
    ) ENGINE=InnoDB;
  `);

  // 8. Audits Table
  await query(`
    CREATE TABLE IF NOT EXISTS audits (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      date VARCHAR(100) NOT NULL,
      auditor VARCHAR(255) NOT NULL,
      progress INT DEFAULT 0,
      status VARCHAR(100) NOT NULL,
      assetState TEXT
    ) ENGINE=InnoDB;
  `);

  // 9. Notifications Table
  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(50) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(100) NOT NULL,
      date VARCHAR(100) NOT NULL,
      \`read\` BOOLEAN DEFAULT FALSE,
      targetRole VARCHAR(100),
      targetUserEmail VARCHAR(191)
    ) ENGINE=InnoDB;
  `);

  // Automatic column migrations for pre-existing MySQL databases
  await addColumnIfNotExists('allocations', 'requestedBy', 'VARCHAR(255) NULL');
  await addColumnIfNotExists('allocations', 'requestedByEmail', 'VARCHAR(255) NULL');
  await addColumnIfNotExists('allocations', 'targetRole', 'VARCHAR(100) NULL');
  await addColumnIfNotExists('allocations', 'notes', 'TEXT NULL');
  await addColumnIfNotExists('departments', 'headName', 'VARCHAR(255) NULL');
  await addColumnIfNotExists('departments', 'headEmail', 'VARCHAR(255) NULL');
  await addColumnIfNotExists('notifications', 'targetRole', 'VARCHAR(100) NULL');
  await addColumnIfNotExists('notifications', 'targetUserEmail', 'VARCHAR(191) NULL');

  console.log('Database tables & column migrations verified successfully.');
  
  // Seed Database if empty
  await seedDatabase();
}

async function seedDatabase() {
  // Database initialization check - no static dummy departments seeded
  const deptsCount = await query('SELECT COUNT(*) as count FROM departments');
  if (deptsCount[0].count === 0) {
    console.log('Departments table initialized empty. Admin can add custom departments.');
  }

  // Seed default admin only if users table is completely empty
  const usersCount = await query('SELECT COUNT(*) as count FROM users');
  if (usersCount[0].count === 0) {
    console.log('Seeding initial admin account...');
    const defaultUsers = [
      ['admin@assetflow.com', 'Password123!', 'Rahul Sharma', 'Admin', 'Management', null, true, 'Active', null]
    ];
    for (const u of defaultUsers) {
      await query(
        'INSERT INTO users (email, password, fullName, role, department, avatar, isVerified, status, transitionDetails) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        u
      );
    }
  }

  console.log('Database verified successfully.');
}

async function resetDatabase() {
  console.log('Developer Reset Database Triggered...');
  await query('DROP TABLE IF EXISTS notifications, audits, maintenance, bookings, allocations, assets, organization, users, departments;');
  await initializeDatabase();
  console.log('Database reset complete.');
}

module.exports = {
  query,
  initializeDatabase,
  resetDatabase
};
