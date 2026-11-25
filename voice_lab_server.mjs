import http from 'http';
import url from 'url';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const PORT = process.env.PORT || 4455;

// Human curated metadata for top voices
const VOICE_DESCRIPTIONS = {
  'en-US-JennyNeural': { role: 'Friendly, warm, conversational — widely rated as the most natural female voice', tag: 'Top Human Pick 🌟' },
  'en-US-GuyNeural': { role: 'Casual, confident, articulate — sounds like a real senior software engineer', tag: 'Top Human Pick 🌟' },
  'en-US-AriaNeural': { role: 'Expressive, dynamic, clear technical enunciation', tag: 'Recommended' },
  'en-US-ChristopherNeural': { role: 'Warm, calm, mature interviewer presence', tag: 'Recommended' },
  'en-US-AndrewMultilingualNeural': { role: 'Authoritative, resonant, crisp male voice', tag: 'Popular' },
  'en-US-AvaMultilingualNeural': { role: 'Modern, crisp, articulate female voice', tag: 'Popular' },
  'en-US-BrianMultilingualNeural': { role: 'Thoughtful, calm, professional tone', tag: 'Popular' },
  'en-GB-RyanNeural': { role: 'Polished British male accent, formal and direct', tag: 'UK Top Pick' },
  'en-GB-SoniaNeural': { role: 'Academic British female accent, crisp articulation', tag: 'UK Top Pick' },
  'en-GB-ThomasNeural': { role: 'Classic British male narrator tone', tag: 'UK Natural' },
  'en-GB-LibbyNeural': { role: 'Gentle, clear British female voice', tag: 'UK Natural' },
  'en-IN-NeerjaNeural': { role: 'Natural, expressive Indian English accent', tag: 'India Top Pick' },
  'en-IN-PrabhatNeural': { role: 'Professional, clear Indian English male voice', tag: 'India Top Pick' },
  'en-AU-WilliamMultilingualNeural': { role: 'Australian English male, casual and clear', tag: 'AU Natural' },
  'en-AU-NatashaNeural': { role: 'Australian English female, friendly and articulate', tag: 'AU Natural' },
  'en-CA-LiamNeural': { role: 'Canadian English male, modern conversational style', tag: 'CA Natural' },
  'en-CA-ClaraNeural': { role: 'Canadian English female, clear and professional', tag: 'CA Natural' }
};

let cachedVoices = null;

async function getEnglishVoices() {
  if (cachedVoices) return cachedVoices;
  const tts = new MsEdgeTTS();
  const allVoices = await tts.getVoices();
  const english = allVoices.filter(v => (v.Locale || '').startsWith('en'));
  
  cachedVoices = english.map(v => {
    const meta = VOICE_DESCRIPTIONS[v.ShortName] || { role: 'Clear Microsoft Neural English voice', tag: 'Neural' };
    return {
      name: v.ShortName,
      friendlyName: v.FriendlyName || v.ShortName,
      gender: v.Gender || 'Unknown',
      locale: v.Locale,
      role: meta.role,
      tag: meta.tag
    };
  });

  // Sort top picks first
  cachedVoices.sort((a, b) => {
    const aTop = a.tag.includes('Top') ? -1 : 1;
    const bTop = b.tag.includes('Top') ? -1 : 1;
    return aTop - bTop;
  });

  return cachedVoices;
}

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vevario Voice Lab — Ultra-Realistic Human Voice Studio</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    .glass-card {
      background: rgba(18, 24, 38, 0.7);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    }
    .glass-input {
      background: rgba(10, 14, 26, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    /* Wave animation */
    .bar-anim {
      animation: bounceWave 1.2s infinite ease-in-out;
    }
    @keyframes bounceWave {
      0%, 100% { height: 4px; }
      50% { height: 28px; }
    }
  </style>
</head>
<body class="bg-[#090d16] text-slate-100 min-h-screen selection:bg-blue-600/30 selection:text-white pb-24">

  <!-- Sticky Top Header -->
  <header class="border-b border-white/10 bg-[#0c111d]/80 backdrop-blur-md sticky top-0 z-50">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="font-mono text-sm font-bold tracking-wider text-white">VEVARIO VOICE LAB</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold">NEURAL 24kHz</span>
          </div>
          <p class="text-[11px] text-slate-400">Ultra-Realistic Human Voice Studio</p>
        </div>
      </div>

      <!-- Quick Audio Status Pill -->
      <div id="player-status-pill" class="hidden sm:flex items-center gap-3 px-4 py-1.5 rounded-full bg-slate-900/80 border border-white/10 text-xs font-mono">
        <div id="playing-wave" class="hidden items-center gap-0.5 h-4">
          <span class="w-0.5 bg-blue-400 rounded-full bar-anim" style="animation-delay: 0s;"></span>
          <span class="w-0.5 bg-blue-400 rounded-full bar-anim" style="animation-delay: 0.2s;"></span>
          <span class="w-0.5 bg-blue-400 rounded-full bar-anim" style="animation-delay: 0.4s;"></span>
          <span class="w-0.5 bg-blue-400 rounded-full bar-anim" style="animation-delay: 0.1s;"></span>
        </div>
        <span id="player-status-text" class="text-slate-400">Ready to play</span>
        <button id="btn-global-stop" class="hidden text-red-400 hover:text-red-300 font-bold ml-1">STOP</button>
      </div>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-6 pt-8 space-y-8">

    <!-- Interactive Test Input Control Console -->
    <section class="glass-card rounded-2xl p-6 sm:p-8 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 class="text-lg font-semibold text-white tracking-tight">Test Sentence / Interview Question</h2>
          <p class="text-xs text-slate-400">Type any sentence below, or choose a realistic technical interview preset.</p>
        </div>
        <!-- Speed & Rate Controls -->
        <div class="flex items-center gap-4 text-xs font-mono text-slate-300">
          <div class="flex items-center gap-2">
            <span>Speech Speed:</span>
            <select id="select-rate" class="glass-input px-2.5 py-1 rounded-md text-xs text-white focus:outline-none cursor-pointer">
              <option value="-15%">0.85x (Deliberate)</option>
              <option value="+0%" selected>1.0x (Natural Human)</option>
              <option value="+10%">1.1x (Energetic)</option>
              <option value="+20%">1.2x (Fast)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Presets bar -->
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[11px] font-mono text-slate-400 uppercase tracking-wider mr-1">Presets:</span>
        <button class="preset-btn px-3 py-1 rounded-full text-xs font-mono bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-all active:scale-95" 
          data-text="Walk me through how you designed the database schema and caching layer for your inventory management project. What were the main latency bottlenecks?">
          1. System Design Question
        </button>
        <button class="preset-btn px-3 py-1 rounded-full text-xs font-mono bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-all active:scale-95" 
          data-text="Could you explain your approach to finding the longest palindromic substring? What is the time and space complexity of your algorithm?">
          2. Algorithmic DSA Challenge
        </button>
        <button class="preset-btn px-3 py-1 rounded-full text-xs font-mono bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-all active:scale-95" 
          data-text="Tell me about a critical production outage you handled under high pressure. How did you diagnose the issue and communicate with your team?">
          3. Behavioral STAR Prompt
        </button>
        <button class="preset-btn px-3 py-1 rounded-full text-xs font-mono bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-all active:scale-95" 
          data-text="Hello and welcome to your technical interview today. We will cover Data Structures, System Design, and dive into your past engineering projects.">
          4. Interviewer Greeting
        </button>
      </div>

      <!-- Textarea input -->
      <div class="relative">
        <textarea id="test-text" rows="3" class="w-full glass-input rounded-xl p-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all resize-none font-light leading-relaxed">Walk me through how you designed the database schema and caching layer for your inventory management project. What were the main latency bottlenecks?</textarea>
        <div class="absolute bottom-3 right-3 text-[10px] font-mono text-slate-500 pointer-events-none">
          Click any voice card below to hear it speak this sentence
        </div>
      </div>
    </section>

    <!-- Filters & Search Toolbar -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
      <!-- Search input -->
      <div class="relative flex-grow max-w-md">
        <svg class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input type="text" id="voice-search" placeholder="Search voices (e.g. Jenny, Guy, British, Male, Indian)..." 
          class="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all" />
      </div>

      <!-- Filter chips -->
      <div class="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
        <button class="filter-btn px-3 py-1.5 rounded-lg text-xs font-mono bg-blue-600 text-white font-medium" data-filter="all">All (47)</button>
        <button class="filter-btn px-3 py-1.5 rounded-lg text-xs font-mono bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5" data-filter="us">🇺🇸 US</button>
        <button class="filter-btn px-3 py-1.5 rounded-lg text-xs font-mono bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5" data-filter="gb">🇬🇧 UK</button>
        <button class="filter-btn px-3 py-1.5 rounded-lg text-xs font-mono bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5" data-filter="in">🇮🇳 India</button>
        <button class="filter-btn px-3 py-1.5 rounded-lg text-xs font-mono bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5" data-filter="female">Female</button>
        <button class="filter-btn px-3 py-1.5 rounded-lg text-xs font-mono bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5" data-filter="male">Male</button>
      </div>
    </div>

    <!-- Voice Grid Cards -->
    <div id="voice-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      <div class="col-span-full py-16 text-center text-slate-400 font-mono text-sm animate-pulse">
        Loading 47 neural voices directly from Microsoft Neural Cloud...
      </div>
    </div>

  </main>

  <!-- Sticky Bottom Audio HUD (Appears when audio is playing) -->
  <div id="bottom-hud" class="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-xl w-full px-4 z-50 transition-all duration-300 opacity-0 translate-y-6 pointer-events-none">
    <div class="glass-card rounded-2xl p-4 border border-blue-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex items-center justify-between gap-4 pointer-events-auto">
      <div class="flex items-center gap-3 overflow-hidden">
        <div class="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
          <svg class="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2v20m-6-15v10m12-10v10m-18-5v0m24 0v0"/></svg>
        </div>
        <div class="overflow-hidden">
          <div class="text-xs font-semibold text-white truncate" id="hud-voice-name">Jenny (en-US-JennyNeural)</div>
          <div class="text-[11px] text-blue-400 font-mono" id="hud-status-msg">Streaming 24kHz neural audio...</div>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button id="btn-hud-stop" class="px-4 py-2 rounded-xl text-xs font-mono font-semibold bg-red-600 hover:bg-red-500 text-white transition-all active:scale-95 cursor-pointer">
          Stop
        </button>
      </div>
    </div>
  </div>

  <!-- Notification Toast -->
  <div id="toast" class="fixed top-20 left-1/2 -translate-x-1/2 bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 px-5 py-2.5 rounded-full text-xs font-mono shadow-2xl backdrop-blur-md z-50 transition-all duration-300 opacity-0 -translate-y-4 pointer-events-none">
    Voice ID copied!
  </div>

  <script>
    let allVoices = [];
    let currentFilter = 'all';
    let searchQuery = '';
    let currentAudio = null;
    let activeCardButton = null;

    const voiceGrid = document.getElementById('voice-grid');
    const testText = document.getElementById('test-text');
    const selectRate = document.getElementById('select-rate');
    const voiceSearch = document.getElementById('voice-search');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const presetBtns = document.querySelectorAll('.preset-btn');
    const bottomHud = document.getElementById('bottom-hud');
    const hudVoiceName = document.getElementById('hud-voice-name');
    const hudStatusMsg = document.getElementById('hud-status-msg');
    const btnHudStop = document.getElementById('btn-hud-stop');
    const btnGlobalStop = document.getElementById('btn-global-stop');
    const playerStatusPill = document.getElementById('player-status-pill');
    const playingWave = document.getElementById('playing-wave');
    const playerStatusText = document.getElementById('player-status-text');

    // Preset clicks
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        testText.value = btn.getAttribute('data-text');
        testText.focus();
      });
    });

    // Fetch voices on load
    fetch('/api/voices')
      .then(res => res.json())
      .then(data => {
        allVoices = data;
        renderVoiceGrid();
      })
      .catch(err => {
        voiceGrid.innerHTML = \`<div class="col-span-full py-12 text-center text-red-400 font-mono text-sm">Failed to load voices: \${err.message}</div>\`;
      });

    // Filter Buttons
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => {
          b.className = 'filter-btn px-3 py-1.5 rounded-lg text-xs font-mono bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5';
        });
        btn.className = 'filter-btn px-3 py-1.5 rounded-lg text-xs font-mono bg-blue-600 text-white font-medium';
        currentFilter = btn.getAttribute('data-filter');
        renderVoiceGrid();
      });
    });

    voiceSearch.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      renderVoiceGrid();
    });

    function renderVoiceGrid() {
      const filtered = allVoices.filter(v => {
        const matchesSearch = !searchQuery || 
          v.name.toLowerCase().includes(searchQuery) || 
          v.friendlyName.toLowerCase().includes(searchQuery) || 
          v.role.toLowerCase().includes(searchQuery);

        if (!matchesSearch) return false;

        if (currentFilter === 'all') return true;
        if (currentFilter === 'female') return v.gender.toLowerCase() === 'female';
        if (currentFilter === 'male') return v.gender.toLowerCase() === 'male';
        if (currentFilter === 'us') return v.locale === 'en-US';
        if (currentFilter === 'gb') return v.locale === 'en-GB';
        if (currentFilter === 'in') return v.locale === 'en-IN';
        return true;
      });

      if (filtered.length === 0) {
        voiceGrid.innerHTML = \`<div class="col-span-full py-16 text-center text-slate-400 font-mono text-xs">No voices match your search query.</div>\`;
        return;
      }

      voiceGrid.innerHTML = filtered.map(v => {
        const isTop = v.tag.includes('Top');
        const borderClass = isTop ? 'border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.12)]' : 'border-white/5';
        const flag = v.locale === 'en-US' ? '🇺🇸' : v.locale === 'en-GB' ? '🇬🇧' : v.locale === 'en-IN' ? '🇮🇳' : v.locale === 'en-AU' ? '🇦🇺' : v.locale === 'en-CA' ? '🇨🇦' : '🌐';
        
        return \`
          <div class="glass-card rounded-2xl p-5 border \${borderClass} flex flex-col justify-between gap-4 transition-all hover:translate-y-[-2px] group">
            <div class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <span class="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-slate-300">
                  <span>\${flag}</span>
                  <span class="text-white font-semibold">\${v.name.replace('en-US-', '').replace('en-GB-', '').replace('en-IN-', '').replace('Neural', '')}</span>
                </span>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded-full \${v.gender === 'Female' ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}">
                  \${v.gender}
                </span>
              </div>
              <div class="text-[11px] text-slate-400 leading-relaxed font-light min-h-[32px]">
                \${v.role}
              </div>
              <div class="text-[10px] font-mono text-slate-500 truncate">
                ID: \${v.name}
              </div>
            </div>

            <div class="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
              <!-- Play Button -->
              <button class="btn-play-voice flex-1 py-2 px-3.5 rounded-xl text-xs font-mono font-semibold bg-blue-600/90 hover:bg-blue-600 text-white flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-blue-900/30 cursor-pointer"
                data-voice="\${v.name}">
                <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                <span>Play Voice</span>
              </button>

              <!-- Select as Default Button -->
              <button class="btn-select-default p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Select as Vevario Default Voice"
                data-voice="\${v.name}">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>
        \`;
      }).join('');

      // Attach play listeners
      document.querySelectorAll('.btn-play-voice').forEach(btn => {
        btn.addEventListener('click', () => {
          const voiceId = btn.getAttribute('data-voice');
          playVoiceSample(voiceId, btn);
        });
      });

      // Attach select default listeners
      document.querySelectorAll('.btn-select-default').forEach(btn => {
        btn.addEventListener('click', () => {
          const voiceId = btn.getAttribute('data-voice');
          localStorage.setItem('selected_voice', voiceId);
          showToast(\`Selected \${voiceId} as your default Vevario voice!\`);
        });
      });
    }

    function stopPlayback() {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
      if (activeCardButton) {
        activeCardButton.innerHTML = \`<svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><span>Play Voice</span>\`;
        activeCardButton.classList.remove('bg-emerald-600');
        activeCardButton.classList.add('bg-blue-600/90');
        activeCardButton = null;
      }
      bottomHud.classList.add('opacity-0', 'translate-y-6', 'pointer-events-none');
      playingWave.classList.add('hidden');
      playingWave.classList.remove('flex');
      btnGlobalStop.classList.add('hidden');
      playerStatusText.textContent = "Ready to play";
    }

    btnHudStop.addEventListener('click', stopPlayback);
    btnGlobalStop.addEventListener('click', stopPlayback);

    function playVoiceSample(voiceId, btnEl) {
      stopPlayback();

      const text = testText.value.trim() || "Hello! I am your AI technical interviewer.";
      const rate = selectRate.value || "+0%";
      const audioUrl = \`/api/speak?voice=\${encodeURIComponent(voiceId)}&text=\${encodeURIComponent(text)}&rate=\${encodeURIComponent(rate)}&t=\${Date.now()}\`;

      activeCardButton = btnEl;
      btnEl.innerHTML = \`<svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg><span>Loading...</span>\`;

      currentAudio = new Audio(audioUrl);

      // HUD updates
      hudVoiceName.textContent = voiceId;
      hudStatusMsg.textContent = "Synthesizing ultra-realistic audio...";
      bottomHud.classList.remove('opacity-0', 'translate-y-6', 'pointer-events-none');
      playerStatusText.textContent = \`Playing \${voiceId}\`;
      playingWave.classList.remove('hidden');
      playingWave.classList.add('flex');
      btnGlobalStop.classList.remove('hidden');

      currentAudio.onplay = () => {
        btnEl.innerHTML = \`<svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg><span>Speaking...</span>\`;
        btnEl.classList.remove('bg-blue-600/90');
        btnEl.classList.add('bg-emerald-600');
        hudStatusMsg.textContent = "Playing 24kHz clear neural audio";
      };

      currentAudio.onended = () => {
        stopPlayback();
      };

      currentAudio.onerror = (e) => {
        console.error("Audio playback error:", e);
        showToast("Error generating voice audio. Please check network connection.");
        stopPlayback();
      };

      currentAudio.play().catch(err => {
        console.warn("Autoplay block or audio error:", err);
        stopPlayback();
      });
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.remove('opacity-0', '-translate-y-4');
      toast.classList.add('opacity-100', 'translate-y-0');
      setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', '-translate-y-4');
      }, 3000);
    }
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'HEAD' && (pathname === '/api/speak' || pathname === '/api/tts')) {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
    res.end();
    return;
  }

  // 1. Home Page: Voice Lab UI
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML_PAGE);
    return;
  }

  // 2. API: List all voices
  if (pathname === '/api/voices') {
    try {
      const voices = await getEnglishVoices();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(voices));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 3. API: Speak text and stream MP3 audio
  if (pathname === '/api/speak' || pathname === '/api/tts') {
    const query = parsedUrl.query;
    let voice = query.voice || 'en-US-JennyNeural';
    let text = query.text || 'Hello, I am your technical interviewer.';
    let rate = query.rate || '+0%';
    let pitch = query.pitch || '+0Hz';

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          voice = parsed.voice || voice;
          text = parsed.text || text;
          rate = parsed.rate || rate;
          pitch = parsed.pitch || pitch;
          handleTTSStream(voice, text, rate, pitch, res);
        } catch(e) {
          handleTTSStream(voice, text, rate, pitch, res);
        }
      });
      return;
    }

    handleTTSStream(voice, text, rate, pitch, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

function handleTTSStream(voice, text, rate, pitch, res) {
  try {
    const tts = new MsEdgeTTS();
    tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      .then(() => {
        const { audioStream } = tts.toStream(text, { rate, pitch });
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-cache',
          'Transfer-Encoding': 'chunked'
        });
        audioStream.pipe(res);
        audioStream.on('error', (err) => {
          console.error('Audio stream error:', err);
          if (!res.headersSent) {
            res.writeHead(500);
            res.end();
          }
        });
        audioStream.on('end', () => {
          tts.close();
        });
      })
      .catch((err) => {
        console.error('TTS metadata error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
  } catch (err) {
    console.error('TTS execution error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }
}

server.listen(PORT, () => {
  console.log(`\n=======================================================`);
  console.log(`🎙️  VEVARIO VOICE LAB RUNNING AT:`);
  console.log(`👉  http://localhost:${PORT}`);
  console.log(`=======================================================\n`);
});
