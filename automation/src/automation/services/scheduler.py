import os
import time
from typing import Any, Dict, List

import requests

from automation.clients.api_client import ApiClient
from automation.models import DeviceConnectionInfo
from automation.vendors.fortigate import run_fortigate_backup


API_BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:3001")
API_TOKEN = os.environ["AUTOMATION_SERVICE_TOKEN"]
BACKUP_ROOT_DIR = os.environ.get("BACKUP_ROOT_DIR", "/data/backups")


def fetch_pending_jobs() -> List[Dict[str, Any]]:
  resp = requests.get(
    f"{API_BASE_URL}/internal/jobs/pending",
    headers={"Authorization": f"Bearer {API_TOKEN}"},
    timeout=10,
  )
  resp.raise_for_status()
  return resp.json().get("items", [])


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
  for j in jobs:
    try:
      mark_status(j["executionId"], "running")
      device = DeviceConnectionInfo(
        device_id=j["deviceId"],
        tenant_id=j["tenantId"],
        hostname=j.get("hostname") or "",
        ip_address=j.get("mgmtIp") or "",
        port=int(j.get("sshPort") or 22),
        username=j.get("username") or "",
        password=j.get("password") or "",
        secret=j.get("secret") or None,
        timeout=int(os.environ.get("DEVICE_TIMEOUT_SECONDS", "30")),
      )
      vendor = j.get("vendor")
      if vendor == "fortigate":
        run_fortigate_backup(
          device=device,
          api_client=client,
          backup_root_dir=BACKUP_ROOT_DIR,
          job_id=None,
          execution_id=j["executionId"],
        )
      else:
        mark_status(j["executionId"], "skipped")
    except Exception:
      continue


def main_loop() -> None:
  interval = int(os.environ.get("SCHEDULER_INTERVAL_SECONDS", "30"))
  while True:
    run_once()
    time.sleep(interval)


if __name__ == "__main__":
  mode = os.environ.get("SCHEDULER_MODE", "once")
  if mode == "loop":
    main_loop()
  else:
    run_once()
