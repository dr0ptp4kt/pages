/**
 * SpessaSynth Bridge — connects SpessaSynth SoundFont synthesizer
 * to the inthebeginning bounce game interfaces.
 *
 * SpessaSynth provides true FluidSynth-equivalent SoundFont synthesis
 * via AudioWorklet, rendering instrument samples from a GM SoundFont
 * (FluidR3_GM.sf2, 142MB) for album-quality audio output.
 *
 * Usage:
 *   const bridge = new SpessaBridge();
 *   await bridge.init('../../shared/audio/soundfonts/FluidR3_GM.sf2');
 *   bridge.programChange(0, 40);  // violin on channel 0
 *   bridge.noteOn(0, 60, 100);    // middle C, velocity 100
 *   bridge.noteOff(0, 60);
 *
 * @license Apache-2.0 (SpessaSynth by Spessasus)
 */

class SpessaBridge {
  constructor() {
    /** @type {Object|null} SpessaSynth WorkletSynthesizer instance. */
    this._synth = null;

    /** @type {AudioContext|null} */
    this._ctx = null;

    /** @type {boolean} Whether the synth is initialized and ready. */
    this.ready = false;

    /** @type {boolean} Whether SoundFont is loaded. */
    this.sf2Loaded = false;

    /** @type {string} Status message for UI display. */
    this.status = 'Not initialized';

    /** @type {number} SoundFont file size in bytes (for progress). */
    this._sf2Size = 0;

    /** @type {Function|null} Progress callback: (loaded, total) => void. */
    this.onProgress = null;

    /** @type {GainNode|null} Master gain for volume control. */
    this._masterGain = null;
  }

  /**
   * Initialize the synthesizer and load a SoundFont.
   * @param {string} sf2Url - URL to the .sf2 SoundFont file.
   * @param {AudioContext} [sharedCtx] - Optional shared AudioContext.
   * @returns {Promise<boolean>} True if initialization succeeded.
   */
  async init(sf2Url) {
    try {
      this.status = 'Loading SoundFont...';

      // Fetch SF2 with progress tracking
      const sf2Buffer = await this._fetchWithProgress(sf2Url);
      if (!sf2Buffer) {
        this.status = 'SoundFont download failed';
        return false;
      }

      this.status = 'Initializing synthesizer...';

      // Create AudioContext
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();

      // Load the AudioWorklet processor
      await this._ctx.audioWorklet.addModule('js/spessasynth_processor.min.js');

      // Create the WorkletSynthesizer from the bundled SpessaSynth
      const { WorkletSynthesizer } = window.SpessaSynth;
      this._synth = new WorkletSynthesizer(this._ctx);

      // Load the SoundFont
      await this._synth.soundBankManager.addSoundBank(sf2Buffer, 'gm');
      await this._synth.isReady;

      // Connect synth output to destination through a gain node
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = 0.8;
      this._masterGain.connect(this._ctx.destination);
      this._synth.connect(this._masterGain);

      this.ready = true;
      this.sf2Loaded = true;
      this.status = 'Ready';
      console.log('SpessaBridge: SoundFont loaded, synthesizer ready');
      return true;
    } catch (e) {
      console.warn('SpessaBridge: Initialization failed:', e.message);
      this.status = `Error: ${e.message}`;
      this.ready = false;
      return false;
    }
  }

  /**
   * Fetch a file with progress tracking.
   * @param {string} url
   * @returns {Promise<ArrayBuffer|null>}
   */
  async _fetchWithProgress(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;

      const total = parseInt(resp.headers.get('content-length') || '0', 10);
      this._sf2Size = total;

      if (!resp.body || !total) {
        // No streaming — just get the buffer
        return resp.arrayBuffer();
      }

      // Stream with progress
      const reader = resp.body.getReader();
      const chunks = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (this.onProgress) {
          this.onProgress(loaded, total);
        }
        this.status = `Loading SoundFont: ${Math.round(loaded / 1048576)}/${Math.round(total / 1048576)} MB`;
      }

      // Combine chunks into single ArrayBuffer
      const combined = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      return combined.buffer;
    } catch (e) {
      console.warn('SpessaBridge: Fetch error:', e.message);
      return null;
    }
  }

  /**
   * Resume the AudioContext (required after user gesture).
   */
  async resume() {
    if (this._ctx && this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
  }

  /**
   * Send a note-on event.
   * @param {number} channel - MIDI channel (0-15).
   * @param {number} note - MIDI note number (0-127).
   * @param {number} velocity - Note velocity (0-127).
   */
  noteOn(channel, note, velocity) {
    if (!this._synth || !this.ready) return;
    this._synth.noteOn(channel, note, velocity);
  }

  /**
   * Send a note-off event.
   * @param {number} channel - MIDI channel (0-15).
   * @param {number} note - MIDI note number (0-127).
   */
  noteOff(channel, note) {
    if (!this._synth || !this.ready) return;
    this._synth.noteOff(channel, note);
  }

  /**
   * Change the instrument (GM program) on a channel.
   * @param {number} channel - MIDI channel (0-15).
   * @param {number} program - GM program number (0-127).
   */
  programChange(channel, program) {
    if (!this._synth || !this.ready) return;
    this._synth.programChange(channel, program);
  }

  /**
   * Set channel volume.
   * @param {number} channel - MIDI channel (0-15).
   * @param {number} volume - Volume (0-127).
   */
  setChannelVolume(channel, volume) {
    if (!this._synth || !this.ready) return;
    this._synth.controllerChange(channel, 7, volume); // CC7 = volume
  }

  /**
   * Set master volume.
   * @param {number} vol - Volume (0-1).
   */
  setVolume(vol) {
    if (this._synth && this.ready) {
      this._synth.setMainVolume(Math.round(vol * 127));
    }
  }

  /**
   * Send pitch bend.
   * @param {number} channel - MIDI channel (0-15).
   * @param {number} value - Pitch bend value (0-16383, center=8192).
   */
  pitchBend(channel, value) {
    if (!this._synth || !this.ready) return;
    // SpessaSynth uses MSB/LSB format
    const msb = (value >> 7) & 0x7f;
    const lsb = value & 0x7f;
    this._synth.pitchWheel(channel, msb, lsb);
  }

  /**
   * Stop all notes on all channels.
   */
  allNotesOff() {
    if (!this._synth || !this.ready) return;
    for (let ch = 0; ch < 16; ch++) {
      this._synth.controllerChange(ch, 123, 0); // CC123 = all notes off
    }
  }

  /**
   * Get the AudioContext (for sharing with other audio components).
   * @returns {AudioContext|null}
   */
  getAudioContext() {
    return this._ctx;
  }

  /**
   * Clean up resources.
   */
  destroy() {
    if (this._synth) {
      this.allNotesOff();
      this._synth = null;
    }
    this.ready = false;
    this.sf2Loaded = false;
    this.status = 'Destroyed';
  }
}
