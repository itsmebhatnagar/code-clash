# syntax=docker/dockerfile:1

FROM eclipse-temurin:25-jdk AS openjdk-25

FROM gcc:16.2 AS python-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates xz-utils \
        libssl-dev zlib1g-dev libbz2-dev libffi-dev \
        libsqlite3-dev libreadline-dev libncurses5-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp/pybuild

RUN curl -fsSL https://www.python.org/ftp/python/3.14.8/Python-3.14.8.tar.xz \
        | tar -xJ --strip-components=1

RUN ac_cv_pthread_is_default=yes \
    ./configure \
        --prefix=/opt/python-3.14 \
        --enable-shared \
        --without-ensurepip \
    && make -j"$(nproc)" \
    && make install

FROM gcc:16.2

LABEL org.opencontainers.image.title="Code Clash Judge"
LABEL org.opencontainers.image.description="Sandboxed multi-language judge for Code Clash"
LABEL judge.gcc.version="16.2.0"
LABEL judge.gpp.version="16.2.0"
LABEL judge.java.version="25-LTS (Eclipse Temurin)"
LABEL judge.python.version="3.14.8"

ENV DEBIAN_FRONTEND=noninteractive

ENV JAVA_HOME=/opt/java/openjdk
COPY --from=openjdk-25 ${JAVA_HOME} ${JAVA_HOME}
ENV PATH="${JAVA_HOME}/bin:${PATH}"

COPY --from=python-builder /opt/python-3.14 /opt/python-3.14

COPY --from=python-builder /opt/python-3.14/lib/libpython3.14.so* \
                           /usr/lib/x86_64-linux-gnu/

COPY --from=python-builder \
    /usr/lib/x86_64-linux-gnu/libssl.so.3 \
    /usr/lib/x86_64-linux-gnu/libcrypto.so.3 \
    /usr/lib/x86_64-linux-gnu/

RUN ldconfig \
    && ln -sf /opt/python-3.14/bin/python3.14 /usr/local/bin/python3.14 \
    && ln -sf /opt/python-3.14/bin/python3.14 /usr/local/bin/python3 \
    && ln -sf /opt/python-3.14/bin/python3.14 /usr/local/bin/python

ENV JAVA_TOOL_OPTIONS="-Xms32m -Xmx256m"

RUN useradd --create-home --uid 10001 --shell /bin/sh --no-log-init judge \
    && mkdir -p /workspace \
    && chown judge:judge /workspace

RUN echo "=== Judge Toolchain Version Report ==" \
    && gcc       --version | head -1 \
    && g++       --version | head -1 \
    && java      --version \
    && python3.14 --version \
    && python3.14 -c "import ssl; print('ssl:', ssl.OPENSSL_VERSION)" \
    && echo "=== All versions verified ==="

WORKDIR /workspace
USER judge
