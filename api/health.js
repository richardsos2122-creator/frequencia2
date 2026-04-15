import { testConnection } from '../backend/config/db.js';

export default async function handler(_req, res) {
  try {
    await testConnection();
    res.status(200).json({ status: 'ok', db: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', db: 'disconnected', detail: error.message });
  }
}
