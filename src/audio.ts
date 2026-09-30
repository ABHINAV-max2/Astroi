/**
 * Web Audio API Sound Synthesizer for Asteroids Vector Arcade
 * 100% procedurally synthesized - no external audio assets needed.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private thrustGain: GainNode | null = null;
  private thrustOsc: OscillatorNode | null = null;
  private thrustNoise: AudioBufferSourceNode | null = null;
  private isThrustPlaying: boolean = false;
  private beatPitchToggle: boolean = false;
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    // AudioContext will be lazily initialized on first user gesture
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private createNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    // Brown/pink noise for explosions and engine rumble
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5; // Gain compensation
    }
    this.noiseBuffer = buffer;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.isThrustPlaying) {
      this.stopThrust();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // Laser Fire Sound (classic downward chirp)
  public playLaser() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.12);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.12);
  }

  // Continuous Thrust Hum
  public startThrust() {
    if (this.isMuted || this.isThrustPlaying) return;
    this.initContext();
    if (!this.ctx || !this.noiseBuffer) return;

    this.isThrustPlaying = true;
    const t = this.ctx.currentTime;

    // Filtered noise
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;
    noiseSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, t);

    // Low rumble oscillator
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(65, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.05);

    noiseSource.connect(filter);
    filter.connect(gain);
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    noiseSource.start(t);
    osc.start(t);

    this.thrustNoise = noiseSource;
    this.thrustOsc = osc;
    this.thrustGain = gain;
  }

  public stopThrust() {
    if (!this.isThrustPlaying || !this.ctx || !this.thrustGain) {
      this.isThrustPlaying = false;
      return;
    }
    const t = this.ctx.currentTime;
    this.thrustGain.gain.cancelScheduledValues(t);
    this.thrustGain.gain.setValueAtTime(this.thrustGain.gain.value, t);
    this.thrustGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    const noise = this.thrustNoise;
    const osc = this.thrustOsc;

    setTimeout(() => {
      try {
        noise?.stop();
        osc?.stop();
      } catch {
        // Ignored
      }
    }, 100);

    this.isThrustPlaying = false;
    this.thrustGain = null;
    this.thrustOsc = null;
    this.thrustNoise = null;
  }

  // Procedural Explosions (Small, Medium, Large)
  public playExplosion(size: 'small' | 'medium' | 'large' | 'ship') {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.noiseBuffer) return;

    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    let duration = 0.25;
    let startFreq = 400;
    let endFreq = 60;
    let volume = 0.2;

    if (size === 'small') {
      duration = 0.18;
      startFreq = 800;
      endFreq = 180;
      volume = 0.16;
      filter.type = 'bandpass';
    } else if (size === 'medium') {
      duration = 0.35;
      startFreq = 500;
      endFreq = 90;
      volume = 0.22;
      filter.type = 'lowpass';
    } else if (size === 'large') {
      duration = 0.55;
      startFreq = 300;
      endFreq = 40;
      volume = 0.28;
      filter.type = 'lowpass';
    } else if (size === 'ship') {
      duration = 0.85;
      startFreq = 260;
      endFreq = 30;
      volume = 0.35;
      filter.type = 'lowpass';

      // Add dramatic low punch sine wave
      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(120, t);
      sub.frequency.exponentialRampToValueAtTime(30, t + duration);
      subGain.gain.setValueAtTime(0.3, t);
      subGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      sub.connect(subGain);
      subGain.connect(this.ctx.destination);
      sub.start(t);
      sub.stop(t + duration);
    }

    filter.frequency.setValueAtTime(startFreq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);

    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(t);
    noise.stop(t + duration);
  }

  // Hyperspace Teleport Sound
  public playHyperspace() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(950, t + 0.15);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.35);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.35);
  }

  // Atari Heartbeat Background Beat (accelerates as danger increases)
  public playBeat() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Toggle between low pitch A (105 Hz) and pitch B (92 Hz)
    const freq = this.beatPitchToggle ? 105 : 92;
    this.beatPitchToggle = !this.beatPitchToggle;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.08);
  }

  // Extra Life Chime
  public playExtraLife() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    const t = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const noteTime = t + idx * 0.07;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.12, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.14);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.15);
    });
  }

  // Wave Cleared fanfare
  public playWaveCleared() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const notes = [440, 554.37, 659.25, 880];
    const t = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const noteTime = t + idx * 0.09;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.15, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.22);
    });
  }
}

export const sounds = new SoundEngine();
