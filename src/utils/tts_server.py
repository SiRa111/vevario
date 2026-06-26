import sys
import asyncio
import base64
import json
import requests
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import edge_tts


app = Flask(__name__)
CORS(app)

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
# Models tried in order — first available quota wins
GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
]


def call_gemini(api_key, contents, system_instruction=None, response_mime_type=None, temperature=0.7, max_tokens=1000):
    """Call Gemini API. Returns the text response or raises on error."""
    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        }
    }
    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}
    if response_mime_type:
        payload["generationConfig"]["responseMimeType"] = response_mime_type

    last_error = None
    for model in GEMINI_MODELS:
        url = f"{GEMINI_API_BASE}/{model}:generateContent?key={api_key}"
        try:
            resp = requests.post(url, json=payload, timeout=30)
            if resp.status_code == 429:
                print(f"Quota hit on {model}, trying next model...", flush=True)
                last_error = f"429 quota on {model}"
                continue
            resp.raise_for_status()
            data = resp.json()
            text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            if not text:
                last_error = f"Empty response from {model}"
                continue
            print(f"✓ Gemini response via {model}", flush=True)
            return text
        except requests.exceptions.RequestException as e:
            print(f"Request error ({model}): {e}", flush=True)
            last_error = str(e)
            continue

    raise Exception(f"All Gemini models failed. Last error: {last_error}")


@app.route("/api/stream_tts", methods=["GET", "POST"])
def stream_tts():
    if request.method == "POST":
        data = request.json or {}
        text = data.get("text", "")
        voice = data.get("voice", "en-US-AndrewMultilingualNeural")
    else:
        text = request.args.get("text", "")
        voice = request.args.get("voice", "en-US-AndrewMultilingualNeural")

    if not text.strip():
        return jsonify({"error": "No text provided"}), 400

    def generate_chunks():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        async def run_edge_stream():
            communicate = edge_tts.Communicate(text, voice, rate="+0%")
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]

        gen = run_edge_stream()
        while True:
            try:
                chunk = loop.run_until_complete(gen.__anext__())
                yield chunk
            except StopAsyncIteration:
                break
        loop.close()

    return Response(generate_chunks(), mimetype="audio/mpeg")

@app.route("/api/tts", methods=["GET", "POST"])
def tts_edge():
    if request.method == "POST":
        data = request.json or {}
        text = data.get("text", "")
        voice = data.get("voice", "en-US-AndrewMultilingualNeural")
    else:
        text = request.args.get("text", "")
        voice = request.args.get("voice", "en-US-AndrewMultilingualNeural")

    if not text.strip():
        return jsonify({"error": "No text provided"}), 400

    async def get_audio_and_boundaries():
        communicate = edge_tts.Communicate(text, voice, rate="+0%", boundary="WordBoundary")
        audio_data = bytearray()
        word_boundaries = []
        
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data.extend(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                word_boundaries.append({
                    "text": chunk["text"],
                    "start": chunk["offset"] / 10000.0,
                    "duration": chunk["duration"] / 10000.0
                })
        return audio_data, word_boundaries

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        audio_data, word_boundaries = loop.run_until_complete(get_audio_and_boundaries())
        loop.close()
    except Exception as e:
        print(f"Error generating voice: {e}", flush=True)
        return jsonify({"error": str(e)}), 500

    audio_base64 = base64.b64encode(audio_data).decode("utf-8")
    return jsonify({
        "audio": f"data:audio/mpeg;base64,{audio_base64}",
        "words": word_boundaries
    })

@app.route("/api/generate", methods=["POST", "OPTIONS"])
def generate_text():
    if request.method == "OPTIONS":
        return Response(status=200)

    data = request.json or {}
    api_key = data.get("api_key", "")
    system_instruction = data.get("system_instruction", "")
    chat_history = data.get("chat_history", [])   # Array of {role, parts:[{text}]}
    model_turns = data.get("model_turns", 0)
    total_count = data.get("total_count", 5)

    # ---------------------------------------------------------------
    # If no API key, we cannot do anything intelligent. Return error.
    # ---------------------------------------------------------------
    if not api_key or api_key in ("", "LOCAL_FALLBACK"):
        return jsonify({"text": "Question 1 of 5: Walk me through your most recent technical project — what did you build, what was your role, and what were the key technical challenges you faced?"}), 200

    # ---------------------------------------------------------------
    # DETECT: Is this a final evaluation request?
    # ---------------------------------------------------------------
    last_user_text = ""
    if chat_history:
        for turn in reversed(chat_history):
            if turn.get("role") == "user":
                last_user_text = (turn.get("parts") or [{}])[0].get("text", "")
                break

    is_eval_request = (
        "JSON SCHEMA" in system_instruction or
        "JUDGING ENGINE" in system_instruction or
        "JSON SCHEMA" in last_user_text or
        "JUDGING ENGINE" in last_user_text
    )

    # ---------------------------------------------------------------
    # FINAL EVALUATION: Ask Gemini to produce evaluation JSON
    # ---------------------------------------------------------------
    if is_eval_request:
        eval_system = (
            "You are an elite Senior Principal Software Engineer conducting a comprehensive mock interview evaluation. "
            "You will be given the full conversation history of a technical mock interview. "
            "Analyze EVERY candidate answer honestly and critically:\n"
            "- If the candidate said they don't know, admitted ignorance, gave a nonsensical answer, or gave a very short non-technical answer: score that question POORLY (0-40 range for tech). Mark it as a weakness.\n"
            "- If the candidate gave a partial answer: score it in the 41-70 range.\n"
            "- Only score 71-100 for genuinely correct, detailed technical answers.\n"
            "Never give a high score to an 'I don't know' answer. Be honest and strict."
        )

        eval_prompt = f"""Analyze this complete mock interview conversation and generate an evaluation scorecard.

INTERVIEW DETAILS:
- Topics: Extracted from the system instruction context
- Difficulty: Based on the questions asked

JUDGING ENGINE SCORING RUBRICS:
1. TECHNICAL ACCURACY (70% weight):
   - 0-40: Wrong, blank, or 'I don't know' answers
   - 41-70: Partial or surface-level understanding
   - 71-85: Correct with solid understanding
   - 86-100: Masterful with trade-offs, alternatives, and depth

2. COMMUNICATION (30% weight):
   - 0-50: Unclear, very short, or admission of not knowing
   - 51-79: Understandable but lacks structure
   - 80-100: Articulate, structured, clear

CRITICAL INSTRUCTIONS:
- If the candidate said 'I don't know', 'no idea', 'I have no clue', 'I never worked at that level', or gave any non-answer: mark techEvaluation as poor, add to weaknesses, and score that question 0-35 for tech.
- Be a STRICT, HONEST evaluator. Do not be encouraging about poor answers.

Return ONLY raw JSON (no markdown, no code blocks) matching this exact schema:
{{
  "overallScore": 0-100,
  "techScore": 0-100,
  "commScore": 0-100,
  "summary": "3-4 sentence honest summary of performance",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "questions": [
    {{
      "question": "The question text",
      "candidateAnswer": "What candidate said",
      "idealAnswer": "What a perfect answer would cover",
      "techEvaluation": "Honest 1-sentence technical critique",
      "commEvaluation": "Honest 1-sentence communication critique",
      "starCheck": {{
        "applicable": false,
        "situation": false,
        "task": false,
        "action": false,
        "result": false
      }}
    }}
  ],
  "studyTopics": [
    {{
      "topic": "Topic name",
      "description": "Why they need to study this",
      "link": "https://www.google.com/search?q=topic+interview+prep"
    }}
  ]
}}"""

        try:
            raw = call_gemini(
                api_key,
                chat_history + [{"role": "user", "parts": [{"text": eval_prompt}]}],
                system_instruction=eval_system,
                response_mime_type="application/json",
                temperature=0.1,
                max_tokens=3000
            )
            # Validate it's real JSON
            json.loads(raw)
            return jsonify({"text": raw})
        except Exception as e:
            print(f"Eval Gemini error: {e}", flush=True)
            return jsonify({"error": str(e)}), 500

    # ---------------------------------------------------------------
    # NORMAL FLOW: Generate next question using Gemini
    # ---------------------------------------------------------------
    # Append the next-question prompt to the existing chat history
    next_q_num = model_turns + 1
    next_q_prompt = (
        f"Question {next_q_num} of {total_count}: "
        f"Based on their previous answer, briefly comment on it in 1 honest sentence "
        f"(if it was poor or 'I don't know', say so critically and note it as a weakness), "
        f"then ask question {next_q_num} of {total_count} on the next topic. "
        f"Prefix your response with 'Question {next_q_num} of {total_count}: '"
    )

    contents = chat_history + [{"role": "user", "parts": [{"text": next_q_prompt}]}]

    try:
        result = call_gemini(
            api_key,
            contents,
            system_instruction=system_instruction,
            temperature=0.7,
            max_tokens=600
        )
        return jsonify({"text": result})
    except Exception as e:
        print(f"Generate Gemini error: {e}", flush=True)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
    print("🚀 Edge TTS Server running on http://localhost:5000", flush=True)
    app.run(host="0.0.0.0", port=5000, debug=False)
