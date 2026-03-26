/**
 * AudioWorklet Processor for WASM Synthesizer.
 *
 * Runs in the audio thread. Receives note_on/note_off messages from the
 * main thread and renders audio via the WASM synth engine.
 *
 * Communication protocol (main thread → worklet):
 *   { type: 'init', wasmBytes: ArrayBuffer }   - Initialize WASM module
 *   { type: 'note_on', note, velocity, channel }
 *   { type: 'note_off', note, channel }
 *   { type: 'program_change', channel, program }
 *   { type: 'set_volume', volume }
 *   { type: 'set_pitch_shift', semitones }
 *   { type: 'set_tempo_mult', mult }
 *   { type: 'stop_all' }
 *
 * Communication protocol (worklet → main thread):
 *   { type: 'ready' }                          - WASM initialized
 *   { type: 'voice_count', count }              - Active voice count
 */

class WasmSynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._engine = null;
    this._wasmMemory = null;
    this._ready = false;

    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  async _handleMessage(msg) {
    switch (msg.type) {
      case 'init':
        await this._initWasm(msg.wasmBytes);
        break;
      case 'note_on':
        if (this._engine) {
          this._engine.note_on(msg.note, msg.velocity, msg.channel);
        }
        break;
      case 'note_off':
        if (this._engine) {
          this._engine.note_off(msg.note, msg.channel);
        }
        break;
      case 'program_change':
        if (this._engine) {
          this._engine.program_change(msg.channel, msg.program);
        }
        break;
      case 'set_volume':
        if (this._engine) {
          this._engine.set_volume(msg.volume);
        }
        break;
      case 'set_pitch_shift':
        if (this._engine) {
          this._engine.set_pitch_shift(msg.semitones);
        }
        break;
      case 'set_tempo_mult':
        if (this._engine) {
          this._engine.set_tempo_mult(msg.mult);
        }
        break;
      case 'stop_all':
        if (this._engine) {
          this._engine.stop_all();
        }
        break;
      case 'load_sf2':
        if (this._ready && this._wasmExports && msg.sf2Bytes) {
          this._loadSf2(new Uint8Array(msg.sf2Bytes));
        }
        break;
      case 'set_use_sf2':
        if (this._engine) {
          this._wasmExports.wasmsynthengine_set_use_sf2(this._enginePtr, msg.value ? 1 : 0);
        }
        break;
    }
  }

  _loadSf2(sf2Data) {
    try {
      // Allocate WASM memory for the SF2 data
      const mem = this._wasmMemory;
      const alloc = this._wasmExports.__wbindgen_malloc;
      const len = sf2Data.length;

      if (!alloc) {
        this.port.postMessage({ type: 'sf2_error', message: 'No allocator in WASM' });
        return;
      }

      const ptr = alloc(len, 1);
      const wasmBytes = new Uint8Array(mem.buffer, ptr, len);
      wasmBytes.set(sf2Data);

      const ok = this._wasmExports.wasmsynthengine_load_sf2(this._enginePtr, ptr, len);

      // Free the allocated memory
      const dealloc = this._wasmExports.__wbindgen_free;
      if (dealloc) dealloc(ptr, len, 1);

      if (ok) {
        const presets = this._wasmExports.wasmsynthengine_sf2_preset_count(this._enginePtr);
        const samples = this._wasmExports.wasmsynthengine_sf2_sample_count(this._enginePtr);
        this.port.postMessage({ type: 'sf2_loaded', presets, samples });
      } else {
        this.port.postMessage({ type: 'sf2_error', message: 'Failed to parse SF2' });
      }
    } catch (e) {
      this.port.postMessage({ type: 'sf2_error', message: e.message });
    }
  }

  async _initWasm(wasmBytes) {
    try {
      const { instance } = await WebAssembly.instantiate(wasmBytes, {
        // wasm-bindgen needs a minimal import object
        './wasm_synth_bg.js': {
          // wasm-bindgen heap management stubs for worklet context
          __wbindgen_throw: (ptr, len) => {
            // Minimal error handling in worklet
            console.error('WASM error in worklet');
          },
        },
      });

      this._wasmMemory = instance.exports.memory;

      // Create engine via the raw WASM exports
      // wasm-pack generates: wasmsynthengine_new(sample_rate) -> ptr
      const ptr = instance.exports.wasmsynthengine_new(sampleRate);
      this._wasmExports = instance.exports;
      this._enginePtr = ptr;

      // Wrap raw exports into a convenient object
      this._engine = {
        note_on: (note, vel, ch) =>
          this._wasmExports.wasmsynthengine_note_on(this._enginePtr, note, vel, ch),
        note_off: (note, ch) =>
          this._wasmExports.wasmsynthengine_note_off(this._enginePtr, note, ch),
        program_change: (ch, prog) =>
          this._wasmExports.wasmsynthengine_program_change(this._enginePtr, ch, prog),
        set_volume: (v) =>
          this._wasmExports.wasmsynthengine_set_volume(this._enginePtr, v),
        set_pitch_shift: (s) =>
          this._wasmExports.wasmsynthengine_set_pitch_shift(this._enginePtr, s),
        set_tempo_mult: (m) =>
          this._wasmExports.wasmsynthengine_set_tempo_mult(this._enginePtr, m),
        stop_all: () =>
          this._wasmExports.wasmsynthengine_stop_all(this._enginePtr),
        render_block: (n) =>
          this._wasmExports.wasmsynthengine_render_block(this._enginePtr, n),
        buffer_ptr: () =>
          this._wasmExports.wasmsynthengine_buffer_ptr(this._enginePtr),
        buffer_len: () =>
          this._wasmExports.wasmsynthengine_buffer_len(this._enginePtr),
        active_voice_count: () =>
          this._wasmExports.wasmsynthengine_active_voice_count(this._enginePtr),
      };

      this._ready = true;
      this.port.postMessage({ type: 'ready' });
    } catch (e) {
      this.port.postMessage({ type: 'error', message: e.message });
    }
  }

  process(inputs, outputs, parameters) {
    if (!this._ready || !this._engine) {
      return true; // Keep alive, output silence
    }

    const output = outputs[0];
    if (!output || !output.length) return true;

    const numSamples = output[0].length; // Typically 128

    // Render audio block via WASM
    this._engine.render_block(numSamples);

    // Read rendered samples from WASM memory
    const bufferPtr = this._engine.buffer_ptr();
    const wasmF32 = new Float32Array(
      this._wasmMemory.buffer,
      bufferPtr,
      numSamples
    );

    // Copy to all output channels (mono → duplicate to stereo)
    for (let ch = 0; ch < output.length; ch++) {
      output[ch].set(wasmF32);
    }

    return true; // Keep processor alive
  }
}

registerProcessor('wasm-synth-processor', WasmSynthProcessor);
