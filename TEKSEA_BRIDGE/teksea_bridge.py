import os
import sys
import json
import time
import subprocess
import threading
import socket
from http.server import HTTPServer, BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib.parse
import msal
import requests

# ============================================================
# CONFIGURAÇÕES TÉCNICAS
# ============================================================
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
_msal_app = msal.PublicClientApplication(CLIENT_ID, authority=AUTHORITY, token_cache=_msal_cache)

# Caminhos padrões
CONFIG_FILE = "config.json"
CCS_BASE_DIR = "ccs_base"
USER_FILES_DIR = "user_files"

# Estado Global do TMS Flash
flash_status = {"progress": 0, "status": "Idle", "log": [], "error": None}

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    return {}

def save_config(config):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=4)

# ============================================================
# MÓDULO: MICROSOFT GRAPH (CLOUD)
# ============================================================
def get_msal_app():
    return _msal_app

def get_access_token():
    accounts = _msal_app.get_accounts()
    if accounts:
        result = _msal_app.acquire_token_silent(SCOPES, account=accounts[0])
        if result and "access_token" in result:
            return result["access_token"]
    return None

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
def run_flash(flash_type, config, product="tps"):
    global flash_status
    flash_status = {"progress": 10, "status": f"Iniciando gravação {flash_type.upper()}...", "log": [], "error": None}
    
    try:
        root_path = config.get(f"{product}_root")
        if not root_path:
            raise Exception(f"Caminho raiz do {product.upper()} nao configurado.")

        bridge_dir = os.path.dirname(os.path.abspath(__file__))
        dslite_path = os.path.join(bridge_dir, "ccs_base", "DebugServer", "bin", "DSLite.exe")
        ccxml_path = os.path.join(bridge_dir, "user_files", "configs", "tms320f28375s.ccxml")
        
        firmware_map = {
            "jiga": config.get(f"{product}_fw_jiga") or ("J2_Vca_montado.out" if product == "scr" else "com.teksea.retificador125.uge-280225A-jiga.out"),
            "vca_montado": config.get(f"{product}_fw_jiga") or ("J2_Vca_montado.out" if product == "scr" else "com.teksea.retificador125.uge-280225A-jiga.out"),
            "burnin": config.get(f"{product}_fw_burnin") or ("B1_Burn_in.out" if product == "scr" else "com.teksea.retificador125.uge-280225A-burnin.out"),
            "cliente": config.get(f"{product}_fw_cliente") or ("C0_Cliente.out" if product == "scr" else "com.teksea.retificador125.uge-280225A-cliente.out")
        }
        fw_rel_path = firmware_map.get(flash_type)
        if not fw_rel_path:
            raise Exception(f"Firmware '{flash_type}' nao configurado para {product}.")
            
        fw_full_path = os.path.join(root_path, fw_rel_path)

        if not os.path.exists(dslite_path):
            raise Exception(f"DSLite nao encontrado em: {dslite_path}")
        if not os.path.exists(ccxml_path):
            raise Exception(f"Arquivo CCXML nao encontrado em: {ccxml_path}")
        fw_full_path = os.path.join(root_path, fw_rel_path)

        # Busca flexível por palavra-chave se o arquivo exato não existir (case-insensitive)
        if not os.path.exists(fw_full_path):
            keyword = (flash_type if flash_type != "vca_montado" else "jiga").lower()
            found = False
            for f in os.listdir(root_path):
                f_low = f.lower()
                if f_low.endswith(".out") and keyword in f_low:
                    fw_full_path = os.path.join(root_path, f)
                    log_debug(f"Arquivo exato nao encontrado. Usando busca por palavra-chave '{keyword}': {f}")
                    found = True
                    break
            if not found:
                raise Exception(f"Arquivo Firmware contendo '{keyword}' (.out) nao encontrado em: {root_path}")

        cmd = [
            dslite_path, "flash",
            "-c", ccxml_path,
            "-e", "-f", "-v", "--run", fw_full_path
        ]
        flash_status["status"] = "Executando DSLite..."
        flash_status["progress"] = 30
        
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
        
        for line in process.stdout:
            clean_line = line.strip()
            if clean_line:
                flash_status["log"].append(clean_line)
                if "Writing at" in clean_line: flash_status["progress"] = 60
                if "Verified" in clean_line: flash_status["progress"] = 90

        process.wait()
        if process.returncode == 0:
            flash_status["progress"] = 100
            flash_status["status"] = "SUCESSO!"
        else:
            flash_status["error"] = "Falha no processo DSLite. Verifique o log."
            flash_status["status"] = "Erro na Gravacao"

    except Exception as e:
        flash_status["error"] = str(e)
        flash_status["status"] = "Falha Critica"

# ============================================================
# HEARTBEAT & CICLO DE VIDA
# ============================================================
def heartbeat_watcher():
    """ Encerra o bridge se o frontend nao enviar sinal por 60 segundos, 
        mas NUNCA encerra se uma gravacao estiver em progresso. """
    while True:
        time.sleep(10) # Verifica a cada 10s
        
        # Se o status nao for Idle ou o progresso for > 0, consideramos que esta gravando
        is_flashing = (flash_status.get("status") != "Idle") and (flash_status.get("progress", 0) < 100)
        
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
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_GET(self):
        global LAST_HEARTBEAT
        LAST_HEARTBEAT = time.time() # Qualquer GET renova o tempo de vida
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        
        # --- SISTEMA ---
        if path == '/sys/heartbeat':
            self.send_json({"status": "alive"})
        
        elif path == '/sys/status':
            accounts = _msal_app.get_accounts()
            conf = load_config()
            self.send_json({
                "bridge_alive": True,
                "ms_logged_in": bool(accounts),
                "ms_username": accounts[0].get("username", "Usuario") if accounts else "",
                "tps_root": conf.get("tps_root", "Não configurado"),
                "scr_root": conf.get("scr_root", "Não configurado")
            })

        # --- CLOUD ---
        elif path == '/cloud/devicecode':
            global _current_device_flow
            flow = _msal_app.initiate_device_flow(scopes=SCOPES)
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
            accounts = _msal_app.get_accounts()
            for a in accounts:
                _msal_app.remove_account(a)
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
            self.send_json(flash_status)

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
            query = urllib.parse.parse_qs(parsed_path.query)
            ftype = query.get('type', ['cliente'])[0]
            prod = query.get('product', ['tps'])[0]
            conf = load_config()
            threading.Thread(target=run_flash, args=(ftype, conf, prod), daemon=True).start()
            self.send_json({"success": True, "message": "Gravacao iniciada"})

        else:
            self.send_json({"error": "Rota nao encontrada"}, 404)

    def do_POST(self):
        global LAST_HEARTBEAT
        LAST_HEARTBEAT = time.time() # Qualquer POST renova o tempo de vida
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else ""

        if path == '/cloud/token':
            global _current_device_flow
            if not _current_device_flow:
                self.send_json({"error": "Nenhum fluxo de login iniciado"})
                return
            result = _msal_app.acquire_token_by_device_flow(_current_device_flow)
            if "access_token" in result:
                _current_device_flow = None
                save_msal_cache() # Salva no disco imediatamente
                username = result.get("id_token_claims", {}).get("preferred_username", "Usuario")
                self.send_json({"success": True, "username": username})
            else:
                self.send_json({"error": result.get("error_description", "Falha na autenticacao")})

        elif path == '/cloud/logout':
            accounts = _msal_app.get_accounts()
            for a in accounts:
                _msal_app.remove_account(a)
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
                    
                    try: urllib.request.urlopen(target, timeout=2)
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
