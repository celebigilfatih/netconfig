from datetime import datetime, timezone
from pathlib import Path

import os

from automation.exceptions import BackupConnectionError, BackupExecutionError
from automation.models import BackupResult, DeviceConnectionInfo
from automation.storage.filesystem import save_config_to_file
from automation.clients.api_client import ApiClient
from automation.vendors.base import BaseVendorBackup
from automation.kex_compat import connect_with_kex_fallback


class HPComwareBackup(BaseVendorBackup):
  @property
  def vendor(self) -> str:
    return "hp_comware"

  def fetch_running_config(self, device: DeviceConnectionInfo) -> str:
    if os.environ.get("SIMULATE_BACKUP") == "1":
      return "sysname HP-Comware-Sim\n#\nsysname HP-Comware\n#\nreturn\n"
    from netmiko import NetmikoTimeoutException, NetmikoAuthenticationException
    host = device.hostname or device.ip_address or ""
    try:
      client, transport = connect_with_kex_fallback(
        host=host,
        port=device.port,
        username=device.username,
        password=device.password,
        timeout=float(device.timeout),
        banner_timeout=float(device.timeout),
        auth_timeout=float(device.timeout),
        mode="paramiko",
      )
      import time
      chan = transport.open_session()
      try:
        chan.get_pty()
      except Exception:
        pass
      chan.invoke_shell()
      chan.settimeout(float(device.timeout))
      # Drain initial banner and handle "Press any key" prompts
      try:
        chan.sendall("\n")
        time.sleep(0.3)
        initial = ""
        try:
          initial = chan.recv(65535).decode(errors="ignore")
        except Exception:
          initial = ""
        if "Press any key" in initial or "press any key" in initial:
          try:
            chan.sendall(" ")
          except Exception:
            pass
          time.sleep(0.3)
      except Exception:
        pass
      is_comware = ("Comware" in initial) or ("H3C" in initial)
      if is_comware:
        try:
          chan.sendall("screen-length disable\n")
        except Exception:
          pass
      else:
        try:
          chan.sendall("no page\n")
        except Exception:
          pass
      def collect(cmd: str) -> str:
        try:
          chan.sendall(cmd + "\n")
        except Exception:
          pass
        out = ""
        deadline = time.time() + max(float(device.timeout), 45.0)
        while time.time() < deadline:
          try:
            data = chan.recv(65535)
            if not data:
              time.sleep(0.2)
              continue
            chunk = data.decode(errors="ignore")
          except Exception:
            chunk = ""
          if chunk:
            out += chunk
            if "Press any key" in chunk or "press any key" in chunk:
              try:
                chan.sendall(" ")
              except Exception:
                pass
              time.sleep(0.2)
            if "\nreturn" in out or out.strip().endswith("return"):
              break
            if "More" in chunk or "more" in chunk:
              try:
                chan.sendall(" ")
              except Exception:
                pass
          time.sleep(0.2)
        return out
      if is_comware:
        buf = collect("display current-configuration")
      else:
        buf = collect("show run")
        if not buf.strip() or "Invalid input" in buf or "Unknown command" in buf:
          time.sleep(0.3)
          buf = collect("show running-config")
      # Cleanup
      try:
        chan.close()
      except Exception:
        pass
      try:
        client.close()
      except Exception:
        pass
      config = buf
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


def run_hp_comware_backup(
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
    vendor="hp_comware",
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
    provider = HPComwareBackup()
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
