import os
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
import urllib.request
import sys
import atexit

# Bibliotecas para MSAL e Requisições Web
try:
    import msal
    import requests
except ImportError:
    print("\nERRO: Bibliotecas 'msal' ou 'requests' não encontradas.")
    print("Por favor, instale-as rodando no terminal:")
    print("pip install msal requests")
    print("--------------------------------------------------\n")
    input("Pressione ENTER para sair...")
    sys.exit(1)

# --- CONFIGURAÇÃO MICROSOFT ---
PORT = 8766
CLIENT_ID = "58454a49-a299-40b0-9566-372bdab155db"
AUTHORITY = "https://login.microsoftonline.com/f03ed2fc-3f7d-4cd8-bbd7-cf47c853931c"
SCOPES = ["User.Read", "Files.ReadWrite", "Sites.ReadWrite.All"]
CACHE_FILE = "ms_cache.bin"

# --- INICIALIZAÇÃO MSAL CACHE ---
cache = msal.SerializableTokenCache()
if os.path.exists(CACHE_FILE):
    try:
        cache.deserialize(open(CACHE_FILE, "r").read())
    except:
        pass

atexit.register(lambda:
    open(CACHE_FILE, "w").write(cache.serialize()) if cache.has_state_changed else None
)

app = msal.PublicClientApplication(
    CLIENT_ID, authority=AUTHORITY,
    token_cache=cache
)

# Variável global para armazenar o fluxo de device code em andamento
current_device_flow = None

def get_access_token():
    accounts = app.get_accounts()
    if accounts:
        result = app.acquire_token_silent(SCOPES, account=accounts[0])
        if result and "access_token" in result:
            return result["access_token"]
    return None

def upload_to_sharepoint(rows):
    token = get_access_token()
    if not token:
        return {"error": "Não autenticado na Microsoft."}
    
    # Parâmetros fixos da sua nuvem
    hostname = "teksea.sharepoint.com"
    site_name = "106FAB"
    file_name = "NUMERO SERIE UGE (USAR ESSE) - Copia.xlsx"
    table_name = "Tabela1"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    try:
        print("[Graph API] Passo 1: Buscando ID do Site SharePoint...")
        url_site = f"https://graph.microsoft.com/v1.0/sites/{hostname}:/sites/{site_name}"
        resp_site = requests.get(url_site, headers=headers)
        if resp_site.status_code != 200:
            return {"error": f"Erro no Site ID: {resp_site.text}"}
        site_id = resp_site.json().get("id")

        print("[Graph API] Passo 2: Buscando arquivo na nuvem...")
        # Usa quote para evitar problemas de URL com espaços
        from urllib.parse import quote
        url_search = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/root/search(q='{quote(file_name)}')"
        resp_search = requests.get(url_search, headers=headers)
        if resp_search.status_code != 200:
            return {"error": f"Erro ao buscar arquivo: {resp_search.text}"}
        
        search_results = resp_search.json().get("value", [])
        if not search_results:
            return {"error": f"Arquivo '{file_name}' não encontrado no SharePoint."}
        
        # Pega o arquivo correto
        file_item = next((f for f in search_results if f.get("name") == file_name), search_results[0])
        item_id = file_item.get("id")
        print(f"[Graph API] Arquivo encontrado! ID: {item_id}")

        print("[Graph API] Passo 3: Verificando colunas da tabela...")
        url_cols = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/items/{item_id}/workbook/tables/{table_name}/columns"
        resp_cols = requests.get(url_cols, headers=headers)
        if resp_cols.status_code == 200:
            cols_count = len(resp_cols.json().get("value", []))
            if cols_count > 0:
                print(f"[Graph API] A tabela tem {cols_count} colunas. Ajustando dados...")
                adjusted_rows = []
                for r in rows:
                    if len(r) > cols_count:
                        adjusted_rows.append(r[:cols_count])
                    else:
                        adjusted_rows.append(r + [""] * (cols_count - len(r)))
                rows = adjusted_rows

        print(f"[Graph API] Passo 4: Enviando {len(rows)} linhas para o Excel Online...")
        url_add = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/items/{item_id}/workbook/tables/{table_name}/rows/add"
        resp_add = requests.post(url_add, headers=headers, json={"values": rows})

        if resp_add.status_code in [200, 201]:
            print("[Graph API] Gravado com Sucesso!")
            return {"success": True}
        else:
            return {"error": f"Graph API Error ({resp_add.status_code}): {resp_add.text}"}
            
    except Exception as e:
        return {"error": f"Exceção interna no Bridge: {str(e)}"}


class LoggerHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        global current_device_flow
        
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        if self.path == '/status':
            accounts = app.get_accounts()
            if accounts:
                self.wfile.write(json.dumps({"logged_in": True, "username": accounts[0].get("username", "Usuário")}).encode())
            else:
                self.wfile.write(json.dumps({"logged_in": False}).encode())

        elif self.path == '/devicecode':
            print("[MSAL] Iniciando fluxo de Device Code...")
            flow = app.initiate_device_flow(scopes=SCOPES)
            if "user_code" in flow:
                current_device_flow = flow
                self.wfile.write(json.dumps({
                    "user_code": flow["user_code"],
                    "verification_uri": flow["verification_uri"],
                    "message": flow["message"]
                }).encode())
            else:
                self.wfile.write(json.dumps({"error": "Falha ao iniciar device flow"}).encode())

        elif self.path == '/logout':
            accounts = app.get_accounts()
            for a in accounts:
                app.remove_account(a)
            self.wfile.write(json.dumps({"success": True}).encode())

    def do_POST(self):
        global current_device_flow
        
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b""
        
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        if self.path == '/token':
            if not current_device_flow:
                self.wfile.write(json.dumps({"error": "Nenhum fluxo iniciado"}).encode())
                return
            
            # O msal bloqueia até o usuário digitar o código ou dar timeout.
            # Para não travar o frontend, a gente processa rápido.
            # O método acquire_token_by_device_flow já faz polling, então chamaremos ele
            print("[MSAL] Aguardando usuário autenticar no navegador...")
            result = app.acquire_token_by_device_flow(current_device_flow)
            
            if "access_token" in result:
                print("[MSAL] Autenticado com sucesso!")
                current_device_flow = None
                self.wfile.write(json.dumps({
                    "success": True, 
                    "username": result.get("id_token_claims", {}).get("preferred_username", "Usuário")
                }).encode())
            else:
                print("[MSAL] Falha ou Timeout na autenticação.")
                self.wfile.write(json.dumps({"error": result.get("error_description", "Falha")}).encode())

        elif self.path == '/update':
            try:
                data = json.loads(post_data)
                rows = data.get("rows", [])
                if not rows:
                    self.wfile.write(json.dumps({"error": "Nenhum dado recebido"}).encode())
                    return
                
                res = upload_to_sharepoint(rows)
                self.wfile.write(json.dumps(res).encode())
            except Exception as e:
                self.wfile.write(json.dumps({"error": str(e)}).encode())

    def log_message(self, format, *args):
        return

def run_server():
    server = HTTPServer(('0.0.0.0', PORT), LoggerHandler)
    print("==================================================")
    print("  BRIDGE PYTHON - MICROSOFT GRAPH API V2")
    print(f"  Rodando na porta {PORT}...")
    print("==================================================")
    server.serve_forever()

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    run_server()
