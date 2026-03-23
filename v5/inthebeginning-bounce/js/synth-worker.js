/**
 * Web Worker for MIDI file parsing.
 *
 * Offloads CPU-intensive MIDI binary parsing from the main thread.
 * The main thread sends ArrayBuffer data; this worker parses it and
 * returns structured note events ready for SynthEngine scheduling.
 *
 * Protocol:
 *   Main → Worker: { type: 'parse', buffer: ArrayBuffer, id: number }
 *   Worker → Main: { type: 'notes', id: number, notes: Array, duration: number, header: Object }
 *   Worker → Main: { type: 'error', id: number, message: string }
 */

/* eslint-env worker */

self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === 'parse') {
    try {
      const data = new DataView(msg.buffer);
      const result = parseMidi(data);
      if (result) {
        self.postMessage({
          type: 'notes',
          id: msg.id,
          notes: result.notes,
          duration: result.duration,
          header: result.header,
        });
      } else {
        self.postMessage({ type: 'error', id: msg.id, message: 'Invalid MIDI file' });
      }
    } catch (err) {
      self.postMessage({ type: 'error', id: msg.id, message: err.message });
    }
  }
};

/** GM instrument families (128 programs → family name). */
const GM_FAMILIES = [
  'piano','piano','piano','piano','piano','piano','piano','piano',
  'chromatic','chromatic','chromatic','chromatic','chromatic','chromatic','chromatic','chromatic',
  'organ','organ','organ','organ','organ','organ','organ','organ',
  'guitar','guitar','guitar','guitar','guitar','guitar','guitar','guitar',
  'bass','bass','bass','bass','bass','bass','bass','bass',
  'strings','strings','strings','strings','strings','strings','strings','strings',
  'ensemble','ensemble','ensemble','ensemble','ensemble','ensemble','ensemble','ensemble',
  'brass','brass','brass','brass','brass','brass','brass','brass',
  'reed','reed','reed','reed','reed','reed','reed','reed',
  'pipe','pipe','pipe','pipe','pipe','pipe','pipe','pipe',
  'synth-lead','synth-lead','synth-lead','synth-lead','synth-lead','synth-lead','synth-lead','synth-lead',
  'synth-pad','synth-pad','synth-pad','synth-pad','synth-pad','synth-pad','synth-pad','synth-pad',
  'fx','fx','fx','fx','fx','fx','fx','fx',
  'ethnic','ethnic','ethnic','ethnic','ethnic','ethnic','ethnic','ethnic',
  'percussion','percussion','percussion','percussion','percussion','percussion','percussion','percussion',
  'sfx','sfx','sfx','sfx','sfx','sfx','sfx','sfx',
];

/**
 * Parse a Standard MIDI File.
 * @param {DataView} data
 * @returns {Object|null} { header, notes, duration }
 */
function parseMidi(data) {
  let offset = 0;

  // Header chunk
  const headerTag = readStr(data, offset, 4);
  if (headerTag !== 'MThd') return null;
  offset += 4;

  const headerLen = data.getUint32(offset); offset += 4;
  const format = data.getUint16(offset); offset += 2;
  const nTracks = data.getUint16(offset); offset += 2;
  const ticksPerBeat = data.getUint16(offset); offset += 2;
  offset += headerLen - 6;

  const header = { format, nTracks, ticksPerBeat };

  // Parse all tracks
  const allEvents = [];
  for (let t = 0; t < nTracks; t++) {
    if (offset + 8 > data.byteLength) break;
    const trackTag = readStr(data, offset, 4);
    if (trackTag !== 'MTrk') {
      offset += 4;
      const chunkLen = data.getUint32(offset);
      offset += 4 + chunkLen;
      continue;
    }
    offset += 4;
    const trackLen = data.getUint32(offset); offset += 4;
    const trackEnd = offset + trackLen;

    const events = parseTrack(data, offset, trackEnd, ticksPerBeat);
    allEvents.push(...events);
    offset = trackEnd;
  }

  allEvents.sort((a, b) => a.time - b.time);

  const notes = buildNoteEvents(allEvents);
  const duration = notes.length > 0 ?
    Math.max(...notes.map(n => n.t + (n.dur || 0.2))) : 0;

  return { header, notes, duration };
}

function parseTrack(data, start, end, ticksPerBeat) {
  const events = [];
  let offset = start;
  let totalTicks = 0;
  let tempo = 500000;
  let totalTime = 0;
  let lastTempoTick = 0;
  let lastTempoTime = 0;
  let runningStatus = 0;

  while (offset < end) {
    const vlq = readVLQ(data, offset);
    offset = vlq.offset;
    totalTicks += vlq.value;

    totalTime = lastTempoTime +
      ((totalTicks - lastTempoTick) / ticksPerBeat) * (tempo / 1000000);

    if (offset >= end) break;

    let status = data.getUint8(offset);
    if (status < 0x80) {
      status = runningStatus;
    } else {
      offset++;
      if (status < 0xF0) runningStatus = status;
    }

    const type = status & 0xF0;
    const ch = status & 0x0F;

    if (type === 0x90) {
      const note = data.getUint8(offset++);
      const vel = data.getUint8(offset++);
      events.push({
        type: vel > 0 ? 'noteOn' : 'noteOff',
        time: totalTime, ch, note, vel: vel / 127,
      });
    } else if (type === 0x80) {
      const note = data.getUint8(offset++);
      offset++; // velocity ignored
      events.push({ type: 'noteOff', time: totalTime, ch, note });
    } else if (type === 0xA0) { offset += 2;
    } else if (type === 0xB0) { offset += 2;
    } else if (type === 0xC0) {
      const program = data.getUint8(offset++);
      events.push({ type: 'programChange', time: totalTime, ch, program });
    } else if (type === 0xD0) { offset++;
    } else if (type === 0xE0) {
      // Pitch bend
      const lsb = data.getUint8(offset++);
      const msb = data.getUint8(offset++);
      const bendValue = ((msb << 7) | lsb) - 8192;
      events.push({ type: 'pitchBend', time: totalTime, ch, bend: bendValue / 8192 });
    } else if (status === 0xFF) {
      const metaType = data.getUint8(offset++);
      const metaVLQ = readVLQ(data, offset);
      offset = metaVLQ.offset;
      const metaLen = metaVLQ.value;

      if (metaType === 0x51 && metaLen === 3) {
        tempo = (data.getUint8(offset) << 16) |
                (data.getUint8(offset + 1) << 8) |
                data.getUint8(offset + 2);
        lastTempoTick = totalTicks;
        lastTempoTime = totalTime;
      } else if (metaType === 0x03) {
        let name = '';
        for (let i = 0; i < metaLen && offset + i < end; i++) {
          name += String.fromCharCode(data.getUint8(offset + i));
        }
        events.push({ type: 'trackName', time: totalTime, name });
      } else if (metaType === 0x2F) {
        offset += metaLen;
        break;
      }
      offset += metaLen;
    } else if (status === 0xF0 || status === 0xF7) {
      const sysVLQ = readVLQ(data, offset);
      offset = sysVLQ.offset + sysVLQ.value;
    } else {
      offset++;
    }
  }

  return events;
}

function buildNoteEvents(rawEvents) {
  const notes = [];
  const openNotes = new Map();
  const programMap = new Map();
  const bendMap = new Map(); // ch → current bend value

  for (const ev of rawEvents) {
    if (ev.type === 'programChange') {
      programMap.set(ev.ch, GM_FAMILIES[ev.program] || 'piano');
    } else if (ev.type === 'pitchBend') {
      bendMap.set(ev.ch, ev.bend);
    } else if (ev.type === 'noteOn') {
      const key = ev.ch * 128 + ev.note;
      openNotes.set(key, {
        t: ev.time, vel: ev.vel, ch: ev.ch, note: ev.note,
        bend: bendMap.get(ev.ch) || 0,
      });
    } else if (ev.type === 'noteOff') {
      const key = ev.ch * 128 + ev.note;
      const open = openNotes.get(key);
      if (open) {
        const dur = Math.max(0.02, ev.time - open.t);
        const inst = ev.ch === 9 ? 'percussion' : (programMap.get(ev.ch) || 'piano');
        notes.push({
          t: open.t, dur, note: open.note, vel: open.vel,
          ch: open.ch, inst, bend: open.bend,
        });
        openNotes.delete(key);
      }
    }
  }

  // Close remaining notes
  for (const [, open] of openNotes) {
    const inst = open.ch === 9 ? 'percussion' : (programMap.get(open.ch) || 'piano');
    notes.push({
      t: open.t, dur: 0.5, note: open.note, vel: open.vel,
      ch: open.ch, inst, bend: open.bend || 0,
    });
  }

  notes.sort((a, b) => a.t - b.t);
  return notes;
}

function readVLQ(data, offset) {
  let value = 0;
  let byte;
  do {
    if (offset >= data.byteLength) return { value, offset };
    byte = data.getUint8(offset++);
    value = (value << 7) | (byte & 0x7F);
  } while (byte & 0x80);
  return { value, offset };
}

function readStr(data, offset, length) {
  let s = '';
  for (let i = 0; i < length && offset + i < data.byteLength; i++) {
    s += String.fromCharCode(data.getUint8(offset + i));
  }
  return s;
}
