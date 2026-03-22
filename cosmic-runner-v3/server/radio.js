#!/usr/bin/env node
/**
 * Streaming Radio Server for Cosmic Runner V3.
 *
 * Provides a never-ending infinite radio experience via Server-Sent Events (SSE).
 * Serves V8 Sessions MP3 audio and synchronized note event data.
 *
 * Architecture:
 * - /stream/events  — SSE endpoint for note events (JSON arrays)
 * - /stream/state   — Current playback state (track, time, etc.)
 * - /audio/:file    — Proxies MP3 files from the audio directory
 * - /api/tracks     — Track listing API
 * - /api/playlist   — Current and upcoming tracks in the infinite playlist
 *
 * The server shuffles through the 12 V8 Sessions tracks infinitely,
 * broadcasting synchronized note events to all connected clients.
 *
 * Usage:
 *   node radio.js [--port 8088] [--audio-dir ../audio]
 *
 * Zero npm dependencies — uses only Node.js stdlib.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 8088;
const BROADCAST_INTERVAL_MS = 100; // Send events every 100ms
const LOOKAHEAD_WINDOW = 0.5;     // Seconds of note events to send each tick

/**
 * Parse command-line arguments.
 * @returns {{port: number, audioDir: string}}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let port = DEFAULT_PORT;
  let audioDir = path.resolve(__dirname, '..', 'audio');

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
      port = parseInt(args[i + 1], 10) || DEFAULT_PORT;
      i++;
    } else if ((args[i] === '--audio-dir' || args[i] === '-d') && args[i + 1]) {
      audioDir = path.resolve(args[i + 1]);
      i++;
    }
  }

  return { port, audioDir };
}

// ---------------------------------------------------------------------------
// Album Data
// ---------------------------------------------------------------------------

/**
 * Load album metadata and track note data.
 * @param {string} audioDir
 * @returns {{album: Object, trackNotes: Map<number, {legend: Object, events: Array}>}}
 */
function loadAlbumData(audioDir) {
  const albumPath = path.join(audioDir, 'album_notes.json');
  if (!fs.existsSync(albumPath)) {
    console.error(`Album file not found: ${albumPath}`);
    process.exit(1);
  }

  const album = JSON.parse(fs.readFileSync(albumPath, 'utf-8'));
  const trackNotes = new Map();

  for (let i = 0; i < album.tracks.length; i++) {
    const track = album.tracks[i];
    const notePath = path.join(audioDir, track.file);
    if (fs.existsSync(notePath)) {
      const data = JSON.parse(fs.readFileSync(notePath, 'utf-8'));
      trackNotes.set(i, data);
    }
  }

  return { album, trackNotes };
}

// ---------------------------------------------------------------------------
// Infinite Playlist
// ---------------------------------------------------------------------------

/**
 * Generates an infinite shuffled playlist from the 12 tracks.
 * Uses Fisher-Yates shuffle, never repeating the last track.
 */
class InfinitePlaylist {
  /**
   * @param {number} trackCount
   */
  constructor(trackCount) {
    this.trackCount = trackCount;
    this._queue = [];
    this._lastTrack = -1;
    this._totalPlayed = 0;
  }

  /** Get the next track index. */
  next() {
    if (this._queue.length === 0) {
      this._refill();
    }
    const track = this._queue.shift();
    this._lastTrack = track;
    this._totalPlayed++;
    return track;
  }

  /** Peek at the next N tracks without consuming them. */
  peek(n) {
    while (this._queue.length < n) {
      this._refill();
    }
    return this._queue.slice(0, n);
  }

  _refill() {
    const indices = [];
    for (let i = 0; i < this.trackCount; i++) indices.push(i);
    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    // Avoid repeating the last track
    if (indices[0] === this._lastTrack && indices.length > 1) {
      [indices[0], indices[1]] = [indices[1], indices[0]];
    }
    this._queue.push(...indices);
  }

  get totalPlayed() { return this._totalPlayed; }
}

// ---------------------------------------------------------------------------
// Radio Broadcaster
// ---------------------------------------------------------------------------

/**
 * Manages the radio broadcast state and timing.
 * Advances through the infinite playlist, tracking current position.
 */
class RadioBroadcaster {
  /**
   * @param {Object} album - Album metadata.
   * @param {Map<number, Object>} trackNotes - Per-track note data.
   */
  constructor(album, trackNotes) {
    this.album = album;
    this.trackNotes = trackNotes;
    this.playlist = new InfinitePlaylist(album.tracks.length);

    /** @type {number} Current track index */
    this.currentTrackIndex = -1;
    /** @type {Object|null} Current track metadata */
    this.currentTrack = null;
    /** @type {Object|null} Current track notes */
    this.currentNotes = null;
    /** @type {number} Playback position within current track (seconds) */
    this.position = 0;
    /** @type {number} Last broadcast timestamp (ms) */
    this._lastTick = 0;
    /** @type {number} Total broadcast time (seconds) */
    this.totalTime = 0;
    /** @type {boolean} Whether broadcasting is active */
    this.active = false;
    /** @type {Set<http.ServerResponse>} Connected SSE clients */
    this.clients = new Set();
    /** @type {NodeJS.Timeout|null} */
    this._timer = null;

    // Start with first track
    this._advanceTrack();
  }

  _advanceTrack() {
    this.currentTrackIndex = this.playlist.next();
    this.currentTrack = this.album.tracks[this.currentTrackIndex];
    this.currentNotes = this.trackNotes.get(this.currentTrackIndex) || null;
    this.position = 0;

    // Broadcast track change event
    this._broadcastEvent('track', {
      index: this.currentTrackIndex,
      trackNum: this.currentTrack.track_num,
      title: this.currentTrack.title,
      duration: this.currentTrack.duration,
      audioFile: this.currentTrack.audio_file,
      queuePosition: this.playlist.totalPlayed,
      upcoming: this.playlist.peek(5).map(i => ({
        index: i,
        title: this.album.tracks[i].title
      }))
    });
  }

  start() {
    if (this.active) return;
    this.active = true;
    this._lastTick = Date.now();

    this._timer = setInterval(() => this._tick(), BROADCAST_INTERVAL_MS);
    console.log('[Radio] Broadcasting started');
  }

  stop() {
    this.active = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    console.log('[Radio] Broadcasting stopped');
  }

  _tick() {
    const now = Date.now();
    const dt = (now - this._lastTick) / 1000;
    this._lastTick = now;

    this.position += dt;
    this.totalTime += dt;

    // Check if track ended
    if (this.currentTrack && this.position >= this.currentTrack.duration) {
      this._advanceTrack();
    }

    // Get active events in the current window
    if (this.currentNotes && this.clients.size > 0) {
      const events = this._getActiveEvents(this.position, LOOKAHEAD_WINDOW);
      if (events.length > 0) {
        this._broadcastEvent('notes', {
          time: this.position,
          trackIndex: this.currentTrackIndex,
          events: events
        });
      }
    }
  }

  /**
   * Get events active at the current position.
   * @param {number} time - Current time in seconds.
   * @param {number} window - Lookahead window in seconds.
   * @returns {Array<{note: number, inst: string, vel: number, ch: number}>}
   */
  _getActiveEvents(time, window) {
    if (!this.currentNotes || !this.currentNotes.events) return [];

    const instMap = this.currentNotes.legend ?
      this.currentNotes.legend.instruments : {};
    const events = this.currentNotes.events;
    const active = [];

    // Binary search for approximate start position
    let lo = 0, hi = events.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const evTime = Array.isArray(events[mid]) ? events[mid][0] : events[mid].t;
      if (evTime + (Array.isArray(events[mid]) ? events[mid][1] : events[mid].dur) < time - 0.1) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    for (let i = Math.max(0, lo - 2); i < events.length; i++) {
      const ev = events[i];
      let t, dur, note, inst, vel, ch;

      if (Array.isArray(ev)) {
        // V3 compressed: [t, dur, note, inst_idx, vel, ch]
        t = ev[0]; dur = ev[1]; note = ev[2];
        inst = instMap[String(ev[3])] || 'unknown';
        vel = ev[4]; ch = ev[5];
      } else {
        // V2 object format
        t = ev.t; dur = ev.dur; note = ev.note;
        inst = ev.inst; vel = ev.vel; ch = ev.ch;
      }

      if (t > time + window) break;
      if (t <= time && t + dur > time) {
        active.push({ note, inst, vel, ch });
      }
    }

    return active;
  }

  /**
   * Broadcast an SSE event to all connected clients.
   * @param {string} eventType - Event type name.
   * @param {Object} data - Event data.
   */
  _broadcastEvent(eventType, data) {
    const msg = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(msg);
      } catch (e) {
        this.clients.delete(client);
      }
    }
  }

  /**
   * Add an SSE client connection.
   * @param {http.ServerResponse} res
   */
  addClient(res) {
    this.clients.add(res);

    // Send current state immediately
    const stateMsg = `event: state\ndata: ${JSON.stringify(this.getState())}\n\n`;
    res.write(stateMsg);

    // Start broadcasting if this is the first client
    if (this.clients.size === 1 && !this.active) {
      this.start();
    }
  }

  /**
   * Remove an SSE client connection.
   * @param {http.ServerResponse} res
   */
  removeClient(res) {
    this.clients.delete(res);

    // Stop broadcasting if no clients
    if (this.clients.size === 0 && this.active) {
      this.stop();
    }
  }

  /** Get current playback state. */
  getState() {
    return {
      trackIndex: this.currentTrackIndex,
      trackNum: this.currentTrack ? this.currentTrack.track_num : 0,
      title: this.currentTrack ? this.currentTrack.title : '',
      duration: this.currentTrack ? this.currentTrack.duration : 0,
      position: this.position,
      totalTime: this.totalTime,
      queuePosition: this.playlist.totalPlayed,
      clientCount: this.clients.size,
      upcoming: this.playlist.peek(5).map(i => ({
        index: i,
        title: this.album.tracks[i].title
      }))
    };
  }
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

/**
 * Create and start the HTTP server.
 * @param {number} port
 * @param {string} audioDir
 * @param {RadioBroadcaster} radio
 */
function createServer(port, audioDir, radio) {
  const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.mp3': 'audio/mpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };

  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    // CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // SSE: Stream events
    if (pathname === '/stream/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write(':ok\n\n');

      radio.addClient(res);

      req.on('close', () => {
        radio.removeClient(res);
      });
      return;
    }

    // API: Current state
    if (pathname === '/stream/state' || pathname === '/api/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(radio.getState()));
      return;
    }

    // API: Track listing
    if (pathname === '/api/tracks') {
      const tracks = radio.album.tracks.map((t, i) => ({
        index: i,
        trackNum: t.track_num,
        title: t.title,
        duration: t.duration,
        audioFile: t.audio_file,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        album: radio.album.album,
        artist: radio.album.artist,
        trackCount: tracks.length,
        totalDuration: radio.album.total_duration,
        tracks
      }));
      return;
    }

    // API: Playlist (current + upcoming)
    if (pathname === '/api/playlist') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        current: {
          index: radio.currentTrackIndex,
          title: radio.currentTrack ? radio.currentTrack.title : '',
          position: radio.position,
          duration: radio.currentTrack ? radio.currentTrack.duration : 0,
        },
        upcoming: radio.playlist.peek(20).map(i => ({
          index: i,
          title: radio.album.tracks[i].title,
          duration: radio.album.tracks[i].duration,
        }))
      }));
      return;
    }

    // Audio files: /audio/:filename
    if (pathname.startsWith('/audio/')) {
      const filename = decodeURIComponent(pathname.slice(7));
      // Security: prevent directory traversal
      if (filename.includes('..') || filename.includes('/')) {
        res.writeHead(400);
        res.end('Bad request');
        return;
      }
      const filePath = path.join(audioDir, filename);
      serveFile(res, filePath);
      return;
    }

    // Serve static files from the visualizer directory
    let filePath;
    if (pathname === '/' || pathname === '/index.html') {
      filePath = path.resolve(__dirname, '..', '..', 'visualizer', 'index.html');
    } else {
      // Try visualizer directory first, then v3 directory
      const visPath = path.resolve(__dirname, '..', '..', 'visualizer', pathname.slice(1));
      const v3Path = path.resolve(__dirname, '..', pathname.slice(1));
      filePath = fs.existsSync(visPath) ? visPath : v3Path;
    }

    serveFile(res, filePath);
  });

  /**
   * Serve a static file with appropriate Content-Type.
   * @param {http.ServerResponse} res
   * @param {string} filePath
   */
  function serveFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Handle range requests for audio
    if (ext === '.mp3') {
      serveAudioFile(res, filePath, contentType);
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }

  /**
   * Serve audio file with Range request support for seeking.
   * @param {http.ServerResponse} res
   * @param {string} filePath
   * @param {string} contentType
   */
  function serveAudioFile(res, filePath, contentType) {
    fs.stat(filePath, (err, stat) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
      });

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      stream.on('error', () => {
        res.end();
      });
    });
  }

  server.listen(port, '127.0.0.1', () => {
    console.log(`\n  ╔══════════════════════════════════════════════════╗`);
    console.log(`  ║  In The Beginning — Streaming Radio Server       ║`);
    console.log(`  ║  V8 Sessions · aiphenomenon                     ║`);
    console.log(`  ╠══════════════════════════════════════════════════╣`);
    console.log(`  ║                                                  ║`);
    console.log(`  ║  Visualizer:  http://localhost:${port}/              ║`);
    console.log(`  ║  SSE Stream:  http://localhost:${port}/stream/events ║`);
    console.log(`  ║  State API:   http://localhost:${port}/api/state     ║`);
    console.log(`  ║  Track list:  http://localhost:${port}/api/tracks    ║`);
    console.log(`  ║  Playlist:    http://localhost:${port}/api/playlist  ║`);
    console.log(`  ║                                                  ║`);
    console.log(`  ║  Audio dir:   ${audioDir.slice(-36).padEnd(36)} ║`);
    console.log(`  ║  Tracks:      ${String(radio.album.tracks.length).padEnd(36)} ║`);
    console.log(`  ╚══════════════════════════════════════════════════╝\n`);
  });

  return server;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const config = parseArgs();
const { album, trackNotes } = loadAlbumData(config.audioDir);

console.log(`[Radio] Loaded ${album.tracks.length} tracks, ${album.total_events} events`);
console.log(`[Radio] Total duration: ${Math.round(album.total_duration)}s (${Math.round(album.total_duration / 60)}min)`);

const radio = new RadioBroadcaster(album, trackNotes);
createServer(config.port, config.audioDir, radio);

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { InfinitePlaylist, RadioBroadcaster, loadAlbumData, parseArgs };
}
