# nexlab/jvm:25
# Covers: Java (JDK 25) + Kotlin (kotlinc 2.4.10)
FROM eclipse-temurin:25-jdk-alpine

LABEL maintainer="NexLab" \
      nexlab.image="jvm" \
      nexlab.version="25"

# Install kotlinc from the official GitHub releases
# Using 2.4.10 (latest stable as of 2026-08)
ENV KOTLIN_VERSION=2.4.10
ENV KOTLIN_HOME=/opt/kotlin

RUN apk add --no-cache bash curl unzip && \
    curl -fsSL \
      "https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-compiler-${KOTLIN_VERSION}.zip" \
      -o /tmp/kotlin.zip && \
    unzip -q /tmp/kotlin.zip -d /opt && \
    mv /opt/kotlinc "${KOTLIN_HOME}" && \
    rm /tmp/kotlin.zip && \
    apk del curl unzip

ENV PATH="${KOTLIN_HOME}/bin:${PATH}"

# Verify both toolchains work
RUN java -version && kotlinc -version

