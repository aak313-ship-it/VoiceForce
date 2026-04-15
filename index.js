require('dotenv').config();

const express = require('express');
const path = require('path');
const app = express();

const uploadRouter = require('./routes/upload');
const profileRouter = require('./routes/profile');
const rewriteRouter = require('./routes/rewrite');
const fragmentsRouter = require('./routes/fragments');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/upload', uploadRouter);
app.use('/profiles', profileRouter);
app.use('/rewrite', rewriteRouter);
app.use('/fragments', fragmentsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VoiceForge listening on port ${PORT}`);
});
