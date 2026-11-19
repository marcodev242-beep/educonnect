ALTER TABLE transactions
  ALTER COLUMN id_transaction SET DEFAULT (gen_random_uuid()::text);
