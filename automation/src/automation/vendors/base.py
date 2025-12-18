from abc import ABC, abstractmethod

from automation.models import DeviceConnectionInfo


class BaseVendorBackup(ABC):
  @property
  @abstractmethod
  def vendor(self) -> str:
    raise NotImplementedError

  @abstractmethod
  def fetch_running_config(self, device: DeviceConnectionInfo) -> str:
    raise NotImplementedError

