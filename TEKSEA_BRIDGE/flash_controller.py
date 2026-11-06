"""Supervisão de uma gravação; independente de MSAL, HTTP e hardware TI.

Windows Job Objects: https://learn.microsoft.com/windows/win32/procthread/job-objects
O worker aguarda autorização no stdin antes de criar o DSLite. Assim todos os
descendentes nascem dentro do Job, inclusive se a ponte encerrar inesperadamente.
"""
import copy
import ctypes
from ctypes import wintypes as w
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import threading
import time


class WindowsJob:
    def __init__(self):
        if os.name != 'nt':
            raise RuntimeError('Gravação disponível somente no Windows.')
        self.api = ctypes.WinDLL('kernel32', use_last_error=True)
        signatures = {
            'CreateJobObjectW': ([ctypes.c_void_p, w.LPCWSTR], w.HANDLE),
            'SetInformationJobObject': ([w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD], w.BOOL),
            'AssignProcessToJobObject': ([w.HANDLE, w.HANDLE], w.BOOL),
            'TerminateJobObject': ([w.HANDLE, w.UINT], w.BOOL),
            'QueryInformationJobObject': ([w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD, ctypes.c_void_p], w.BOOL),
            'CloseHandle': ([w.HANDLE], w.BOOL),
        }
        for name, (args, result) in signatures.items():
            fn = getattr(self.api, name)
            fn.argtypes, fn.restype = args, result

        class BasicLimits(ctypes.Structure):
            _fields_ = [('ProcessTime', ctypes.c_int64), ('JobTime', ctypes.c_int64),
                        ('Flags', w.DWORD), ('MinWorkingSet', ctypes.c_size_t),
                        ('MaxWorkingSet', ctypes.c_size_t), ('ActiveLimit', w.DWORD),
                        ('Affinity', ctypes.c_size_t), ('Priority', w.DWORD), ('Scheduling', w.DWORD)]

        class ExtendedLimits(ctypes.Structure):
            _fields_ = [('Basic', BasicLimits), ('Io', ctypes.c_uint64 * 6),
                        ('ProcessMemory', ctypes.c_size_t), ('JobMemory', ctypes.c_size_t),
                        ('PeakProcessMemory', ctypes.c_size_t), ('PeakJobMemory', ctypes.c_size_t)]

        self.handle = self.api.CreateJobObjectW(None, None)
        self._check(self.handle)
        limits = ExtendedLimits()
        limits.Basic.Flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        try:
            self._check(self.api.SetInformationJobObject(self.handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)))
        except Exception:
            self.close()
            raise

    @staticmethod
    def _check(ok):
        if not ok:
            raise ctypes.WinError(ctypes.get_last_error())

    def assign(self, process):
        self._check(self.api.AssignProcessToJobObject(self.handle, w.HANDLE(int(process._handle))))

    def active_count(self):
        class Accounting(ctypes.Structure):
            _fields_ = [('Times', ctypes.c_int64 * 4), ('Faults', w.DWORD),
                        ('Total', w.DWORD), ('Active', w.DWORD), ('Terminated', w.DWORD)]
        info = Accounting()
        self._check(self.api.QueryInformationJobObject(self.handle, 1, ctypes.byref(info), ctypes.sizeof(info), None))
        return info.Active

    def terminate(self):
        self._check(self.api.TerminateJobObject(self.handle, 1))

    def close(self):
        if self.handle:
            self._check(self.api.CloseHandle(self.handle))
            self.handle = None


class FlashController:
    def __init__(self, process_factory=subprocess.Popen, job_factory=WindowsJob):
        self.lock = threading.RLock()
        self.process_factory, self.job_factory = process_factory, job_factory
        self.cancel_event = threading.Event()
        self.history = {}
        self.status = dict(operation_id=None, state='idle', status='Aguardando início',
                           progress=0, log=[], error=None, busy=False, cleanup_confirmed=True)

    def snapshot(self, operation_id=None):
        with self.lock:
            if operation_id and operation_id != self.status['operation_id']:
                return copy.deepcopy(self.history.get(operation_id))
            return copy.deepcopy(self.status)

    def _update(self, **fields):
        with self.lock:
            self.status.update(fields)

    def _log(self, line):
        with self.lock:
            self.status['log'].append(line[:2000])
            self.status['log'] = self.status['log'][-400:]
            if 'Writing at' in line:
                self.status['progress'] = 60
            if 'Verified' in line:
                self.status['progress'] = 90

    def start(self, operation_id, command, timeout=300, **metadata):
        if not isinstance(operation_id, str) or not 1 <= len(operation_id) <= 80:
            raise ValueError('Identificador de operação inválido.')
        timeout = float(timeout)
        if not math.isfinite(timeout) or timeout <= 0:
            raise ValueError('Timeout inválido.')
        with self.lock:
            previous = self.snapshot(operation_id)
            if previous:
                return previous, 200  # Repetir a mesma solicitação nunca regrava.
            if self.status['busy']:
                return self.snapshot(), 409
            if self.status['operation_id']:
                self.history[self.status['operation_id']] = self.snapshot()
            self.cancel_event.clear()
            self.status = dict(operation_id=operation_id, state='preparing', status='Preparando gravação',
                               progress=10, log=[], error=None, busy=True, cleanup_confirmed=False,
                               started_at=time.time(), finished_at=None, exit_code=None, **metadata)
            try:
                threading.Thread(target=self._run, args=(command, timeout), daemon=True).start()
            except Exception as exc:
                self._update(state='failed', status='Falha ao iniciar supervisor', error=str(exc),
                             busy=False, cleanup_confirmed=True, finished_at=time.time())
                raise
            return self.snapshot(), 202

    def cancel(self, operation_id):
        with self.lock:
            if operation_id != self.status['operation_id']:
                return {'error': 'Operação não corresponde à gravação atual.'}, 409
            if self.status['busy'] and self.status['state'] in ('preparing', 'running', 'cancelling'):
                self.cancel_event.set()
                self._update(state='cancelling', status='Encerrando gravação...')
            return self.snapshot(), 200

    def _run(self, command, timeout):
        process = job = reader = None
        state, error, code = 'failed', None, None
        cleanup_ok = True
        started = time.monotonic()
        try:
            job = self.job_factory()
            python_exe = Path(sys.executable).with_name('python.exe')
            process = self.process_factory(
                [str(python_exe), str(Path(__file__).resolve()), '--worker', json.dumps(command)],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding='utf-8', errors='replace', creationflags=subprocess.CREATE_NO_WINDOW)
            job.assign(process)

            def read_log():
                try:
                    # Limite por leitura também protege contra linhas sem newline.
                    while True:
                        line = process.stdout.readline(2000)
                        if not line:
                            break
                        self._log(line.rstrip())
                except (OSError, ValueError) as exc:
                    self._log(f'Leitura de log encerrada: {exc}')

            reader = threading.Thread(target=read_log, daemon=True)
            reader.start()
            with self.lock:
                if not self.cancel_event.is_set():
                    self._update(state='running', status='Executando DSLite...', progress=30)
                    process.stdin.write('GO\n')
                    process.stdin.flush()
            process.stdin.close()
            while True:
                if self.cancel_event.is_set():
                    state, error = 'cancelled', 'Gravação cancelada. Pode ser necessário regravar o equipamento.'
                    break
                code = process.poll()
                if code is not None:
                    state = 'succeeded' if code == 0 else 'failed'
                    error = None if code == 0 else f'DSLite terminou com código {code}. Consulte o log.'
                    break
                if time.monotonic() - started >= timeout:
                    state, error = 'timed_out', f'Limite de {timeout:g}s excedido. Gravação interrompida.'
                    break
                self.cancel_event.wait(0.1)
        except Exception as exc:
            state, error = 'failed', str(exc)
        finally:
            try:
                # DSLite não oferece aqui um encerramento cooperativo confiável.
                # TerminateJobObject contém também filhos que mantêm stdout aberto.
                if job and job.active_count():
                    job.terminate()
                if process:
                    if process.poll() is None:
                        # Também cobre falha de associação: worker ainda sem GO.
                        process.kill()
                    process.wait(timeout=5)
                if job:
                    deadline = time.monotonic() + 5
                    while job.active_count() and time.monotonic() < deadline:
                        time.sleep(0.05)
                    if job.active_count():
                        raise RuntimeError('Processos da gravação continuam ativos.')
                if reader:
                    reader.join(timeout=2)
                    if reader.is_alive():
                        raise RuntimeError('Não foi confirmado o encerramento da leitura do processo.')
                if process:
                    for stream in (process.stdin, process.stdout):
                        if stream:
                            stream.close()
            except Exception as exc:
                cleanup_ok = False
                state, error = 'failed', f'{error or ""} Falha na limpeza: {exc}. Nova gravação bloqueada.'
            finally:
                if job:
                    try:
                        job.close()  # Kill-on-close também protege encerramento da ponte.
                    except Exception as exc:
                        cleanup_ok = False
                        state, error = 'failed', f'Falha ao fechar Job: {exc}. Nova gravação bloqueada.'
            # Mesmo se uma consulta de limpeza falhar, fechar o Job mata a árvore.
            # Recolher streams depois disso sem bloquear indefinidamente o supervisor.
            if process:
                try:
                    process.wait(timeout=5)
                    if reader:
                        reader.join(timeout=2)
                    if not reader or not reader.is_alive():
                        for stream in (process.stdin, process.stdout):
                            if stream:
                                stream.close()
                except (OSError, subprocess.TimeoutExpired):
                    cleanup_ok = False
                    state, error = 'failed', 'Encerramento do processo não confirmado. Nova gravação bloqueada.'
            labels = {'succeeded': 'Gravação concluída com sucesso', 'failed': 'Falha na gravação',
                      'cancelled': 'Gravação cancelada', 'timed_out': 'Tempo de gravação excedido'}
            self._update(state=state, status=labels[state], error=error, exit_code=code,
                         busy=not cleanup_ok, cleanup_confirmed=cleanup_ok, finished_at=time.time(),
                         progress=100 if state == 'succeeded' else self.snapshot()['progress'])


def firmware_command(config, product, variant, bridge_dir):
    names = {
        'tps': {'jiga': 'com.teksea.retificador125.uge-280225A-jiga.out',
                'burnin': 'com.teksea.retificador125.uge-280225A-burnin.out',
                'cliente': 'com.teksea.retificador125.uge-280225A-cliente.out'},
        'scr': {'vca_montado': 'J2_Vca_montado.out', 'burnin': 'B1_Burn_in.out', 'cliente': 'C0_Cliente.out'},
    }
    if product not in names or variant not in names[product]:
        raise ValueError('Produto ou variante inválidos.')
    root = config.get(f'{product}_root')
    if not root:
        raise ValueError(f'Pasta do {product.upper()} não configurada.')
    key = 'jiga' if variant == 'vca_montado' else variant
    firmware = (Path(root) / (config.get(f'{product}_fw_{key}') or names[product][variant])).resolve()
    exe = Path(bridge_dir) / 'ccs_base/DebugServer/bin/DSLite.exe'
    ccxml = Path(bridge_dir) / 'user_files/configs/tms320f28375s.ccxml'
    for path in (exe, ccxml, firmware):
        if not path.is_file():
            raise ValueError(f'Arquivo não encontrado: {path}')
    timeout = float(config.get('flash_timeout_seconds', 300))
    if not math.isfinite(timeout) or not 30 <= timeout <= 3600:
        raise ValueError('flash_timeout_seconds deve estar entre 30 e 3600.')
    return [str(exe), 'flash', '-c', str(ccxml), '-e', '-f', '-v', '--run', str(firmware)], timeout


if __name__ == '__main__' and len(sys.argv) == 3 and sys.argv[1] == '--worker':
    if sys.stdin.readline().strip() != 'GO':
        sys.exit(2)
    # O worker só cria o gravador depois de estar contido no Job da operação.
    result = subprocess.run(json.loads(sys.argv[2]), stdin=subprocess.DEVNULL,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    sys.exit(result.returncode)
