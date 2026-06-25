// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { spawn } from 'child_process';
import path from 'path';

function ttsServerPlugin() {
  /** @type {import('child_process').ChildProcess | null} */
  let ttsProcess = null;
  return {
    name: 'tts-server-plugin',
    configureServer(server) {
      const pythonPath = '/home/simran/Desktop/code/rag/ragenv/bin/python';
      const scriptPath = path.resolve('./src/utils/tts_server.py');
      
      import('net').then(({ default: net }) => {
        const socket = new net.Socket();
        socket.setTimeout(200);
        
        const cleanup = () => {
          if (ttsProcess) {
            console.log('[TTS Plugin] Stopping Edge TTS server...');
            ttsProcess.kill('SIGTERM');
            ttsProcess = null;
          }
        };
        
        process.on('exit', cleanup);
        process.on('SIGINT', () => {
          cleanup();
          process.exit();
        });
        process.on('SIGTERM', () => {
          cleanup();
          process.exit();
        });

        socket.on('connect', () => {
          socket.destroy();
          console.log('[TTS Plugin] Edge TTS server is already running on port 5000.');
        });
        
        socket.on('error', () => {
          socket.destroy();
          console.log(`[TTS Plugin] Spawning Edge TTS server using ${pythonPath}...`);
          
          ttsProcess = spawn(pythonPath, ['-u', scriptPath], {
            stdio: 'inherit',
            detached: false
          });
          
          ttsProcess.on('error', (err) => {
            console.error('[TTS Plugin] Failed to start TTS server:', err);
          });
          
          ttsProcess.on('exit', (code) => {
            console.log(`[TTS Plugin] TTS server exited with code ${code}`);
          });
        });
        
        socket.on('timeout', () => {
          socket.destroy();
          socket.emit('error', new Error('timeout'));
        });
        
        socket.connect(5000, '127.0.0.1');
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
