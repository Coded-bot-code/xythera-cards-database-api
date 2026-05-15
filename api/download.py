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

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass  # Suppress default access logs

    def do_GET(self):
        params  = parse_qs(urlparse(self.path).query)
        url     = params.get('url',  [None])[0]
        media   = params.get('type', ['video'])[0].lower()

        if media not in ('video', 'audio'):
            media = 'video'

        if not url:
            return self._json(400, {
                'creator': 'XYTHERA', 'status': 400, 'success': False,
                'error': 'No URL provided. Use ?url=YOUTUBE_URL&type=video|audio'
            })

        ydl_opts = {
            'quiet':       True,
            'no_warnings': True,
            'noplaylist':  True,
            'format': (
                'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio/best'
                if media == 'audio' else
                'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
            ),
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

            # Resolve selected format
            fmts   = info.get('requested_formats') or [info]
            primary = fmts[0]

            if media == 'audio':
                ext     = primary.get('ext') or info.get('ext', 'm4a')
                abr     = primary.get('abr') or info.get('abr')
                quality = f"{int(abr)}kbps" if abr else primary.get('format_note', 'Best Audio')
                dl_url  = primary.get('url') or info.get('url', '')
            else:
                ext     = info.get('ext', 'mp4')
                height  = info.get('height') or primary.get('height')
                quality = f"{height}p" if height else info.get('format_note', 'Best')
                dl_url  = info.get('url') or info.get('manifest_url') or primary.get('url', '')

            # Format duration as H:MM:SS or M:SS
            raw_dur = info.get('duration')
            duration = None
            if raw_dur:
                m, s = divmod(int(raw_dur), 60)
                h, m = divmod(m, 60)
                duration = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"

            return self._json(200, {
                'creator': 'XYTHERA', 'status': 200, 'success': True,
                'result': {
                    'type':         media,
                    'format':       ext,
                    'title':        info.get('title', ''),
                    'uploader':     info.get('uploader') or info.get('channel', ''),
                    'duration':     duration,
                    'thumbnail':    info.get('thumbnail', ''),
                    'quality':      quality,
                    'download_url': dl_url,
                }
            })

        except yt_dlp.utils.DownloadError as e:
            msg = str(e)
            if 'Sign in' in msg or 'age' in msg.lower():
                friendly = 'This video is age-restricted and cannot be downloaded.'
            elif 'unavailable' in msg.lower() or 'private' in msg.lower():
                friendly = 'This video is unavailable or private.'
            elif 'copyright' in msg.lower():
                friendly = 'This video is blocked due to copyright restrictions.'
            else:
                friendly = msg.replace('ERROR: ', '', 1)

            return self._json(422, {'creator': 'XYTHERA', 'status': 422, 'success': False, 'error': friendly})

        except Exception as e:
            return self._json(500, {'creator': 'XYTHERA', 'status': 500, 'success': False, 'error': str(e)})
