-- Migration to add strict range constraints for latitude and longitude
-- This ensures invalid coordinates (like 110.53 or 716.19) are rejected by the database engine.

-- Adding constraint for Latitude: Must be between -90 and 90
ALTER TABLE restaurant_profiles 
ADD CONSTRAINT check_latitude 
CHECK (latitude >= -90 AND latitude <= 90);

-- Adding constraint for Longitude: Must be between -180 and 180
ALTER TABLE restaurant_profiles 
ADD CONSTRAINT check_longitude 
CHECK (longitude >= -180 AND longitude <= 180);
