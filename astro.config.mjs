// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import url from 'url';

function ttsServerPlugin() {
  return {
    name: 'tts-server-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const parsed = url.parse(req.url || '', true);
        if (parsed.pathname === '/api/speak' || parsed.pathname === '/api/tts') {
          // Set CORS headers
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }

          if (req.method === 'HEAD') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'audio/mpeg');
            res.end();
            return;
          }

          let voice = parsed.query.voice || 'en-GB-RyanNeural';
          let text = parsed.query.text || 'Hello, I am your technical interviewer.';
          let rate = parsed.query.rate || '+0%';
          let pitch = parsed.query.pitch || '+0Hz';

          const handleSpeech = async (v, t, r, p) => {
            try {
              const tts = new MsEdgeTTS();
              await tts.setMetadata(v, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
              const { audioStream } = tts.toStream(t, { rate: r, pitch: p });

              res.statusCode = 200;
              res.setHeader('Content-Type', 'audio/mpeg');
              res.setHeader('Cache-Control', 'no-cache');
              audioStream.pipe(res);

              audioStream.on('error', (err) => {
                console.error('[TTS Plugin] Stream error:', err);
                if (!res.headersSent) {
                  res.statusCode = 500;
                  res.end();
                }
              });

              audioStream.on('end', () => {
                try { tts.close(); } catch (e) {}
              });
            } catch (err) {
              console.error('[TTS Plugin] Generation error:', err);
              if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            }
          };

          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const parsedBody = JSON.parse(body || '{}');
                handleSpeech(
                  parsedBody.voice || voice,
                  parsedBody.text || text,
                  parsedBody.rate || rate,
                  parsedBody.pitch || pitch
                );
              } catch (e) {
                handleSpeech(voice, text, rate, pitch);
              }
            });
            return;
          }

          handleSpeech(voice, text, rate, pitch);
          return;
        }
        next();
      });
    }
  };
}

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss(), ttsServerPlugin()],
  },
});
