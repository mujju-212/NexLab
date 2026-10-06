import os

from app import create_app, socketio

app = create_app()

if __name__ == '__main__':
    # Local/dev serving. Two paths, selected by env:
    #   SOCKET_PROD=1  -> flask-socketio's own runner (use with gunicorn+eventlet
    #                      on Linux; on Windows this falls back to werkzeug).
    #   otherwise      -> waitress, a real production WSGI server that plays
    #                      nicely with Socket.IO's "threading" async_mode.
    #                      Werkzeug's dev server is NOT used any more: it handled
    #                      Socket.IO long-polls and API calls on the same tiny
    #                      thread pool, which starved /api/* requests and made
    #                      the whole admin UI feel laggy.
    if os.environ.get('SOCKET_PROD') == '1':
        socketio.run(
            app,
            host=os.environ.get('HOST', '0.0.0.0'),
            port=int(os.environ.get('PORT', 5000)),
            debug=False,
            allow_unsafe_werkzeug=True,
        )
    else:
        from waitress import serve

        threads = int(os.environ.get('WAITRESS_THREADS', 16))
        host = os.environ.get('HOST', '0.0.0.0')
        port = int(os.environ.get('PORT', 5000))
        print(f'[waitress] serving on http://{host}:{port} (threads={threads})')
        serve(app, host=host, port=port, threads=threads,
              connection_limit=200, recv_bytes=65536, send_bytes=65536)
