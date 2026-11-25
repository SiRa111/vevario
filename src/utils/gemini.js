/**
 * Utility methods for interacting directly with Gemini Flash API
 * entirely client-side, using the candidate's custom API key.
 */

const GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-pro"
];

/**
 * Common fetch helper for Gemini API with multi-model fallback resilience
 */
async function callLocalFallback(payload, apiKey = "") {
  const systemInstruction = payload.systemInstruction?.parts?.[0]?.text || "";
  let modelTurns = 0;
  let totalCount = 5;

  if (Array.isArray(payload.contents)) {
    modelTurns = payload.contents.filter(msg => msg.role === 'model').length;
    const match = systemInstruction.match(/Total Target Question Count:\s*(\d+)/);
    totalCount = match ? parseInt(match[1], 10) : 5;
  }

  // Attempt local server if active
  try {
    const localUrl = "http://127.0.0.1:5000/api/generate";
    const localRes = await fetch(localUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        system_instruction: systemInstruction,
        chat_history: Array.isArray(payload.contents) ? payload.contents : [],
        model_turns: modelTurns,
        total_count: totalCount
      })
    });

    if (localRes.ok) {
      const data = await localRes.json();
      if (data.text) return data.text;
    }
  } catch(e) {}

  // Smart client-side emergency fallback
  return "Could you elaborate on the architecture of one of the core projects mentioned on your resume, specifically the design patterns and data structures you chose?";
}

async function callGemini(apiKey, payload) {
  let lastError = null;

  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return text;
        }
      }

      if (response.status === 429 || response.status === 503) {
        console.warn(`[Gemini] Model ${model} quota/rate limit hit (HTTP ${response.status}). Trying next model...`);
        lastError = new Error(`Quota limit on ${model}`);
        continue;
      }

      const errorData = await response.json().catch(() => ({}));
      const message = errorData?.error?.message || `HTTP error! status: ${response.status}`;
      if (message.toLowerCase().includes("quota") || message.toLowerCase().includes("limit") || message.toLowerCase().includes("exhausted")) {
        console.warn(`[Gemini] Model ${model} quota exhausted. Trying next model...`);
        lastError = new Error(message);
        continue;
      }

      lastError = new Error(message);
    } catch (netErr) {
      console.warn(`[Gemini] Network error on model ${model}:`, netErr);
      lastError = netErr;
    }
  }

  // If all models exhausted, use fallback
  console.warn("[Gemini] All models exhausted or blocked, running fallback question generator...");
  return callLocalFallback(payload, apiKey);
}

/**
 * Builds the system instruction prompt based on the candidate's interview configuration.
 */
function buildSystemInstruction(sessionContext) {
  const { resumeText, topics, difficulty, questionCount } = sessionContext;

  const difficultyGuidelines = {
    "Junior (Easy)": `
- Scope: Core syntax, basic OOP concepts, fundamental data structures (arrays, hash maps, simple lists), and fundamental databases queries (CRUD).
- Tone: Supportive, encouraging, looking for solid foundational understandings.
- Expectations: Simple code solutions, clean code style, and straightforward explanations. Avoid advanced patterns or high-scale system designs.`,
    "Mid-Level (Medium)": `
- Scope: System design basics (REST API design, database schemas, primary/foreign keys), caching basics, database indexing, design patterns, profiling, and mid-level algorithms.
- Tone: Pragmatic, professional, examining engineering trade-offs and code structure.
- Expectations: Understanding of performance tradeoffs (e.g. time vs space complexity, index read vs write penalties), solid refactoring habits, and realistic estimations.`,
    "Senior (Hard)": `
- Scope: Distributed systems principles, advanced concurrency, scaling bottlenecks (replication, sharding, message queues), high availability (load balancers, CDN), and deep algorithmic tradeoffs.
- Tone: Rigorous, analytical, challenging assumptions and probing deep on technical choices.
- Expectations: Justifying technology selections (e.g., choosing SQL vs NoSQL, pub/sub engines), addressing race conditions, database transaction isolations, and designing resilient system boundaries.`,
    "Lead/Staff (Expert)": `
- Scope: Global-scale architecture design, cross-system failure domains, microservice boundaries, consensus protocols (Raft/Paxos), trade-offs in distributed data consistency (CAP/PACELC), organizational alignment, and engineering team leadership.
- Tone: Elite technical partner, discussing strategic and architectural compromises, long-term trade-offs, and critical system safety.
- Expectations: Deep mastery of performance optimization, defining metrics, risk analysis, mitigation of system-wide cascade failures, and mentoring-level communication.`
  };

  const difficultyPrompt = difficultyGuidelines[difficulty] || difficultyGuidelines["Mid-Level (Medium)"];

  const isCodingDSA = topics.some(t => t.toLowerCase().includes('coding') || t.toLowerCase().includes('dsa') || t.toLowerCase().includes('algorithm'));

  let codingModeInstruction = "";
  if (isCodingDSA) {
    codingModeInstruction = `
SPECIAL RULES FOR CODING (DSA) TOPICS:
- Question 1 must be a detailed DSA coding problem description formatted in rich Markdown.
  - It must have a clean title (e.g. "# Two Sum" or "# Longest Substring Without Repeating Characters").
  - Describe the problem clearly, referencing variable names in backticks.
  - Include at least two structured Example blocks using the prefix "### Example 1:" and listing "Input: ...", "Output: ...", and optionally "Explanation: ...".
  - Include a "### Constraints:" section listing the algorithmic limits using mathematical formatting (e.g. \`10^4\`, \`2^31 - 1\`, \`<=\`, \`>=\`).
  - DO NOT restrict the length of Question 1. It must be a complete LeetCode-style specification.
- Subsequent questions (Question 2, Question 3, etc.) must be CONCISED conversational follow-ups about their code submission. They must remain 1 to 3 sentences maximum, conversational, spoken-ready, and contain NO markdown headings, lists, or code blocks.`;
  }

  return `You are an elite Senior Principal Software Engineer and Technical Recruiter conducting a live mock interview.

INTERVIEW DETAILS:
- Candidate's Resume Details: ${resumeText}
- Focus Topics Selected: ${topics.join(", ")}
- Calibrated Difficulty Level: ${difficulty}
- Total Target Question Count: ${questionCount}

CALIBRATION FOCUS FOR THIS INTERVIEW:
${difficultyPrompt}
${codingModeInstruction}

INSTRUCTIONS FOR THE INTERVIEW LOOP:
1. Ask exactly ONE question at a time.
2. For all conversational/non-coding questions (and coding follow-ups), keep your replies concise, conversational, and direct (1 to 3 sentences maximum), because your responses will be read aloud by a Text-To-Speech synthesizer. Do NOT write markdown headings, bulleted lists, or code blocks in these questions.
3. Incorporate technical problems, behavioral scenarios (STAR method), and design discussions.
4. Topics Distribution: Evenly rotate and cover the selected topics (${topics.join(", ")}) across the session. Do not keep asking about the same topic.
5. Resume-Based Questions (CRITICAL):
   - You MUST ground all conversational questions directly in the candidate's actual resume (e.g., their specific projects, roles, companies, tools, and experiences).
   - Rather than asking generic questions about the selected focus topics, look for relevant experiences or technologies listed on their resume and formulate questions based on those specific items, aligning them with the selected focus topics.
   - For example, if the topic is 'Databases' and their resume mentions 'PostgreSQL at Company X', ask a database design, scaling, or optimization question specific to their PostgreSQL usage at Company X.
   - If a topic is selected that is not explicitly present on the resume, ask how they would apply that topic to one of the projects or roles listed on their resume.
   - Every single question (except the first coding DSA challenge, if coding is selected) must explicitly reference a specific project, company, role, or technology mentioned in their resume.
6. Behavioral Focus: If "Behavioral (STAR)" is in the topic list, formulate situational questions (e.g., "Tell me about a time you resolved a major bug under pressure...") to test their Situation, Task, Action, and Result coverage, based on their resume experiences.
7. Before asking the next question, briefly comment on their previous answer in 1 sentence. (For example, "That is a correct analysis of read-heavy caching, but note the eviction overhead. Question 2 of 5: ...")
8. ALWAYS prefix your response with "Question X of Y: " to indicate the current state (e.g., "Question 1 of 5: ...").`;
}

/**
 * Validates if the text is a resume/CV.
 * 
 * @param {string} apiKey - Gemini API Key
 * @param {string} text - The resume text to validate
 * @returns {Promise<{ isResume: boolean, reason: string }>}
 */
export async function validateResume(apiKey, text) {
  const checkHeuristics = (txt) => {
    const lowerText = txt.toLowerCase();
    const keywords = ['experience', 'work', 'education', 'skills', 'projects', 'history', 'employment', 'cv', 'resume', 'contact', 'email', 'phone'];
    const matchCount = keywords.filter(keyword => lowerText.includes(keyword)).length;
    return matchCount >= 2;
  };

  if (apiKey === 'LOCAL_FALLBACK') {
    if (checkHeuristics(text)) {
      return { isResume: true, reason: "Local validation passed (keywords found)." };
    } else {
      return { isResume: false, reason: "Local validation failed (could not identify typical resume sections like work experience, education, or skills)." };
    }
  }

  const prompt = `Analyze the following text and determine if it represents a professional resume or curriculum vitae (CV). A resume typically contains sections like work experience, education, skills, contact information, or projects.

Text to analyze:
"""
${text.substring(0, 4000)}
"""

Respond ONLY with a JSON object matching this schema:
{
  "isResume": true, // or false
  "reason": "A short sentence explaining why it is or is not a resume (e.g. 'Found sections for Work Experience, Education, and Skills.' or 'The text appears to be a recipe rather than a resume.')"
}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 150,
    }
  };

  try {
    const rawJson = await callGemini(apiKey, payload);
    try {
      return JSON.parse(rawJson);
    } catch (err) {
      const cleaned = rawJson.replace(/```json/gi, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    }
  } catch (err) {
    console.warn("Gemini validation failed, falling back to heuristics:", err);
    if (checkHeuristics(text)) {
      return { isResume: true, reason: "Validation succeeded via client-side heuristics fallback." };
    } else {
      return { isResume: false, reason: "Document does not appear to be a valid resume (heuristics fallback failed)." };
    }
  }
}


/**
 * Gets the next interview question from Gemini.
 * 
 * @param {string} apiKey - Gemini API Key
 * @param {Object} sessionContext - { resumeText, topics, difficulty, questionCount }
 * @param {Array} chatHistory - Array of { role: 'user' | 'model', parts: [{ text }] }
 * @returns {Promise<string>} - The next question
 */
export async function getNextQuestion(apiKey, sessionContext, chatHistory) {
  const systemInstruction = buildSystemInstruction(sessionContext);
  
  const payload = {
    contents: chatHistory,
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000,
    }
  };

  return callGemini(apiKey, payload);
}

/**
 * Requests a quick hint for the candidate on the current question.
 */
export async function getHint(apiKey, question, answerSoFar = "") {
  const prompt = `You are a helpful interviewer helper. The candidate is stuck on this question: "${question}".
Current answer draft: "${answerSoFar}".
Provide a very short, subtle, 1-sentence hint that guides them in the right direction without giving away the exact answer. Do not use code blocks.`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 100,
    }
  };

  return callGemini(apiKey, payload);
}

/**
 * Conducts the final structured evaluation of the entire interview conversation history.
 * 
 * @param {string} apiKey 
 * @param {Object} sessionContext 
 * @param {Array} chatHistory - Full history including all questions and answers
 * @returns {Promise<Object>} - Parsed JSON grade evaluation
 */
export async function getFinalEvaluation(apiKey, sessionContext, chatHistory) {
  // Extract genuine candidate answers: prioritize clean answersList, otherwise filter out system prompts from chatHistory
  const rawAnswers = (Array.isArray(sessionContext.answersList))
    ? sessionContext.answersList
    : (chatHistory || [])
        .filter(m => m.role === "user")
        .map(m => (m.parts?.[0]?.text || "").trim())
        .filter(t => !t.startsWith("Let's begin the mock interview") && !t.startsWith("Candidate has submitted the following code"));

  const modelQuestions = (Array.isArray(sessionContext.questionsList) && sessionContext.questionsList.length > 0)
    ? sessionContext.questionsList
    : (chatHistory || []).filter(m => m.role === "model").map(m => m.parts?.[0]?.text || "");

  const totalTargetCount = sessionContext.questionCount || Math.max(modelQuestions.length, 5);

  // Filter for genuine, substantive answers (not "idk", "skip", "bhul gaya", or blanks)
  const nonAnswerKeywords = [
    "idk", "i don't know", "i dont know", "no idea", "skip", "pass", 
    "bhul gaya", "bhul gai", "pata nahi", "pata nahin", "no response", 
    "quit", "exit", "dunno", "nothing"
  ];
  
  const validAnswers = rawAnswers.filter(ans => {
    const text = (ans || "").trim().toLowerCase();
    if (text.length < 15) return false;
    return !nonAnswerKeywords.some(kw => text.includes(kw) && text.length < 40);
  });

  // Strict Zero-answer check: If candidate answered 0 questions or gave only non-answers, score is strictly 0.
  if (rawAnswers.length === 0 || validAnswers.length === 0) {
    return {
      overallScore: 0,
      techScore: 0,
      commScore: 0,
      summary: `No technical answers were provided during this session on ${sessionContext.topics.join(", ")}. The candidate either ended the interview without answering or provided unresponsive replies. Complete all questions with technical depth to receive an objective evaluation.`,
      strengths: ["Session was initiated."],
      weaknesses: [
        "No substantive technical answers were provided for any question.",
        "Candidate did not demonstrate baseline technical proficiency or problem-solving methodology.",
        "Interview was exited prematurely or questions were left unattempted."
      ],
      questions: modelQuestions.map((qText, idx) => ({
        question: qText || `Question ${idx + 1}`,
        candidateAnswer: rawAnswers[idx] || "No response recorded.",
        idealAnswer: `A comprehensive technical response outlining architecture, performance bottlenecks, and design trade-offs.`,
        techEvaluation: "Question was unattempted or contained no technical content. 0/100 points.",
        commEvaluation: "No technical communication provided. 0/100 points.",
        starCheck: {
          applicable: false,
          situation: false,
          task: false,
          action: false,
          result: false
        }
      })),
      studyTopics: sessionContext.topics.map(t => ({
        topic: t,
        description: `Fundamental review required: study core principles, architectural patterns, and interview questions for ${t}.`,
        link: `https://www.google.com/search?q=${encodeURIComponent(t + " technical interview preparation guide")}`
      }))
    };
  }

  const prompt = `You are a strict, objective, and unbiased Principal Software Engineering Bar Raiser conducting an official technical evaluation of a mock interview.
Your job is to provide honest, realistic, and unvarnished grading. DO NOT flatter the candidate or inflate scores. We show candidates the unvarnished truth so they can genuinely improve.

CONVERSATION HISTORY:
${JSON.stringify(chatHistory, null, 2)}

INTERVIEW META:
- Focus Topics: ${sessionContext.topics.join(", ")}
- Target Difficulty: ${sessionContext.difficulty}
- Total Target Question Count: ${totalTargetCount}
- Questions Asked: ${modelQuestions.length}
- Answers Provided: ${validAnswers.length}
- Answers Provided: ${userMessages.length}

CRITICAL SCORING & INTEGRITY RULES:
1. PENALTY FOR UNANSWERED / SKIPPED QUESTIONS:
   - The candidate's target was ${totalTargetCount} questions. Any question that was not asked or not answered receives 0/100 points.
   - If the candidate answered only 1 out of 5 questions with an 80/100 answer, the overall technical score MUST be prorated: (80 + 0 + 0 + 0 + 0) / 5 = 16%.
2. NON-ANSWERS & GIBBERISH:
   - Phrases like "I don't know", "skip", "no idea", "bhul gaya", or irrelevant one-liners MUST receive 0 to 5 points.
   - Do NOT give points for merely typing or speaking without technical accuracy.
3. HARSH REALISTIC SCORING:
   - 0 - 20: Completely unattempted, wrong, or unresponsive.
   - 21 - 45: Superficial buzzwords, inaccurate definitions, or unable to explain basic principles.
   - 46 - 65: Basic textbook definition, but lacks practical depth, failure modes, or real engineering trade-offs.
   - 66 - 80: Solid mid-level explanation with correct concepts and understanding of trade-offs.
   - 81 - 100: Exceptional Senior/Staff level depth: covers architecture, latency, concurrency, edge cases, and scalability.
4. HONEST CRITIQUE:
   - If performance was poor, weaknesses MUST highlight the exact missing technical concepts.
   - DO NOT invent fake strengths like "Showed consistent engagement" if the candidate didn't answer all questions.

You MUST output your response in JSON format matching the schema below. Do not wrap the JSON in markdown code blocks. Return only the raw JSON.

JSON SCHEMA:
{
  "overallScore": <integer 0-100 calculated strictly as 0.7 * techScore + 0.3 * commScore>,
  "techScore": <integer 0-100 reflecting strict technical knowledge across all questions>,
  "commScore": <integer 0-100 reflecting clarity, structure, and communication>,
  "summary": "<Objective 2-3 sentence honest summary of candidate's actual performance>",
  "strengths": [
    "<Actual specific strength demonstrated, or 'None demonstrated' if poor/unanswered>"
  ],
  "weaknesses": [
    "<Specific technical gap 1>",
    "<Specific technical gap 2>"
  ],
  "questions": [
    {
      "question": "<Question text>",
      "candidateAnswer": "<What the candidate answered, or 'No response'>",
      "idealAnswer": "<What an expert response should cover>",
      "techEvaluation": "<Honest technical critique of this answer>",
      "commEvaluation": "<Honest delivery and structure critique>",
      "starCheck": {
        "applicable": false,
        "situation": false,
        "task": false,
        "action": false,
        "result": false
      }
    }
  ],
  "studyTopics": [
    {
      "topic": "<Specific topic to study>",
      "description": "<Why they need to study this based on their gaps>",
      "link": "<Educational search link>"
    }
  ]
}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 2500,
    }
  };

  const rawJson = await callGemini(apiKey, payload);
  try {
    return JSON.parse(rawJson);
  } catch (err) {
    console.warn("Failed to parse initial Gemini response, attempting cleanup:", err);
    try {
      const cleaned = rawJson
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      }
    } catch (cleanupErr) {
      console.error("Cleanup parsing failed as well:", cleanupErr);
    }

    // Mathematical fallback grade calculation when AI response is unavailable
    const totalCount = sessionContext.questionCount || Math.max(modelQuestions.length, 5);
    let techScoresList = [];
    let commScoresList = [];
    let fillerWordsTotal = 0;
    
    const evaluationQuestions = modelQuestions.map((qText, idx) => {
      const questionText = qText || `Question ${idx + 1}`;
      const answerText = rawAnswers[idx] || "";
      const cleanAnswer = answerText.trim();
      const lowerAns = cleanAnswer.toLowerCase();
      
      const isNonAnswer = !cleanAnswer || cleanAnswer.length < 15 || 
        nonAnswerKeywords.some(kw => lowerAns.includes(kw) && cleanAnswer.length < 40);

      // Filler words
      const fillerWordsRegex = /\b(um|uh|like|basically|actually|so|literally|you know)\b/gi;
      const fillerCount = (cleanAnswer.match(fillerWordsRegex) || []).length;
      fillerWordsTotal += fillerCount;
      
      let qTechScore = 0;
      let qCommScore = 0;

      if (!isNonAnswer) {
        if (cleanAnswer.length >= 250) {
          qTechScore = 75;
          qCommScore = Math.max(30, 80 - (fillerCount * 5));
        } else if (cleanAnswer.length >= 100) {
          qTechScore = 60;
          qCommScore = Math.max(30, 70 - (fillerCount * 5));
        } else {
          qTechScore = 40;
          qCommScore = 50;
        }
      }
      
      techScoresList.push(qTechScore);
      commScoresList.push(qCommScore);
      
      const lowerQ = questionText.toLowerCase();
      const isBehavioral = lowerQ.includes("tell me about") || 
                           lowerQ.includes("describe a time") || 
                           lowerQ.includes("describe a situation") ||
                           lowerQ.includes("star method") || 
                           lowerQ.includes("behavioral") ||
                           sessionContext.topics.some(t => t.toLowerCase().includes("behavioral"));
                           
      let starCheck = {
        applicable: isBehavioral,
        situation: isBehavioral && cleanAnswer.length > 20,
        task: isBehavioral && cleanAnswer.length > 50,
        action: isBehavioral && cleanAnswer.length > 100,
        result: isBehavioral && (lowerAns.includes("result") || lowerAns.includes("outcome") || lowerAns.includes("%") || lowerAns.includes("metric"))
      };
      
      return {
        question: questionText,
        candidateAnswer: cleanAnswer || "No response recorded.",
        idealAnswer: `An expert response covers architecture, trade-offs, scalability limits, and clear engineering metrics.`,
        techEvaluation: isNonAnswer 
          ? "Unanswered or non-substantive. 0/100 points."
          : `Candidate provided a partial response (${cleanAnswer.length} chars), but lacked architectural depth and trade-off considerations.`,
        commEvaluation: isNonAnswer 
          ? "No technical communication provided."
          : (fillerCount > 1 ? `Delivery pacing was disrupted by ${fillerCount} filler words.` : `Basic delivery.`),
        starCheck
      };
    });
    
    // Penalize for unasked/unanswered questions up to totalCount
    while (techScoresList.length < totalCount) {
      techScoresList.push(0);
      commScoresList.push(0);
    }

    const avgTech = Math.round(techScoresList.reduce((a, b) => a + b, 0) / totalCount);
    const avgComm = Math.round(commScoresList.reduce((a, b) => a + b, 0) / totalCount);
    const overall = Math.round(0.7 * avgTech + 0.3 * avgComm);
    
    let strengths = [];
    let weaknesses = [];
    
    if (avgTech >= 70) {
      strengths.push("Demonstrated solid understanding of technical principles and mechanics.");
    } else {
      weaknesses.push("Technical explanations lacked required depth, architecture trade-offs, and scaling limits.");
    }

    if (avgComm >= 70) {
      strengths.push("Articulate delivery with structured pacing.");
    } else {
      weaknesses.push("Communication was incomplete, brief, or lacked structured delivery.");
    }

    if (techScoresList.filter(s => s === 0).length > 0) {
      weaknesses.push(`Candidate left ${techScoresList.filter(s => s === 0).length} out of ${totalCount} questions unanswered.`);
    }

    if (strengths.length === 0) {
      strengths.push("Attempted the interview questions.");
    }

    return {
      overallScore: overall,
      techScore: avgTech,
      commScore: avgComm,
      summary: `Completed mock interview session on: ${sessionContext.topics.join(", ")}. Answered ${validAnswers.length} of ${totalCount} questions. The candidate demonstrated a ${avgTech >= 70 ? "satisfactory" : "deficient"} technical baseline. Significant preparation in core systems trade-offs is required.`,
      strengths,
      weaknesses,
      questions: evaluationQuestions,
      studyTopics: sessionContext.topics.map(t => ({
        topic: t,
        description: `Key technical area requiring deeper study and practice.`,
        link: `https://www.google.com/search?q=${encodeURIComponent(t + " interview questions and trade-offs")}`
      }))
    };
  }
}

/**
 * Transcribes audio client-side using Gemini 1.5 Flash.
 * 
 * @param {string} apiKey - Gemini API Key
 * @param {string} base64Audio - Base64 encoded audio string
 * @param {string} mimeType - The mime type of the audio (e.g. 'audio/webm', 'audio/wav')
 * @returns {Promise<string>} - Transcribed text
 */
export async function transcribeAudio(apiKey, base64Audio, mimeType) {
  const prompt = `You are a precise speech-to-text transcriber. Transcribe the provided audio content exactly as it is spoken. Do not add comments, corrections, explanations, summaries, or preamble. Return only the raw transcription text.`;
  
  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          },
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 1024,
    }
  };

  let lastError = null;
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && text.trim()) {
          return text.trim();
        }
      }

      if (response.status === 429 || response.status === 503) {
        console.warn(`[Gemini STT] Model ${model} rate/quota limit hit (HTTP ${response.status}). Trying next model...`);
        lastError = new Error(`Quota limit on ${model}`);
        continue;
      }

      const errorData = await response.json().catch(() => ({}));
      lastError = new Error(errorData?.error?.message || `HTTP error ${response.status}`);
    } catch (netErr) {
      console.warn(`[Gemini STT] Network error on model ${model}:`, netErr);
      lastError = netErr;
    }
  }

  throw lastError || new Error("Failed to transcribe audio with Gemini models.");
}

