require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const phone = '+966599994144';
  const clinicId = 'cmnkmp2h40000dq9kj4vgb2tu';
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const existing = await pool.query(
    'SELECT * FROM conversation_sessions WHERE "phoneNumber" = $1 AND "clinicId" = $2',
    [phone, clinicId]
  );
  console.log('Existing sessions:', existing.rows.length);

  if (existing.rows.length === 0) {
    const id = 'test_sess_' + Date.now();
    try {
      await pool.query(
        'INSERT INTO conversation_sessions (id, "clinicId", "phoneNumber", "currentState", "detectedLanguage", "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
        [id, clinicId, phone, 'IDLE', 'UNKNOWN', expiresAt]
      );
      console.log('Direct SQL insert succeeded:', id);
    } catch (err) {
      console.error('Direct SQL insert failed:', err.message);
    }
  } else {
    console.log('Session already exists:', existing.rows[0].id, existing.rows[0].currentState);
  }

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
