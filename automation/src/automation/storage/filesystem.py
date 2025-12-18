from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

from automation.models import BackupResult


def build_backup_path(base_dir: Path, tenant_id: str, device_id: str, ts: datetime) -> Path:
  date_part = ts.strftime("%Y/%m/%d")
  filename = f"{ts.strftime('%Y%m%dT%H%M%SZ')}.cfg"
  return base_dir / tenant_id / device_id / date_part / filename


def save_config_to_file(base_dir: Path, result: BackupResult, config_text: str) -> BackupResult:
  ts = result.backup_timestamp.astimezone(timezone.utc)
  path = build_backup_path(base_dir, result.tenant_id, result.device_id, ts)
  path.parent.mkdir(parents=True, exist_ok=True)
  encoded = config_text.encode("utf-8")
  path.write_bytes(encoded)
  digest = sha256(encoded).hexdigest()
  return BackupResult(
    device_id=result.device_id,
    tenant_id=result.tenant_id,
    vendor=result.vendor,
    backup_timestamp=result.backup_timestamp,
    config_path=path,
    config_sha256=digest,
    config_size_bytes=len(encoded),
    success=result.success,
    error_message=result.error_message,
    job_id=result.job_id,
    execution_id=result.execution_id,
  )
