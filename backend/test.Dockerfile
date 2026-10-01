# syntax=docker/dockerfile:1
FROM eclipse-temurin:25-jdk AS openjdk-25

FROM node:24.21.0 AS node-24

# ── Python 3.14.8 source build ──────────────────────────────────────────────
FROM gcc:16.2 AS python-builder
WORKDIR /tmp/pybuild

# Install build-time deps for Python
RUN apt-get update && apt-get install -y --no-install-recommends \
        libssl-dev zlib1g-dev libbz2-dev libffi-dev libsqlite3-dev \
        libreadline-dev libncurses5-dev xz-utils curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -sSL https://www.python.org/ftp/python/3.14.8/Python-3.14.8.tar.xz \
        | tar -xJ --strip-components=1

# ac_cv_pthread_is_default=yes prevents the configure test from hanging in
# Docker Desktop on Windows (Hyper-V / WSL2) due to a fork() limitation.
RUN ac_cv_pthread_is_default=yes \
    ./configure \
        --prefix=/opt/python-3.14 \
        --without-ensurepip \
        --enable-shared \
    && make -j$(nproc) \
    && make install

# ── Final judge image ────────────────────────────────────────────────────────
FROM gcc:16.2

LABEL maintainer="Code Clash Judge"
LABEL judge.gcc.version="16.2.0"
LABEL judge.gpp.version="16.2.0"
LABEL judge.java.version="25.0.4.1-LTS"
LABEL judge.python.version="3.14.8"
LABEL judge.node.version="24.21.0"

ENV DEBIAN_FRONTEND=noninteractive

# ── Java 25 ──────────────────────────────────────────────────────────────────
ENV JAVA_HOME=/opt/java/openjdk
COPY --from=openjdk-25 ${JAVA_HOME} ${JAVA_HOME}
ENV PATH="${JAVA_HOME}/bin:${PATH}"

# ── Node.js 24.21.0 ──────────────────────────────────────────────────────────
COPY --from=node-24 /usr/local/bin/node /usr/local/bin/node

# ── Python 3.14.8 ────────────────────────────────────────────────────────────
COPY --from=python-builder /opt/python-3.14 /opt/python-3.14
# Shared libs needed by Python
COPY --from=python-builder /usr/lib/x86_64-linux-gnu/libssl* /usr/lib/x86_64-linux-gnu/
COPY --from=python-builder /usr/lib/x86_64-linux-gnu/libcrypto* /usr/lib/x86_64-linux-gnu/
COPY --from=python-builder /usr/lib/x86_64-linux-gnu/libz.so* /usr/lib/x86_64-linux-gnu/
COPY --from=python-builder /usr/lib/x86_64-linux-gnu/libbz2* /usr/lib/x86_64-linux-gnu/
COPY --from=python-builder /usr/lib/x86_64-linux-gnu/libffi* /usr/lib/x86_64-linux-gnu/
COPY --from=python-builder /usr/lib/x86_64-linux-gnu/libsqlite3* /usr/lib/x86_64-linux-gnu/
COPY --from=python-builder /opt/python-3.14/lib/libpython3.14.so* /usr/lib/x86_64-linux-gnu/

RUN ldconfig \
    && ln -sf /opt/python-3.14/bin/python3.14 /usr/local/bin/python3.14 \
    && ln -sf /opt/python-3.14/bin/python3.14 /usr/local/bin/python3 \
    && ln -sf /opt/python-3.14/bin/python3.14 /usr/local/bin/python

# ── Judge user and workspace ─────────────────────────────────────────────────
RUN useradd --create-home --uid 10001 judge \
    && mkdir -p /workspace \
    && chown judge:judge /workspace

# ── Version verification ──────────────────────────────────────────────────────
RUN echo "=== Version Report ===" \
    && gcc --version | head -1 \
    && g++ --version | head -1 \
    && java --version \
    && python3.14 --version \
    && node --version

WORKDIR /workspace
USER judge
