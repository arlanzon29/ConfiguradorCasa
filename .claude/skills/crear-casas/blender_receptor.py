# Receptor de un solo uso dentro de Blender: espera el .glb que manda la web
# con descargarGlb({ enviarA: 'http://localhost:8765' }), lo guarda en la
# carpeta temporal y se cierra. Claude lo manda con execute_blender_code antes
# de llamar a la web; luego blender_casa.py importa RECIBIDO.
#
# Vale también para la web publicada en GitHub Pages (HTTPS): Chrome deja que
# una página pública hable con localhost si este contesta a la consulta previa
# con Access-Control-Allow-Private-Network. Escucha solo en 127.0.0.1.
import http.server, os, tempfile, threading

PUERTO = 8765
RECIBIDO = os.path.join(tempfile.gettempdir(), "eurocasa-casa.glb")

if os.path.exists(RECIBIDO):
    os.remove(RECIBIDO)


class Receptor(http.server.BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_POST(self):
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        with open(RECIBIDO, "wb") as f:
            f.write(data)
        self.send_response(200)
        self.cors()
        self.end_headers()
        self.wfile.write(b"ok")
        threading.Thread(target=self.server.shutdown, daemon=True).start()

    def log_message(self, *args):
        pass


import builtins
old = getattr(builtins, "_eurocasa_receptor", None)
if old:
    try:
        old.shutdown()
        old.server_close()
    except Exception:
        pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", PUERTO), Receptor)
srv.timeout = 300
threading.Thread(target=srv.serve_forever, daemon=True).start()
builtins._eurocasa_receptor = srv  # para cerrarlo si se vuelve a abrir
print({"escuchando": f"http://localhost:{PUERTO}", "guarda_en": RECIBIDO})
