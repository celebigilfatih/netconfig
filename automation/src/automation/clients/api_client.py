from pathlib import Path

import requests

from automation.models import BackupResult


class ApiClient:
  def __init__(self, base_url: str, token: str, timeout_seconds: int = 10):
    self.base_url = base_url.rstrip("/")
    self.token = token
    self.timeout_seconds = timeout_seconds

  def _headers(self) -> dict:
    return {
      "Authorization": f"Bearer {self.token}",
      "Content-Type": "application/json",
    }

  def report_backup_result(self, result: BackupResult) -> None:
    url = f"{self.base_url}/internal/backups/report"
    ts = result.backup_timestamp.replace(microsecond=0)
    ts_str = ts.isoformat()
    if ts_str.endswith("+00:00"):
      ts_str = ts_str[:-6] + "Z"
    payload = {
      "deviceId": result.device_id,
      "tenantId": result.tenant_id,
      "vendor": result.vendor,
      "backupTimestamp": ts_str,
      "configPath": str(result.config_path) if result.config_path else None,
      "configSha256": result.config_sha256,
      "configSizeBytes": result.config_size_bytes,
      "success": result.success,
      "errorMessage": result.error_message,
      "jobId": result.job_id,
      "executionId": result.execution_id,
    }
    response = requests.post(url, json=payload, headers=self._headers(), timeout=self.timeout_seconds)
    response.raise_for_status()
