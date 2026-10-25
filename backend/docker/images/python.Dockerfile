FROM python:3.12-slim

# Pre-install common science and lab packages so execution is sub-second without runtime downloads
RUN pip install --no-cache-dir \
    matplotlib \
    sympy \
    numpy \
    pandas \
    scipy \
    requests \
    pillow \
    w1thermsensor

WORKDIR /work
RUN chmod 777 /work
