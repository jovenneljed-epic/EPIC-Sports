// NBA Arena Audio Engine - High-Fidelity Multi-Source Audio
class ArenaAudioEngine {
  private ctx: AudioContext | null = null;
  private soundCache: Map<string, HTMLAudioElement> = new Map();

  // CDN links to authentic stadium/arena clips
  private soundUrls = {
    // Authentic NBA end-of-period electro-mechanical horn
    nbaBuzzer: 'https://cdn.freesound.org/previews/145/145398_2615119-lq.mp3',
    // Authentic official Fox 40 referee pea-less whistle
    refWhistle: 'https://cdn.freesound.org/previews/218/218823_3244837-lq.mp3',
    // Table scorer desk dual-tone electronic sub horn
    subHorn: 'https://cdn.freesound.org/previews/369/369952_6687700-lq.mp3',
    // Pure indoor hardwood nylon swish sound
    nbaSwish: 'https://cdn.freesound.org/previews/518/518888_11270273-lq.mp3',
    // Authentic indoor stadium crowd clapping and cheering
    crowdClapping: 'https://actions.google.com/sounds/v1/ambiences/indoor_stadium_crowd.ogg',
  };

  constructor() {
    // Preload audio elements into memory for instant, zero-latency trigger
    if (typeof window !== 'undefined') {
      Object.entries(this.soundUrls).forEach(([key, url]) => {
        const audio = new Audio(url);
        audio.preload = 'auto';
        this.soundCache.set(key, audio);
      });
    }
  }

  private playMediaAudio(key: keyof typeof this.soundUrls, fallbackFn: () => void, volume = 0.85) {
    const audio = this.soundCache.get(key);
    if (audio) {
      audio.currentTime = 0;
      audio.volume = volume;
      audio.play().catch(() => {
        // Fallback to synthetic oscillator if offline or browser blocked autoplay
        fallbackFn();
      });
    } else {
      fallbackFn();
    }
  }

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // 1. NBA End-of-Period / Shot Clock Arena Buzzer
  playArenaBuzzer() {
    this.playMediaAudio('nbaBuzzer', () => this.synthesizeNbaBuzzer(), 0.9);
  }

  // 2. Table Official Substitution Klaxon
  playSubstitutionHorn() {
    this.playMediaAudio('subHorn', () => this.synthesizeSubHorn(), 0.75);
  }

  // 3. Fox 40 Referee Whistle (Fouls & Stoppages)
  playWhistle() {
    this.playMediaAudio('refWhistle', () => this.synthesizeWhistle(), 0.7);
  }

  // 4. Clean Ball Through Net Swish
  playSwish() {
    this.playMediaAudio('nbaSwish', () => this.synthesizeSwish(), 0.8);
  }

  // 5. Arena Crowd Clapping & Ovation (Lineup Intros & Victories)
  playCrowdClapping() {
    this.playMediaAudio('crowdClapping', () => this.synthesizeClapping(), 0.75);
  }

  // --- Acoustic Synthesizer Fallbacks (Tuned to NBA Frequencies) ---

  private synthesizeNbaBuzzer(durationMs = 1500) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const dur = durationMs / 1000;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(118, now);

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(236, now);

    osc3.type = 'square';
    osc3.frequency.setValueAtTime(354, now);

    gainNode.gain.setValueAtTime(0.4, now);
    gainNode.gain.setValueAtTime(0.4, now + dur - 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    osc3.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    osc1.stop(now + dur);
    osc2.stop(now + dur);
    osc3.stop(now + dur);
  }

  private synthesizeSubHorn(durationMs = 700) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const dur = durationMs / 1000;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(466.16, now);
    osc.frequency.setValueAtTime(392.00, now + 0.18);

    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur);
  }

  private synthesizeWhistle(durationMs = 450) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const dur = durationMs / 1000;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(2950, now);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2985, now);

    gainNode.gain.setValueAtTime(0.25, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + dur);
    osc2.stop(now + dur);
  }

  private synthesizeSwish() {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.Q.setValueAtTime(2.8, now);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    noise.start(now);
  }

  // Fallback synthetic stadium clapping and cheering noise simulation
  private synthesizeClapping(durationMs = 3000) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const dur = durationMs / 1000;
    const bufferSize = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.4;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1200, now); // Sharp transient sounds for clapping

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.01, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.5);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    noise.start(now);
  }
}

export const arenaAudio = new ArenaAudioEngine();