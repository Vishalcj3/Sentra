// geminiClient.js
// Thin wrapper around Gemini. The rest of the codebase never touches the
// SDK directly — swap MODEL_NAME or provider here only, in one place.

const { GoogleGenerativeAI } = require("@google/generative-ai");

const API_KEY = process.env.GEMINI_API_KEY; // set via `firebase functions:config` or .env
const MODEL_NAME = "gemini-2.0-flash";       // 2x faster than 1.5-flash, same quality for safety checks

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

/**
 * RAG-grounded reasoning call.
 *
 * The model is explicitly instructed to ground its verdict ONLY in the
 * retrieved knowledge block and to CITE the numbered sources it relied on,
 * so the frontend can show "reasoning + which evidence backed it".
 *
 * @param {string} contextBlock  patient context + retrieved knowledge (from rag.js)
 * @param {string} task          plain-language instruction
 * @returns {Promise<{ reasoning: string, result: object, citations: number[] }>}
 */
async function reasonAndAnswer(contextBlock, task) {
  const prompt = `You are a clinical safety assistant supporting (not replacing) a doctor or pharmacist.

You must ground your analysis ONLY in the RETRIEVED CLINICAL KNOWLEDGE provided
below. Do not invent interactions that are not supported by the retrieved items.
If the retrieved knowledge does not cover a concern, say so explicitly rather than
guessing. When you rely on a specific retrieved item, cite it by its bracket number.

${contextBlock}

=== TASK ===
${task}

Think step by step. First, list each candidate concern you should check (interactions,
allergy conflicts, duplicate therapy, polypharmacy, dose/renal/hepatic cautions).
Then evaluate each against the retrieved knowledge, citing the [n] item that supports it.
Then form a conclusion.

Respond ONLY with valid JSON, no markdown fences, in this exact shape:
{
  "reasoning": "<step-by-step reasoning as plain text, 3-6 sentences, citing [n] items inline>",
  "result": {
    "status": "clear" | "flagged",
    "interactions": ["<short description of each flagged issue>"],
    "severity": "none" | "minor" | "moderate" | "severe"
  },
  "citations": [<bracket numbers of retrieved items you actually relied on>]
}`;

  const response = await model.generateContent(prompt);
  const text = response.response.text().trim();
  const cleaned = text.replace(/^```json\s*|```$/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      reasoning: parsed.reasoning,
      result: parsed.result,
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
    };
  } catch (err) {
    // Fallback so a malformed model response never crashes the demo.
    return {
      reasoning: "Model response could not be parsed. Raw output: " + text.slice(0, 300),
      result: {
        status: "flagged",
        interactions: ["Unable to verify automatically — manual review required."],
        severity: "moderate",
      },
      citations: [],
    };
  }
}

const HERMES_SYSTEM = `You are Hermes, a warm, concise assistant inside the Sentra health app.
You help a patient with THEIR OWN prescriptions, appointments, reminders, and
adherence (the PATIENT CONTEXT), and you may explain general medication facts
drawn from the RETRIEVED CLINICAL KNOWLEDGE. Rules:
- For anything personal (their meds, doses, appointments, how they've been doing),
  answer only from PATIENT CONTEXT. If it isn't there, say you don't have it.
- For general drug facts (what a drug is for, common interactions, how to take it),
  use ONLY the RETRIEVED CLINICAL KNOWLEDGE and cite the items you use as [n].
  If the knowledge doesn't cover it, say so — don't guess.
- You are NOT a doctor. Don't diagnose, change a dose, or tell them to stop a drug.
  For those decisions, tell them to contact their doctor or pharmacist.
- If they describe an emergency, tell them to call their local emergency number now.
- Be brief and kind.`;

/**
 * Multi-turn patient chat, grounded in the patient's own record (patientContext)
 * and optional retrieved clinical knowledge (knowledgeContext, from rag.js).
 *
 * @param {object}   args
 * @param {string}   args.patientContext     JSON string of the patient's record
 * @param {string}  [args.knowledgeContext]  RAG clinical-knowledge block (cited as [n])
 * @param {Array}    args.history            prior turns [{ role: "user"|"assistant", content }]
 * @param {string}   args.userMessage        the latest user message
 * @returns {Promise<string>} the assistant reply text
 */
async function chatReply({ patientContext, knowledgeContext, history, userMessage }) {
  const systemInstruction = [
    HERMES_SYSTEM,
    `=== PATIENT CONTEXT ===\n${patientContext}`,
    knowledgeContext
      ? `=== RETRIEVED CLINICAL KNOWLEDGE (cite [n] when you use it) ===\n${knowledgeContext}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const chatModel = genAI.getGenerativeModel({ model: MODEL_NAME, systemInstruction });
  const chat = chatModel.startChat({
    history: (history || []).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  });
  const res = await chat.sendMessage(userMessage);
  return res.response.text().trim();
}

module.exports = { reasonAndAnswer, chatReply };
