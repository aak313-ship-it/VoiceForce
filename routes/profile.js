const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../db');
const { buildAnalysisPrompt, ANALYSIS_SYSTEM_PROMPT } = require('../lib/prompts');

const client = new Anthropic();
const router = express.Router();

// GET /profiles — list all voice profiles
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, description, characteristics, created_at FROM voice_profiles ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('List profiles error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /profiles/:id — get a single profile with its samples
router.get('/:id', async (req, res) => {
  try {
    const { rows: profiles } = await pool.query(
      'SELECT id, name, description, characteristics, created_at FROM voice_profiles WHERE id = $1',
      [req.params.id]
    );

    if (profiles.length === 0) {
      return res.status(404).json({ error: 'Profile not found.' });
    }

    const { rows: samples } = await pool.query(
      'SELECT id, filename, mimetype, created_at FROM voice_samples WHERE profile_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    res.json({ ...profiles[0], samples });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /profiles — create a new voice profile
router.post('/', async (req, res) => {
  const { name, description } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name is required.' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO voice_profiles (name, description, created_at)
       VALUES ($1, $2, NOW())
       RETURNING id, name, description, characteristics, created_at`,
      [name.trim(), description || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /profiles/:id — update name / description
router.patch('/:id', async (req, res) => {
  const { name, description } = req.body;

  const fields = [];
  const values = [];
  let idx = 1;

  if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
  if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update.' });
  }

  values.push(req.params.id);

  try {
    const { rows } = await pool.query(
      `UPDATE voice_profiles SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, name, description, characteristics, created_at`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found.' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /profiles/:id/analyse
// Reads all uploaded samples, calls Claude with the structured analysis prompt,
// parses the returned JSON, and stores it as JSONB in voice_profiles.characteristics.
router.post('/:id/analyse', async (req, res) => {
  try {
    const { rows: profiles } = await pool.query(
      'SELECT id, name FROM voice_profiles WHERE id = $1',
      [req.params.id]
    );

    if (profiles.length === 0) {
      return res.status(404).json({ error: 'Profile not found.' });
    }

    const { rows: samples } = await pool.query(
      'SELECT extracted_text FROM voice_samples WHERE profile_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    if (samples.length === 0) {
      return res.status(400).json({ error: 'Upload at least one writing sample before analysing.' });
    }

    // Combine samples, capped at ~12 000 chars to stay within token budget
    let combined = '';
    for (const s of samples) {
      if (combined.length >= 12000) break;
      combined += s.extracted_text.slice(0, 12000 - combined.length) + '\n\n';
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildAnalysisPrompt(combined.trim()) }],
    });

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    // Parse and validate — Claude must return pure JSON per the system prompt
    let characteristics;
    try {
      characteristics = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'Claude returned invalid JSON.', raw });
    }

    const { rows: updated } = await pool.query(
      `UPDATE voice_profiles SET characteristics = $1 WHERE id = $2
       RETURNING id, name, description, characteristics, created_at`,
      [JSON.stringify(characteristics), req.params.id]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Analyse error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /profiles/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM voice_profiles WHERE id = $1',
      [req.params.id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Profile not found.' });
    }

    res.status(204).end();
  } catch (err) {
    console.error('Delete profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
