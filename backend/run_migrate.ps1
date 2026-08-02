$env:FLASK_APP="run.py"
$env:FLASK_ENV="development"
$env:DATABASE_URL="postgresql://postgres:vlabpass@localhost:5433/virtuallab"
$env:SECRET_KEY="vlab-dev-secret"
$env:JWT_SECRET_KEY="vlab-jwt-secret"

& "venv\Scripts\python.exe" -m flask db upgrade | Out-Default
