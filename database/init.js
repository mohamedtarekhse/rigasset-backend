// database/init.js – Creates DB and runs schema + seed
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function init() {
  // Connect to default 'postgres' DB to create our database
  const adminClient = new Client({
    host:     process.env.DB_HOST || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    user:     process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: 'postgres',
  });

  try {
    await adminClient.connect();
    const dbName = process.env.DB_NAME || 'rigasset_db';

    // Create database if it doesn't exist
    const exists = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]
    );
    if (exists.rows.length === 0) {
      await adminClient.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Database "${dbName}" created`);
    } else {
      console.log(`ℹ️  Database "${dbName}" already exists`);
    }
    await adminClient.end();

    // Now connect to our DB and run schema
    const appClient = new Client({
      host:     process.env.DB_HOST || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432'),
      user:     process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: dbName,
    });
    await appClient.connect();

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await appClient.query(schema);
    console.log('✅ Schema applied');

    const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    await appClient.query(seed);
    console.log('✅ Seed data inserted');

    await appClient.end();
    console.log('\n🚀 Database ready! Run: npm run dev');
  } catch (err) {
    console.error('❌ Init error:', err.message);
    process.exit(1);
  }
}

init();
