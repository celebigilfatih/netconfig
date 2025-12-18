import os

from automation.clients.api_client import ApiClient
from automation.models import DeviceConnectionInfo
from automation.vendors.fortigate import run_fortigate_backup


def main() -> None:
  api_base_url = os.environ["API_BASE_URL"]
  api_token = os.environ["AUTOMATION_SERVICE_TOKEN"]
  backup_root_dir = os.environ.get("BACKUP_ROOT_DIR", "/data/backups")

  device = DeviceConnectionInfo(
    device_id=os.environ["DEVICE_ID"],
    tenant_id=os.environ["TENANT_ID"],
    hostname=os.environ.get("DEVICE_HOSTNAME", ""),
    ip_address=os.environ["DEVICE_IP"],
    port=int(os.environ.get("DEVICE_SSH_PORT", "22")),
    username=os.environ["DEVICE_USERNAME"],
    password=os.environ["DEVICE_PASSWORD"],
    timeout=int(os.environ.get("DEVICE_TIMEOUT_SECONDS", "30")),
  )

  client = ApiClient(api_base_url, api_token)
  run_fortigate_backup(device=device, api_client=client, backup_root_dir=backup_root_dir)


if __name__ == "__main__":
  main()

