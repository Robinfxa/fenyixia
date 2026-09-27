import duckdb from 'duckdb';

const db = new duckdb.Database(':memory:');
const conn = db.connect();

async function runTest() {
  console.log('Testing DuckDB connection, tables, and parameterized queries...');
  
  await new Promise<void>((resolve, reject) => {
    conn.run('CREATE TABLE users (id VARCHAR PRIMARY KEY, name VARCHAR, email VARCHAR UNIQUE)', (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  await new Promise<void>((resolve, reject) => {
    conn.run('INSERT INTO users VALUES (?, ?, ?)', 'u1', 'Alice', 'alice@test.com', (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  const rows = await new Promise<any[]>((resolve, reject) => {
    conn.all('SELECT * FROM users WHERE email = ?', 'alice@test.com', (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });

  console.log('Found user:', rows);

  // Test transaction
  await new Promise<void>((resolve, reject) => {
    conn.run('BEGIN TRANSACTION', (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  await new Promise<void>((resolve, reject) => {
    conn.run('INSERT INTO users VALUES (?, ?, ?)', 'u2', 'Bob', 'bob@test.com', (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  await new Promise<void>((resolve, reject) => {
    conn.run('COMMIT', (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  const allUsers = await new Promise<any[]>((resolve, reject) => {
    conn.all('SELECT * FROM users', (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });

  console.log('All users after transaction:', allUsers);
  console.log('Everything works perfectly!');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
