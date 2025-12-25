import os
import time
from typing import Any, Dict, List

import requests
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, TimeoutError

from automation.clients.api_client import ApiClient
from automation.models import DeviceConnectionInfo, BackupResult
from automation.vendors.fortigate import run_fortigate_backup
from automation.vendors.cisco_ios import run_cisco_ios_backup
from automation.vendors.hp_comware import run_hp_comware_backup


API_BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:3001")
API_TOKEN = os.environ["AUTOMATION_SERVICE_TOKEN"]
BACKUP_ROOT_DIR = os.environ.get("BACKUP_ROOT_DIR", "/data/backups")


def fetch_pending_jobs() -> List[Dict[str, Any]]:
  try:
    resp = requests.get(
      f"{API_BASE_URL}/internal/jobs/pending",
      headers={"Authorization": f"Bearer {API_TOKEN}"},
      timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("items", [])
  except Exception:
    return []


def mark_status(execution_id: str, status: str) -> None:
  resp = requests.patch(
    f"{API_BASE_URL}/internal/jobs/{execution_id}/status",
    headers={"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"},
    json={"status": status},
    timeout=10,
  )
  resp.raise_for_status()


def run_once() -> None:
  client = ApiClient(API_BASE_URL, API_TOKEN)
  jobs = fetch_pending_jobs()
  seen_devices: dict[str, bool] = {}
  deduped: List[Dict[str, Any]] = []
  for j in jobs:
    did = str(j.get("deviceId") or "")
    if not did:
      continue
    if seen_devices.get(did):
      continue
    seen_devices[did] = True
    deduped.append(j)
  jobs = deduped
  for j in jobs:
    try:
      mark_status(j["executionId"], "running")
      try:
        ApiClient(API_BASE_URL, API_TOKEN).report_step(j["deviceId"], j["executionId"], "automation_dispatch", "success", None, {"vendor": j.get("vendor")})
      except Exception:
        pass
      device = DeviceConnectionInfo(
        device_id=j["deviceId"],
        tenant_id=j["TenantId"] if "TenantId" in j else j["tenantId"],
        hostname=(j.get("hostname") or ""),
        ip_address=((j.get("mgmtIp") or "").split("/")[0].strip()),
        port=int(j.get("sshPort") or 22),
        username=j.get("username") or "",
        password=j.get("password") or "",
        secret=j.get("secret") or None,
        timeout=int(os.environ.get("DEVICE_TIMEOUT_SECONDS", "30")),
      )
      vendor = j.get("vendor")
      timeout_seconds = device.timeout + 5
      with ThreadPoolExecutor(max_workers=1) as ex:
        if vendor == "fortigate":
          fut = ex.submit(
            run_fortigate_backup,
            device,
            client,
            BACKUP_ROOT_DIR,
            None,
            j["executionId"],
          )
        elif vendor == "cisco_ios":
          fut = ex.submit(
            run_cisco_ios_backup,
            device,
            client,
            BACKUP_ROOT_DIR,
            None,
            j["executionId"],
          )
        elif vendor == "hp_comware":
          fut = ex.submit(
            run_hp_comware_backup,
            device,
            client,
            BACKUP_ROOT_DIR,
            None,
            j["executionId"],
          )
        else:
          mark_status(j["executionId"], "skipped")
          continue
        try:
          fut.result(timeout=timeout_seconds)
        except TimeoutError:
          ts = datetime.now(timezone.utc)
          try:
            client.report_step(device_id=device.device_id, execution_id=j["executionId"], step_key="error", status="failed", detail="Backup timed out", meta={})
          except Exception:
            pass
          try:
            client.report_backup_result(
              BackupResult(
                device_id=device.device_id,
                tenant_id=device.tenant_id,
                vendor=str(vendor or ""),
                backup_timestamp=ts,
                config_path=None,
                config_sha256="",
                config_size_bytes=0,
                success=False,
                error_message="Backup timed out",
                job_id=None,
                execution_id=j["executionId"],
              )
            )
          except Exception:
            pass
    except Exception as e:
      ts = datetime.now(timezone.utc)
      try:
        client.report_step(device_id=j.get("deviceId", ""), execution_id=j.get("executionId", ""), step_key="error", status="failed", detail=str(e), meta={})
      except Exception:
        pass
      try:
        client.report_backup_result(
          BackupResult(
            device_id=j.get("deviceId", ""),
            tenant_id=j.get("tenantId", ""),
            vendor=str(j.get("vendor") or ""),
            backup_timestamp=ts,
            config_path=None,
            config_sha256="",
            config_size_bytes=0,
            success=False,
            error_message=str(e),
            job_id=None,
            execution_id=j.get("executionId", ""),
          )
        )
      except Exception:
        pass


def main_loop() -> None:
  interval = int(os.environ.get("SCHEDULER_INTERVAL_SECONDS", "30"))
  while True:
    try:
      run_once()
    except Exception:
      time.sleep(5)
    time.sleep(interval)


if __name__ == "__main__":
  mode = os.environ.get("SCHEDULER_MODE", "once")
  if mode == "loop":
    main_loop()
  else:
    run_once()
