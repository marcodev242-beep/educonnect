-- Readable IDs for new transactions and documents; existing IDs remain valid.
ALTER TABLE transactions ALTER COLUMN id_transaction DROP DEFAULT;
ALTER TABLE transactions ALTER COLUMN id_transaction TYPE TEXT USING id_transaction::text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS message_statut TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference_groupe TEXT;
CREATE INDEX IF NOT EXISTS transactions_reference_groupe_idx ON transactions(reference_groupe);

CREATE SEQUENCE IF NOT EXISTS transactions_id_seq;
CREATE SEQUENCE IF NOT EXISTS enseignants_id_seq;

ALTER TABLE transactions
  ALTER COLUMN id_transaction SET DEFAULT ('TRX' || lpad(nextval('transactions_id_seq')::text, 9, '0'));
ALTER TABLE transactions ALTER COLUMN statut_paiement SET DEFAULT '1';

ALTER TABLE documents
  ALTER COLUMN id_document SET DEFAULT ('DOC' || lpad(nextval('documents_id_seq')::text, 9, '0'));
