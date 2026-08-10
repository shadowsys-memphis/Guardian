import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sessions = await pool.query(`SELECT conversation_id, session_date, elevenlabs_conversation_id, reached, summary, id, ended_at FROM call_sessions ORDER BY id DESC LIMIT 5`);
console.log(JSON.stringify(sessions.rows, null, 2));
await pool.end();
