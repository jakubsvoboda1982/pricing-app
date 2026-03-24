FROM python:3.11-slim

WORKDIR /app

# Upgrade pip
RUN pip install --upgrade pip

# Copy and install dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code to /app
COPY backend ./

EXPOSE 8000

# Run the app
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
