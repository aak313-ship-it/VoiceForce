const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../db');

const router = express.Router();
const client = new Anthropic();

// GET /fragments — list all writer fragments
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

// POST /fragments — create a new writer influence
// Body: { name, era?, sampleText }
// Claude generates the style_summary and influence_prompt from sampleText
router.post('/', async (req, res) => {
  const { name, era, sampleText } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name is required.' });
  }
  if (!sampleText || typeof sampleText !== 'string' || sampleText.trim() === '') {
    return res.status(400).json({ error: 'sampleText is required.' });
  }

  try {
    // Ask Claude to generate a style summary and influence prompt from the sample
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: `You are a writing style analyst. Given sample text from a specific writer, generate two things:
1. A "style_summary": one short sentence (under 12 words) capturing their most distinctive trait.
2. An "influence_prompt": 3-5 sentences of concrete writing technique instructions a ghostwriter could follow to borrow this person's style. Focus on sentence structure, tone, vocabulary, rhythm, and punctuation habits. No em dashes.

Return ONLY valid JSON in this exact shape:
{"style_summary": "...", "influence_prompt": "..."}
No markdown fences, no preamble.`,
      messages: [{
        role: 'user',
        content: `Writer name: ${name.trim()}\n\nSample text:\n${sampleText.trim().slice(0, 6000)}`,
      }],
    });

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    let generated;
    try {
      generated = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: 'Claude returned invalid JSON.', raw });
    }

    // Create a URL-safe slug from the name
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      + '-' + Date.now();

    const { rows } = await pool.query(
      `INSERT INTO writer_fragments (slug, name, era, style_summary, influence_prompt)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, slug, name, era, style_summary`,
      [slug, name.trim(), era?.trim() || null, generated.style_summary, generated.influence_prompt]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create fragment error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /fragments/:id — remove a writer influence
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM writer_fragments WHERE id = $1',
      [req.params.id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Writer fragment not found.' });
    }

    res.status(204).end();
  } catch (err) {
    console.error('Delete fragment error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
