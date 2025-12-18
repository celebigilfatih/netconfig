from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional


@dataclass
class DeviceConnectionInfo:
  device_id: str
  tenant_id: str
  hostname: str
  ip_address: str
  port: int
  username: str
  password: str
  secret: Optional[str] = None
  timeout: int = 30


@dataclass
class BackupResult:
  device_id: str
  tenant_id: str
  vendor: str
  backup_timestamp: datetime
  config_path: Path | None
  config_sha256: str
  config_size_bytes: int
  success: bool
  error_message: Optional[str] = None
  job_id: Optional[str] = None
  execution_id: Optional[str] = None
