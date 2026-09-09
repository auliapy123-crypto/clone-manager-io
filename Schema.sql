-- =====================================================================
-- Clone Manager.io — Skema Database (Fase 1.1)
-- Database: PostgreSQL (Neon)
-- Mengikuti 5 poin di §1.1 dokumen Roadmap:
--   1. Jurnal umum double-entry (journal_entries + journal_lines)
--   2. Tabel inti (businesses, users, user_business_roles,
--      chart_of_accounts, contacts)
--   3. Mata uang per akun + kurs per baris jurnal
--   4. Opening Balance eksplisit di chart_of_accounts
--   5. Audit trail (audit_logs)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ekstensi pendukung (UUID sebagai primary key, lebih aman utk multi-tenant)
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- Fungsi bantu: auto-update kolom updated_at
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1. BUSINESSES — daftar bisnis yang bisa dikelola di sistem
-- =====================================================================
CREATE TABLE businesses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    base_currency_code VARCHAR(3) NOT NULL DEFAULT 'IDR',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_businesses_updated_at
    BEFORE UPDATE ON businesses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 2. USERS — akun pengguna, sifatnya global (bisa akses banyak bisnis)
-- =====================================================================
CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           VARCHAR(255) NOT NULL,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 3. USER_BUSINESS_ROLES — hak akses user per bisnis (multi-tenant)
-- =====================================================================
CREATE TYPE user_role AS ENUM ('admin', 'accountant', 'viewer');

CREATE TABLE user_business_roles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    role         user_role NOT NULL DEFAULT 'viewer',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, business_id)
);

CREATE INDEX idx_user_business_roles_business ON user_business_roles(business_id);
CREATE INDEX idx_user_business_roles_user ON user_business_roles(user_id);

-- =====================================================================
-- 4. CHART_OF_ACCOUNTS — daftar akun per bisnis (fondasi, bukan modul biasa)
--    Mata uang per akun (poin 3) + Opening Balance eksplisit (poin 4)
-- =====================================================================
CREATE TYPE account_type AS ENUM ('asset', 'liability', 'equity', 'income', 'expense');

CREATE TABLE chart_of_accounts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    code                  VARCHAR(20) NOT NULL,
    name                  VARCHAR(255) NOT NULL,
    type                  account_type NOT NULL,
    currency_code         VARCHAR(3) NOT NULL DEFAULT 'IDR',
    -- Opening Balance eksplisit (bukan mekanisme tersembunyi seperti Manager.io, lihat §4.3 analisis)
    opening_balance       NUMERIC(18, 2) NOT NULL DEFAULT 0,
    opening_balance_date  DATE,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, code)
);

CREATE INDEX idx_coa_business ON chart_of_accounts(business_id);

CREATE TRIGGER trg_coa_updated_at
    BEFORE UPDATE ON chart_of_accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 5. CONTACTS — gabungan Customers/Suppliers (keputusan §2.3 dokumen analisis)
--    Kolom "type" membedakan customer / supplier / both
-- =====================================================================
CREATE TYPE contact_type AS ENUM ('customer', 'supplier', 'both');

CREATE TABLE contacts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    type              contact_type NOT NULL,
    name              VARCHAR(255) NOT NULL,
    billing_address   TEXT,
    delivery_address  TEXT,
    email             VARCHAR(255),
    phone             VARCHAR(50),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_business ON contacts(business_id);

CREATE TRIGGER trg_contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 6. JOURNAL_ENTRIES — header jurnal umum (poin 1: double-entry ledger)
--    SEMUA transaksi (faktur, kuitansi, pembayaran, jurnal manual, dst)
--    wajib memposting ke sini — bukan subledger terpisah tanpa integrasi.
-- =====================================================================
CREATE TABLE journal_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    entry_date      DATE NOT NULL,
    -- reference_type menandai modul sumber transaksi, mis. 'sales_invoice',
    -- 'purchase_invoice', 'receipt', 'payment', 'manual', dst (diisi saat modul terkait dibangun di Fase 2/3)
    reference_type  VARCHAR(50) NOT NULL DEFAULT 'manual',
    reference_id    UUID,
    description     TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_journal_entries_business ON journal_entries(business_id);
CREATE INDEX idx_journal_entries_reference ON journal_entries(reference_type, reference_id);

CREATE TRIGGER trg_journal_entries_updated_at
    BEFORE UPDATE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 7. JOURNAL_LINES — baris debit/kredit tiap jurnal
--    Kurs per transaksi (poin 3) ada di sini, bukan di header.
-- =====================================================================
CREATE TABLE journal_lines (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id  UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id        UUID NOT NULL REFERENCES chart_of_accounts(id),
    contact_id        UUID REFERENCES contacts(id),
    description       TEXT,
    debit             NUMERIC(18, 2) NOT NULL DEFAULT 0,
    credit            NUMERIC(18, 2) NOT NULL DEFAULT 0,
    currency_code     VARCHAR(3) NOT NULL DEFAULT 'IDR',
    exchange_rate     NUMERIC(18, 6) NOT NULL DEFAULT 1,
    line_order        INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT chk_journal_lines_debit_credit
        CHECK (
            (debit >= 0 AND credit >= 0) AND
            NOT (debit > 0 AND credit > 0)   -- satu baris tidak boleh isi debit & kredit sekaligus
        )
);

CREATE INDEX idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX idx_journal_lines_contact ON journal_lines(contact_id);

-- Catatan penting untuk backend (Fase 1.2):
-- Validasi "total debit = total kredit per journal_entry" TIDAK dipaksakan
-- lewat CHECK constraint di level tabel (Postgres tidak mendukung agregat
-- lintas-baris di CHECK). Validasi ini WAJIB dilakukan di lapisan backend
-- sebelum commit transaksi (idealnya dalam satu DB transaction).

-- =====================================================================
-- 8. AUDIT_LOGS — jejak audit (poin 5): siapa mengubah apa & kapan
-- =====================================================================
CREATE TYPE audit_action AS ENUM ('insert', 'update', 'delete');

CREATE TABLE audit_logs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id  UUID REFERENCES businesses(id) ON DELETE CASCADE,
    user_id      UUID REFERENCES users(id),
    table_name   VARCHAR(100) NOT NULL,
    record_id    UUID NOT NULL,
    action       audit_action NOT NULL,
    old_data     JSONB,
    new_data     JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_business ON audit_logs(business_id);
CREATE INDEX idx_audit_logs_record ON audit_logs(table_name, record_id);

-- =====================================================================
-- SEED DATA MINIMAL — supaya bisa langsung dicoba setelah migrasi
-- (Chart of Accounts standar akan dilengkapi di step 1.4 Roadmap)
-- =====================================================================
INSERT INTO businesses (name, base_currency_code) VALUES
    ('Contoh Bisnis (Dummy)', 'IDR');

-- =====================================================================
-- SELESAI. Lanjut ke langkah verifikasi di panduan (cek jumlah tabel).
-- =====================================================================