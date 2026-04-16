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

    def log_message(self, format, *args):
        # Suppress default HTTP server logs
        pass

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
                "error": "No URL provided. Use ?url=YOUTUBE_URL&type=video|audio"
            })
            return

        try:
            if media_type == 'audio':
                # Use bestaudio with broad fallback — yt-dlp picks best available
                ydl_opts = {
                    'format': 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio/best',
                    'quiet': True,
                    'no_warnings': True,
                    'noplaylist': True,
                }
            else:
                # Prefer mp4 with audio+video merged; fall back to best single file
                ydl_opts = {
                    'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                    'quiet': True,
                    'no_warnings': True,
                    'noplaylist': True,
                }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

            # Resolve the actual selected format details
            requested_formats = info.get('requested_formats') or [info]
            primary_fmt = requested_formats[0] if requested_formats else info

            if media_type == 'audio':
                fmt = primary_fmt.get('ext') or info.get('ext', 'm4a')
                abr = primary_fmt.get('abr') or info.get('abr')
                quality = f"{int(abr)}kbps" if abr else primary_fmt.get('format_note', 'Best Audio')
                # For audio-only, get the direct stream URL
                download_url = primary_fmt.get('url') or info.get('url', '')
            else:
                fmt = info.get('ext', 'mp4')
                height = info.get('height') or primary_fmt.get('height')
                quality = f"{height}p" if height else info.get('format_note', 'Best')
                # For video, prefer the manifest_url or direct url
                download_url = (
                    info.get('url')
                    or info.get('manifest_url')
                    or primary_fmt.get('url', '')
                )

            duration = info.get('duration')
            duration_str = None
            if duration:
                mins, secs = divmod(int(duration), 60)
                hrs, mins = divmod(mins, 60)
                duration_str = f"{hrs}:{mins:02d}:{secs:02d}" if hrs else f"{mins}:{secs:02d}"

            self._send_json(200, {
                "creator": "XYTHERA",
                "status": 200,
                "success": True,
                "result": {
                    "type": media_type,
                    "format": fmt,
                    "title": info.get('title', ''),
                    "uploader": info.get('uploader') or info.get('channel', ''),
                    "duration": duration_str,
                    "thumbnail": info.get('thumbnail', ''),
                    "quality": quality,
                    "download_url": download_url
                }
            })

        except yt_dlp.utils.DownloadError as e:
            # Friendly message for age-gated / unavailable videos
            msg = str(e)
            if 'Sign in' in msg or 'age' in msg.lower():
                error_msg = "This video is age-restricted and cannot be downloaded."
            elif 'unavailable' in msg.lower() or 'not available' in msg.lower():
                error_msg = "This video is unavailable or private."
            elif 'copyright' in msg.lower():
                error_msg = "This video is blocked due to copyright restrictions."
            else:
                error_msg = msg.replace('ERROR: ', '', 1)

            self._send_json(422, {
                "creator": "XYTHERA",
                "status": 422,
                "success": False,
                "error": error_msg
            })

        except Exception as e:
            self._send_json(500, {
                "creator": "XYTHERA",
                "status": 500,
                "success": False,
                "error": str(e)
            })
