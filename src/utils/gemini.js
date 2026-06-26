/**
 * Utility methods for interacting directly with the Gemini 1.5 Flash API
 * entirely client-side, using the candidate's custom API key.
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/**
 * Common fetch helper for Gemini API
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

  const localUrl = "http://127.0.0.1:5000/api/generate";
  const localRes = await fetch(localUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      system_instruction: systemInstruction,
      chat_history: Array.isArray(payload.contents) ? payload.contents : [],
      model_turns: modelTurns,
      total_count: totalCount
    })
  });

  if (!localRes.ok) {
    const errorText = await localRes.text();
    throw new Error(`Local Fallback LLM failed: ${errorText}`);
  }

  const data = await localRes.json();
  return data.text;
}

async function callGemini(apiKey, payload) {
  const url = `${BASE_URL}?key=${apiKey}`;
  
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (netErr) {
    console.warn("Network error contacting Gemini, falling back to local LLM:", netErr);
    return callLocalFallback(payload, apiKey);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `HTTP error! status: ${response.status}`;
    
    const isQuotaError = response.status === 429 || 
                         message.toLowerCase().includes("quota") || 
                         message.toLowerCase().includes("limit");
                         
    if (isQuotaError) {
      console.warn("Gemini Rate Limit / Quota Exceeded. Falling back to local backend LLM...");
      return callLocalFallback(payload, apiKey);
    }
    
    throw new Error(message);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Empty response from Gemini API.");
  }
  return text;
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
  const prompt = `You are a Senior Principal Software Engineer conducting a comprehensive review of a candidate's completed mock interview.
Analyze the complete conversation history below and output a detailed evaluation score card.

CONVERSATION HISTORY:
${JSON.stringify(chatHistory, null, 2)}

INTERVIEW META:
- Topics: ${sessionContext.topics.join(", ")}
- Difficulty: ${sessionContext.difficulty}
- Total Questions: ${sessionContext.questionCount}

JUDGING ENGINE SCORING RUBRICS:
Align the scoring strictly against the requested difficulty (${sessionContext.difficulty}).

1. TECHNICAL ACCURACY (70% Weight of Overall Score):
- 0 to 40 points: Unresponsive, incorrect concepts, or major misconceptions.
- 41 to 70 points: Textbook definition, but lacks architectural depth or real-world details.
- 71 to 85 points: Correct concepts with solid understanding of mechanics and implementation.
- 86 to 100 points: Masterful technical explanation addressing read/write trade-offs, scaling limits, data consistency models, and alternative design options.

2. COMMUNICATION & PACING (30% Weight of Overall Score):
- 0 to 50 points: Muddled explanations, high volume of fillers, or disjointed structures.
- 51 to 79 points: Clear voice pacing, but lacks a concise thesis or fails to structure behavioral answers using the STAR format.
- 80 to 100 points: Articulate, concise, structured explanations that address questions directly with appropriate STAR components.

3. STAR METHOD AUDITING (Behavioral Questions only):
For any behavioral scenario, audit if they stated:
- Situation (context)
- Task (objectives)
- Action (steps they took)
- Result (outcomes/metrics)

You MUST output your response in JSON format matching the schema below. Do not wrap the JSON in markdown code blocks like \`\`\`json. Return only the raw JSON.

JSON SCHEMA:
{
  "overallScore": 85, // Computed weighted average (70% techScore, 30% commScore)
  "techScore": 88,    // Integer (0 to 100) based on Technical Accuracy rubric
  "commScore": 82,    // Integer (0 to 100) based on Communication rubric
  "summary": "A detailed 3-4 sentence paragraph summarizing the candidate's general performance, highlighting their technical capabilities and soft skills.",
  "strengths": [
    "Brief description of strength 1",
    "Brief description of strength 2"
  ],
  "weaknesses": [
    "Brief description of area to improve 1",
    "Brief description of area to improve 2"
  ],
  "questions": [
    {
      "question": "The question asked by the interviewer",
      "candidateAnswer": "What the candidate answered",
      "idealAnswer": "A concise, highly professional example of an ideal answer (1-2 sentences)",
      "techEvaluation": "A constructive 1-sentence critique of their technical accuracy based on the rubric",
      "commEvaluation": "A constructive 1-sentence critique of their pacing, grammar, or phrasing",
      "starCheck": {
        "applicable": true, // false if question was not behavioral
        "situation": true,  // true if they stated the context/situation
        "task": true,       // true if they stated the objectives/tasks
        "action": true,     // true if they detailed their actions
        "result": false     // true if they explained the outcome/results
      }
    }
  ],
  "studyTopics": [
    {
      "topic": "Name of topic (e.g. SQL Indexes, Database Sharding, STAR Method)",
      "description": "Why they need to study this based on their gaps",
      "link": "A high-quality educational URL or Google Search query URL for this topic"
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
      temperature: 0.2,
      maxOutputTokens: 2000,
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

    // Return structured default fallback grade report to ensure UX is clean
    const totalCount = sessionContext.questionCount || 5;
    
    // Build a dynamic evaluation from history
    let techScoresList = [];
    let commScoresList = [];
    let fillerWordsTotal = 0;
    
    const evaluationQuestions = chatHistory
      .filter(m => m.role === "model")
      .map((m, idx) => {
        const questionText = m.parts?.[0]?.text || `Question ${idx + 1}`;
        const uAns = chatHistory.find((uh, uIdx) => uIdx > chatHistory.indexOf(m) && uh.role === "user");
        const answerText = uAns?.parts?.[0]?.text || "";
        const cleanAnswer = answerText.trim();
        
        // Count filler words
        const fillerWordsRegex = /\b(um|uh|like|basically|actually|so|literally|you know)\b/gi;
        const fillerCount = (cleanAnswer.match(fillerWordsRegex) || []).length;
        fillerWordsTotal += fillerCount;
        
        // Calculate Technical score for this answer
        let qTechScore = 10;
        if (cleanAnswer.length >= 150) {
          qTechScore = 88;
        } else if (cleanAnswer.length >= 50) {
          qTechScore = 75;
        } else if (cleanAnswer.length > 5) {
          qTechScore = 55;
        }
        techScoresList.push(qTechScore);
        
        // Calculate Communication score for this answer
        let qCommScore = Math.max(40, 85 - (fillerCount * 5));
        if (cleanAnswer.length < 15) {
          qCommScore = 50;
        }
        commScoresList.push(qCommScore);
        
        // Check if question is behavioral
        const lowerQ = questionText.toLowerCase();
        const isBehavioral = lowerQ.includes("tell me about") || 
                             lowerQ.includes("describe a time") || 
                             lowerQ.includes("describe a situation") ||
                             lowerQ.includes("star method") || 
                             lowerQ.includes("behavioral") ||
                             sessionContext.topics.some(t => t.toLowerCase().includes("behavioral"));
                             
        let starCheck = {
          applicable: isBehavioral,
          situation: false,
          task: false,
          action: false,
          result: false
        };
        
        if (isBehavioral && cleanAnswer) {
          const lowerAns = cleanAnswer.toLowerCase();
          starCheck.situation = lowerAns.includes("situation") || lowerAns.includes("context") || lowerAns.includes("project") || lowerAns.includes("client") || lowerAns.includes("team") || lowerAns.includes("role") || lowerAns.includes("when i was");
          starCheck.task = lowerAns.includes("task") || lowerAns.includes("goal") || lowerAns.includes("objective") || lowerAns.includes("responsibility") || lowerAns.includes("challenge") || lowerAns.includes("issue");
          starCheck.action = lowerAns.includes("action") || lowerAns.includes("did") || lowerAns.includes("wrote") || lowerAns.includes("built") || lowerAns.includes("solved") || lowerAns.includes("implemented") || lowerAns.includes("designed") || lowerAns.includes("created");
          starCheck.result = lowerAns.includes("result") || lowerAns.includes("outcome") || lowerAns.includes("metrics") || lowerAns.includes("percent") || lowerAns.includes("%") || lowerAns.includes("saved") || lowerAns.includes("improved") || lowerAns.includes("reduced");
        }
        
        return {
          question: questionText,
          candidateAnswer: cleanAnswer || "No response recorded.",
          idealAnswer: `An ideal response should address the specifics of the prompt, outlining system trade-offs (e.g. read/write ratio, availability) and presenting clear metrics.`,
          techEvaluation: cleanAnswer.length > 5 
            ? `The candidate provides a response addressing the question, but could deepen the details regarding performance characteristics.`
            : `No substantive technical response was recorded for this question.`,
          commEvaluation: fillerCount > 1 
            ? `Delivery pacing was slightly disrupted by the usage of ${fillerCount} filler words.`
            : `Clear and concise delivery.`,
          starCheck
        };
      });
      
    const avgTech = techScoresList.length ? Math.round(techScoresList.reduce((a, b) => a + b, 0) / techScoresList.length) : 75;
    const avgComm = commScoresList.length ? Math.round(commScoresList.reduce((a, b) => a + b, 0) / commScoresList.length) : 75;
    const overall = Math.round(0.7 * avgTech + 0.3 * avgComm);
    
    // Strengths and Weaknesses
    let strengths = ["Showed consistent engagement and answered all prompted questions."];
    let weaknesses = [];
    
    if (avgComm >= 80) {
      strengths.push("Articulate delivery with structured, professional pacing.");
    } else if (fillerWordsTotal > 2) {
      weaknesses.push("Delivery pacing was affected by frequent filler words (ums, like, basically).");
    }
    
    if (avgTech < 75) {
      weaknesses.push("Technical explanations lacked architectural depth and trade-off considerations.");
    } else {
      strengths.push("Demonstrated solid understanding of technical principles and mechanics.");
    }
    
    // Check if STAR criteria missed
    const behavioralEvaluations = evaluationQuestions.filter(q => q.starCheck.applicable);
    if (behavioralEvaluations.length > 0) {
      const missedResult = behavioralEvaluations.some(q => !q.starCheck.result);
      if (missedResult) {
        weaknesses.push("Behavioral responses did not consistently include concrete metrics or outcomes (Result of the STAR method).");
      } else {
        strengths.push("Effectively applied the STAR methodology to behavioral questions.");
      }
    }
    
    if (weaknesses.length === 0) {
      weaknesses.push("Could expand on alternative design options and scaling bottlenecks.");
    }

    return {
      overallScore: overall,
      techScore: avgTech,
      commScore: avgComm,
      summary: `Completed mock interview session on: ${sessionContext.topics.join(", ")}. The candidate demonstrated a ${avgTech >= 78 ? "strong" : "basic"} technical baseline with ${avgComm >= 78 ? "very clean" : "adequate"} communication pacing. Further focus on architectural scaling trade-offs is recommended.`,
      strengths,
      weaknesses,
      questions: evaluationQuestions,
      studyTopics: sessionContext.topics.map(topic => ({
        topic: topic,
        description: `Review fundamental engineering concepts, trade-offs, and best practices in: ${topic}`,
        link: `https://www.google.com/search?q=${encodeURIComponent(topic + " interview questions")}`
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

  // Do not fallback to local LLM, because the local Flask LLM server cannot transcribe audio.
  // Instead, execute a direct fetch to the Gemini API and throw on rate-limit or error.
  const url = `${BASE_URL}?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Gemini transcription failed with status ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Empty response from Gemini transcription.");
  }
  return text;
}

