-- ==========================================================
-- Wappa eSIM - Cloudflare D1 Database Relational Schema
-- ==========================================================

-- 1. Clientes / Usuarios
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  country TEXT,
  country_code TEXT,
  notes TEXT,
  total_spent_usd REAL DEFAULT 0.0,
  total_data_used_gb REAL DEFAULT 0.0,
  fcm_tokens_json TEXT,
  push_notifications_enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- 2. Catálogo de Destinos (Países y Multi-país)
CREATE TABLE IF NOT EXISTS destinations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  region TEXT NOT NULL,
  flag TEXT NOT NULL,
  popular_cities TEXT,
  is_popular INTEGER DEFAULT 0,
  starting_price_eur REAL DEFAULT 4.90,
  plan_count INTEGER DEFAULT 1,
  region_label TEXT,
  is_multi_country INTEGER DEFAULT 0,
  covered_countries_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_destinations_code ON destinations(code);
CREATE INDEX IF NOT EXISTS idx_destinations_region ON destinations(region);

-- 3. Catálogo de Paquetes y Planes eSIM
CREATE TABLE IF NOT EXISTS esim_plans (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  country_code TEXT NOT NULL,
  region TEXT NOT NULL,
  region_label TEXT,
  data_gb REAL NOT NULL,
  is_unlimited INTEGER DEFAULT 0,
  duration_days INTEGER NOT NULL,
  price_usd REAL,
  price_eur REAL NOT NULL,
  speed TEXT DEFAULT '5G',
  operators_json TEXT,
  operator TEXT,
  hotspot INTEGER DEFAULT 1,
  kyc_required INTEGER DEFAULT 0,
  popular INTEGER DEFAULT 0,
  best_value INTEGER DEFAULT 0,
  apn TEXT DEFAULT 'globaldata',
  features_json TEXT,
  coverage_details TEXT,
  support_top_up_type INTEGER,
  is_reloadable INTEGER,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_esim_plans_country_code ON esim_plans(country_code);
CREATE INDEX IF NOT EXISTS idx_esim_plans_region ON esim_plans(region);
CREATE INDEX IF NOT EXISTS idx_esim_plans_plan_id ON esim_plans(plan_id);

-- 4. eSIMs Asignadas a Usuarios (Monitoreo e Inventario)
CREATE TABLE IF NOT EXISTS user_esims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT,
  iccid TEXT UNIQUE NOT NULL,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  country TEXT NOT NULL,
  country_code TEXT NOT NULL,
  flag TEXT NOT NULL,
  operator TEXT NOT NULL,
  network_5g INTEGER DEFAULT 1,
  qr_code_url TEXT NOT NULL,
  smdp_address TEXT NOT NULL,
  activation_code TEXT NOT NULL,
  manual_code TEXT NOT NULL,
  total_data_gb REAL NOT NULL,
  used_data_gb REAL DEFAULT 0.0,
  is_unlimited INTEGER DEFAULT 0,
  duration_days INTEGER DEFAULT 30,
  pre_install_validity TEXT DEFAULT '180 Días',
  price_paid REAL,
  cost_price_eur REAL,
  sale_price_eur REAL,
  profit_eur REAL,
  purchase_date TEXT NOT NULL,
  activation_date TEXT,
  expiry_date TEXT NOT NULL,
  status TEXT DEFAULT 'ready_to_install',
  provider_status TEXT DEFAULT 'GOT_RESOURCE',
  double_check_passed INTEGER DEFAULT 0,
  double_checked_at TEXT,
  auto_renew INTEGER DEFAULT 0,
  apn TEXT DEFAULT 'globaldata',
  order_no TEXT,
  package_code TEXT,
  provision_source TEXT DEFAULT 'esimaccess_api',
  topup_count INTEGER DEFAULT 0,
  eid TEXT,
  device_type TEXT,
  device_brand TEXT,
  device_model TEXT,
  fcm_token TEXT,
  notified_50 INTEGER DEFAULT 0,
  notified_80 INTEGER DEFAULT 0,
  notified_90 INTEGER DEFAULT 0,
  last_notification_sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_esims_user_id ON user_esims(user_id);
CREATE INDEX IF NOT EXISTS idx_user_esims_iccid ON user_esims(iccid);
CREATE INDEX IF NOT EXISTS idx_user_esims_status ON user_esims(status);
CREATE INDEX IF NOT EXISTS idx_user_esims_user_email ON user_esims(user_email);

-- 5. Pedidos y Transacciones
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  country TEXT NOT NULL,
  country_code TEXT NOT NULL,
  flag TEXT DEFAULT '🌐',
  operator TEXT DEFAULT 'Red Global',
  network_5g INTEGER DEFAULT 1,
  total_data_gb REAL NOT NULL,
  is_unlimited INTEGER DEFAULT 0,
  duration_days INTEGER DEFAULT 30,
  price_paid REAL NOT NULL,
  cost_price_eur REAL DEFAULT 0.0,
  payment_method TEXT DEFAULT 'credit_card',
  payment_details_json TEXT,
  status TEXT DEFAULT 'pending_approval',
  is_test_mode INTEGER DEFAULT 1,
  approved_at TEXT,
  approved_by TEXT,
  rejection_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- 6. Auditoría y Verificación de Compras
CREATE TABLE IF NOT EXISTS purchase_audit_logs (
  id TEXT PRIMARY KEY,
  order_number TEXT,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  customer_name TEXT,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  country TEXT NOT NULL,
  price_paid REAL NOT NULL,
  payment_method TEXT DEFAULT 'card',
  iccid TEXT,
  order_no TEXT,
  package_code TEXT,
  provision_source TEXT DEFAULT 'esimaccess_api',
  stage TEXT DEFAULT 'initiated',
  provider_status TEXT,
  double_check_passed INTEGER DEFAULT 0,
  double_check_details_json TEXT,
  steps_json TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_order_number ON purchase_audit_logs(order_number);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON purchase_audit_logs(user_id);

-- 7. Dispositivos Compatibles
CREATE TABLE IF NOT EXISTS compatible_devices (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  models_json TEXT NOT NULL,
  instructions TEXT DEFAULT '',
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
