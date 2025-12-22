CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE device_vendor AS ENUM (
  'fortigate',
  'cisco_ios',
  'mikrotik',
  'juniper',
  'arista_eos',
  'cisco_nx_os',
  'cisco_asa',
  'vyos',
  'huawei_vrp',
  'dell_os10',
  'extreme_xos',
  'brocade',
  'f5_bigip',
  'paloalto_pan_os',
  'checkpoint_gaia',
  'ubiquiti_edgeos',
  'zyxel',
  'netgear',
  'watchguard',
  'hp_comware'
);
CREATE TYPE backup_status AS ENUM ('pending', 'running', 'success', 'failed', 'skipped');
CREATE TYPE role_name AS ENUM ('admin', 'operator');

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(255) NOT NULL,
  slug varchar(64) NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email varchar(255) NOT NULL,
  password_hash varchar(255) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE roles (
  name role_name PRIMARY KEY
);

INSERT INTO roles (name) VALUES ('admin') ON CONFLICT DO NOTHING;
INSERT INTO roles (name) VALUES ('operator') ON CONFLICT DO NOTHING;

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_name role_name NOT NULL REFERENCES roles(name),
  PRIMARY KEY (user_id, role_name)
);

CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  hostname varchar(255),
  mgmt_ip inet NOT NULL,
  ssh_port integer NOT NULL DEFAULT 22,
  vendor device_vendor NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE device_credentials (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  username varchar(255) NOT NULL,
  password_encrypted bytea NOT NULL,
  password_iv bytea NOT NULL,
  secret_encrypted bytea,
  secret_iv bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE backup_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  schedule_cron varchar(255),
  is_manual_only boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE device_backups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  job_id uuid REFERENCES backup_jobs(id) ON DELETE SET NULL,
  backup_timestamp timestamptz NOT NULL DEFAULT now(),
  config_path text NOT NULL,
  config_sha256 char(64) NOT NULL,
  config_size_bytes integer NOT NULL,
  created_by uuid REFERENCES users(id),
  is_success boolean NOT NULL,
  error_message text
);

CREATE TABLE backup_executions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id uuid REFERENCES backup_jobs(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status backup_status NOT NULL,
  error_message text,
  backup_id uuid REFERENCES device_backups(id) ON DELETE SET NULL
);

CREATE INDEX idx_devices_tenant_vendor ON devices (tenant_id, vendor);
CREATE INDEX idx_backups_device_timestamp ON device_backups (device_id, backup_timestamp DESC);
CREATE INDEX idx_backup_executions_job_started ON backup_executions (job_id, started_at DESC);
