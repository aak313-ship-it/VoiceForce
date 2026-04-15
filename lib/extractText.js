const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const cheerio = require('cheerio');
const stripMarkdown = require('strip-markdown');
const { remark } = require('remark');
const path = require('path');

async function extractText(buffer, mimetype, originalname) {
  const ext = path.extname(originalname).toLowerCase();

  if (mimetype === 'application/pdf' || ext === '.pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  if (mimetype === 'text/html' || ext === '.html' || ext === '.htm') {
    const $ = cheerio.load(buffer.toString('utf8'));
    $('script, style').remove();
    return $.text().replace(/\s+/g, ' ').trim();
  }

  if (mimetype === 'text/markdown' || ext === '.md') {
    const file = await remark().use(stripMarkdown).process(buffer.toString('utf8'));
    return String(file);
  }

  if (mimetype === 'text/plain' || ext === '.txt') {
    return buffer.toString('utf8');
  }

  throw new Error(`Unsupported file type: ${mimetype || ext}`);
}

module.exports = { extractText };
