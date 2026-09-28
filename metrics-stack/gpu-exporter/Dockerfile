FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends intel-gpu-tools && \
    rm -rf /var/lib/apt/lists/*

COPY exporter.py /exporter.py

EXPOSE 9200
CMD ["python3", "/exporter.py"]
