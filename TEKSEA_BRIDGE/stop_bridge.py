"""Encerra somente esta ponte e a gravação que ela controla."""
import json
import time
import urllib.request


def request(path, data=None):
    req = urllib.request.Request('http://127.0.0.1:8760' + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={'X-Teksea-Local': '1', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=5) as response:
        return json.load(response)


if __name__ == '__main__':
    try:
        current = request('/tms/progress')
        if current['busy']:
            answer = input('Cancelar a gravacao em andamento? Pode ser necessario regravar. [s/N] ')
            if answer.lower() != 's':
                raise SystemExit(0)
            request('/tms/cancel', {'operation_id': current['operation_id']})
            deadline = time.monotonic() + 15
            while request('/tms/progress')['busy']:
                if time.monotonic() > deadline:
                    raise RuntimeError('Limpeza nao confirmada. A ponte foi preservada para diagnostico.')
                time.sleep(0.3)
        request('/sys/shutdown', {})
        print('Ponte encerrada.')
    except Exception as exc:
        print(f'Nao foi possivel encerrar a ponte: {exc}')
        raise SystemExit(1)
