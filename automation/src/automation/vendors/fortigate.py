from datetime import datetime, timezone
from pathlib import Path

import os

from automation.exceptions import BackupConnectionError, BackupExecutionError
from automation.models import BackupResult, DeviceConnectionInfo
from automation.storage.filesystem import save_config_to_file
from automation.clients.api_client import ApiClient
from automation.vendors.base import BaseVendorBackup


class FortigateBackup(BaseVendorBackup):
  @property
  def vendor(self) -> str:
    return "fortigate"

  def fetch_running_config(self, device: DeviceConnectionInfo) -> str:
    if os.environ.get("SIMULATE_BACKUP") == "1":
      return "config-version=simulated\nconfig system global\nset hostname FortiGate-Sim\nend\n"
    from netmiko import ConnectHandler, NetmikoTimeoutException, NetmikoAuthenticationException
    host = device.hostname or device.ip_address
    params = {
      "device_type": "fortinet",
      "host": host,
      "port": device.port,
      "username": device.username,
      "password": device.password,
      "timeout": device.timeout,
    }
    try:
      with ConnectHandler(**params) as conn:
        conn.send_command("config global")
        conn.send_command("config system console")
        conn.send_command("set output standard")
        conn.send_command("end")
        config = conn.send_command("show full-configuration", expect_string=r"#", read_timeout=device.timeout)
        if not config.strip():
          raise BackupExecutionError("Empty configuration received from device")
        return config
    except NetmikoTimeoutException as exc:
      raise BackupConnectionError(f"Timeout connecting to {host}") from exc
    except NetmikoAuthenticationException as exc:
      raise BackupConnectionError(f"Authentication failed for {host}") from exc
    except BackupExecutionError:
      raise
    except Exception as exc:
      raise BackupExecutionError(f"Unexpected error fetching config from {host}: {exc}") from exc


def run_fortigate_backup(
  device: DeviceConnectionInfo,
  api_client: ApiClient,
  backup_root_dir: str,
  job_id: str | None = None,
  execution_id: str | None = None,
) -> BackupResult:
  ts = datetime.now(timezone.utc)
  base_result = BackupResult(
    device_id=device.device_id,
    tenant_id=device.tenant_id,
    vendor="fortigate",
    backup_timestamp=ts,
    config_path=None,
    config_sha256="",
    config_size_bytes=0,
    success=False,
    error_message=None,
    job_id=job_id,
    execution_id=execution_id,
  )
  try:
    provider = FortigateBackup()
    config_text = provider.fetch_running_config(device)
    result_with_file = save_config_to_file(
      base_dir=Path(backup_root_dir),
      result=base_result,
      config_text=config_text,
    )
    final_result = BackupResult(
      device_id=result_with_file.device_id,
      tenant_id=result_with_file.tenant_id,
      vendor=result_with_file.vendor,
      backup_timestamp=result_with_file.backup_timestamp,
      config_path=result_with_file.config_path,
      config_sha256=result_with_file.config_sha256,
      config_size_bytes=result_with_file.config_size_bytes,
      success=True,
      error_message=None,
      job_id=result_with_file.job_id,
      execution_id=result_with_file.execution_id,
    )
    api_client.report_backup_result(final_result)
    return final_result
  except (BackupConnectionError, BackupExecutionError) as exc:
    error_result = BackupResult(
      device_id=base_result.device_id,
      tenant_id=base_result.tenant_id,
      vendor=base_result.vendor,
      backup_timestamp=base_result.backup_timestamp,
      config_path=base_result.config_path,
      config_sha256=base_result.config_sha256,
      config_size_bytes=base_result.config_size_bytes,
      success=False,
      error_message=str(exc),
      job_id=base_result.job_id,
      execution_id=base_result.execution_id,
    )
    api_client.report_backup_result(error_result)
    return error_result
