-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SHARED EXPENSES (gastos compartidos estilo Tricount)
-- Grupos con link público (share_token). Los invitados NO necesitan
-- cuenta: acceden con el link y se identifican con nombre + email/teléfono.
-- Todo el acceso de invitados pasa por la API (service role) validando el
-- token; el acceso directo con sesión queda limitado al dueño vía RLS.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE shared_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  currency TEXT NOT NULL DEFAULT 'ARS',
  share_token TEXT NOT NULL UNIQUE CHECK (share_token ~ '^[a-f0-9]{32}$'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shared_groups_owner ON shared_groups(owner_user_id, is_active);

CREATE TABLE shared_group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
  -- Si el invitado tiene cuenta Zarix se puede vincular; opcional.
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  email TEXT CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone TEXT CHECK (phone IS NULL OR phone ~ '^[0-9+\-() ]{6,25}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shared_group_members_group ON shared_group_members(group_id);

CREATE TABLE shared_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
  paid_by_member_id UUID NOT NULL REFERENCES shared_group_members(id) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
  amount NUMERIC(20, 2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shared_expenses_group ON shared_expenses(group_id, expense_date DESC, created_at DESC);

CREATE TABLE shared_expense_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES shared_expenses(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES shared_group_members(id) ON DELETE CASCADE,
  amount NUMERIC(20, 2) NOT NULL CHECK (amount >= 0),
  UNIQUE (expense_id, member_id)
);

CREATE INDEX idx_shared_expense_splits_expense ON shared_expense_splits(expense_id);
CREATE INDEX idx_shared_expense_splits_member ON shared_expense_splits(member_id);

-- RLS: dueño con sesión puede operar directo; invitados SOLO vía API
-- (service role) que valida share_token. Sin política para anon.
ALTER TABLE shared_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_expense_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY shared_groups_owner_all ON shared_groups
  FOR ALL TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY shared_group_members_owner_all ON shared_group_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shared_groups g
      WHERE g.id = shared_group_members.group_id
        AND g.owner_user_id = auth.uid()
    )
  );

CREATE POLICY shared_expenses_owner_all ON shared_expenses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shared_groups g
      WHERE g.id = shared_expenses.group_id
        AND g.owner_user_id = auth.uid()
    )
  );

CREATE POLICY shared_expense_splits_owner_all ON shared_expense_splits
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shared_expenses e
      JOIN shared_groups g ON g.id = e.group_id
      WHERE e.id = shared_expense_splits.expense_id
        AND g.owner_user_id = auth.uid()
    )
  );
