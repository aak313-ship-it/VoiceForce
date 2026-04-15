const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /fragments — list all writer fragments (for the UI writer card grid)
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, slug, name, era, style_summary FROM writer_fragments ORDER BY name ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('List fragments error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
