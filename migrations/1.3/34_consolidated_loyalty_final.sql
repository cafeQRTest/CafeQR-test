-- ==========================================
-- CONSOLIDATED LOYALTY SCHEMA SETUP (FINAL)
-- ==========================================

-- 1. Create Loyalty Programs Table
CREATE TABLE IF NOT EXISTS loyalty_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  earning_criteria TEXT NOT NULL CHECK (earning_criteria IN ('amount_spent', 'visits', 'items_ordered')),
  amount_spent_conversion_rate NUMERIC(10,2) DEFAULT 0, -- Spend X to get 1 point? Or Spend 1 to get X? (Usually Spend X for 1 pt)
  min_order_amount NUMERIC(10,2) DEFAULT 0,
  redemption_conversion_rate NUMERIC(10,2) DEFAULT 1.0, -- 1 Point = X Currency
  redemption_min_points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Restaurant Customers Table (Enhanced)
-- Ensure base table exists first (if separate from this script)
-- Here we just add columns safely
CREATE TABLE IF NOT EXISTS restaurant_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  customer_id UUID REFERENCES customers(id), -- Link to global user (optional)
  name TEXT,
  phone TEXT,
  email TEXT,
  total_spend NUMERIC(12,2) DEFAULT 0,
  visit_count INTEGER DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Loyalty fields
  loyalty_points BIGINT DEFAULT 0,
  loyalty_program_id UUID REFERENCES loyalty_programs(id),
  total_points_earned BIGINT DEFAULT 0,
  total_points_redeemed BIGINT DEFAULT 0
);

-- If table exists, ensure columns exist
DO $$ 
BEGIN 
    BEGIN
        ALTER TABLE restaurant_customers ADD COLUMN loyalty_points BIGINT DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END;
    
    BEGIN
        ALTER TABLE restaurant_customers ADD COLUMN loyalty_program_id UUID REFERENCES loyalty_programs(id);
    EXCEPTION WHEN duplicate_column THEN NULL; END;
    
    BEGIN
        ALTER TABLE restaurant_customers ADD COLUMN total_points_earned BIGINT DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END;
    
    BEGIN
        ALTER TABLE restaurant_customers ADD COLUMN total_points_redeemed BIGINT DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;


-- 3. Loyalty Transactions Table
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  customer_id UUID NOT NULL, -- Logical link to restaurant_customer (using UUID matching customer_id col)
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL, -- Order Context
  type TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust', 'expire')),
  points BIGINT NOT NULL, -- Net change (+/-)
  points_earned BIGINT DEFAULT 0, -- Explicit earned portion
  points_redeemed BIGINT DEFAULT 0, -- Explicit redeemed portion
  amount_value NUMERIC(10,2) DEFAULT 0, -- Currency value of this transaction
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure explicit columns exist if table already existed
DO $$ 
BEGIN 
    BEGIN
        ALTER TABLE loyalty_transactions ADD COLUMN points_earned BIGINT DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END;

    BEGIN
        ALTER TABLE loyalty_transactions ADD COLUMN points_redeemed BIGINT DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END;

    BEGIN
        ALTER TABLE loyalty_transactions ADD COLUMN amount_value NUMERIC(10,2) DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;


-- 4. CLEANUP: Remove Loyalty Logic from Orders/Invoices (As requested)
-- We strictly use the side-car 'loyalty_transactions' table now. All 'mixed' payment logic in UI handles the math.
DO $$ 
BEGIN 
    BEGIN
        ALTER TABLE orders DROP COLUMN loyalty_amount_used;
    EXCEPTION WHEN undefined_column THEN NULL; END;

    BEGIN
        ALTER TABLE orders DROP COLUMN loyalty_points_used;
    EXCEPTION WHEN undefined_column THEN NULL; END;
    
    BEGIN
        ALTER TABLE orders DROP COLUMN loyalty_points_earned;
    EXCEPTION WHEN undefined_column THEN NULL; END;

    BEGIN
        ALTER TABLE invoices DROP COLUMN loyalty_amount_used;
    EXCEPTION WHEN undefined_column THEN NULL; END;

    BEGIN
        ALTER TABLE invoices DROP COLUMN loyalty_points_used;
    EXCEPTION WHEN undefined_column THEN NULL; END;
END $$;

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_cust ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_rest ON loyalty_transactions(restaurant_id);
