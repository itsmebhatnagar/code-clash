FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs python3 g++ openjdk-21-jdk-headless \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 judge

WORKDIR /workspace
USER judge
