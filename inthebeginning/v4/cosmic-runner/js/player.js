/**
 * Audio Player for Cosmic Runner V3.
 *
 * HTML5 Audio playback with lock-screen support via Media Session API.
 * Shows full track title (earth-name + epoch name).
 * Handles track navigation including rewind-to-start on first track.
 */

class GamePlayer {
  constructor(musicSync) {
    this.musicSync = musicSync;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.isPlaying = false;
    this.currentTrack = 0;
    this.volume = 0.8;
    this.audio.volume = this.volume;
    this._rafId = 0;
    this._seeking = false;

    this.playBtn = null;
    this.prevBtn = null;
    this.nextBtn = null;
    this.seekBar = null;
    this.timeDisplay = null;
    this.volSlider = null;
    this.muteBtn = null;

    this.onTimeUpdate = null;
    this.onTrackChange = null;
  }

  bindUI() {
    this.playBtn = document.getElementById('play-btn');
    this.prevBtn = document.getElementById('prev-btn');
    this.nextBtn = document.getElementById('next-btn');
    this.seekBar = document.getElementById('music-seek');
    this.timeDisplay = document.getElementById('music-time');
    this.volSlider = document.getElementById('music-vol');
    this.muteBtn = document.getElementById('mute-btn');
    this._bindEvents();
  }

  _bindEvents() {
    if (this.playBtn) this.playBtn.addEventListener('click', () => this.togglePlay());
    if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.prevTrack());
    if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.nextTrack());

    if (this.seekBar) {
      this.seekBar.addEventListener('mousedown', () => { this._seeking = true; });
      this.seekBar.addEventListener('touchstart', () => { this._seeking = true; });
      this.seekBar.addEventListener('input', (e) => {
        if (this._seeking) {
          const pct = parseFloat(e.target.value) / 100;
          this.audio.currentTime = pct * (this.audio.duration || 0);
        }
      });
      this.seekBar.addEventListener('mouseup', () => { this._seeking = false; });
      this.seekBar.addEventListener('touchend', () => { this._seeking = false; });
    }

    if (this.volSlider) {
      this.volSlider.addEventListener('input', (e) => {
        this.volume = parseInt(e.target.value) / 100;
        this.audio.volume = this.volume;
        this.audio.muted = false;
        this._updateMuteIcon();
      });
    }

    if (this.muteBtn) {
      this.muteBtn.addEventListener('click', () => {
        this.audio.muted = !this.audio.muted;
        this._updateMuteIcon();
      });
    }

    this.audio.addEventListener('ended', () => {
      if (this.currentTrack < this.musicSync.getTrackCount() - 1) {
        this.nextTrack();
      } else {
        this.loadTrack(0).then(() => this.play());
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isPlaying) {
        if (this.onTimeUpdate) this.onTimeUpdate(this.audio.currentTime);
      }
    });
  }

  async loadTrack(index) {
    if (index < 0 || index >= this.musicSync.getTrackCount()) return;
    this.currentTrack = index;
    this.musicSync.currentTrack = index;

    const audioUrl = this.musicSync.getAudioUrl(index);
    if (audioUrl) {
      this.audio.src = audioUrl;
      this.audio.load();
    }

    await this.musicSync.loadTrackEvents(index);
    this._updateMediaSession(index);
    if (this.onTrackChange) this.onTrackChange(index);
  }

  _updateMediaSession(index) {
    if (!('mediaSession' in navigator)) return;
    const track = this.musicSync.getTrack(index);
    if (!track) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${track.title} \u2014 ${track.epochName}`,
      artist: 'aiphenomenon',
      album: 'In The Beginning Phase 0 \u2014 V8 Sessions',
    });

    navigator.mediaSession.setActionHandler('play', () => this.play());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.prevTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.nextTrack());
  }

  togglePlay() {
    this.isPlaying ? this.pause() : this.play();
  }

  play() {
    if (this.audio.src || this.audio.currentSrc) {
      this.audio.play().catch(() => {});
    }
    this.isPlaying = true;
    this._updatePlayIcon();
    this._startTimeLoop();
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this._updatePlayIcon();
    this._stopTimeLoop();
  }

  prevTrack() {
    if (this.currentTrack === 0) {
      // On first track, restart it
      this.audio.currentTime = 0;
    } else {
      this.loadTrack(this.currentTrack - 1).then(() => {
        if (this.isPlaying) this.play();
      });
    }
  }

  nextTrack() {
    if (this.currentTrack < this.musicSync.getTrackCount() - 1) {
      this.loadTrack(this.currentTrack + 1).then(() => {
        if (this.isPlaying) this.play();
      });
    }
    // On last track, forward button does nothing
  }

  getCurrentTime() { return this.audio.currentTime || 0; }
  getDuration() { return this.audio.duration || 0; }

  _updatePlayIcon() {
    if (this.playBtn) this.playBtn.textContent = this.isPlaying ? '\u23F8' : '\u25B6';
  }

  _updateMuteIcon() {
    if (this.muteBtn) this.muteBtn.textContent = this.audio.muted ? '\u{1F507}' : '\u{1F50A}';
  }

  _startTimeLoop() {
    if (this._rafId) return;
    const loop = () => {
      this._updateTimeUI();
      if (this.onTimeUpdate) this.onTimeUpdate(this.audio.currentTime);
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _stopTimeLoop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
  }

  _updateTimeUI() {
    const current = this.audio.currentTime || 0;
    const duration = this.audio.duration || 0;
    if (this.seekBar && !this._seeking && duration > 0) {
      this.seekBar.value = ((current / duration) * 100).toFixed(1);
    }
    if (this.timeDisplay) {
      this.timeDisplay.textContent = `${GamePlayer.formatTime(current)} / ${GamePlayer.formatTime(duration)}`;
    }
  }

  static formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  destroy() {
    this._stopTimeLoop();
    this.audio.pause();
    this.audio.src = '';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GamePlayer };
}
