alter table restaurantprofiles
  add column if not exists featurescustomersenabled boolean default false,
  add column if not exists featuresloyaltyenabled boolean default false;
