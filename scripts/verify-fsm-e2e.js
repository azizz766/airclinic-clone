require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const phone = '+966504121721';
  const clinicId = 'cmnkmp2h40000dq9kj4vgb2tu';

  const sess = await pool.query(
    'SELECT id, "currentState", "previousState", "expiresAt", "createdAt" FROM conversation_sessions WHERE "phoneNumber" = $1 AND "clinicId" = $2 ORDER BY "createdAt" DESC LIMIT 3',
    [phone, clinicId]
  );
  console.log('=== ConversationSessions ===');
  console.log(JSON.stringify(sess.rows, null, 2));

  if (sess.rows[0]) {
    const sid = sess.rows[0].id;

    const msgs = await pool.query(
      'SELECT id, role, "twilioMessageSid", "sessionStateAtSend", "createdAt" FROM conversation_messages WHERE "sessionId" = $1 ORDER BY "createdAt" DESC LIMIT 5',
      [sid]
    );
    console.log('=== ConversationMessages ===');
    console.log(JSON.stringify(msgs.rows, null, 2));

    const logs = await pool.query(
      'SELECT id, "fromState", "toState", "triggerType", "createdAt" FROM state_transition_logs WHERE "sessionId" = $1 ORDER BY "createdAt" DESC LIMIT 5',
      [sid]
    );
    console.log('=== StateTransitionLogs ===');
    console.log(JSON.stringify(logs.rows, null, 2));
  }

  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
