const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../db');
const { buildSystemPrompt, buildRewritePrompt } = require('../lib/prompts');

const router = express.Router();
const client = new Anthropic();

// POST /rewrite
// Streams the Claude response back as Server-Sent Events.
// Body: { profileId, text, tone?, writerSlugs? }
router.post('/', async (req, res) => {
  const { profileId, text, tone, writerSlugs } = req.body;

  if (!profileId) return res.status(400).json({ error: 'profileId is required.' });
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({ error: 'text is required.' });
  }
  if (writerSlugs !== undefined && (!Array.isArray(writerSlugs) || writerSlugs.length > 3)) {
    return res.status(400).json({ error: 'writerSlugs must be an array of up to 3 slugs.' });
  }

  try {
    // Fetch voice profile — must be analysed before rewriting
    const { rows: profiles } = await pool.query(
      'SELECT id, name, description, characteristics FROM voice_profiles WHERE id = $1',
      [profileId]
    );

    if (profiles.length === 0) return res.status(404).json({ error: 'Voice profile not found.' });

    const profile = profiles[0];
    if (!profile.characteristics) {
      return res.status(400).json({ error: 'Profile has not been analysed yet. Upload samples and run analyse first.' });
    }

    // Fetch writer influence fragments if requested
    let writerFragments = [];
    if (writerSlugs && writerSlugs.length > 0) {
      const placeholders = writerSlugs.map((_, i) => `$${i + 1}`).join(',');
      const { rows } = await pool.query(
        `SELECT name, influence_prompt FROM writer_fragments WHERE slug IN (${placeholders})`,
        writerSlugs
      );
      writerFragments = rows;
    }

    const systemPrompt = buildSystemPrompt(profile, writerFragments, tone || '');
    const userMessage = buildRewritePrompt(text.trim(), tone || '');

    // ── Server-Sent Events headers ──────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let fullText = '';

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const token = chunk.delta.text;
        fullText += token;
        sendEvent('token', { token });
      }
    }

    // Persist the completed rewrite
    const { rows: saved } = await pool.query(
      `INSERT INTO rewrite_jobs (profile_id, source_text, rewritten_text, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, created_at`,
      [profileId, text.trim(), fullText]
    );

    sendEvent('done', { jobId: saved[0].id });
    res.end();
  } catch (err) {
    console.error('Rewrite error:', err);
    // If headers not sent yet, send JSON error; otherwise send SSE error event
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// GET /rewrite/history/:profileId — last 10 rewrite jobs for a profile
router.get('/history/:profileId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, source_text, rewritten_text, created_at
       FROM rewrite_jobs
       WHERE profile_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [req.params.profileId]
    );
    res.json(rows);
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
