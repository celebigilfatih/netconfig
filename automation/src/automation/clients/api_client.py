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

  def report_step(self, device_id: str, execution_id: str | None, step_key: str, status: str, detail: str | None = None, meta: dict | None = None) -> None:
    url = f"{self.base_url}/internal/backups/step"
    payload = {
      "deviceId": device_id,
      "executionId": execution_id,
      "stepKey": step_key,
      "status": status,
      "detail": detail,
      "meta": meta or {},
    }
    response = requests.post(url, json=payload, headers=self._headers(), timeout=self.timeout_seconds)
    response.raise_for_status()

  # Monitoring endpoints
  def list_active_devices(self, limit: int = 50, offset: int = 0) -> list[dict]:
    url = f"{self.base_url}/internal/monitoring/devices?limit={limit}&offset={offset}"
    response = requests.get(url, headers=self._headers(), timeout=self.timeout_seconds)
    response.raise_for_status()
    data = response.json()
    return data.get("items", [])

  def get_snmp_config(self, device_id: str) -> dict:
    url = f"{self.base_url}/internal/monitoring/devices/{device_id}/snmp_config"
    response = requests.get(url, headers=self._headers(), timeout=self.timeout_seconds)
    response.raise_for_status()
    return response.json()

  def report_metrics(self, tenant_id: str, device_id: str, uptime_ticks: int | None, cpu_percent: int | None, mem_used_percent: int | None) -> None:
    url = f"{self.base_url}/internal/monitoring/metrics"
    payload = {
      "tenantId": tenant_id,
      "deviceId": device_id,
      "uptimeTicks": uptime_ticks,
      "cpuPercent": cpu_percent,
      "memUsedPercent": mem_used_percent,
    }
    response = requests.post(url, json=payload, headers=self._headers(), timeout=self.timeout_seconds)
    response.raise_for_status()

  def report_inventory(self, tenant_id: str, device_id: str, model: str | None, firmware: str | None, serial: str | None) -> None:
    url = f"{self.base_url}/internal/monitoring/inventory"
    payload = {
      "tenantId": tenant_id,
      "deviceId": device_id,
      "model": model,
      "firmware": firmware,
      "serial": serial,
    }
    response = requests.post(url, json=payload, headers=self._headers(), timeout=self.timeout_seconds)
    response.raise_for_status()
