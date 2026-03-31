from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import yt_dlp


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.end_headers()

    def _send_json(self, status_code, payload):
        body = json.dumps(payload).encode()
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        url = params.get('url', [None])[0]
        media_type = params.get('type', ['video'])[0].lower()
        if media_type not in ('video', 'audio'):
            media_type = 'video'

        if not url:
            self._send_json(400, {
                "creator": "XYTHERA",
                "status": 400,
                "success": False,
                "error": "No URL provided. Use ?url=YOUTUBE_URL"
            })
            return

        try:
            if media_type == 'audio':
                ydl_opts = {
                    'format': 'bestaudio[ext=m4a]/bestaudio/best',
                    'quiet': True,
                    'no_warnings': True,
                }
            else:
                ydl_opts = {
                    'format': 'best[ext=mp4]/best',
                    'quiet': True,
                    'no_warnings': True,
                }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

            if media_type == 'audio':
                fmt = info.get('ext', 'm4a')
                abr = info.get('abr')
                quality = f"{int(abr)}kbps" if abr else 'Best Audio'
            else:
                fmt = info.get('ext', 'mp4')
                height = info.get('height')
                quality = f"{height}p" if height else info.get('format_note', 'Best')

            self._send_json(200, {
                "creator": "XYTHERA",
                "status": 200,
                "success": True,
                "result": {
                    "type": media_type,
                    "format": fmt,
                    "title": info.get('title', ''),
                    "thumbnail": info.get('thumbnail', ''),
                    "quality": quality,
                    "download_url": info.get('url', '')
                }
            })
        except Exception as e:
            self._send_json(500, {
                "creator": "XYTHERA",
                "status": 500,
                "success": False,
                "error": str(e)
            })
