FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (WeasyPrint needs these)
RUN apt-get update && apt-get install -y \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create ml_models directory if not mounted
RUN mkdir -p ml_models

EXPOSE 5000

CMD ["gunicorn", "--worker-class", "eventlet", "-w", "1", \
     "--bind", "0.0.0.0:5000", \
     "--timeout", "120", \
     "--log-level", "info", \
     "run:app"]
