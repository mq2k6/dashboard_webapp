import { useEffect, useRef, useState } from 'react';

/**
 * Subscribes to /ws/metrics and keeps a rolling history buffer for charts,
 * plus the latest snapshot for instant values (CPU%, RAM%, uptime, etc).
 * Reconnects automatically on drop -- LAN dashboards left open in a browser
 * tab for days should recover from the backend restarting.
 */
export function useMetricsSocket(historyLength = 60) {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const retryTimeout = useRef(null);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws/metrics`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) {
          retryTimeout.current = setTimeout(connect, 2000);
        }
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setLatest(data);
        setHistory((prev) => {
          const next = [...prev, data];
          return next.length > historyLength ? next.slice(next.length - historyLength) : next;
        });
      };
    }

    connect();
    return () => {
      cancelled = true;
      clearTimeout(retryTimeout.current);
      wsRef.current?.close();
    };
  }, [historyLength]);

  return { latest, history, connected };
}
