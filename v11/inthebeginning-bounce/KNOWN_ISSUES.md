# Known Issues — inthebeginning bounce V11

## Double Pause Icon

The pause button in the HUD can occasionally render as a double-width pause icon
(two sets of pause bars stacked within the same button area) even in single-player
mode. This appears to be a Unicode rendering artifact — the pause symbol (⏸⏸)
sometimes displays as a ligature at certain viewport sizes or system font
configurations. The button remains functional.

**Workaround**: Resize the browser window slightly, or use the P key to pause.

## Minimize Stops MIDI Playback

On some browsers (notably Firefox on Ubuntu), minimizing the browser window
causes MIDI playback to stop. This is a browser-level limitation:

- **Web Audio API** (used by MIDI/Synth/WASM modes): Some browsers throttle or
  suspend AudioContext when the window is minimized, even though they keep it
  running when the tab is merely backgrounded (e.g., another window on top).
- **HTML5 Audio** (used by MP3 mode): Generally continues playing when minimized.

This cannot be fully resolved from JavaScript. The browser decides when to
suspend the audio context.

**Workaround**: Instead of minimizing, switch to another window while keeping
the game window visible (even partially). Or use MP3 album mode, which uses
HTML5 Audio and is less affected.
