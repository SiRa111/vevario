import sys
import asyncio
import base64
import subprocess
import re
import json
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import edge_tts


app = Flask(__name__)
CORS(app)

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
                    "start": chunk["offset"] / 10000.0,      # Convert ticks (100ns) to milliseconds
                    "duration": chunk["duration"] / 10000.0  # Convert ticks (100ns) to milliseconds
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
    prompt = data.get("prompt", "")
    system_instruction = data.get("system_instruction", "")

    # Identify if it is requesting the final evaluation JSON
    if "JSON SCHEMA" in prompt or "JUDGING ENGINE" in prompt:
        evaluation_json = {
            "overallScore": 87,
            "techScore": 90,
            "commScore": 84,
            "summary": "The candidate performed very well on the Coding (DSA) and system evaluation. They implemented an optimal solution using a hash map, and explained their complexity analysis correctly.",
            "strengths": [
                "Implemented O(N) time complexity solution for Two Sum.",
                "Dry ran code correctly and handled negative integer cases."
            ],
            "weaknesses": [
                "Could optimize space complexity if auxiliary arrays were avoided.",
                "A few minor stutter filler words detected during speech delivery."
            ],
            "questions": [
                {
                    "question": "Coding Challenge: Two Sum",
                    "candidateAnswer": "Code submitted and explained verbally.",
                    "idealAnswer": "Two Sum is optimally solved using a single pass with a Hash Map to locate elements matching target complement in O(N) time and O(N) auxiliary space.",
                    "techEvaluation": "Excellent clean implementation matching optimal time bounds.",
                    "commEvaluation": "Explanation of space/time trade-offs was clear and structured.",
                    "starCheck": {
                        "applicable": False,
                        "situation": False,
                        "task": False,
                        "action": False,
                        "result": False
                    }
                }
            ],
            "studyTopics": [
                {
                    "topic": "Array Algorithms and Hashing",
                    "description": "Strengthen your confidence with double pointer sliding windows and hash-map storage optimizations.",
                    "link": "https://www.google.com/search?q=two+sum+leetcode+optimal+hashmap+approach"
                }
            ]
        }
        return jsonify({"text": json.dumps(evaluation_json)})

    # Handle coding challenge follow-ups dynamically
    if "Candidate has submitted the following code in" in prompt or "submitted code" in prompt.lower():
        return jsonify({"text": "I see you have submitted your solution. Can you explain your approach to solving this question? Walk me through how your code works and analyze its time and space complexity."})
    
    if "explain their design" in prompt.lower() or "explain their time and space complexity" in prompt.lower():
        return jsonify({"text": "Thank you for explaining your approach. How does your solution handle boundary conditions? For example, empty input arrays, target values not present, or overflow limits?"})

    # Otherwise, it's a next question request
    match = re.search(r"Question (\d+) of (\d+)", prompt)
    q_num = int(match.group(1)) if match else 2
    total_q = int(match.group(2)) if match else 5

    # Check topics in system instruction or prompt
    topics = []
    if "Focus Topics Selected:" in system_instruction:
        parts = system_instruction.split("Focus Topics Selected:")
        if len(parts) > 1:
            topics = [t.strip() for t in parts[1].split("\n")[0].split(",")]
    
    if not topics and "Coding (DSA)" in prompt:
        topics = ["Coding (DSA)"]
    elif not topics:
        topics = ["System Design"]

    # Select simulated question based on topic and question number
    topic = topics[0]
    questions_pool = {
        "System Design": [
            "How would you design a URL shortening service? Specifically, what database and hashing algorithm would you choose?",
            "How would you handle high concurrent traffic on the redirect path of your URL shortener? Where would you cache codes?",
            "Let's discuss database scaling. If your relational database runs out of write capacity, how would you scale it?",
            "Tell me about a time you had to deal with a severe production outage or database lock. What did you do to fix it?",
            "What strategy would you use to cache blog posts to improve system performance?"
        ],
        "Coding (DSA)": [
            "# Two Sum\nGiven an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\n### Example 1:\nInput: nums = [2,7,11,15], target = 9\nOutput: [0,1]\nExplanation: Because nums[0] + nums[1] == 9, we return [0, 1].\n\n### Constraints:\n- `2 <= nums.length <= 10^4`\n- `-10^9 <= nums[i] <= 10^9`\n- `-10^9 <= target <= 10^9`"
        ],
        "Coding": [
            "Write a function to find the first non-repeating character in a string. What is the time complexity of your solution?",
            "How would you optimize search performance on a table containing 10 million rows?",
            "Explain the difference between SQL database normalization and denormalization. When would you choose to denormalize?",
            "Describe a complex coding bug you encountered recently and the debugging process you used to resolve it.",
            "How do you implement unit testing and CI/CD pipelines in your daily coding workflow?"
        ]
    }
    
    pool = questions_pool.get(topic, questions_pool["System Design"])
    q_index = (q_num - 1) % len(pool)
    question_text = pool[q_index]

    if q_num > 1:
        simulated_text = f"That is a correct analysis of the trade-offs. Question {q_num} of {total_q}: {question_text}"
    else:
        simulated_text = f"Question {q_num} of {total_q}: {question_text}"

    return jsonify({"text": simulated_text})

if __name__ == "__main__":
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
    print("🚀 Edge TTS Server running on http://localhost:5000", flush=True)
    app.run(host="0.0.0.0", port=5000, debug=False)
