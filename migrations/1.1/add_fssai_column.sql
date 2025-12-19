-- Add FSSAI license number column to restaurant_profiles table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'restaurant_profiles' 
        AND column_name = 'fssai_license'
    ) THEN
        ALTER TABLE restaurant_profiles ADD COLUMN fssai_license TEXT;
    END IF;
END $$;
