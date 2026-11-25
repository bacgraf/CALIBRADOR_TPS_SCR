import os
import sys
import json
import time
import subprocess
import threading
import socket
from http.server import HTTPServer, BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib.parse
import urllib.request
import base64
import tempfile
from flash_controller import FlashController, firmware_command
import pit_parser
import msal
import requests

# ============================================================
# CONFIGURAÇÕES TÉCNICAS
# ============================================================
BRIDGE_VERSION = "2.1.4"
GITHUB_BRIDGE_RAW = "https://raw.githubusercontent.com/bacgraf/CALIBRADOR_TPS_SCR/main/TEKSEA_BRIDGE"
NET_SHARE_BRIDGE = r"\\srv01\01 TEKSEA\111 PUB\01 INTRANET\Marcel Hilleshein\DEV\CALIBRADOR_TPS_SCR\TEKSEA_BRIDGE"
BRIDGE_UPDATE_FILES = [
    "teksea_bridge.py",
    "pit_parser.py",
    "flash_controller.py",
    "version.json",
    "install_TPS_SCR_calibrador.bat",
    "uninstall_TPS_SCR_calibrador.bat",
    "one_time_setup.bat",
    "kill_bridge.bat",
    "stop_bridge.py",
]
PORT = 8760
LAST_HEARTBEAT = time.time()

# Configuração de Log para arquivo (fundamental para depurar modo invisível)
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bridge_error.log")

def log_debug(msg):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    try:
        with open(LOG_FILE, "a") as f:
            f.write(f"[{timestamp}] {msg}\n")
    except:
        pass

# Configurações do Microsoft Graph (Cloud)
CLIENT_ID = "58454a49-a299-40b0-9566-372bdab155db"
SCOPES = ["User.Read", "Files.ReadWrite", "Sites.ReadWrite.All"]
AUTHORITY = "https://login.microsoftonline.com/f03ed2fc-3f7d-4cd8-bbd7-cf47c853931c"
CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ms_cache.bin")

# Inicializa o cache MSAL persistente
_msal_cache = msal.SerializableTokenCache()
if os.path.exists(CACHE_FILE):
    try:
        _msal_cache.deserialize(open(CACHE_FILE, "r").read())
    except:
        pass

import atexit

def save_msal_cache():
    try:
        if _msal_cache.has_state_changed:
            with open(CACHE_FILE, "w") as f:
                f.write(_msal_cache.serialize())
    except Exception as e:
        log_debug(f"Erro ao salvar cache MSAL: {e}")

atexit.register(save_msal_cache)

# Variável global para o fluxo de device code em andamento
_current_device_flow = None
_msal_app = None

# ============================================================
# MÓDULO: MICROSOFT GRAPH (CLOUD)
# ============================================================
def get_msal_app():
    global _msal_app
    if _msal_app is None:
        try:
            _msal_app = msal.PublicClientApplication(CLIENT_ID, authority=AUTHORITY, token_cache=_msal_cache)
        except Exception as e:
            log_debug(f"MSAL offline/indisponivel: {e}")
            return None
    return _msal_app

def get_msal_accounts():
    app = get_msal_app()
    if not app:
        return []
    try:
        return app.get_accounts()
    except Exception:
        return []

def get_access_token():
    app = get_msal_app()
    if not app:
        return None
    accounts = get_msal_accounts()
    if accounts:
        result = app.acquire_token_silent(SCOPES, account=accounts[0])
        if result and "access_token" in result:
            return result["access_token"]
    return None

# Caminhos padrões
CONFIG_FILE = "config.json"
CCS_BASE_DIR = "ccs_base"
USER_FILES_DIR = "user_files"

# Estado Global do TMS Flash
flash_controller = FlashController()

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    return {}

def save_config(config):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=4)

# ============================================================
# MÓDULO: SHAREPOINT UPLOAD
# ============================================================
def upload_to_sharepoint(rows):
    token = get_access_token()
    if not token:
        return {"error": "Nao autenticado na Microsoft."}

    hostname = "teksea.sharepoint.com"
    site_name = "106FAB"
    file_name = "NUMERO SERIE UGE (USAR ESSE).xlsx"
    table_name = "Tabela1"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    try:
        from urllib.parse import quote
        url_site = f"https://graph.microsoft.com/v1.0/sites/{hostname}:/sites/{site_name}"
        resp_site = requests.get(url_site, headers=headers)
        if resp_site.status_code != 200:
            return {"error": f"Erro no Site ID: {resp_site.text}"}
        site_id = resp_site.json().get("id")

        url_search = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/root/search(q='{quote(file_name)}')"
        resp_search = requests.get(url_search, headers=headers)
        if resp_search.status_code != 200:
            return {"error": f"Erro ao buscar arquivo: {resp_search.text}"}

        search_results = resp_search.json().get("value", [])
        if not search_results:
            return {"error": f"Arquivo '{file_name}' nao encontrado no SharePoint."}

        file_item = next((f for f in search_results if f.get("name") == file_name), search_results[0])
        item_id = file_item.get("id")

        url_cols = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/items/{item_id}/workbook/tables/{table_name}/columns"
        resp_cols = requests.get(url_cols, headers=headers)
        if resp_cols.status_code == 200:
            cols_count = len(resp_cols.json().get("value", []))
            if cols_count > 0:
                adjusted = []
                for r in rows:
                    if len(r) > cols_count: adjusted.append(r[:cols_count])
                    else: adjusted.append(r + [""] * (cols_count - len(r)))
                rows = adjusted

        url_add = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/items/{item_id}/workbook/tables/{table_name}/rows/add"
        resp_add = requests.post(url_add, headers=headers, json={"values": rows})
        if resp_add.status_code in [200, 201]:
            return {"success": True}
        else:
            return {"error": f"Graph API Error ({resp_add.status_code}): {resp_add.text}"}
    except Exception as e:
        return {"error": f"Excecao interna: {str(e)}"}
# ============================================================
# HEARTBEAT & CICLO DE VIDA
# ============================================================
def heartbeat_watcher():
    """ Encerra o bridge se o frontend nao enviar sinal por 60 segundos, 
        mas NUNCA encerra se uma gravacao estiver em progresso. """
    while True:
        time.sleep(10) # Verifica a cada 10s
        
        # Se o status nao for Idle ou o progresso for > 0, consideramos que esta gravando
        is_flashing = flash_controller.snapshot()['busy']
        
        if not is_flashing and (time.time() - LAST_HEARTBEAT > 60):
            log_debug("Heartbeat expirado (60s). Encerrando Bridge para economizar recursos.")
            os._exit(0)

def is_already_running():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            return s.connect_ex(('127.0.0.1', PORT)) == 0
    except:
        return False

# ============================================================
# SERVIDOR HTTP
# ============================================================
class TekseaHandler(BaseHTTPRequestHandler):
    def origin_allowed(self):
        # Validação de origem desativada por decisão operacional.
        # O código anterior foi mantido abaixo para facilitar uma futura reativação.
        #
        # origin = self.headers.get('Origin')
        # defaults = ['http://192.168.4.1', 'http://192.168.1.100',
        #             'http://localhost:3000', 'http://127.0.0.1:3000']
        # allowed = load_config().get('allowed_origins', defaults)
        # return origin in allowed if origin else self.headers.get('X-Teksea-Local') == '1'
        return True

    def authorize(self):
        # A rejeição HTTP 403 por origem foi desativada junto com origin_allowed().
        # if not self.origin_allowed():
        #     self.send_json({'error': 'Origem não autorizada. Configure allowed_origins na ponte.'}, 403)
        #     return False
        return True

    def end_headers(self):
        if self.headers.get('Origin') and self.origin_allowed():
            self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
            self.send_header('Vary', 'Origin')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        if not self.authorize():
            return
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_GET(self):
        if not self.authorize():
            return
        global LAST_HEARTBEAT
        LAST_HEARTBEAT = time.time() # Qualquer GET renova o tempo de vida
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        
        # --- SISTEMA ---
        if path == '/sys/heartbeat':
            self.send_json({"status": "alive"})
        
        elif path == '/sys/status':
            accounts = get_msal_accounts()
            conf = load_config()
            self.send_json({
                "bridge_alive": True,
                "bridge_version": BRIDGE_VERSION,
                "capabilities": ["pit_parser", "self_update", "tms_flash", "cloud_upload"],
                "ms_logged_in": bool(accounts),
                "ms_username": accounts[0].get("username", "Usuario") if accounts else "",
                "tps_root": conf.get("tps_root", "Não configurado"),
                "scr_root": conf.get("scr_root", "Não configurado")
            })

        elif path == '/sys/version':
            self.send_json({
                "version": BRIDGE_VERSION,
                "capabilities": ["pit_parser", "self_update", "tms_flash", "cloud_upload"]
            })

        # --- CLOUD ---
        elif path == '/cloud/devicecode':
            global _current_device_flow
            app = get_msal_app()
            if not app:
                self.send_json({"error": "Sem conexao com a internet para autenticar na Microsoft."}, 503)
                return
            flow = app.initiate_device_flow(scopes=SCOPES)
            if "user_code" in flow:
                _current_device_flow = flow  # Guarda em memória para o /token usar
                self.send_json({
                    "user_code": flow["user_code"],
                    "verification_uri": flow["verification_uri"],
                    "message": flow.get("message", "")
                })
            else:
                self.send_json({"error": "Falha ao iniciar device flow"})

        elif path == '/cloud/logout':
            app = get_msal_app()
            if app:
                for a in get_msal_accounts():
                    app.remove_account(a)
            if os.path.exists(CACHE_FILE):
                try: os.remove(CACHE_FILE)
                except: pass
            self.send_json({"success": True})

        # --- TMS ---
        elif path == '/tms/check':
            # Verifica se existem firmwares configurados ou usa os nomes padrao
            conf = load_config()
            # Se a pasta raiz estiver configurada, consideramos os firmwares disponiveis pelos nomes padrao
            has_tps = bool(conf.get("tps_root"))
            has_scr = bool(conf.get("scr_root"))
            
            self.send_json({
                "jiga": has_tps or has_scr,
                "burnin": has_tps or has_scr,
                "cliente": has_tps or has_scr
            })
            
        elif path == '/tms/progress':
            operation_id = urllib.parse.parse_qs(parsed_path.query).get('operation_id', [None])[0]
            status = flash_controller.snapshot(operation_id)
            self.send_json(status or {'error': 'Operação não encontrada.'}, 200 if status else 404)

        elif path == '/tms/setup':
            # Abre o seletor de pastas (Tkinter)
            query = urllib.parse.parse_qs(parsed_path.query)
            prod = query.get('product', ['tps'])[0]
            
            import tkinter as tk
            from tkinter import filedialog
            try:
                root = tk.Tk()
                root.withdraw()
                root.attributes('-topmost', True)
                folder = filedialog.askdirectory(title=f"Selecione a pasta raiz do {prod.upper()}")
                root.destroy()
                
                if folder:
                    conf = load_config()
                    conf[f"{prod}_root"] = folder
                    save_config(conf)
                    self.send_json({"success": True, "path": folder})
                else:
                    self.send_json({"success": False, "message": "Cancelado"})
            except Exception as e:
                self.send_json({"error": str(e)}, 500)

        elif path == '/tms/config':
            query = urllib.parse.parse_qs(parsed_path.query)
            prod = query.get('product', ['tps'])[0]
            conf = load_config()
            self.send_json({"path": conf.get(f"{prod}_root", "Não configurado")})

        elif path == '/tms/flash':
            self.send_json({'error': 'Atualize a interface: gravação exige POST.'}, 405)

        else:
            self.send_json({"error": "Rota nao encontrada"}, 404)

    def do_POST(self):
        if not self.authorize():
            return
        global LAST_HEARTBEAT
        LAST_HEARTBEAT = time.time() # Qualquer POST renova o tempo de vida
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        self.connection.settimeout(30 if path == '/api/parse-pit' else 10)
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            max_len = 15 * 1024 * 1024 if path == '/api/parse-pit' else 1048576
            if not 0 <= content_length <= max_len:
                raise ValueError('Corpo da requisição excede o limite.')
            post_data = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else ""
        except (ValueError, OSError) as exc:
            self.send_json({'error': str(exc)}, 400)
            return

        if path == '/api/parse-pit':
            tmp_path = None
            try:
                data = json.loads(post_data)
                filename = str(data.get('filename', '')).strip()
                b64 = data.get('content_base64', '')
                if not filename or not b64:
                    raise ValueError('Campos filename e content_base64 sao obrigatorios.')
                ext = os.path.splitext(filename)[1].lower()
                if ext not in ('.csv', '.xlsx', '.xlsm', '.docx', '.pdf'):
                    raise ValueError(f'Formato nao suportado: {ext}. Use CSV, XLSX, DOCX ou PDF.')
                if ',' in b64 and b64.startswith('data:'):
                    b64 = b64.split(',', 1)[1]
                raw_bytes = base64.b64decode(b64)
                fd, tmp_path = tempfile.mkstemp(suffix=ext, prefix='pit_')
                with os.fdopen(fd, 'wb') as tf:
                    tf.write(raw_bytes)
                result = pit_parser.parse_pit_file(tmp_path)
                result['source_file'] = os.path.basename(filename)
                result['success'] = True
                self.send_json(result, 200)
            except Exception as exc:
                log_debug(f"Erro em /api/parse-pit: {exc}")
                self.send_json({'success': False, 'error': str(exc)}, 400)
            finally:
                if tmp_path and os.path.exists(tmp_path):
                    try:
                        os.remove(tmp_path)
                    except OSError:
                        pass
            return

        if path == '/api/pit/revalidate':
            try:
                data = json.loads(post_data)
                pit = data.get('pit')
                if not isinstance(pit, dict):
                    raise ValueError('Objeto pit invalido.')
                warnings = pit_parser.validate_pit(pit)
                can_plan = pit_parser.build_can_writes(pit)
                self.send_json({
                    'success': True,
                    'pit': pit,
                    'warnings': warnings,
                    'can_plan': can_plan,
                    'summary': {
                        'phase1_writes': len(can_plan['phase1_base']),
                        'phase2_writes': len(can_plan['phase2_user']),
                        'params_parsed': len(pit.get('parametros', {})),
                        'alarms_parsed': len(pit.get('alarmes', {})),
                        'din_parsed': len(pit.get('entradas_digitais', {})),
                        'status_relays_parsed': len(pit.get('saidas_rele', {})),
                        'warnings_count': len(warnings),
                        'errors_count': sum(1 for w in warnings if w['severity'] == 'error'),
                    }
                }, 200)
            except Exception as exc:
                self.send_json({'success': False, 'error': str(exc)}, 400)
            return

        if path == '/sys/update':
            if flash_controller.snapshot()['busy']:
                self.send_json({'success': False, 'error': 'Aguarde a gravacao JTAG terminar antes de atualizar o Bridge.'}, 409)
                return
            try:
                base_dir = os.path.dirname(os.path.abspath(__file__))
                updated = []
                for fname in BRIDGE_UPDATE_FILES:
                    dst = os.path.join(base_dir, fname)
                    url = f"{GITHUB_BRIDGE_RAW}/{fname}"
                    content = None
                    try:
                        resp = requests.get(url, timeout=15)
                        if resp.status_code == 200:
                            content = resp.content
                    except Exception:
                        pass
                    if content is None:
                        share_src = os.path.join(NET_SHARE_BRIDGE, fname)
                        if os.path.exists(share_src):
                            with open(share_src, 'rb') as sf:
                                content = sf.read()
                    if content is not None:
                        with open(dst, 'wb') as df:
                            df.write(content)
                        updated.append(fname)
                if 'teksea_bridge.py' not in updated:
                    self.send_json({'success': False, 'error': 'Nao foi possivel baixar a atualizacao do GitHub nem da rede local.'}, 502)
                    return

                self.send_json({'success': True, 'updated_files': updated, 'restarting': True})

                def _restart():
                    time.sleep(0.8)
                    py_exe = sys.executable
                    script = os.path.join(base_dir, 'teksea_bridge.py')
                    try:
                        subprocess.Popen([py_exe, script], cwd=base_dir, creationflags=getattr(subprocess, 'DETACHED_PROCESS', 0))
                    except Exception as e:
                        log_debug(f"Erro ao reiniciar apos update: {e}")
                    os._exit(0)

                threading.Thread(target=_restart, daemon=True).start()
            except Exception as exc:
                self.send_json({'success': False, 'error': str(exc)}, 500)
            return

        if path in ('/tms/flash', '/tms/cancel'):
            try:
                data = json.loads(post_data)
                if not isinstance(data, dict):
                    raise ValueError('Objeto JSON esperado.')
                operation_id = data.get('operation_id')
                if not isinstance(operation_id, str) or not 1 <= len(operation_id) <= 80:
                    raise ValueError('Identificador de operação inválido.')
                if path == '/tms/cancel':
                    result, code = flash_controller.cancel(operation_id)
                else:
                    existing = flash_controller.snapshot(operation_id)
                    if existing:
                        self.send_json(existing)
                        return
                    product, variant = data.get('product'), data.get('type')
                    if not isinstance(product, str) or not isinstance(variant, str):
                        raise ValueError('Produto e variante são obrigatórios.')
                    command, timeout = firmware_command(load_config(), product, variant, os.path.dirname(__file__))
                    result, code = flash_controller.start(operation_id, command, timeout,
                                                          product=product, variant=variant, firmware=command[-1])
                self.send_json(result, code)
            except (ValueError, TypeError, OSError) as exc:
                self.send_json({'error': str(exc)}, 400)
            return

        if path == '/sys/shutdown':
            if flash_controller.snapshot()['busy']:
                self.send_json({'error': 'Cancele a gravação e aguarde a limpeza antes de encerrar.'}, 409)
            else:
                self.send_json({'success': True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
            return

        if path == '/cloud/token':
            global _current_device_flow
            app = get_msal_app()
            if not _current_device_flow or not app:
                self.send_json({"error": "Nenhum fluxo de login iniciado"})
                return
            result = app.acquire_token_by_device_flow(_current_device_flow)
            if "access_token" in result:
                _current_device_flow = None
                save_msal_cache() # Salva no disco imediatamente
                username = result.get("id_token_claims", {}).get("preferred_username", "Usuario")
                self.send_json({"success": True, "username": username})
            else:
                self.send_json({"error": result.get("error_description", "Falha na autenticacao")})

        elif path == '/cloud/logout':
            app = get_msal_app()
            if app:
                for a in get_msal_accounts():
                    app.remove_account(a)
            save_msal_cache() # Remove do disco imediatamente
            self.send_json({"success": True})

        elif path == '/cloud/upload':
            try:
                data = json.loads(post_data)
                rows = data.get("rows", [])
                if not rows:
                    self.send_json({"error": "Nenhum dado recebido"})
                    return
                result = upload_to_sharepoint(rows)
                self.send_json(result)
            except Exception as e:
                self.send_json({"error": str(e)})

        else:
            self.send_json({"error": "Rota POST nao encontrada"}, 404)

    def log_message(self, format, *args):
        return  # Silencia logs no terminal

def start_server():
    try:
        server = ThreadingHTTPServer(('127.0.0.1', PORT), TekseaHandler)
        server.serve_forever()
    except Exception as e:
        log_debug(f"Erro no Servidor: {e}")

if __name__ == "__main__":
    try:
        os.chdir(os.path.dirname(os.path.abspath(__file__)))
        
        # Silencia stdout/stderr se for pythonw
        if sys.executable.endswith("pythonw.exe"):
            sys.stdout = open(os.devnull, 'w')
            sys.stderr = open(os.devnull, 'w')

        if is_already_running():
            # Se for um comando via URI, repassa para a instância ativa
            if len(sys.argv) > 1:
                uri = sys.argv[1]
                if "teksea://" in uri:
                    clean = uri.replace("teksea://", "").strip("/")
                    parts = clean.split("/")
                    # Ex: teksea://tms/setup/scr -> /tms/setup?product=scr
                    if len(parts) >= 3 and parts[1] == "setup":
                        target = f"http://127.0.0.1:{PORT}/tms/setup?product={parts[2]}"
                    else:
                        # Acorda o bridge ou repassa comando genérico
                        target = f"http://127.0.0.1:{PORT}/sys/heartbeat"
                    
                    try: urllib.request.urlopen(urllib.request.Request(target, headers={'X-Teksea-Local': '1'}), timeout=2)
                    except: pass
            sys.exit(0)

        # Processa seletor de pasta se for um "setup"
        if len(sys.argv) > 1 and "setup" in sys.argv[1]:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk(); root.withdraw(); root.attributes('-topmost', True)
            folder = filedialog.askdirectory(title="Selecione a pasta raiz")
            root.destroy()
            if folder:
                c = load_config()
                p = "scr" if "scr" in sys.argv[1] else "tps"
                c[f"{p}_root"] = folder
                save_config(c)

        # Inicia Watcher e Servidor
        threading.Thread(target=heartbeat_watcher, daemon=True).start()
        start_server()
        
    except Exception as e:
        log_debug(f"CRASH NA INICIALIZACAO: {e}")
        import traceback
        log_debug(traceback.format_exc())
