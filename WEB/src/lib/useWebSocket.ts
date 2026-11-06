import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(url: string) {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const [data, setData] = useState<any>({});
  const [connected, setConnected] = useState(false);
  const [useMock, setUseMock] = useState(isLocalhost);
  const wsRef = useRef<WebSocket | null>(null);
  const lastPulseRef = useRef<number>(Date.now());

  const pending = useRef(new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  useEffect(() => {
    let disposed = false;
    let reconnect: ReturnType<typeof setTimeout>;
    const connect = () => {
      if (disposed) return;
      let ws: WebSocket;
      try { ws = new WebSocket(url); }
      catch {
        setConnected(false);
        setData({});
        reconnect = setTimeout(connect, 5000);
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        if (disposed) { ws.close(); return; }
        setConnected(true);
        setUseMock(false);
        lastPulseRef.current = Date.now();
      };
      ws.onmessage = e => {
        if (disposed) return;
        lastPulseRef.current = Date.now();
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.type === 'command_result' && parsed.request_id) {
            const waiter = pending.current.get(parsed.request_id);
            if (waiter) {
              clearTimeout(waiter.timer);
              pending.current.delete(parsed.request_id);
              if (parsed.success) waiter.resolve(parsed);
              else waiter.reject(new Error(parsed.message || 'Comando rejeitado.'));
            }
          }
          setData((prev: any) => ({ ...prev, ...parsed }));
        } catch (error) { console.error('Resposta WebSocket inválida', error); }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        for (const waiter of pending.current.values()) {
          clearTimeout(waiter.timer);
          waiter.reject(new Error('Conexão encerrada; resultado do comando não confirmado.'));
        }
        pending.current.clear();
        if (disposed) return;
        setConnected(false);
        setData({});
        if (isLocalhost) setUseMock(true);
        reconnect = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnect);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      for (const waiter of pending.current.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('Conexão encerrada; resultado não confirmado.'));
      }
      pending.current.clear();
    };
  }, [url, isLocalhost]);

  const request = useCallback((msg: any, timeout = 5000): Promise<any> => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Sem conexão real com o ESP32.'));
    const request_id = msg.request_id || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.current.delete(request_id);
        reject(new Error('Sem confirmação do comando. Confira o equipamento antes de repetir.'));
      }, timeout);
      pending.current.set(request_id, { resolve, reject, timer });
      try { ws.send(JSON.stringify({ ...msg, request_id })); }
      catch (error) {
        clearTimeout(timer);
        pending.current.delete(request_id);
        reject(error);
      }
    });
  }, []);

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

  return { data, connected, send, request, isMock: useMock };
}
