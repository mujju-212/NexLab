import os

from app import create_app, socketio

app = create_app()

if __name__ == '__main__':
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', '0') == '1'

    # socketio.run() is required for WebSocket support.
    # Waitress (previously used here) is a pure WSGI server — it cannot accept
    # WebSocket protocol upgrades, causing the repeated ws:// connection failures
    # seen in the browser console. socketio.run() uses Werkzeug (dev) or
    # eventlet/gevent (prod) which all support WebSocket upgrades properly.
    #
    # For production, set SOCKETIO_ASYNC_MODE=eventlet in your env and run:
    #   gunicorn -k eventlet -w 1 run:app
    print(f'[socketio] serving on http://{host}:{port} (debug={debug})')
    socketio.run(
        app,
        host=host,
        port=port,
        debug=debug,
        allow_unsafe_werkzeug=True,
    )
