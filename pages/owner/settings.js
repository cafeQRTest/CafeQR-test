//pages/owner/settings.js

import React, { useEffect, useState } from 'react';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import { useSubscription } from '../../context/SubscriptionContext'; // ADD THIS LINE
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { getSupabase } from '../../services/supabase'; // 1. IMPORT
import PrinterSetupCard from '../../components/PrinterSetupCard';



function Section({ title, icon, children }) {
  return (
    <Card padding24>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
      </div>
      <div style={{ display: 'grid', gap: 16 }}>
        {children}
      </div>
    </Card>
  );
}

function Field({ label, required, children, hint }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {hint && (
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const supabase = getSupabase();
  const { checking } = useRequireAuth(supabase);
  const { restaurant, loading: loadingRestaurant } = useRestaurant();
  const { refresh: refreshSubscription } = useSubscription();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [routeAccountId, setRouteAccountId] = useState('');
  const [form, setForm] = useState({
    legal_name: '',
    restaurant_name: '',
    phone: '',
    support_email: '',
    gst_enabled: false,
    gstin: '',
    default_tax_rate: 5,
    prices_include_tax: false,
    shipping_name: '',
    shipping_phone: '',
    shipping_address_line1: '',
    shipping_address_line2: '',
    shipping_city: '',
    shipping_state: '',
    shipping_pincode: '',
    tables_count: 0,
    table_prefix: 'T',
    upi_id: '',
    online_payment_enabled: false,
    use_own_gateway: false,
    razorpay_key_id: '',
    razorpay_key_secret: '',
    bank_account_holder_name: '',
    bank_account_number: '',
    bank_ifsc: '',
    bank_email: '',
    bank_phone: '',
    profile_category: 'food_and_beverages',
    profile_subcategory: 'restaurant',
    business_type: 'individual',
    legal_pan: '',
    legal_gst: '',
    beneficiary_name: '',
    brand_logo_url: '',
    brand_color: '#1976d2',
    website_url: '',
    instagram_handle: '',
    facebook_page: '',
    description: '',
    swiggy_enabled: false,
    swiggy_api_key: '',
    swiggy_api_secret: '',
    swiggy_webhook_secret: '',
    zomato_enabled: false,
    zomato_api_key: '',
    zomato_api_secret: '',
    zomato_webhook_secret: '',
    useswiggy: false,
    usezomato: false,
    features_credit_enabled: false,
    features_production_enabled: false,
    features_inventory_enabled: false,
    features_table_ordering_enabled: false,
  });

  const [originalTables, setOriginalTables] = useState(0);
  const [isFirstTime, setIsFirstTime] = useState(false);

  useEffect(() => {
   if (!restaurant?.id || !supabase) return;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const { data: profile, error: profileError } = await supabase
          .from('restaurant_profiles')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .maybeSingle();
        if (profileError) throw profileError;

        if (profile) {
          // *** FIX STARTS HERE ***
          // Sanitize the fetched data to replace any null values with empty strings.
          // This prevents the "value prop on input should not be null" warning.
          const sanitizedProfile = Object.entries(profile).reduce((acc, [key, value]) => {
            acc[key] = value === null ? '' : value;
            return acc;
          }, {});
          // *** FIX ENDS HERE ***
          // Normalize stored booleans that might be strings from older saves
          const normalizedPricesInclude = (sanitizedProfile.prices_include_tax === true
            || sanitizedProfile.prices_include_tax === 'true'
            || sanitizedProfile.prices_include_tax === 1
            || sanitizedProfile.prices_include_tax === '1');

          setForm(prev => ({
            ...prev,
            ...sanitizedProfile, // Use the sanitized data
            default_tax_rate: profile.default_tax_rate ?? 5,
            prices_include_tax: profile.prices_include_tax != null ? normalizedPricesInclude : false,
            profile_category: profile.profile_category || 'food_and_beverages',
            profile_subcategory: profile.profile_subcategory || 'restaurant',
            business_type: profile.business_type || 'individual',
            online_payment_enabled: profile.online_payment_enabled ?? false,
            use_own_gateway: profile.use_own_gateway ?? false,
            swiggy_enabled: !!(profile.swiggy_api_key && profile.swiggy_api_secret && profile.swiggy_webhook_secret),
            zomato_enabled: !!(profile.zomato_api_key && profile.zomato_api_secret && profile.zomato_webhook_secret),
            useswiggy: !!(profile.swiggy_api_key && profile.swiggy_api_secret && profile.swiggy_webhook_secret),
            usezomato: !!(profile.zomato_api_key && profile.zomato_api_secret && profile.zomato_webhook_secret),
            features_credit_enabled: !!sanitizedProfile.features_credit_enabled,
            features_production_enabled: !!sanitizedProfile.features_production_enabled,
            features_inventory_enabled: !!sanitizedProfile.features_inventory_enabled,
            features_table_ordering_enabled: !!sanitizedProfile.features_table_ordering_enabled,

          }));
          setOriginalTables(profile.tables_count || 0);
          setIsFirstTime(false);
        } else {
          setIsFirstTime(true);
        }

        const { data: restData, error: restError } = await supabase
          .from('restaurants')
          .select('name, route_account_id')
          .eq('id', restaurant.id)
          .single();

        if (!restError) {
          if (restData?.route_account_id) setRouteAccountId(restData.route_account_id);
          if (restData?.name) {
            setForm(prev => ({ ...prev, restaurant_name: restData.name }));
          }
        }
      } catch (e) {
        setError(e.message || 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [restaurant?.id, restaurant?.name, supabase]);

  const onChange = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(prev => {
      const updated = { ...prev, [field]: val };
      if (field === 'legal_name') {
        updated.beneficiary_name = val;
        updated.bank_account_holder_name = val;
      }
      if (field === 'online_payment_enabled' && !val) {
        updated.use_own_gateway = false;
        updated.razorpay_key_id = '';
        updated.razorpay_key_secret = '';
      }
      if (field === 'use_own_gateway' && !val) {
        updated.razorpay_key_id = '';
        updated.razorpay_key_secret = '';
      }
      if (field === 'swiggy_enabled' && !val) {
        updated.swiggy_api_key = '';
        updated.swiggy_api_secret = '';
        updated.swiggy_webhook_secret = '';
        updated.useswiggy = false;
      }
      if (field === 'useswiggy' && !val) {
        updated.swiggy_api_key = '';
        updated.swiggy_api_secret = '';
        updated.swiggy_webhook_secret = '';
        updated.swiggy_enabled = false;
      }
      if (field === 'zomato_enabled' && !val) {
        updated.zomato_api_key = '';
        updated.zomato_api_secret = '';
        updated.zomato_webhook_secret = '';
        updated.usezomato = false;
      }
      if (field === 'usezomato' && !val) {
        updated.zomato_api_key = '';
        updated.zomato_api_secret = '';
        updated.zomato_webhook_secret = '';
        updated.zomato_enabled = false;
      }
      if (field === 'gst_enabled' && !val) {
        updated.gstin = '';
        updated.legal_gst = '';
      }
      return updated;
    });
  };

  function validateBusinessType(val) {
    const allowed = ['individual', 'private_limited', 'proprietorship', 'partnership', 'llp', 'trust', 'society', 'ngo', 'public_limited'];
    return allowed.includes(val);
  }

  function validateUPI(upi) {
    return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upi.trim());
  }

  function validateIFSC(ifsc) {
    return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim().toUpperCase());
  }

async function save(e) {
  e.preventDefault();
  setSaving(true);
  setError('');
  setSuccess('');
  const startTime = Date.now();
  try {
    // STEP 1: Quick validation
    console.time("Validation");
    const required = ['legal_name', 'restaurant_name', 'phone', 'support_email'];
    if (form.online_payment_enabled) {
      if (form.use_own_gateway) {
        required.push('razorpay_key_id', 'razorpay_key_secret');
      } else {
        required.push('bank_account_holder_name', 'bank_account_number', 'bank_ifsc', 'beneficiary_name', 'business_type', 'legal_pan');
      }
    }

    const missing = required.filter(f => !form[f] || !form[f].toString().trim());
    if (missing.length) throw new Error(`Missing required fields: ${missing.join(', ')}`);

    if (form.online_payment_enabled && !form.use_own_gateway) {
      if (form.beneficiary_name.trim() !== form.legal_name.trim()) {
        throw new Error('Beneficiary Name must match Legal Name');
      }
      if (!validateBusinessType(form.business_type)) {
        throw new Error('Invalid business type selected');
      }
      if (!validateIFSC(form.bank_ifsc)) {
        throw new Error('Invalid IFSC code format');
      }
    }

    if (form.upi_id && !validateUPI(form.upi_id)) {
      throw new Error('Invalid UPI format. Example: name@bankhandle');
    }

    const newTableCount = Number(form.tables_count);
    if (!isFirstTime && newTableCount < originalTables) {
      throw new Error('Cannot decrease number of tables');
    }

    // STEP 2: Ensure restaurant record exists
    const { data: restCheck } = await supabase
      .from('restaurants')
      .select('id')
      .eq('id', restaurant.id)
      .maybeSingle();

    if (!restCheck) {
      const { error: createRestErr } = await supabase
        .from('restaurants')
        .insert({ id: restaurant.id, name: form.restaurant_name });

      if (createRestErr) throw new Error("Failed to create restaurant");
    }

    const { useswiggy, usezomato, ...rest } = form;

    const payload = {
      restaurant_id: restaurant.id,
      legal_name: rest.legal_name,
      phone: rest.phone,
      support_email: rest.support_email,
      gst_enabled: rest.gst_enabled,
      gstin: rest.gstin,
      default_tax_rate: Number(rest.default_tax_rate) || 5,
      prices_include_tax: !!rest.prices_include_tax,
      shipping_name: rest.shipping_name,
      shipping_phone: rest.shipping_phone,
      shipping_address_line1: rest.shipping_address_line1,
      shipping_address_line2: rest.shipping_address_line2,
      shipping_city: rest.shipping_city,
      shipping_state: rest.shipping_state,
      shipping_pincode: rest.shipping_pincode,
      tables_count: newTableCount,
      table_prefix: rest.table_prefix,
      upi_id: rest.upi_id.trim(),
      online_payment_enabled: !!rest.online_payment_enabled,
      use_own_gateway: !!rest.use_own_gateway,
      razorpay_key_id: rest.razorpay_key_id,
      razorpay_key_secret: rest.razorpay_key_secret,
      bank_account_holder_name: rest.bank_account_holder_name,
      bank_account_number: rest.bank_account_number,
      bank_email: rest.bank_email,
      bank_phone: rest.bank_phone,
      bank_ifsc: rest.bank_ifsc.trim().toUpperCase(),
      profile_category: rest.profile_category,
      profile_subcategory: rest.profile_subcategory,
      business_type: rest.business_type,
      legal_pan: rest.legal_pan.trim().toUpperCase(),
      legal_gst: rest.legal_gst,
      beneficiary_name: rest.beneficiary_name,
      brand_logo_url: rest.brand_logo_url,
      brand_color: rest.brand_color,
      website_url: rest.website_url,
      instagram_handle: rest.instagram_handle,
      facebook_page: rest.facebook_page,
      description: rest.description,
      swiggy_enabled: !!rest.swiggy_enabled,
      swiggy_api_key: rest.swiggy_api_key,
      swiggy_api_secret: rest.swiggy_api_secret,
      swiggy_webhook_secret: rest.swiggy_webhook_secret,
      zomato_enabled: !!rest.zomato_enabled,
      zomato_api_key: rest.zomato_api_key,
      zomato_api_secret: rest.zomato_api_secret,
      zomato_webhook_secret: rest.zomato_webhook_secret,
      features_credit_enabled: !!rest.features_credit_enabled,
      features_production_enabled: !!rest.features_production_enabled,
      features_inventory_enabled: !!rest.features_inventory_enabled,
      features_table_ordering_enabled: !!rest.features_table_ordering_enabled,

    };

    // STEP 3: Show immediate success & disable saving
    setSaving(false);
    setSuccess('✓ Settings saved! Preparing your account...');
    setOriginalTables(newTableCount);
    setIsFirstTime(false);
    console.timeEnd("Validation");

    // STEP 4: All heavy work in background (parallel execution)
    Promise.all([
      // Save profile
      (async () => {
        try {
          console.time("Supabase upsert: restaurantprofiles");
          const { error: upsertError } = await supabase
            .from('restaurant_profiles')
            .upsert(payload, { 
              onConflict: 'restaurant_id',
              ignoreDuplicates: false 
            });


          if (upsertError) {
            console.error('Profile upsert failed:', upsertError);
            throw upsertError;
          }
        } catch (err) {
          console.error('Profile upsert error:', err);
        } finally {
          console.timeEnd("Supabase Upsert restaurant_profiles");
        }
      })(),

      // Update restaurant
      (async () => {
        try {
          console.time("Supabase update: restaurants");
          await supabase
            .from('restaurants')
            .update({ name: rest.restaurant_name })
            .eq('id', restaurant.id);
            console.timeEnd("Supabase update: restaurants");

        } catch (err) {
          console.error('Restaurant update error:', err);
        }finally {
          console.timeEnd("Supabase Update restaurants name");
        }
      })(),

      // Create Route account if needed
      (async () => {
        try {
          if (!rest.online_payment_enabled || rest.use_own_gateway || routeAccountId) {
            return;
          }

          const profile = {
            category: rest.profile_category,
            subcategory: rest.profile_subcategory,
            addresses: {
              registered: {
                street1: rest.shipping_address_line1.trim(),
                street2: rest.shipping_address_line2.trim(),
                city: rest.shipping_city.trim(),
                state: rest.shipping_state.trim(),
                postal_code: rest.shipping_pincode.trim(),
                country: 'IN',
              },
            },
          };

          const legalInfo = { pan: rest.legal_pan.trim().toUpperCase() };
          if (rest.gst_enabled && rest.legal_gst.trim()) {
            legalInfo.gst = rest.legal_gst.trim().toUpperCase();
          }

          const resp = await fetch('/api/route/create-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              legal_name: rest.legal_name,
              beneficiary_name: rest.beneficiary_name,
              display_name: rest.restaurant_name,
              business_type: rest.business_type,
              account_number: rest.bank_account_number,
              ifsc: rest.bank_ifsc.trim().toUpperCase(),
              email: rest.bank_email?.trim() || rest.support_email.trim(),
              phone: rest.bank_phone?.trim() || rest.phone.trim(),
              owner_id: restaurant.id,
              profile,
              legal_info: legalInfo,
            }),
          });

          if (!resp.ok) {
            const err = await resp.json();
            console.error('Route account error:', err);
            return;
          }

          const accountId = await resp.json();
          setRouteAccountId(accountId);

          await supabase
            .from('restaurants')
            .update({ route_account_id: accountId })
            .eq('id', restaurant.id);
        } catch (err) {
          console.error('Route account creation error:', err);
        }
      })(),

      // Start trial if first time
      (async () => {
        console.time("Start Trial API");
        try {
          if (!isFirstTime) return;

          const res = await fetch('/api/subscription/start-trial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restaurant_id: restaurant.id }),
          });

          if (!res.ok) {
            const trialErr = await res.json().catch(() => ({}));
            console.warn('Trial creation warning:', trialErr.message);
          }
        } catch (err) {
          console.warn('Trial error (non-critical):', err.message);
        } finally {
          console.timeEnd("Start Trial API");
        }

      })(),
    ]).then(() => {
      console.timeEnd("Total Save Function");
      console.log("Total time for settings save (including background tasks):", Date.now() - overallStartTime, "ms");
    }).catch(console.error);

   // SEND QR EMAIL SEPARATELY - FIRE & FORGET (ONLY if tables_count INCREMENTED)
if (form.tables_count && form.tables_count > originalTables) {
  console.time("Send QR Email (Fire & Forget)");
  
  // Generate QR codes ONLY for NEW tables
  const newTablesCount = form.tables_count - originalTables;
  const startTableNum = originalTables + 1;
  
  const qrCodes = Array.from({ length: newTablesCount }, (_, i) => ({
    tableNumber: `${form.table_prefix}${startTableNum + i}`,
    qrUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/order?r=${restaurant.id}&t=${startTableNum + i}`,
  }));

  fetch('/api/send-qr-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qrCodes,
      restaurantData: {
        restaurantName: form.restaurant_name,
        legalName: form.legal_name,
        phone: form.phone,
        email: form.support_email,
        recipientName: form.shipping_name,           
        recipientPhone: form.shipping_phone,
        address: [
          form.shipping_address_line1,
          form.shipping_address_line2,
          form.shipping_city,
          form.shipping_state,
          form.shipping_pincode,
        ].filter(Boolean).join(', '),
      },
      isIncremental: true,  // Mark as incremental/additional QR codes
    }),
  }).catch(err => {
    console.warn('QR email failed (background):', err.message);
    console.timeEnd("Send QR Email (Fire & Forget)");
  });
}


    // Refresh subscription after delay
    setTimeout(() => {
      console.time("RefreshSubscription Timeout");
      refreshSubscription();
      console.timeEnd("RefreshSubscription Timeout");
    }, 1000);


  } catch (err) {
    console.error('Save error:', err);
    setError(err.message || 'Failed to save settings');
    setSaving(false);
  }
}



  if (checking || loadingRestaurant) return <div>Loading...</div>;
  if (loading) return <div>Loading settings...</div>;

  return (
    <div className="container" style={{ padding: 20 }}>
      <h1 className="h1">Restaurant Settings</h1>

      {error && (
        <Card padding12 style={{ background: '#fee2e2', borderColor: '#fca5a5', marginBottom: 16 }}>
          <div style={{ color: '#b91c1c' }}>{error}</div>
        </Card>
      )}

      {success && (
        <Card padding12 style={{ background: '#ecfdf5', borderColor: '#34d399', marginBottom: 16 }}>
          <div style={{ color: '#065f46' }}>{success}</div>
        </Card>
      )}

      <form onSubmit={save} style={{ display: 'grid', gap: 24 }}>
        {/* Business Information */}
        <Section title="Business Info" icon="🏢">
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
            <Field label="Legal Name" required>
              <input className="input" value={form.legal_name} onChange={onChange('legal_name')} />
            </Field>

            <Field label="Display Name" required hint="Shown to customers">
              <input className="input" value={form.restaurant_name} onChange={onChange('restaurant_name')} />
            </Field>

            <Field label="Phone" required>
              <input
                className="input"
                type="tel"
                value={form.phone}
                onChange={onChange('phone')}
                style={{ fontSize: 16 }}
              />
            </Field>

            <Field label="Support Email" required>
              <input
                className="input"
                type="email"
                value={form.support_email}
                onChange={onChange('support_email')}
              />
            </Field>
          </div>
        </Section>

        {/* Payment Gateway Setup */}
        <Section title="Payment Gateway Setup" icon="💳">
          <Field label="Enable Online Payments?" required>
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <label>
                <input
                  type="radio"
                  name="online_payment_enabled"
                  checked={form.online_payment_enabled === true}
                  onChange={() => setForm(prev => ({ ...prev, online_payment_enabled: true }))}
                />
                Yes
              </label>
              <label>
                <input
                  type="radio"
                  name="online_payment_enabled"
                  checked={form.online_payment_enabled === false}
                  onChange={() =>
                    setForm(prev => ({
                      ...prev,
                      online_payment_enabled: false,
                      use_own_gateway: false,
                      razorpay_key_id: '',
                      razorpay_key_secret: '',
                    }))
                  }
                />
                No
              </label>
            </div>
          </Field>

          {form.online_payment_enabled && (
            <>
              <Field label="Use Your Own Gateway?" required>
                <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                  <label>
                    <input
                      type="radio"
                      name="use_own_gateway"
                      checked={form.use_own_gateway === true}
                      onChange={() => setForm(prev => ({ ...prev, use_own_gateway: true }))}
                    />
                    Yes
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="use_own_gateway"
                      checked={form.use_own_gateway === false}
                      onChange={() =>
                        setForm(prev => ({
                          ...prev,
                          use_own_gateway: false,
                          razorpay_key_id: '',
                          razorpay_key_secret: '',
                        }))
                      }
                    />
                    No
                  </label>
                </div>
              </Field>

              {form.use_own_gateway && (
                <Section title="Razorpay Account" icon="🔑">
                  <Field label="Razorpay Key ID" required>
                    <input
                      className="input"
                      value={form.razorpay_key_id}
                      onChange={onChange('razorpay_key_id')}
                      placeholder="rzp_test_..."
                    />
                  </Field>

                  <Field label="Razorpay Key Secret" required>
                    <input
                      className="input"
                      type="password"
                      value={form.razorpay_key_secret}
                      onChange={onChange('razorpay_key_secret')}
                    />
                  </Field>

                  <div style={{ fontSize: 14, marginTop: 12 }}>
                    Creating your own Razorpay account requires KYC and may incur additional charges.
                  </div>
                </Section>
              )}

              {!form.use_own_gateway && (
                <>
                  <Section title="Bank Details & KYC" icon="🏦">
                    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
                      <Field label="Account Holder Name" required>
                        <input
                          className="input"
                          value={form.bank_account_holder_name}
                          onChange={onChange('bank_account_holder_name')}
                        />
                      </Field>

                      <Field label="Account Number" required>
                        <input
                          className="input"
                          value={form.bank_account_number}
                          onChange={onChange('bank_account_number')}
                        />
                      </Field>

                      <Field label="IFSC Code" required hint="Example: HDFC0001234">
                        <input
                          className="input"
                          value={form.bank_ifsc}
                          onChange={onChange('bank_ifsc')}
                          style={{ textTransform: 'uppercase' }}
                        />
                      </Field>

                      <Field label="Email" hint="Optional">
                        <input
                          className="input"
                          type="email"
                          value={form.bank_email}
                          onChange={onChange('bank_email')}
                        />
                      </Field>

                      <Field label="Phone" hint="Optional">
                        <input
                          className="input"
                          type="tel"
                          value={form.bank_phone}
                          onChange={onChange('bank_phone')}
                        />
                      </Field>
                    </div>
                  </Section>
                  <Section title="KYC Information" icon="📋">
                    <Field label="Business Category" required>
                      <select value={form.profile_category} onChange={onChange('profile_category')}>
                        <option value="food_and_beverages">Food & Beverages</option>
                      </select>
                    </Field>

                    <Field label="Business Subcategory" required>
                      <select value={form.profile_subcategory} onChange={onChange('profile_subcategory')}>
                        <option value="restaurant">Restaurant</option>
                      </select>
                    </Field>

                    <Field label="PAN" required>
                      <input
                        className="input"
                        value={form.legal_pan}
                        onChange={onChange('legal_pan')}
                        placeholder="ABCDE1234F"
                        style={{ textTransform: 'uppercase' }}
                      />
                    </Field>

                    <Field label="Business Type" required hint="Select your business type">
                      <select value={form.business_type} onChange={onChange('business_type')}>
                        <option value="">-- Select --</option>
                        <option value="individual">Individual</option>
                        <option value="private_limited">Private Limited</option>
                        <option value="proprietorship">Proprietorship</option>
                        <option value="partnership">Partnership</option>
                        <option value="llp">LLP</option>
                        <option value="trust">Trust</option>
                        <option value="society">Society</option>
                        <option value="ngo">NGO</option>
                        <option value="public_limited">Public Limited</option>
                      </select>
                    </Field>

                    <Field label="Beneficiary Name" required hint="Auto-synced from Legal Name">
                      <input
                        className="input"
                        value={form.beneficiary_name}
                        readOnly
                        style={{ backgroundColor: '#f9fafb', cursor: 'not-allowed' }}
                      />
                    </Field>
                  </Section>
                </>
              )}
            </>
          )}

        </Section>

        {/* Tax Settings */}
        <Section title="Tax Settings" icon="📊">
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center' }}>
            <input id="gst_enabled" type="checkbox" checked={form.gst_enabled} onChange={onChange('gst_enabled')} />
            <label htmlFor="gst_enabled" style={{ marginLeft: 6 }}>Enable GST</label>
          </div>
          {form.gst_enabled && (
            <>
              <Field label="GSTIN">
                <input
                  className="input"
                  value={form.gstin}
                  onChange={onChange('gstin')}
                  placeholder="22AAAAA0000A1Z"
                  style={{ textTransform: 'uppercase' }}
                />
              </Field>
              <Field label="GST Number (if different)">
                <input
                  className="input"
                  value={form.legal_gst}
                  onChange={onChange('legal_gst')}
                  style={{ textTransform: 'uppercase' }}
                />
              </Field>
            </>
          )}
         {form.gst_enabled && <div style={{ display: 'flex', gap: 24 }}>
            <Field label="Default Tax Rate (GST %)" required hint="Common GST slabs in India are 5% and 18%">
              <select className="input" value={String(form.default_tax_rate)} onChange={onChange('default_tax_rate')}>
                <option value={"5"}>5%</option>
                <option value={"18"}>18%</option>
              </select>
            </Field>

            <Field label="Prices Include Tax" required hint="If checked, item prices you enter are tax-inclusive">
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!form.prices_include_tax}
                  onChange={onChange('prices_include_tax')}
                />
              </label>
            </Field>
          </div>
        }
        </Section>
        {/* Delivery Address */}
        <Section title="Delivery Address" icon="📍">
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
            <Field label="Recipient" required>
              <input className="input" value={form.shipping_name} onChange={onChange('shipping_name')} />
            </Field>

            <Field label="Contact" required>
              <input
                className="input"
                type="tel"
                value={form.shipping_phone}
                onChange={onChange('shipping_phone')}
                style={{ fontSize: 16 }}
              />
            </Field>
          </div>

          <Field label="Address Line 1" required>
            <input className="input" value={form.shipping_address_line1} onChange={onChange('shipping_address_line1')} />
          </Field>

          <Field label="Address Line 2">
            <input className="input" value={form.shipping_address_line2} onChange={onChange('shipping_address_line2')} />
          </Field>

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '2fr 1fr 1fr' }}>
            <Field label="City" required>
              <input className="input" value={form.shipping_city} onChange={onChange('shipping_city')} />
            </Field>

            <Field label="State" required>
              <input className="input" value={form.shipping_state} onChange={onChange('shipping_state')} />
            </Field>

            <Field label="Pincode" required>
              <input
                className="input"
                value={form.shipping_pincode}
                onChange={onChange('shipping_pincode')}
                style={{ fontSize: 16 }}
              />
            </Field>
          </div>
        </Section>

        {/* Operations */}
        <Section title="Operations" icon="⚙️">
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
            <Field label="Tables Count" required>
              <input
                className="input"
                type="number"
                min={originalTables || 0}
                max="100"
                value={form.tables_count}
                onChange={onChange('tables_count')}
              />
              {originalTables > 0 && (
                <div className="muted" style={{ fontSize: 12 }}>
                  Current: {originalTables}
                </div>
              )}
            </Field>

            <Field label="Table Prefix" hint="e.g. T for T1, T2">
              <input className="input" maxLength="3" value={form.table_prefix} onChange={onChange('table_prefix')} placeholder="T" />
            </Field>

            <Field label="UPI ID" required>
              <input className="input" value={form.upi_id} onChange={onChange('upi_id')} placeholder="name@bankhandle" />
            </Field>
          </div>


        </Section>

        {/* Brand & Web */}
        <Section title="Brand & Web" icon="🎨">
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
            <Field label="Logo URL">
              <input className="input" type="url" value={form.brand_logo_url} onChange={onChange('brand_logo_url')} />
            </Field>

            <Field label="Brand Color">
              <input className="input" type="color" value={form.brand_color} onChange={onChange('brand_color')} />
            </Field>

            <Field label="Website URL">
              <input className="input" type="url" value={form.website_url} onChange={onChange('website_url')} />
            </Field>

            <Field label="Instagram">
              <input className="input" value={form.instagram_handle} onChange={onChange('instagram_handle')} />
            </Field>

            <Field label="Facebook">
              <input className="input" type="url" value={form.facebook_page} onChange={onChange('facebook_page')} />
            </Field>
          </div>

          <Field label="Description">
            <textarea className="input" rows="3" value={form.description} onChange={onChange('description')} />
          </Field>
        </Section>

        {/* Third-party Integrations */}
        <Section title="Third-party Integrations" icon="🔗">
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center' }}>
            <input
              id="swiggy_enabled"
              type="checkbox"
              checked={form.swiggy_enabled}
              onChange={onChange('swiggy_enabled')}
            />
            <label htmlFor="swiggy_enabled" style={{ marginLeft: 6 }}>Enable Swiggy Integration</label>
          </div>

          {form.swiggy_enabled && (
            <>
              <Field label="Swiggy API Key" required>
                <input className="input" value={form.swiggy_api_key} onChange={onChange('swiggy_api_key')} />
              </Field>
              <Field label="Swiggy API Secret" required>
                <input className="input" type="password" value={form.swiggy_api_secret} onChange={onChange('swiggy_api_secret')} />
              </Field>
              <Field label="Swiggy Webhook Secret" required>
                <input className="input" type="password" value={form.swiggy_webhook_secret} onChange={onChange('swiggy_webhook_secret')} />
              </Field>
            </>
          )}

          <div style={{ marginTop: 20, marginBottom: 12, display: 'flex', alignItems: 'center' }}>
            <input id="zomato_enabled" type="checkbox" checked={form.zomato_enabled} onChange={onChange('zomato_enabled')} />
            <label htmlFor="zomato_enabled" style={{ marginLeft: 6 }}>Enable Zomato Integration</label>
          </div>

          {form.zomato_enabled && (
            <>
              <Field label="Zomato API Key" required>
                <input className="input" value={form.zomato_api_key} onChange={onChange('zomato_api_key')} />
              </Field>
              <Field label="Zomato API Secret" required>
                <input className="input" type="password" value={form.zomato_api_secret} onChange={onChange('zomato_api_secret')} />
              </Field>
              <Field label="Zomato Webhook Secret" required>
                <input className="input" type="password" value={form.zomato_webhook_secret} onChange={onChange('zomato_webhook_secret')} />
              </Field>
            </>
          )}
        </Section>

{/* Modules visible in sidebar */}
<Section title="Modules & Sidepanel" icon="🧩">
  <div style={{ display: 'grid', gap: 14 }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input
        type="checkbox"
        checked={!!form.features_credit_enabled}
        onChange={onChange('features_credit_enabled')}
      />
      <span>Credit (Credit Customers + Credit Sales Report)</span>
    </label>

    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input
        type="checkbox"
        checked={!!form.features_production_enabled}
        onChange={onChange('features_production_enabled')}
      />
      <span>Production (Production page)</span>
    </label>

    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input
        type="checkbox"
        checked={!!form.features_table_ordering_enabled}
        onChange={onChange('features_table_ordering_enabled')}
      />
      <span>Table‑wise Ordering (Availability page)</span>
    </label>

    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input
        type="checkbox"
        checked={!!form.features_inventory_enabled}
        onChange={onChange('features_inventory_enabled')}
      />
      <span>Inventory (Inventory page)</span>
    </label>
  </div>

</Section>


        {/* Save Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button disabled={saving} type="submit">
            {saving ? 'Saving...' : isFirstTime ? 'Complete Setup' : 'Save Changes'}
          </Button>

        </div>
      </form>

<Section title="Printing">
  <PrinterSetupCard />
</Section>

      {/* Kitchen Dashboard Link */}
      <Section title="Kitchen Dashboard Link" icon="👨‍🍳">
        <Field label="Kitchen Dashboard URL">
          {restaurant?.id ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                readOnly
                value={`${window.location.origin}/kitchen?rid=${restaurant.id}`}
                onFocus={e => e.target.select()}
                style={{ flex: 1 }}
              />
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/kitchen?rid=${restaurant.id}`);
                  alert('Kitchen URL copied to clipboard!');
                }}
              >
                Copy
              </Button>
            </div>
          ) : (
            <div>Loading link...</div>
          )}
        </Field>
      </Section>
    </div>
  );
}
