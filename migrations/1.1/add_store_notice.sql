ALTER TABLE restaurants 
ADD COLUMN IF NOT EXISTS store_notice_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS store_notice_msg TEXT DEFAULT '';
