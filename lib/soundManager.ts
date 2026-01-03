export class SoundManager {
    private ctx: AudioContext | null = null;
    private enabled: boolean = true;

    constructor() {
        // AudioContext must be initialized after user interaction in some browsers,
        // but we can create it lazily.
    }

    private getContext(): AudioContext | null {
        if (!this.enabled) return null;
        if (!this.ctx) {
            // Check for window to ensure we are client-side
            if (typeof window !== 'undefined') {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioContextClass) {
                    this.ctx = new AudioContextClass();
                }
            }
        }
        return this.ctx;
    }

    // Call this on first user interaction (click) to unlock audio
    public resumeContext() {
        const ctx = this.getContext();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume();
        }
    }

    public setEnabled(enabled: boolean) {
        this.enabled = enabled;
    }

    // generic tone generator
    private playTone(freq: number, type: OscillatorType, duration: number, vol: number = 0.1) {
        const ctx = this.getContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + duration);
    }

    // 1. Select: Short high-pitched mechanical click
    public playSelect() {
        // High click
        this.playTone(800, 'sine', 0.1, 0.05);
    }

    // 2. Move: Sliding/Thud sound
    public playMove() {
        const ctx = this.getContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.1); // Slide down

        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    }

    // 3. Battle Win: Sharp metallic clash
    public playBattleWin() {
        const ctx = this.getContext();
        if (!ctx) return;

        // Metallic = Triangle + High Overtones
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.3); // Pitch bend

        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);

        // Add a bit of noise for impact
        this.playNoise(0.1, 0.15); // Short impact
    }

    // 4. Battle Tie / Bomb: Explosion
    public playExplosion() {
        this.playNoise(0.5, 0.3); // Longer, louder noise
    }

    private playNoise(duration: number, volume: number) {
        const ctx = this.getContext();
        if (!ctx) return;

        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        // Lowpass filter for "boom" sound
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start();
    }

    // 5. Commander Death / Flag Reveal: Dramatic Alert
    public playCommanderDeath() {
        const ctx = this.getContext();
        if (!ctx) return;

        const t = ctx.currentTime;
        // Alarm sound: High -> Low -> High -> Low
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.linearRampToValueAtTime(300, t + 0.2);
        osc.frequency.linearRampToValueAtTime(500, t + 0.4);
        osc.frequency.linearRampToValueAtTime(200, t + 0.6);

        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(t + 0.7);
    }

    // 6. Player Defeated (Flag Captured): Bugle Call (Sad/Final)
    public playPlayerDefeated() {
        const ctx = this.getContext();
        if (!ctx) return;

        const t = ctx.currentTime;
        // Minor Triad: C -> Eb -> G -> C(High)
        // Actually, let's do a "Taps" style or descending defeat sound for enemy, triumphant for us
        // Let's do a generic "Military Call"
        // G3, C4, E4, G4
        this.playToneAtTime(392.00, t, 0.15); // G4
        this.playToneAtTime(523.25, t + 0.15, 0.15); // C5
        this.playToneAtTime(659.25, t + 0.3, 0.15); // E5
        this.playToneAtTime(783.99, t + 0.45, 0.4); // G5 (Long)
    }

    // 7. Victory: Fanfare
    public playVictory() {
        const ctx = this.getContext();
        if (!ctx) return;

        const t = ctx.currentTime;
        // C Major Arpeggio + Final Chord
        // C4, E4, G4, C5 ..... C5-E5-G5 Chord
        const speed = 0.12;

        this.playToneAtTime(523.25, t, speed); // C5
        this.playToneAtTime(659.25, t + speed, speed); // E5
        this.playToneAtTime(783.99, t + speed * 2, speed); // G5
        this.playToneAtTime(1046.50, t + speed * 3, 0.6); // C6

        // Harmony at the end
        this.playToneAtTime(523.25, t + speed * 3, 0.6, 0.1);
        this.playToneAtTime(659.25, t + speed * 3, 0.6, 0.1);
    }

    private playToneAtTime(freq: number, time: number, duration: number, vol: number = 0.15) {
        const ctx = this.getContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square'; // Chiptune-like / Brass-like
        // Smooth out square wave slightly
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2000;

        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol, time + 0.02);
        gain.gain.setValueAtTime(vol, time + duration - 0.05);
        gain.gain.linearRampToValueAtTime(0, time + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(time);
        osc.stop(time + duration + 0.1);
    }
    // 8. Game Start: Morale Boosting Drum Roll / Charge
    public playStartGame() {
        const ctx = this.getContext();
        if (!ctx) return;

        const t = ctx.currentTime;

        // Rapid snare drum effect (noise bursts)
        for (let i = 0; i < 8; i++) {
            this.playNoiseAtTime(t + i * 0.1, 0.05, 0.1);
        }

        // Final "Charge!" (Trumpet-ish)
        // C4 E4 G4 C5 (Fast Rising)
        const start = t + 0.8;
        this.playToneAtTime(523.25, start, 0.1);
        this.playToneAtTime(659.25, start + 0.1, 0.1);
        this.playToneAtTime(783.99, start + 0.2, 0.1);
        this.playToneAtTime(1046.50, start + 0.3, 0.4);
    }

    private playNoiseAtTime(time: number, duration: number, volume: number) {
        const ctx = this.getContext();
        if (!ctx) return;

        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

        noise.connect(gain);
        gain.connect(ctx.destination);

        noise.start(time);
    }
}

export const soundManager = new SoundManager();
