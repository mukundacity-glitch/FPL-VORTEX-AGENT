FROM python:3.13-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --requirement requirements.txt

EXPOSE 3001

CMD ["markitdown-mcp", "--http", "--host", "0.0.0.0", "--port", "3001"]
