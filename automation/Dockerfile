FROM python:3.11-slim
WORKDIR /usr/src/app
RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir netmiko==4.3.0 paramiko==3.5.0 requests==2.32.0 pydantic==2.9.0 pysnmp-lextudio==5.0.26
COPY src ./src
ENV PYTHONPATH=/usr/src/app/src
CMD ["python", "-m", "automation.services.scheduler"]
