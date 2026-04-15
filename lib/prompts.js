/**
 * Build the system prompt for rewriting in a user's voice,
 * optionally blending in named writer influences.
 *
 * @param {Object} profile       - voice_profiles row (characteristics is a parsed JSON object)
 * @param {Array}  writerFragments - array of writer_fragments rows (may be empty)
 */
function buildSystemPrompt(profile, writerFragments = []) {
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

  return `You are a personal writing editor. Rewrite AI-generated drafts so they sound like the specific human writer described below.

<voice_profile>
${voiceJson}
</voice_profile>
${influencesBlock}
RULES:
1. Preserve all facts and meaning exactly.
2. Match sentence rhythm, paragraph density, and vocabulary from the voice profile.
3. Apply personality_markers naturally — not in every sentence.
4. Avoid every pattern in what_to_avoid.
5. Never use em dashes (—). Rewrite any sentence that would naturally use one using a period, comma, or restructured phrasing instead.
6. Return ONLY the rewritten text, no explanation.`;
}

/**
 * Build the user message containing the text to rewrite.
 * @param {string} text - source text
 * @param {string} [tone] - optional tone instruction e.g. "casual LinkedIn post"
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

module.exports = { buildSystemPrompt, buildRewritePrompt, buildAnalysisPrompt, ANALYSIS_SYSTEM_PROMPT };
