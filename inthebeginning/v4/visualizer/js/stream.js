/**
 * SSE Stream Client for In The Beginning Visualizer.
 *
 * Connects to a Server-Sent Events endpoint for infinite radio mode.
 * Receives note events in real-time and forwards them to the grid.
 */

/**
 * StreamClient manages an SSE connection for live note data.
 */
class StreamClient {
  /**
   * Create a StreamClient.
   * @param {Object} options
   * @param {string} options.url - SSE endpoint URL.
   * @param {Function} options.onNotes - Callback receiving an array of note events.
   * @param {Function} options.onConnect - Callback when connection is established.
   * @param {Function} options.onDisconnect - Callback when connection is lost.
   * @param {Function} options.onError - Callback on error.
   */
  constructor(options) {
    /** @type {string} */
    this.url = options.url || '';

    /** @type {Function} */
    this.onNotes = options.onNotes || (() => {});

    /** @type {Function} */
    this.onConnect = options.onConnect || (() => {});

    /** @type {Function} */
    this.onDisconnect = options.onDisconnect || (() => {});

    /** @type {Function} */
    this.onError = options.onError || (() => {});

    /** @type {EventSource|null} */
    this.eventSource = null;

    /** @type {boolean} */
    this.connected = false;

    /** @type {number} Reconnection attempts */
    this._reconnectAttempts = 0;

    /** @type {number} Max reconnection attempts */
    this.maxReconnectAttempts = 10;

    /** @type {number} Base reconnection delay in ms */
    this.reconnectDelay = 1000;

    /** @type {number|null} Reconnect timer */
    this._reconnectTimer = null;
  }

  /**
   * Connect to the SSE endpoint.
   */
  connect() {
    if (typeof EventSource === 'undefined') {
      this.onError(new Error('EventSource not supported'));
      return;
    }

    if (this.eventSource) {
      this.disconnect();
    }

    try {
      this.eventSource = new EventSource(this.url);

      this.eventSource.onopen = () => {
        this.connected = true;
        this._reconnectAttempts = 0;
        this.onConnect();
      };

      this.eventSource.addEventListener('notes', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.events && Array.isArray(data.events)) {
            this.onNotes(data.events);
          }
        } catch (err) {
          // Ignore malformed events
        }
      });

      this.eventSource.onerror = () => {
        this.connected = false;
        this.onDisconnect();
        this._scheduleReconnect();
      };
    } catch (err) {
      this.onError(err);
    }
  }

  /**
   * Disconnect from the SSE endpoint.
   */
  disconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   * @private
   */
  _scheduleReconnect() {
    if (this._reconnectAttempts >= this.maxReconnectAttempts) {
      this.onError(new Error('Max reconnection attempts reached'));
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this._reconnectAttempts);
    this._reconnectAttempts++;

    this._reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Check whether the client is currently connected.
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Parse a raw SSE note event data string.
   * Useful for testing without EventSource.
   * @param {string} dataStr - JSON string from SSE data field.
   * @returns {Array<Object>} Parsed note events.
   */
  static parseNoteData(dataStr) {
    try {
      const data = JSON.parse(dataStr);
      if (data.events && Array.isArray(data.events)) {
        return data.events;
      }
      return [];
    } catch (e) {
      return [];
    }
  }
}

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StreamClient };
}
