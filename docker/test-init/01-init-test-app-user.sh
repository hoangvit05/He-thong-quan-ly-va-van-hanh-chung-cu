#!/bin/sh
set -eu

# =========================================================================
# KHỞI TẠO TÀI KHOẢN LEAST PRIVILEGE CHO INTEGRATION TESTS QUA ENV/SECRETS
# Cơ chế bảo mật tuyệt đối:
# 1. FAIL-CLOSED: Dừng ngay lập tức nếu thiếu biến POSTGRES_APP_PASSWORD
# 2. KHÔNG LỘ SECRET: psql đọc secret trực tiếp từ process environment qua \getenv
# 3. NATIVE ESCAPING: psql tự động quote SQL literal (:'var') và identifier (:"var")
# 4. KHÔNG DÙNG EVAL, KHÔNG NỘI SUY SHELL TRÊN CÂU SQL (dùng heredoc <<-'EOSQL')
# =========================================================================

# Kiểm tra bắt buộc biến POSTGRES_APP_PASSWORD, không cho phép dùng mật khẩu mặc định
if [ -z "${POSTGRES_APP_PASSWORD:-}" ]; then
  echo "❌ [INIT FAILED]: Biến môi trường POSTGRES_APP_PASSWORD chưa được thiết lập!" >&2
  echo "   Vui lòng cung cấp POSTGRES_APP_PASSWORD qua môi trường hoặc secret manager." >&2
  exit 1
fi

export POSTGRES_APP_USER="${POSTGRES_APP_USER:-test_app_user}"
export POSTGRES_DB="${POSTGRES_DB:-apartment_test}"
export POSTGRES_USER="${POSTGRES_USER:-test_user}"

APP_USER="$POSTGRES_APP_USER"
TARGET_DB="$POSTGRES_DB"
OWNER_USER="$POSTGRES_USER"

echo "Configuring least privilege role '$APP_USER' on database '$TARGET_DB'..."

# psql thực thi an toàn với ON_ERROR_STOP=1
# Dùng <<-'EOSQL' (single-quoted heredoc) để shell không can thiệp nội suy chuỗi
psql -v ON_ERROR_STOP=1 --username "$OWNER_USER" --dbname "$TARGET_DB" <<-'EOSQL'
\getenv app_user POSTGRES_APP_USER
\getenv app_pass POSTGRES_APP_PASSWORD
\getenv target_db POSTGRES_DB
\getenv owner_user POSTGRES_USER

-- 1. Kiểm tra sự tồn tại của role qua catalog query an toàn
SELECT NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user') AS should_create \gset

-- 2. Tạo mới hoặc cập nhật mật khẩu với thuộc tính Least Privilege
\if :should_create
  CREATE USER :"app_user" WITH PASSWORD :'app_pass' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
\else
  ALTER USER :"app_user" WITH PASSWORD :'app_pass' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
\endif

-- 3. Cấp quyền kết nối chỉ trên database mục tiêu
GRANT CONNECT ON DATABASE :"target_db" TO :"app_user";

-- 4. Cấp quyền sử dụng schema public và DML trên bảng/sequence
GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO :"app_user";

-- 5. Thiết lập Default Privileges cho đối tượng tạo trong tương lai bởi owner
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_user" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_user" IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"app_user";
EOSQL

echo "Least privilege role '$APP_USER' successfully initialized."
