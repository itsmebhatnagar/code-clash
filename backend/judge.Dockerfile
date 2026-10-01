# syntax=docker/dockerfile:1
# ────────────────────────────────────────────────────────────────────────────
# Code Clash – Judge Sandbox Image
#
# Toolchain (pinned, reproducible):
#   C / C++   : GCC / G++ 16.2.0  (from docker.io/library/gcc:16.2)
#   Java      : Eclipse Temurin OpenJDK 25 LTS  (eclipse-temurin:25-jdk)
#   Python    : CPython 3.14.8  (built from source: python.org/ftp/python/3.14.8)
#   Node.js   : 24.21.0 LTS  (from docker.io/library/node:24.21.0)
#
# Build:
#   docker build -f judge.Dockerfile -t code-clash-judge:latest .
#
# Verify installed versions after build:
#   docker run --rm code-clash-judge:latest sh -c \
#     "gcc --version && g++ --version && java --version && python3.14 --version && node --version"
# ────────────────────────────────────────────────────────────────────────────

# ── Stage 1: OpenJDK 25 LTS (Eclipse Temurin) ───────────────────────────────
FROM eclipse-temurin:25-jdk AS openjdk-25

# ── Stage 2: Node.js 24.21.0 LTS ────────────────────────────────────────────
FROM node:24.21.0 AS node-24

# ── Stage 3: Python 3.14.8 – built from official source tarball ─────────────
FROM gcc:16.2 AS python-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates xz-utils \
        libssl-dev zlib1g-dev libbz2-dev libffi-dev \
        libsqlite3-dev libreadline-dev libncurses5-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp/pybuild

RUN curl -fsSL https://www.python.org/ftp/python/3.14.8/Python-3.14.8.tar.xz \
        | tar -xJ --strip-components=1

# ac_cv_pthread_is_default=yes prevents the pthreads configure test from
# hanging when building inside Docker Desktop on Windows (WSL2/Hyper-V).
RUN ac_cv_pthread_is_default=yes \
    ./configure \
        --prefix=/opt/python-3.14 \
        --enable-shared \
        --without-ensurepip \
    && make -j"$(nproc)" \
    && make install

# ── Stage 4: Final judge sandbox image ──────────────────────────────────────
FROM gcc:16.2

LABEL org.opencontainers.image.title="Code Clash Judge"
LABEL org.opencontainers.image.description="Sandboxed multi-language judge for Code Clash"
LABEL judge.gcc.version="16.2.0"
LABEL judge.gpp.version="16.2.0"
LABEL judge.java.version="25-LTS (Eclipse Temurin)"
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

# Copy shared libraries needed at runtime
COPY --from=python-builder /usr/lib/x86_64-linux-gnu/libssl.so* \
                           /usr/lib/x86_64-linux-gnu/libcrypto.so* \
                           /usr/lib/x86_64-linux-gnu/libz.so* \
                           /usr/lib/x86_64-linux-gnu/libbz2.so* \
                           /usr/lib/x86_64-linux-gnu/libffi.so* \
                           /usr/lib/x86_64-linux-gnu/libsqlite3.so* \
                           /usr/lib/x86_64-linux-gnu/

COPY --from=python-builder /opt/python-3.14/lib/libpython3.14.so* \
                           /usr/lib/x86_64-linux-gnu/

RUN ldconfig \
    && ln -sf /opt/python-3.14/bin/python3.14 /usr/local/bin/python3.14 \
    && ln -sf /opt/python-3.14/bin/python3.14 /usr/local/bin/python3 \
    && ln -sf /opt/python-3.14/bin/python3.14 /usr/local/bin/python

# ── Unprivileged judge user ───────────────────────────────────────────────────
RUN useradd --create-home --uid 10001 --shell /bin/sh --no-log-init judge \
    && mkdir -p /workspace \
    && chown judge:judge /workspace

# ── Verify all versions at build time ────────────────────────────────────────
RUN echo "=== Judge Toolchain Version Report ===" \
    && gcc    --version | head -1 \
    && g++    --version | head -1 \
    && java   --version \
    && python3.14 --version \
    && node   --version \
    && echo "=== All versions verified ==="

WORKDIR /workspace
USER judge
