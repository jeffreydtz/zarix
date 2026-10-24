-- Obligaciones negociables as their own instrument type, distinct from sovereign bonds.
-- Must commit before any statement uses the new enum label.
ALTER TYPE public.investment_type ADD VALUE IF NOT EXISTS 'on';
