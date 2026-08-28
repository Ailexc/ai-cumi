# 临时验证服务器: 服务 frontend/dist 静态文件 + 代理 /api → http://localhost:8000
# 用法: python3.12 serve_verify.py  (验证后删除)
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.request import Request, urlopen
import os

DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DIST, **kw)

    def _proxy(self):
        try:
            req = Request("http://localhost:8000" + self.path, headers={"Host": "localhost:8000"})
            with urlopen(req, timeout=30) as r:
                body = r.read()
                self.send_response(r.status)
                for k, v in r.headers.items():
                    if k.lower() not in ("content-length", "transfer-encoding", "connection", "keep-alive"):
                        self.send_header(k, v)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except Exception as e:
            self.send_error(502, "proxy error: %s" % e)

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._proxy()
        else:
            super().do_GET()


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 5173), Handler).serve_forever()
