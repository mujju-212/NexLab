# nexlab/shell:1
# Covers: Bash 5.3 + SQLite 3.5x
FROM alpine:3.22

LABEL maintainer="NexLab" \
      nexlab.image="shell" \
      nexlab.version="1"

# bash and sqlite3 from apk (alpine:3.22 ships bash 5.2+ and sqlite 3.45+)
RUN apk add --no-cache bash sqlite && \
    bash --version && sqlite3 --version
