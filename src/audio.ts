type NoiseFilter = "lowpass" | "highpass" | "bandpass";

class TacticalAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private runnerAlarm: HTMLAudioElement | null = null;
  private lastShot = 0;

  public resume(): void {
    if (!this.context) this.initialize();
    if (this.context?.state === "suspended") void this.context.resume();
  }

  private initialize(): void {
    if (!window.AudioContext) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0.34;
    this.master.connect(this.context.destination);
    this.runnerAlarm = new Audio("./audio/runner-rush-klaxon.mp3");
    this.runnerAlarm.preload = "auto";
    this.runnerAlarm.volume = 0.44;
    this.noiseBuffer = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  }

  private get active(): boolean {
    return this.context?.state === "running" && !!this.master && !!this.noiseBuffer;
  }

  private output(pan: number): AudioNode {
    const panner = this.context!.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(this.master!);
    return panner;
  }

  private noise(duration: number, gain: number, filter: NoiseFilter, frequency: number, pan = 0): void {
    if (!this.active) return;
    const context = this.context!;
    const start = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const band = context.createBiquadFilter();
    band.type = filter;
    band.frequency.value = frequency;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(band).connect(envelope).connect(this.output(pan));
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  private tone(frequency: number, endFrequency: number, duration: number, gain: number, type: OscillatorType, pan = 0, delay = 0): void {
    if (!this.active) return;
    const context = this.context!;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope).connect(this.output(pan));
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private klaxonBlast(frequency: number, duration: number, gain: number, pan: number, delay: number): void {
    if (!this.active) return;
    const context = this.context!;
    const start = context.currentTime + delay;
    const end = start + duration;
    const fundamental = context.createOscillator();
    const harmonic = context.createOscillator();
    const fundamentalGain = context.createGain();
    const harmonicGain = context.createGain();
    const filter = context.createBiquadFilter();
    const tremolo = context.createGain();
    const tremoloOscillator = context.createOscillator();
    const tremoloDepth = context.createGain();
    const envelope = context.createGain();

    fundamental.type = "sawtooth";
    fundamental.frequency.value = frequency;
    harmonic.type = "square";
    harmonic.frequency.value = frequency * 2.01;
    fundamentalGain.gain.value = 0.76;
    harmonicGain.gain.value = 0.14;
    filter.type = "lowpass";
    filter.frequency.value = 1180;
    filter.Q.value = 1.4;

    // A slight mechanical flutter keeps the sustained horn from sounding like
    // a clean game-console oscillator.
    tremolo.gain.value = 0.74;
    tremoloOscillator.type = "sine";
    tremoloOscillator.frequency.value = 11.5;
    tremoloDepth.gain.value = 0.18;
    tremoloOscillator.connect(tremoloDepth).connect(tremolo.gain);

    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.045);
    envelope.gain.setValueAtTime(gain, end - 0.09);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    fundamental.connect(fundamentalGain).connect(filter);
    harmonic.connect(harmonicGain).connect(filter);
    filter.connect(tremolo).connect(envelope).connect(this.output(pan));
    fundamental.start(start);
    harmonic.start(start);
    tremoloOscillator.start(start);
    fundamental.stop(end + 0.02);
    harmonic.stop(end + 0.02);
    tremoloOscillator.stop(end + 0.02);
  }

  public fire(weapon: "rifle" | "shotgun" | "smg" | "carbine", pan: number): void {
    if (!this.active) return;
    const now = this.context!.currentTime;
    const duck = now - this.lastShot < 0.04 ? 0.42 : 1;
    this.lastShot = now;
    if (weapon === "shotgun") {
      this.noise(0.2, 0.72 * duck, "lowpass", 720, pan);
      this.tone(150, 58, 0.18, 0.28 * duck, "sine", pan);
    } else if (weapon === "smg") {
      this.noise(0.055, 0.38 * duck, "highpass", 1450, pan);
      this.tone(500, 210, 0.045, 0.11 * duck, "square", pan);
    } else if (weapon === "rifle") {
      this.noise(0.13, 0.62 * duck, "bandpass", 950, pan);
      this.tone(310, 88, 0.1, 0.21 * duck, "sawtooth", pan);
    } else {
      this.noise(0.085, 0.48 * duck, "highpass", 1100, pan);
      this.tone(380, 130, 0.07, 0.15 * duck, "square", pan);
    }
  }

  public survivorHit(): void {
    this.noise(0.09, 0.18, "lowpass", 520);
    this.tone(190, 80, 0.12, 0.1, "sine");
  }

  public contactDown(): void {
    this.noise(0.16, 0.16, "lowpass", 760);
  }

  public breach(): void {
    this.noise(0.32, 0.7, "lowpass", 620);
    this.tone(105, 42, 0.34, 0.3, "sine");
  }

  public cacheSecured(): void {
    this.tone(420, 660, 0.12, 0.13, "triangle", -0.12);
    window.setTimeout(() => this.tone(560, 820, 0.13, 0.12, "triangle", 0.12), 90);
  }

  private synthesizedRunnerRush(): void {
    // Long, low alternating blasts read as a physical warning klaxon rather
    // than an arcade alert if the recorded asset cannot be played.
    this.klaxonBlast(285, 0.62, 0.2, -0.08, 0);
    this.klaxonBlast(218, 0.62, 0.22, 0.08, 0.7);
    this.klaxonBlast(285, 0.72, 0.2, -0.08, 1.4);
  }

  public runnerRush(): void {
    const alarm = this.runnerAlarm;
    if (!alarm) {
      this.synthesizedRunnerRush();
      return;
    }
    alarm.currentTime = 0;
    void alarm.play().catch(() => this.synthesizedRunnerRush());
  }
}

export const tacticalAudio = new TacticalAudio();
