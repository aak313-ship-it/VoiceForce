const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { extractText } = require('../lib/extractText');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/html',
      'text/markdown',
      'text/plain',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// POST /upload/:profileId  — attach one or more sample files to a voice profile
router.post('/:profileId', upload.array('files', 20), async (req, res) => {
  const { profileId } = req.params;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded.' });
  }

  try {
    const results = [];

    for (const file of req.files) {
      const text = await extractText(file.buffer, file.mimetype, file.originalname);

      const { rows } = await pool.query(
        `INSERT INTO voice_samples (profile_id, filename, mimetype, extracted_text, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, filename, created_at`,
        [profileId, file.originalname, file.mimetype, text]
      );

      results.push(rows[0]);
    }

    res.status(201).json({ uploaded: results });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /upload/:profileId/text — save pasted text directly as a voice sample
router.post('/:profileId/text', async (req, res) => {
  const { profileId } = req.params;
  const { text, label } = req.body;

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({ error: 'text is required.' });
  }

  try {
    const filename = (label && label.trim()) ? label.trim() : `Pasted text ${new Date().toLocaleDateString()}`;

    const { rows } = await pool.query(
      `INSERT INTO voice_samples (profile_id, filename, mimetype, extracted_text, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, filename, created_at`,
      [profileId, filename, 'text/plain', text.trim()]
    );

    res.status(201).json({ uploaded: [rows[0]] });
  } catch (err) {
    console.error('Paste upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
