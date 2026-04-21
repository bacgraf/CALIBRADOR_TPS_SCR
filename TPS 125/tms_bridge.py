import sys
import os
import json
import subprocess
import threading
import time
import re
from urllib.parse import urlparse, parse_qs
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
# --- CONFIGURAÇÃO ---
CONFIG_FILE = "config_bridge.json"
DEFAULT_CONFIG = {
    "tps_root": "",  # Caminho para a pasta 'TPS 125'
    "scr_root": "",  # Caminho para a pasta 'SCR'
    "last_ip": "192.168.4.1"
}

# Estado Global do Progresso
progress_data = {
    "progress": 0,
    "status": "Aguardando...",
    "error": None,
    "log": [] 
}

# --- SERVIDOR LOCALHOST (PARA O BROWSER) ---
class ProgressHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/progress':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*') # Importante para CORS
            self.end_headers()
            self.wfile.write(json.dumps(progress_data).encode())
        elif self.path.startswith('/check'):
            parsed_path = urlparse(self.path)
            query = parse_qs(parsed_path.query)
            product = query.get('product', ['tps'])[0]
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            config = load_config()
            root_path = config.get(f"{product}_root", "")
            availability = {"jiga": False, "vca_montado": False, "burnin": False, "cliente": False}
            
            if root_path and os.path.exists(root_path):
                firmware_dir = os.path.join(root_path, "images") if os.path.exists(os.path.join(root_path, "images")) else root_path
                try:
                    for f in os.listdir(firmware_dir):
                        f_low = f.lower()
                        if f_low.endswith(".out"):
                            if "jiga" in f_low: availability["jiga"] = True
                            if "vca_montado" in f_low: availability["vca_montado"] = True
                            if "burnin" in f_low or "burn_in" in f_low: availability["burnin"] = True
                            if "cliente" in f_low: availability["cliente"] = True
                except Exception:
                    pass
            self.wfile.write(json.dumps(availability).encode())
        elif self.path.startswith('/config'):
            parsed_path = urlparse(self.path)
            query = parse_qs(parsed_path.query)
            product = query.get('product', ['tps'])[0]
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            # Recarrega para pegar mudanças feitas em outras instâncias/threads
            config = load_config()
            path = config.get(f"{product}_root", "")
            
            # Se estiver vazio, tenta um fallback para o outro produto se for a mesma pasta raiz
            if not path:
                path = "Não configurado"
                
            self.wfile.write(json.dumps({"path": path}).encode())
        elif self.path.startswith('/flash?'):
            parsed_path = urlparse(self.path)
            query = parse_qs(parsed_path.query)
            fw_type = query.get('type', [''])[0]
            product = query.get('product', ['tps'])[0]
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "started"}).encode())
            
            if fw_type:
                config = load_config()
                threading.Thread(target=run_flash, args=(fw_type, config, product), daemon=True).start()
        else:
            self.send_error(404)

    def log_message(self, format, *args):
        return # Silencia logs no terminal

def start_server():
    try:
        server = HTTPServer(('localhost', 8765), ProgressHandler)
        server.serve_forever()
    except OSError:
        pass # Porta já em uso (outra instância rodando)

# --- LÓGICA DE PERSISTÊNCIA ---
def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return DEFAULT_CONFIG.copy()

def save_config(cfg):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(cfg, f, indent=4)

import tkinter as tk
from tkinter import filedialog

def select_root_folder(product="tps"):
    """Abre o seletor de pastas moderno do Windows usando tkinter"""
    root = tk.Tk()
    root.withdraw() # Esconde a janela principal do tcl/tk
    root.attributes('-topmost', True) # Coloca a janela na frente de tudo
    
    title = f"Selecione a pasta RAIZ do Calibrador ({product.upper()})"
    folder = filedialog.askdirectory(title=title)
    
    root.destroy()
    return folder

def find_file_smart(root_path, filename, subfolders):
    """Procura um arquivo na raiz ou em subpastas específicas"""
    # 1. Tenta na raiz direta
    direct_path = os.path.join(root_path, filename)
    if os.path.exists(direct_path):
        return direct_path
    
    # 2. Tenta nas subpastas sugeridas
    for sub in subfolders:
        path = os.path.join(root_path, sub, filename)
        if os.path.exists(path):
            return path
    return None

# --- EXECUÇÃO DO DSLITE ---
def run_flash(cmd_type, config, product="tps"):
    global progress_data
    progress_data["progress"] = 0
    progress_data["error"] = None
    progress_data["log"] = [f"Iniciando gravação {product.upper()}..."]
    
    root_path = os.path.abspath(config.get(f"{product}_root", ""))
    if not root_path or not os.path.exists(root_path):
        progress_data["error"] = f"Pasta raiz de {product.upper()} não configurada!"
        return
    
    # Pasta onde o executável do Bridge está (para buscar CCXML e DSLite)
    bridge_path = os.path.dirname(os.path.abspath(sys.argv[0]))
    
    # BUSCA INTELIGENTE DO FIRMWARE (Na pasta selecionada pelo usuário)
    firmware_dir = os.path.join(root_path, "images") if os.path.exists(os.path.join(root_path, "images")) else root_path
    matching_files = []
    
    try:
        for f in os.listdir(firmware_dir):
            f_low = f.lower()
            # Ajuste para tipos com nomes ligeiramente diferentes (burnin vs burn_in)
            search_type = cmd_type.lower()
            if search_type == "burnin":
                found = ("burnin" in f_low or "burn_in" in f_low)
            else:
                found = (search_type in f_low)

            if f_low.endswith(".out") and found:
                full_path = os.path.join(firmware_dir, f)
                matching_files.append({
                    "path": full_path,
                    "mtime": os.path.getmtime(full_path),
                    "name": f
                })
    except Exception as e:
        progress_data["error"] = f"Erro ao acessar pasta: {str(e)}"
        return

    if not matching_files:
        progress_data["error"] = f"Nenhum arquivo de firmware do tipo [{cmd_type.upper()}] encontrado em {firmware_dir}"
        return

    # Ordena por data de modificação (mais recente primeiro)
    matching_files.sort(key=lambda x: x["mtime"], reverse=True)
    selected_file = matching_files[0]
    fw_path = selected_file["path"]
    
    progress_data["log"].append(f"Arquivo encontrado: {selected_file['name']}")
    progress_data["log"].append(f"Data: {time.ctime(selected_file['mtime'])}")
    print(f"Selecionado: {fw_path}")

    # BUSCA INTELIGENTE DO CONFIG CCXML (Na pasta do Bridge)
    ccxml_path = find_file_smart(bridge_path, "tms320f28375s.ccxml", ["user_files/configs", "configs"])
    if not ccxml_path:
        progress_data["error"] = f"Arquivo 'tms320f28375s.ccxml' não encontrado na pasta do Bridge: {bridge_path}"
        return

    # BUSCA INTELIGENTE DO DSLITE.EXE (Na pasta do Bridge)
    dslite_exe = find_file_smart(bridge_path, "DSLite.exe", ["ccs_base/DebugServer/bin", "bin"])
    if not dslite_exe:
        progress_data["error"] = f"Executável 'DSLite.exe' não encontrado na pasta do Bridge."
        return
    
    # BUSCA INTELIGENTE DO UFSETTINGS (Opcional, mas recomendado pela TI)
    ufsettings_path = find_file_smart(bridge_path, "generated.ufsettings", ["user_files/settings", "settings"])

    progress_data["status"] = f"Iniciando gravação: {selected_file['name']}..."
    
    try:
        args = [
            dslite_exe, "flash",
            "-c", ccxml_path
        ]

        if ufsettings_path:
            args.extend(["-l", ufsettings_path])

        # Flags corrigidas segundo o seu --help:
        # -e: Verbose (para garantir que os logs de porcentagem apareçam bem)
        # -f: Flash
        # -v: Verify
        # -u: Run (inicia a CPU ao final)
        args.extend(["-e", "-f", "-v", "-u", fw_path])
        
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        
        process = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True,
            cwd=root_path,
            startupinfo=startupinfo
        )

        # Buffer para construir a linha atual caractere por caractere
        current_line = ""
        verification_ok = False
        current_phase = "Waiting" # Waiting, Erasing, Programming, Verifying

        while True:
            char = process.stdout.read(1)
            if not char and process.poll() is not None:
                break
            
            if char == '\r' or char == '\n':
                line = current_line.strip()
                if line:
                    print(f"[DSLite] {line}")
                    
                    # Detecta mudança de fase com mais inteligência
                    if "Erasing" in line: 
                        current_phase = "Erasing"
                    # No C2000, o início da escrita é marcado por seções ou endereços 0x
                    if any(x in line for x in ["Writing", "Programming", "Loading", "at 0x", "codestart", ".text", ".TI.ramfunc"]):
                        if "Erasing" not in line:
                            current_phase = "Programming"
                    
                    if "Verifying" in line: 
                        current_phase = "Verifying"
                    
                    if "Program verification successful" in line:
                        verification_ok = True
                        progress_data["progress"] = 100
                        progress_data["status"] = "Verificação OK!"

                    # Adiciona ao log apenas se for relevante
                    if "%" not in line or len(progress_data["log"]) == 0 or "%" not in progress_data["log"][-1]:
                        progress_data["log"].append(line)
                    else:
                        progress_data["log"][-1] = line
                    
                    if len(progress_data["log"]) > 50: progress_data["log"].pop(0)

                    # Captura de Progresso com Escalonamento por Fase
                    match = re.search(r'(\d+)\s*%', line)
                    if match:
                        val = int(match.group(1))
                        scaled = progress_data["progress"]
                        
                        if current_phase == "Erasing": scaled = int(val * 0.1)
                        elif current_phase == "Programming": scaled = 10 + int(val * 0.8)
                        elif current_phase == "Verifying": scaled = 90 + int(val * 0.1)
                        
                        if scaled > progress_data["progress"]:
                            progress_data["progress"] = scaled
                    
                    if current_phase == "Erasing": progress_data["status"] = "Apagando Memória..."
                    if current_phase == "Programming": progress_data["status"] = "Gravando Flash..."
                    if current_phase == "Verifying" and not verification_ok: progress_data["status"] = "Verificando Dados..."
                
                current_line = ""
            else:
                current_line += char

        process.wait()

        # TENTATIVA SECUNDÁRIA DE RUN (Se a verificação foi OK mas a CPU não deu sinal de vida)
        if verification_ok and process.returncode != 0:
             print("Aviso: Tentando comando secundário de início (Run)...")
             subprocess.Popen([dslite_exe, "flash", "-c", ccxml_path, "-u"], 
                              startupinfo=startupinfo, cwd=root_path).wait()
        
        # Resultado Final
        if verification_ok:
            progress_data["progress"] = 100
            progress_data["status"] = "Sucesso! Firmware Iniciado."
        elif process.returncode == 0:
            progress_data["progress"] = 100
            progress_data["status"] = "Sucesso!"
        else:
            progress_data["error"] = "O DSLite retornou um erro. Chips travados ou falta de alimentação podem causar isso."

    except Exception as e:
        progress_data["error"] = str(e)

    except Exception as e:
        progress_data["error"] = str(e)

# --- MAIN ---
if __name__ == "__main__":    
    # Carrega config mas troca o diretório de trabalho para onde o exe está
    os.chdir(os.path.dirname(os.path.abspath(sys.argv[0])))
    config = load_config()
    
    action = None
    
    # Processa Argumento (URI: tms-flash://192.168.4.1/jiga)
    if len(sys.argv) > 1:
        uri = sys.argv[1]
        clean_uri = uri.replace("tms-flash://", "").strip("/")
        parts = clean_uri.split("/")
        
        product = "tps"
        if len(parts) >= 3:
            product = parts[2].lower()
        elif "scr" in uri.lower(): # Fallback se a URI for mal formada
            product = "scr"

        # Se for comando setup ou nunca configurado, pede pasta
        if "setup" in uri or not config.get(f"{product}_root"):
            folder = select_root_folder(product)
            if folder:
                config[f"{product}_root"] = folder
                save_config(config)
            if "setup" in uri and len(parts) < 2:
                sys.exit(0)

        if len(parts) >= 2:
            action = parts[1].lower()
            
    # Tenta enviar para uma instância já aberta (Single Instance Mode)
    if action:
        try:
            req = urllib.request.urlopen(f'http://localhost:8765/flash?type={action}&product={product}', timeout=1)
            if req.getcode() == 200:
                print(f"Comando {action} ({product}) repassado para o Bridge já aberto.")
                sys.exit(0) # Sucesso, repassou e fechou essa instância redundante
        except Exception:
            pass # Instância principal não está rodando, continuaremos para criar a nossa!

    # Instância Principal
    if action:
        # Se recebemos um comando mas não havia master, iniciamos a gravação em paralelo
        threading.Thread(target=run_flash, args=(action, config, product), daemon=True).start()
    else:
        # Modo Manual / Debug
        if not config.get("tps_root"):
            config["tps_root"] = select_root_folder()
            save_config(config)

    print("Bridge Persistente rodando na porta 8765... Pode fechar esta janela se desejar.")
    start_server() # Bloqueia o main thread e fica servindo indefinidamente
