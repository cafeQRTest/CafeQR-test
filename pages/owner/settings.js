//pages/owner/settings.js - "Best" Dynamic AI Structure + Brand Orange Theme

import React, { useEffect, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { getSupabase } from '../../services/supabase';
import PrinterSetupCard from '../../components/PrinterSetupCard';
import NiceSelect from '../../components/NiceSelect';
import { fileToBitmapGrid } from '../../utils/logoBitmap';

// --- Animations ---

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
`;

const slideUp = keyframes`
  from { transform: translate(-50%, 100%); opacity: 0; }
  to { transform: translate(-50%, 0); opacity: 1; }
`;

// --- Styled Components ---

const PageContainer = styled.div`
  max-width: 1000px;
  margin: 0 auto;
  padding: 60px 24px 160px;
  font-family: 'DM Sans', 'Inter', sans-serif;
  color: #1f2937;
  background-color: #f8fafc;
  min-height: 100vh;
  animation: ${fadeInUp} 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  
  @media (max-width: 640px) {
    padding: 24px 16px 100px;
  }
`;

const Header = styled.header`
  margin-bottom: 56px;
  text-align: center;
`;

const Title = styled.h1`
  font-size: 36px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.03em;
  margin: 0 0 16px 0;
  /* Orange Gradient Text */
  background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
`;

const Subtitle = styled.p`
  font-size: 17px;
  color: #64748b;
  margin: 0 auto;
  max-width: 540px;
  line-height: 1.6;
`;

const ContentGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 40px;
`;

/* Dynamic Section Card - "Floating" Effect */
const SectionCard = styled.section`
  background: white;
  border-radius: 24px;
  border: 1px solid rgba(255, 237, 213, 0.5); /* Very subtle orange tint border */
  box-shadow: 0 10px 40px -10px rgba(0,0,0,0.05);
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  opacity: 0;
  animation: ${fadeInUp} 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  
  &:nth-child(1) { animation-delay: 0.1s; }
  &:nth-child(2) { animation-delay: 0.15s; }
  &:nth-child(3) { animation-delay: 0.2s; }
  &:nth-child(4) { animation-delay: 0.25s; }
  &:nth-child(5) { animation-delay: 0.3s; }

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 20px 40px -10px rgba(0,0,0,0.08);
    border-color: #fed7aa; /* Orange-200 */
  }
`;

const SectionHeader = styled.div`
  padding: 28px 36px;
  border-bottom: 1px solid #fff7ed;
  display: flex;
  align-items: center;
  gap: 20px;
  background: linear-gradient(to right, #ffffff, #fff7ed); /* Warm fade */
`;

const SectionIcon = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%); /* Orange tint */
  color: #ea580c; /* Orange-600 */
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.5), 0 4px 6px -2px rgba(234, 88, 12, 0.1);
`;

const SectionTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: #0f172a;
  letter-spacing: -0.01em;
`;

const SectionBody = styled.div`
  padding: 36px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 36px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    padding: 24px;
    gap: 24px;
  }
`;

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  ${props => props.span && css`grid-column: span ${props.span};`}
  
  @media(max-width: 768px) {
    grid-column: span 1 !important;
  }
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 2px;
`;

const Required = styled.span`
  color: #ef4444;
  font-size: 14px;
  margin-left: 2px;
`;

const Input = styled.input`
  display: block;
  width: 90%;
  padding: 14px 18px;
  font-size: 16px;
  color: #0f172a;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

  &::placeholder {
    color: #94a3b8;
  }

  &:focus {
    background-color: white;
    border-color: #f97316; /* Orange Focus */
    outline: none;
    box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1); /* Orange Glow */
    transform: translateY(-1px);
  }

  &:hover:not(:disabled):not(:focus) {
    background-color: white;
    border-color: #cbd5e1;
  }
`;

const Textarea = styled.textarea`
  display: block;
  width: 90%;
  padding: 14px 18px;
  font-size: 16px;
  color: #0f172a;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  transition: all 0.2s;
  resize: vertical;
  min-height: 120px;
  font-family: inherit;

  &:focus {
    background-color: white;
    border-color: #f97316;
    outline: none;
    box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1);
  }
`;

const Select = styled.select`
  display: block;
  width: 90%;
  padding: 14px 18px;
  font-size: 16px;
  color: #0f172a;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;

  &:focus {
    background-color: white;
    border-color: #f97316;
    outline: none;
    box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1);
    transform: translateY(-1px);
  }

  &:hover:not(:disabled):not(:focus) {
    background-color: white;
    border-color: #cbd5e1;
  }
`;

const HelperText = styled.div`
  font-size: 13px;
  color: #64748b;
  margin-top: 6px;
  line-height: 1.4;
`;

/* Dynamic Toggle Card (Restored from "Best" version, updated to Orange) */
const FeatureCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
  background-color: #ffffff;
  border: 1px solid #f1f5f9;
  border-radius: 20px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);

  &:hover {
    transform: translateY(-4px) scale(1.01);
    box-shadow: 0 15px 30px -5px rgba(0, 0, 0, 0.06);
    border-color: #fed7aa;
    z-index: 1;
  }

  ${props => props.checked && css`
    border-color: rgba(249, 115, 22, 0.3);
    background: linear-gradient(135deg, #ffffff 0%, #fff7ed 100%); /* Warm Orange Tint */
    box-shadow: 0 10px 25px -5px rgba(249, 115, 22, 0.15);

    /* Left accent bar */
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 6px;
      background: linear-gradient(to bottom, #f97316, #ea580c);
    }
  `}
`;

const FeatureIcon = styled.div`
  width: 52px;
  height: 52px;
  border-radius: 16px;
  /* Orange Gradient Active */
  background: ${props => props.active ? 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)' : '#f1f5f9'};
  color: ${props => props.active ? 'white' : '#64748b'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  margin-right: 20px;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
  box-shadow: ${props => props.active ? '0 8px 16px -4px rgba(234, 88, 12, 0.4)' : 'none'};
`;

const FeatureText = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FeatureTitle = styled.div`
  font-weight: 700;
  font-size: 16px;
  color: #0f172a;
`;

const FeatureDesc = styled.div`
  font-size: 14px;
  color: #64748b;
  line-height: 1.5;
`;

const Switch = styled.div`
  position: relative;
  width: 52px;
  height: 30px;
  background: ${props => props.checked ? '#f97316' : '#e2e8f0'}; /* Orange Active */
  border-radius: 999px;
  transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  margin-left: 20px;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.06);

  &::after {
    content: '';
    position: absolute;
    top: 3px;
    left: ${props => props.checked ? '25px' : '3px'};
    width: 24px;
    height: 24px;
    background: white;
    border-radius: 50%;
    transition: left 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  }
`;

const ActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 24px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 12px;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
  
  ${props => props.primary ? css`
    background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); /* Orange Gradient */
    color: white;
    border: none;
    box-shadow: 0 4px 6px -1px rgba(234, 88, 12, 0.2), 0 2px 4px -1px rgba(234, 88, 12, 0.1);
    
    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 10px 15px -3px rgba(234, 88, 12, 0.3);
    }
    &:active:not(:disabled) { transform: translateY(0); }
    &:disabled { opacity: 0.7; cursor: not-allowed; }
  ` : css`
    background-color: white;
    color: #334155;
    border: 1px solid #e2e8f0;
    
    &:hover:not(:disabled) {
      background-color: #f8fafc;
      border-color: #cbd5e1;
      transform: translateY(-1px);
    }
  `}
`;

const SaveBar = styled.div`
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  width: auto;
`;

const Toast = styled.div`
  position: fixed;
  bottom: 50px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  padding: 16px 28px;
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 200;
  border: 1px solid #e2e8f0;
  animation: ${slideUp} 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  min-width: 340px;
  justify-content: center;

  ${props => props.type === 'error' && css`border-left: 5px solid #ef4444;`}
  ${props => props.type === 'success' && css`border-left: 5px solid #10b981;`}
`;

/* "Dynamic UI" File Upload - Refined with Orange */
const DynamicFileUpload = styled.label`
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 20px;
  border: 2px dashed #e2e8f0;
  border-radius: 16px;
  cursor: pointer;
  background: #f8fafc;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    border-color: #f97316;
    background: #fff7ed;
    transform: scale(1.01);
  }

  & * { pointer-events: none; }
  & button { pointer-events: auto; }
`;

function PrintLogoField({ restaurantId, supabase }) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const ensureReady = () => restaurantId && supabase;

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !ensureReady()) return;

    setSaving(true);
    setMsg('');
    try {
      const { bitmap, cols, rows } = await fileToBitmapGrid(file);
      const { error } = await supabase.from('restaurant_profiles').upsert(
          { restaurant_id: restaurantId, print_logo_bitmap: bitmap, print_logo_cols: cols, print_logo_rows: rows },
          { onConflict: 'restaurant_id', ignoreDuplicates: false }
      );
      if (error) throw error;
      setMsg('✓ Logo saved');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg('✗ ' + (err.message || String(err)));
    } finally {
      setSaving(false);
      if (e.target) e.target.value = '';
    }
  };

  const clearLogo = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!ensureReady()) return;
    setSaving(true);
    setMsg('');
    try {
      const { error } = await supabase.from('restaurant_profiles').update({ print_logo_bitmap: null }).eq('restaurant_id', restaurantId);
      if (error) throw error;
      setMsg('✓ Logo removed');
    } catch (err) { setMsg('✗ Error'); } 
    finally { setSaving(false); }
  };

  return (
    <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #fff7ed' }}>
      <Label style={{ marginBottom: 16 }}>Receipt Logo</Label>
      <DynamicFileUpload>
         <input type="file" accept="image/*" onChange={handleFile} disabled={saving} style={{ display: 'none' }} />
         <div style={{ width: 56, height: 56, borderRadius: 12, background: 'white', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            🖼️
         </div>
         <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: '#0f172a', marginBottom: 4 }}>Upload Business Logo</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>Supports JPG/PNG • Max 380px width</div>
         </div>
         {saving ? (
             <span style={{fontSize: 14, color: '#f97316', fontWeight: 600}}>Processing...</span>
         ) : (
            <button onClick={clearLogo} style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#ef4444', fontSize: 13, cursor: 'pointer', fontWeight: 600, padding: '8px 16px', borderRadius: 8 }}>
                Clear
            </button>
         )}
      </DynamicFileUpload>
      {msg && <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600, color: msg.startsWith('✗') ? '#dc2626' : '#10b981'}}>{msg}</div>}
    </div>
  );
}


export default function SettingsPage() {
  const supabase = getSupabase();
  const { restaurant, loading: loadingRestaurant } = useRestaurant();
  const { refresh: refreshSubscription } = useSubscription();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [form, setForm] = useState({
    legal_name: '', restaurant_name: '', phone: '', support_email: '', address: '',
    tables_count: 0, table_prefix: 'T', upi_id: '',
    features_credit_enabled: false, features_menu_images_enabled: false,
    features_table_ordering_enabled: false, features_inventory_enabled: false,
    features_production_enabled: false, features_counter_send_to_kitchen_enabled: true,
    swiggy_enabled: false, zomato_enabled: false,
    brand_color: '#f97316', description: '', instagram_handle: '', website_url: '',
    gst_enabled: false, gstin: '', default_tax_rate: 5, prices_include_tax: false,
    swiggy_api_key: '', swiggy_api_secret: '', swiggy_webhook_secret: '',
    zomato_api_key: '', zomato_api_secret: '', zomato_webhook_secret: '',
  });

  const [originalTables, setOriginalTables] = useState(0);
  const [isFirstTime, setIsFirstTime] = useState(false);

  useEffect(() => {
    if (showToast) {
        const timer = setTimeout(() => { setShowToast(false); }, 3000);
        return () => clearTimeout(timer);
    }
  }, [showToast]);

  useEffect(() => {
   if (!restaurant?.id || !supabase) return;
    async function load() {
      setLoading(true);
      try {
        const { data: profile } = await supabase.from('restaurant_profiles').select('*').eq('restaurant_id', restaurant.id).maybeSingle();
        if (profile) {
          setForm(prev => ({
            ...prev, ...profile,
            default_tax_rate: profile.default_tax_rate ?? 5,
            features_production_enabled: !!profile.features_production_enabled,
            features_credit_enabled: !!profile.features_credit_enabled,
            features_menu_images_enabled: !!profile.features_menu_images_enabled,
            features_table_ordering_enabled: !!profile.features_table_ordering_enabled,
            features_inventory_enabled: !!profile.features_inventory_enabled,
            features_counter_send_to_kitchen_enabled: profile.features_counter_send_to_kitchen_enabled !== false,
            swiggy_enabled: !!(profile.swiggy_api_key), zomato_enabled: !!(profile.zomato_api_key),
          }));
          setOriginalTables(profile.tables_count || 0);
          setIsFirstTime(false);
        } else { setIsFirstTime(true); }

        const { data: restData } = await supabase.from('restaurants').select('name').eq('id', restaurant.id).single();
        if (restData?.name) setForm(prev => ({ ...prev, restaurant_name: restData.name }));
      } catch (e) { setError(e.message); } 
      finally { setLoading(false); }
    }
    load();
  }, [restaurant]);

  const onChange = (field) => (e) => setForm({ ...form, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setShowToast(false);
    try {
      if (!form.legal_name) throw new Error("Legal Name required");
      
      const payload = {
          restaurant_id: restaurant.id,
          legal_name: form.legal_name,
          phone: form.phone,
          support_email: form.support_email,
          address: form.address,
          tables_count: Number(form.tables_count),
          table_prefix: form.table_prefix,
          upi_id: form.upi_id,
          gst_enabled: form.gst_enabled,
          gstin: form.gstin,
          prices_include_tax: form.prices_include_tax,
          default_tax_rate: Number(form.default_tax_rate),
          brand_color: form.brand_color,
          description: form.description,
          instagram_handle: form.instagram_handle,
          website_url: form.website_url,
          
          features_credit_enabled: form.features_credit_enabled,
          features_menu_images_enabled: form.features_menu_images_enabled,
          features_table_ordering_enabled: form.features_table_ordering_enabled,
          features_inventory_enabled: form.features_inventory_enabled,
          features_production_enabled: form.features_production_enabled,
          features_counter_send_to_kitchen_enabled: form.features_counter_send_to_kitchen_enabled,
          
          swiggy_enabled: form.swiggy_enabled,
          swiggy_api_key: form.swiggy_api_key,
          swiggy_api_secret: form.swiggy_api_secret,
          swiggy_webhook_secret: form.swiggy_webhook_secret,
          
          zomato_enabled: form.zomato_enabled,
          zomato_api_key: form.zomato_api_key,
          zomato_api_secret: form.zomato_api_secret,
          zomato_webhook_secret: form.zomato_webhook_secret,
      };

      await supabase.from('restaurant_profiles').upsert(payload, { onConflict: 'restaurant_id' });
      await supabase.from('restaurants').update({ name: form.restaurant_name }).eq('id', restaurant.id);
      
      setOriginalTables(payload.tables_count);
      setSuccess("Settings Saved");
      setShowToast(true);
      setTimeout(refreshSubscription, 500);
    } catch (err) { setError(err.message); setShowToast(true); }
    finally { setSaving(false); }
  }

  if (loading) return <div style={{padding:80, textAlign:'center'}}>Loading settings...</div>;

  return (
    <PageContainer>
      <Header>
        <Title>Settings & Preferences</Title>
        <Subtitle>Customize how your restaurant operates, manages orders, and connects with customers.</Subtitle>
      </Header>

      {/* Toast */}
      {showToast && (
          <Toast type={error ? 'error' : 'success'}>
              <span style={{ fontSize: 24 }}>{error ? '⚠️' : '🎉'}</span>
              <div style={{display:'flex', flexDirection:'column'}}>
                 <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{error ? 'Update Failed' : 'Update Successful'}</span>
                 <span style={{ fontSize: 13, color: '#64748b' }}>{error || success}</span>
              </div>
          </Toast>
      )}

      <form onSubmit={save}>
        <ContentGrid>
          
          {/* BUSINESS INFO CARD */}
          <SectionCard>
            <SectionHeader>
              <SectionIcon>🏢</SectionIcon>
              <div>
                 <SectionTitle>Business Profile</SectionTitle>
                 <div style={{fontSize: 13, color:'gray', fontWeight:400}}>Core identity & contact details</div>
              </div>
            </SectionHeader>
            <SectionBody>
              <FormField>
                <Label>Display Name <Required>*</Required></Label>
                <Input value={form.restaurant_name} onChange={onChange('restaurant_name')} placeholder="e.g. The Coffee House" />
              </FormField>
              <FormField>
                <Label>Legal Business Name <Required>*</Required></Label>
                <Input value={form.legal_name} onChange={onChange('legal_name')} placeholder="Legal Registered Name" />
              </FormField>
              <FormField>
                <Label>Phone Number <Required>*</Required></Label>
                <Input value={form.phone} onChange={onChange('phone')} type="tel" placeholder="+91 999 999 9999" />
              </FormField>
              <FormField>
                <Label>Support Email <Required>*</Required></Label>
                <Input value={form.support_email} onChange={onChange('support_email')} type="email" />
              </FormField>
              <FormField span={2}>
                <Label>Business Address</Label>
                <Textarea value={form.address} onChange={onChange('address')} rows={3} placeholder="Enter your complete business address..." />
                <HelperText>This address will appear on receipts and invoices</HelperText>
              </FormField>
            </SectionBody>
          </SectionCard>

          {/* OPERATIONS CARD */}
          <SectionCard>
            <SectionHeader>
              <SectionIcon>⚙️</SectionIcon>
              <div>
                 <SectionTitle>Operations & Setup</SectionTitle>
                 <div style={{fontSize: 13, color:'gray', fontWeight:400}}>Table management & payment config</div>
              </div>
            </SectionHeader>
            <SectionBody>
               <FormField>
                  <Label>Total Tables <Required>*</Required></Label>
                  <Input type="number" min={originalTables || 0} max="100" value={form.tables_count} onChange={onChange('tables_count')} />
                  <HelperText>Increasing this will generate new QR codes.</HelperText>
               </FormField>
               <FormField>
                  <Label>Table Prefix</Label>
                  <Input value={form.table_prefix} onChange={onChange('table_prefix')} placeholder="e.g. T" maxLength={3} />
               </FormField>
               <FormField span={2}>
                  <Label>UPI ID (VPA) <Required>*</Required></Label>
                  <Input value={form.upi_id} onChange={onChange('upi_id')} placeholder="merchant@upi" />
                  <HelperText>Direct UPI payments will be sent to this VPA.</HelperText>
               </FormField>
            </SectionBody>
          </SectionCard>

          {/* TAX & COMPLIANCE CARD */}
          <SectionCard>
            <SectionHeader>
              <SectionIcon>📋</SectionIcon>
              <div>
                <SectionTitle>Tax & Compliance</SectionTitle>
                <div style={{fontSize: 13, color:'gray', fontWeight:400}}>Configure tax settings and GST information</div>
              </div>
            </SectionHeader>
            <SectionBody>
              <FormField span={2}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0' }}>
                  <input 
                    type="checkbox" 
                    id="gst-enabled" 
                    checked={form.gst_enabled} 
                    onChange={onChange('gst_enabled')}
                    style={{ width: 20, height: 20, cursor: 'pointer', accentColor: '#f97316' }}
                  />
                  <label htmlFor="gst-enabled" style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>
                    Enable GST
                  </label>
                </div>
                <HelperText>Check this if your business is registered under GST</HelperText>
              </FormField>

              {form.gst_enabled && (
                <FormField span={2}>
                  <Label>GSTIN (GST Identification Number)</Label>
                  <Input 
                    value={form.gstin} 
                    onChange={onChange('gstin')} 
                    placeholder="e.g. 22AAAAA0000A1Z5"
                    maxLength={15}
                  />
                  <HelperText>15-character GST Identification Number</HelperText>
                </FormField>
              )}

              <FormField>
                <Label>Default Tax Rate (%)</Label>
                <NiceSelect
                  value={form.default_tax_rate}
                  onChange={(val) => setForm({ ...form, default_tax_rate: val })}
                  options={[
                    { value: 5, label: '5%' },
                    { value: 18, label: '18%' },
                  ]}
                  placeholder="Select tax rate"
                />
                <HelperText>Applied to items without specific tax rates</HelperText>
              </FormField>

              <FormField>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0' }}>
                  <input 
                    type="checkbox" 
                    id="prices-include-tax" 
                    checked={form.prices_include_tax} 
                    onChange={onChange('prices_include_tax')}
                    style={{ width: 20, height: 20, cursor: 'pointer', accentColor: '#f97316' }}
                  />
                  <label htmlFor="prices-include-tax" style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>
                    Prices Include Tax
                  </label>
                </div>
                <HelperText>Check if menu prices already include tax</HelperText>
              </FormField>
            </SectionBody>
          </SectionCard>

          {/* MODULES CARD (Dynamic Grid) */}
          <SectionCard>
            <SectionHeader>
               <SectionIcon>⚡</SectionIcon>
               <div>
                 <SectionTitle>Power Modules</SectionTitle>
                 <div style={{fontSize: 13, color:'gray', fontWeight:400}}>Enable specific features for your workflow</div>
              </div>
            </SectionHeader>
            <div style={{ padding: 36, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
              
              <FeatureCard 
                 checked={form.features_menu_images_enabled} 
                 onClick={() => setForm(f => ({ ...f, features_menu_images_enabled: !f.features_menu_images_enabled }))}
              >
                 <FeatureIcon active={form.features_menu_images_enabled}>📸</FeatureIcon>
                 <FeatureText>
                    <FeatureTitle>Menu Images</FeatureTitle>
                    <FeatureDesc>Show product photos</FeatureDesc>
                 </FeatureText>
                 <Switch checked={form.features_menu_images_enabled} />
              </FeatureCard>

              <FeatureCard 
                 checked={form.features_credit_enabled}
                 onClick={() => setForm(f => ({ ...f, features_credit_enabled: !f.features_credit_enabled }))}
              >
                 <FeatureIcon active={form.features_credit_enabled}>📒</FeatureIcon>
                 <FeatureText>
                    <FeatureTitle>Credit Ledger</FeatureTitle>
                    <FeatureDesc>Manage customer tabs</FeatureDesc>
                 </FeatureText>
                 <Switch checked={form.features_credit_enabled} />
              </FeatureCard>

              <FeatureCard 
                 checked={form.features_table_ordering_enabled}
                 onClick={() => setForm(f => ({ ...f, features_table_ordering_enabled: !f.features_table_ordering_enabled }))}
              >
                 <FeatureIcon active={form.features_table_ordering_enabled}>🤳</FeatureIcon>
                 <FeatureText>
                    <FeatureTitle>QR Ordering</FeatureTitle>
                    <FeatureDesc>Customers order at table</FeatureDesc>
                 </FeatureText>
                 <Switch checked={form.features_table_ordering_enabled} />
              </FeatureCard>

              <FeatureCard 
                 checked={form.features_inventory_enabled}
                 onClick={() => setForm(f => ({ ...f, features_inventory_enabled: !f.features_inventory_enabled }))}
              >
                 <FeatureIcon active={form.features_inventory_enabled}>📦</FeatureIcon>
                 <FeatureText>
                    <FeatureTitle>Inventory</FeatureTitle>
                    <FeatureDesc>Simple stock tracking</FeatureDesc>
                 </FeatureText>
                 <Switch checked={form.features_inventory_enabled} />
              </FeatureCard>

               <FeatureCard 
                 checked={form.features_production_enabled}
                 onClick={() => setForm(f => ({ ...f, features_production_enabled: !f.features_production_enabled }))}
              >
                 <FeatureIcon active={form.features_production_enabled}>🏭</FeatureIcon>
                 <FeatureText>
                    <FeatureTitle>Production</FeatureTitle>
                    <FeatureDesc>Manufacturing pipeline</FeatureDesc>
                 </FeatureText>
                 <Switch checked={form.features_production_enabled} />
              </FeatureCard>

              <FeatureCard 
                 checked={form.features_counter_send_to_kitchen_enabled}
                 onClick={() => setForm(f => ({ ...f, features_counter_send_to_kitchen_enabled: !f.features_counter_send_to_kitchen_enabled }))}
              >
                 <FeatureIcon active={form.features_counter_send_to_kitchen_enabled}>🍳</FeatureIcon>
                 <FeatureText>
                    <FeatureTitle>Send to Kitchen</FeatureTitle>
                    <FeatureDesc>Forward orders to kitchen</FeatureDesc>
                 </FeatureText>
                 <Switch checked={form.features_counter_send_to_kitchen_enabled} />
              </FeatureCard>

            </div>
          </SectionCard>

          {/* BRANDING CARD */}
          <SectionCard>
             <SectionHeader>
                <SectionIcon>🎨</SectionIcon>
                <div>
                  <SectionTitle>Branding & Assets</SectionTitle>
                  <div style={{fontSize: 13, color:'gray', fontWeight:400}}>Customize your receipts and online presence</div>
                </div>
             </SectionHeader>
             <SectionBody>
               <FormField>
                 <Label>Primary Brand Color</Label>
                 <div style={{ display: 'flex', gap: 16 }}>
                    <Input type="color" value={form.brand_color} onChange={onChange('brand_color')} style={{ width: 80, padding: 4, height: 50, borderRadius: 12, cursor: 'pointer', border: 'none', background:'none' }} />
                    <Input value={form.brand_color} onChange={onChange('brand_color')} style={{ flex: 1 }} />
                 </div>
               </FormField>
               <FormField>
                 <Label>Short Description</Label>
                 <Textarea value={form.description} onChange={onChange('description')} rows={2} placeholder="A short bio about your restaurant..." />
               </FormField>
               
               <PrintLogoField restaurantId={restaurant?.id} supabase={supabase} />
             </SectionBody>
          </SectionCard>
          
          {/* PRINTERS CARD */}
          <SectionCard>
             <SectionHeader>
                <SectionIcon>🖨️</SectionIcon>
                <div>
                   <SectionTitle>Printers & Hardware</SectionTitle>
                   <div style={{fontSize: 13, color:'gray', fontWeight:400}}>Connect thermal printers for receipts</div>
                </div>
             </SectionHeader>
             <div style={{ padding: 36 }}>
                <PrinterSetupCard />
             </div>
          </SectionCard>

          {/* KITCHEN LINK CARD */}
          <SectionCard>
            <SectionHeader>
              <SectionIcon>🖥️</SectionIcon>
               <div>
                   <SectionTitle>Kitchen Display Screen</SectionTitle>
                   <div style={{fontSize: 13, color:'gray', fontWeight:400}}>Use this link on a tablet or screen</div>
                </div>
            </SectionHeader>
            <div style={{ padding: 36 }}>
               <Label style={{marginBottom: 10}}>Kitchen Dashboard URL</Label>
               <div style={{ display: 'flex', gap: 12 }}>
                  <Input readOnly value={`${window.location.origin}/kitchen?rid=${restaurant?.id || ''}`} style={{ background: '#f1f5f9', color: '#64748b', fontFamily:'monospace', fontSize: 13 }} />
                  <ActionButton onClick={(e) => {
                     e.preventDefault();
                     navigator.clipboard.writeText(`${window.location.origin}/kitchen?rid=${restaurant?.id}`);
                     alert('Copied!');
                  }}>Copy</ActionButton>
               </div>
            </div>
          </SectionCard>

        </ContentGrid>

        <SaveBar>
           <ActionButton primary disabled={saving} onClick={save} style={{minWidth: 200, padding: '16px 32px', fontSize: 16, borderRadius: 100, boxShadow: '0 10px 20px -5px rgba(249, 115, 22, 0.4)'}}>
               {saving ? 'Saving...' : '✨ Save Changes'}
           </ActionButton>
        </SaveBar>
      </form>
    </PageContainer>
  );
}
