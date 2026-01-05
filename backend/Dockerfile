FROM python:3.10-slim

WORKDIR /app

# Create non-root user (SECURITY)
RUN useradd -m appuser
USER appuser

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5001
CMD ["python", "app.py"]
