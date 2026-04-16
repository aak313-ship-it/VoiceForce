/**
 * Format instructions for each tone preset.
 * These tell Claude HOW to restructure the content, not just the voice to use.
 */
const FORMAT_INSTRUCTIONS = {
  'LinkedIn post': `
<format>
Restructure this as a LinkedIn post:
- Open with a single punchy hook sentence (no "I am excited to share" openers)
- 3-5 short paragraphs, each making one point
- Use line breaks generously — LinkedIn readers scan, not read
- End with a reflective question or a direct call to action
- No hashtags unless the writer's voice naturally includes them
- Target length: 150-300 words
</format>`,

  'Twitter/X thread': `
<format>
Restructure this as a Twitter/X thread:
- Start with a standalone hook tweet that works without context (Tweet 1)
- Number each tweet: 1/, 2/, 3/ etc.
- Each tweet must be under 280 characters including the number
- One idea per tweet — no cramming
- Last tweet should be a summary or call to action
- Target: 5-10 tweets
</format>`,

  'professional email': `
<format>
Restructure this as a professional email:
- First line: Subject: [concise subject line]
- Leave a blank line, then start the body
- Short opening that states the purpose in one sentence
- Middle: the substance, broken into short paragraphs
- Clear closing with a specific next step or ask
- Sign-off: Best, / Thanks, / Regards, — then the writer's name placeholder [Name]
- No bullet points unless absolutely necessary
</format>`,

  'blog post': `
<format>
Restructure this as a blog post:
- Open with a hook — a story, a surprising fact, or a direct challenge
- Use subheadings (## style) to break up sections
- Each section should make one clear argument or point
- Vary paragraph length — short punchy ones after longer ones
- End with a clear takeaway or conclusion
- Target length: preserve the depth of the original
</format>`,

  'formal report': `
<format>
Restructure this as a formal report:
- Begin with a one-paragraph executive summary
- Use clear section headings
- Write in third person, no contractions
- Use precise, specific language — no filler phrases
- Bullet points are acceptable for lists of 3 or more items
- End with a conclusions or recommendations section
</format>`,
};

/**
 * Build the system prompt for rewriting in a user's voice,
 * optionally blending in named writer influences and format instructions.
 *
 * @param {Object} profile        - voice_profiles row (characteristics is a parsed JSON object)
 * @param {Array}  writerFragments - array of writer_fragments rows (may be empty)
 * @param {string} tone           - selected tone/format preset key (may be empty)
 */
function buildSystemPrompt(profile, writerFragments = [], tone = '') {
  const voiceJson = JSON.stringify(profile.characteristics || {}, null, 2);

  let influencesBlock = '';
  if (writerFragments.length > 0) {
    const list = writerFragments
      .map((w) => `### ${w.name}\n${w.influence_prompt}`)
      .join('\n\n');

    influencesBlock = `
<style_influences>
The writer has chosen to borrow specific techniques from these writers.
Apply ONLY the listed techniques — do not adopt their subject matter or persona.

${list}
</style_influences>`;
  }

  // Inject format block if the tone matches a preset
  const formatBlock = FORMAT_INSTRUCTIONS[tone] || '';

  return `You are a personal writing editor. Rewrite AI-generated drafts so they sound like the specific human writer described below.

<voice_profile>
${voiceJson}
</voice_profile>
${influencesBlock}${formatBlock}
RULES:
1. Preserve all facts and meaning exactly.
2. Match sentence rhythm, paragraph density, and vocabulary from the voice profile.
3. Apply personality_markers naturally — not in every sentence.
4. Avoid every pattern in what_to_avoid.
5. Never use em dashes (—). Rewrite any sentence that would naturally use one using a period, comma, or restructured phrasing instead.
6. If a <format> block is present, restructure the content to fit that format while keeping the voice.
7. Return ONLY the rewritten text, no explanation.`;
}

/**
 * Build the user message containing the text to rewrite.
 * @param {string} text - source text
 * @param {string} [tone] - tone label (used for context, format is handled in system prompt)
 */
function buildRewritePrompt(text, tone = '') {
  const toneNote = tone ? `\nTone: ${tone}` : '';
  return `Rewrite the following text in the voice described above.${toneNote}\n\n${text}`;
}

/**
 * System prompt for the voice analysis endpoint.
 * Instructs Claude to return a strict JSON voice profile.
 */
const ANALYSIS_SYSTEM_PROMPT = `You are a writing style analyst. Extract a structured Voice Profile from writing samples. Analyze ONLY style, not content.

Return a JSON object with exactly these fields:
{
  "sentence_rhythm": "short and punchy / long and flowing / mixed",
  "avg_sentence_length": <number of words>,
  "paragraph_density": "tight (1-2 sentences) / medium (3-5) / expansive (6+)",
  "formality": "casual / semi-formal / formal / academic",
  "punctuation_style": "describe tendencies",
  "vocabulary_level": "accessible / intermediate / advanced / technical",
  "transition_style": "explicit / implicit / abrupt",
  "hedging": "high / medium / low",
  "voice": "first-person / second-person / third-person / mixed",
  "personality_markers": ["3-5 distinctive patterns"],
  "what_to_avoid": ["3-5 patterns absent from this writer"],
  "one_sentence_summary": "single sentence describing overall voice"
}

Output ONLY valid JSON. No preamble, no markdown fences.`;

/**
 * Build the user message for the analysis call.
 * @param {string} sampleText - combined extracted text from uploaded samples
 */
function buildAnalysisPrompt(sampleText) {
  return `Analyse the writing style of the following text and return the structured Voice Profile JSON.\n\nText:\n${sampleText}`;
}

module.exports = { buildSystemPrompt, buildRewritePrompt, buildAnalysisPrompt, ANALYSIS_SYSTEM_PROMPT, FORMAT_INSTRUCTIONS };
