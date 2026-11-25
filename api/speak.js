import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

let persistentTTS = null;
let currentVoice = null;

async function getOrInitTTS(voice = 'en-GB-RyanNeural') {
  if (!persistentTTS || currentVoice !== voice) {
    if (persistentTTS) {
      try { persistentTTS.close(); } catch (e) {}
    }
    persistentTTS = new MsEdgeTTS();
    await persistentTTS.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    currentVoice = voice;
  }
  return persistentTTS;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'HEAD') {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.status(200).end();
    return;
  }

  const query = req.query || {};
  const voice = query.voice || 'en-GB-RyanNeural';
  const text = query.text || 'Hello, I am your technical interviewer.';
  const rate = query.rate || '+0%';
  const pitch = query.pitch || '+0Hz';

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const tts = await getOrInitTTS(voice);
      const { audioStream } = tts.toStream(text, { rate, pitch });

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      res.status(200);

      audioStream.pipe(res);
      audioStream.on('error', (err) => {
        console.error(`[API Speak] Stream error (attempt ${attempt}):`, err);
        persistentTTS = null;
        if (!res.headersSent) {
          res.status(500).json({ error: err.message });
        }
      });
      return;
    } catch (err) {
      console.warn(`[API Speak] Attempt ${attempt} failed:`, err);
      persistentTTS = null;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 250 * attempt));
      } else {
        if (!res.headersSent) {
          res.status(500).json({ error: err.message });
        }
      }
    }
  }
}
