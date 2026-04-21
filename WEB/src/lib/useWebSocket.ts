import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(url: string) {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const [data, setData] = useState<any>({});
  const [connected, setConnected] = useState(false);
  const [useMock, setUseMock] = useState(isLocalhost);
  const wsRef = useRef<WebSocket | null>(null);
  const lastPulseRef = useRef<number>(Date.now());

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        setConnected(true);
        setUseMock(false);
        lastPulseRef.current = Date.now();
      };
      
      ws.onmessage = (e) => {
        lastPulseRef.current = Date.now();
        try {
          const parsed = JSON.parse(e.data);
          setData((prev: any) => ({ ...prev, ...parsed }));
        } catch (err) {
          console.error("Error parsing WS message", err);
        }
      };
      
      ws.onclose = () => {
        setConnected(false);
        if (isLocalhost) setUseMock(true);
        setTimeout(connect, 5000);
      };
      
      wsRef.current = ws;
    } catch (e) {
      if (isLocalhost) setUseMock(true);
    }
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Watchdog
  useEffect(() => {
    const watchdog = setInterval(() => {
      if (!useMock && connected && Date.now() - lastPulseRef.current > 5000) {
        console.warn("[Watchdog] Timeout de Rede detectado! Forçando fechamento.");
        if (wsRef.current) wsRef.current.close();
      }
    }, 1000);
    return () => clearInterval(watchdog);
  }, [useMock, connected]);

  // Mock data generator for preview environment
  useEffect(() => {
    if (useMock) {
      setConnected(true);
      const interval = setInterval(() => {
        const fluctuate = (base: number, variance: number) => base + (Math.random() * variance - variance/2);
        
        setData((prev: any) => ({
          ...prev,
          uge_ok: true,
          uge_vers: "1.2.4",
          uge_build: "842",
          vret: fluctuate(12500, 20),
          vcons: fluctuate(12490, 15),
          vbat: fluctuate(12600, 10),
          iret: fluctuate(4500, 50),
          ibat: fluctuate(1500, 30),
          vrs: fluctuate(2340, 10),
          vst: fluctuate(2335, 10),
          vt: fluctuate(2345, 10),
          ir: fluctuate(24500, 100),
          is: fluctuate(24800, 100),
          it: fluctuate(24600, 100),
          sncc: 123456,
          snug: 654321,
          tbat: fluctuate(250, 2),
          err_cod: 32768,
          err_ext: 0,
          ov1: 12, gv1: 100,
          ovc: -5, gvc: -50,
          oi1: 0, gi1: 0,
          oib: 2, gib: 10,
          gvrs: 0, gvst: 0, gvt: 0,
          gir: 0, gis: 0, git: 0,
          din: 0b10101010,
        }));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [useMock]);

  const send = useCallback((msg: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else if (useMock) {
      console.log("Mock WS Send:", msg);
    }
  }, [useMock]);

  return { data, connected, send };
}
