import path from 'node:path';

// Load environment variables immediately on module import
try {
  process.loadEnvFile();
} catch {}
try {
  process.loadEnvFile(path.resolve(process.cwd(), '../.env'));
} catch {}
try {
  process.loadEnvFile(path.resolve(process.cwd(), '.env'));
} catch {}
