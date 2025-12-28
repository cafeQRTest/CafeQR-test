//pages/owner/settings.js - "Best" Dynamic AI Structure + Brand Orange Theme

import React, { useEffect, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { getSupabase } from '../../services/supabase';
import UomManager from "../../components/UomManager";
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
  width: min(100%, 1100px);
  max-width: 1000px;
  margin: 0 auto;
  margin-inline: auto;
  padding: 60px 24px 160px;
  padding-inline: clamp(12px, 2vw, 28px);
  padding-block: clamp(20px, 4vw, 60px);
  padding-bottom: calc(clamp(110px, 14vw, 170px) + env(safe-area-inset-bottom, 0px));
  font-family: 'DM Sans', 'Inter', sans-serif;
  color: #1f2937;
  background-color: #f8fafc;
  min-height: 100dvh;
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
  font-size: clamp(24px, 4vw, 40px);
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.03em;
  margin: 0 0 clamp(10px, 1.5vw, 16px) 0;
  /* Orange Gradient Text */
  background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
`;

const Subtitle = styled.p`
  font-size: clamp(14px, 1.6vw, 17px);
  color: #64748b;
  margin: 0 auto;
  max-width: 60ch;
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
  padding: clamp(16px, 2.5vw, 28px) clamp(16px, 3vw, 36px);
  border-bottom: 1px solid #fff7ed;
  display: flex;
  align-items: center;
  gap: 20px;
  background: linear-gradient(to right, #ffffff, #fff7ed); /* Warm fade */
  @media (max-width: 412px) {
    gap: 12px;
    padding: 14px 14px;
  }
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
  @media (max-width: 412px) {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    font-size: 20px;
  }
`;

const SectionTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: #0f172a;
  letter-spacing: -0.01em;
`;

const SectionBody = styled.div`
  padding: clamp(16px, 3vw, 36px);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); /* key change */
  gap: clamp(14px, 2.5vw, 36px);

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    padding: 24px;
    gap: 24px;
  }

  @media (max-width: 360px) {
    padding: 14px;
  }
`;

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0; /* guard against overflow in grids/flex parents */
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
  width: 100%;
  max-width: 100%;
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
  width: 100%;
  max-width: 100%;
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
  width: 100%;
  max-width: 100%;

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
  gap: 12px;
  flex-wrap: wrap;               /* allow wrap under 340-360px */
  background-color: #ffffff;
  border: 1px solid #f1f5f9;
  border-radius: 20px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
  @media (max-width: 360px) {
    padding: 16px;
  }

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
  min-width: 0;                  /* IMPORTANT: allow shrink */
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FeatureTitle = styled.div`
  font-weight: 700;
  font-size: 16px;
  color: #0f172a;
  overflow-wrap: anywhere;        /* long words/emails won’t overflow */
`;

const FeatureDesc = styled.div`
  font-size: 14px;
  color: #64748b;
  line-height: 1.5;
  overflow-wrap: anywhere;
`;

const Switch = styled.div`
  position: relative;
  width: 52px;
  height: 30px;
  background: ${props => props.checked ? '#f97316' : '#e2e8f0'}; /* Orange Active */
  border-radius: 999px;
  transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  flex-shrink: 0;
  margin-left: 0;                /* remove forced spacing */

  @media (max-width: 360px) {
    transform: scale(0.92);
    transform-origin: right center;
  }  box-shadow: inset 0 2px 4px rgba(0,0,0,0.06);

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
  @media (max-width: 412px) {
    width: 100%;
    padding: 12px 16px;
  }

  @media (max-width: 360px) {
    font-size: 14px;
    padding: 11px 14px;
  }
  
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
  left: 50%;
  transform: translateX(-50%);
  bottom: 40px;
  z-index: 100;
  width: auto;

  @media (max-width: 412px) {
    left: 0;
    right: 0;
    transform: none;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    width: 100%;
    padding: 0 12px;
    box-sizing: border-box;
  }
`;

const SaveBtn = styled(ActionButton)`
  width: min(100%, 420px);
  pointer-events: auto;

  @media (max-width: 412px) {
    width: 100%;
  }
`;

const Toast = styled.div`
  position: fixed;
  bottom: 50px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;

  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  padding: 16px 28px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;

  /* Replace min-width: 340px */
  min-width: 0;
  max-width: min(520px, calc(100vw - 24px));
  width: max-content;

  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;

  @media (max-width: 412px) {
    left: 12px;
    right: 12px;
    transform: none;
    width: auto;                 /* now controlled by left/right */
    padding: 14px 14px;
  }
`;

const Row = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
  width: 100%;

  /* Critical: allow wrapping on tiny widths */
  flex-wrap: wrap;

  & > * {
    min-width: 0; /* allow children to shrink */
  }

  @media (max-width: 360px) {
    gap: 10px;
  }
`;

const ColorSwatch = styled(Input)`
  width: 80px;
  padding: 4px;
  height: 50px;
  border-radius: 12px;
  cursor: pointer;
  border: none;
  background: none;

  @media (max-width: 360px) {
    width: 64px;
    height: 46px;
  }
`;

const FlexInput = styled(Input)`
  flex: 1;
  min-width: 0; /* key for flex overflow on narrow screens */
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

const UrlRow = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  flex-wrap: wrap;

  & > * { min-width: 0; }

  @media (max-width: 412px) {
    gap: 10px;
  }
`;

const UrlInput = styled(Input)`
  flex: 1;
  min-width: 0;
  background: #f1f5f9;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;

  @media (max-width: 360px) {
    font-size: 12px;
  }
`;

const CopyBtn = styled(ActionButton)`
  flex: 0 0 auto;

  @media (max-width: 412px) {
    width: 100%;
  }
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
  const { restaurant, loading: loadingRestaurant, refresh } = useRestaurant();
  const { refresh: refreshSubscription } = useSubscription();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showUomManager, setShowUomManager] = useState(false);
  const [defaultUomName, setDefaultUomName] = useState(null);
  const [localRestaurantId, setLocalRestaurantId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [form, setForm] = useState({
    legal_name: '', restaurant_name: '', phone: '', support_email: '',
    shipping_address_line1: '', shipping_address_line2: '', shipping_city: '', shipping_state: '', shipping_pincode: '',
    tables_count: 0, table_prefix: 'T', upi_id: '',
    features_credit_enabled: false, features_menu_images_enabled: false,
    features_table_ordering_enabled: false, features_inventory_enabled: false,
    features_production_enabled: false, features_counter_send_to_kitchen_enabled: true,
    swiggy_enabled: false, zomato_enabled: false,
    brand_color: '#f97316', description: '', instagram_handle: '', website_url: '',
    gst_enabled: false, gstin: '', fssai_license: '', default_tax_rate: 5, prices_include_tax: false,
    swiggy_api_key: '', swiggy_api_secret: '', swiggy_webhook_secret: '',
    zomato_api_key: '', zomato_api_secret: '', zomato_webhook_secret: '',
    delivery_radius_km: 10,
    owner_lat: '',
    owner_lng: '',

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
    fetchRestaurant();
  }, [supabase]);

  const fetchRestaurant = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/login';
        return;
      }
      
      const { data, error } = await supabase
        .from('restaurants')
        .select('*, default_uom:unit_of_measures!default_uom_id(name)')
        .eq('owner_email', user.email)
        .single();
        
      if (error) throw error;
      if (data) {
        setLocalRestaurantId(data.id);
        if (data.default_uom) {
             // Handle both object (single relation) and array (if misconfigured)
             const uomName = Array.isArray(data.default_uom) ? data.default_uom[0]?.name : data.default_uom.name;
             setDefaultUomName(uomName);
        } else {
             setDefaultUomName(null);
        }
        
        // Pre-fill form - this part is handled by the existing useEffect below
        // setForm({
        //   id: data.id,
        //   name: data.name || '',
        //   phone: data.phone || '',
        //   address: data.address || '',
        //   upi_id: data.upi_id || '',
        //   logo_url: data.logo_url || '',
        //   tables_count: data.tables_count || 10,
        //   table_prefix: data.table_prefix || '',
        //   owner_lat: data.owner_lat || '',
        //   owner_lng: data.owner_lng || '',
        //   theme_color: data.theme_color || '#f97316',
        //   gst_enabled: data.gst_enabled || false,
        //   gstin: data.gstin || '',
        //   default_tax_rate: data.default_tax_rate || 0,
        //   fssai_cert_number: data.fssai_cert_number || '', // Added
        //   business_legal_name: data.business_legal_name || '', // Added
        //   printer_name: data.printer_name || 'POS-80', // Added printer defaults
        //   printer_ip: data.printer_ip || '192.168.1.100',
        //   printer_width: data.printer_width || 80,
        //   features_menu_images_enabled: !!data.features_menu_images_enabled, // ensure boolean
        // });
        // setOriginalTables(data.tables_count);
        
        // Set images
        // if (data.logo_url) setLogoPreview(data.logo_url);
      }
    } catch (err) {
      console.error(err);
      // alert('Error loading settings');
    }
  };
  useEffect(() => {
   if (!restaurant?.id || !supabase) return;
    async function load() {
      setLoading(true);
      try {
        const { data: profile } = await supabase.from('restaurant_profiles').select('*').eq('restaurant_id', restaurant.id).maybeSingle();
        if (profile) {
          setForm(prev => ({
            ...prev, ...profile,
            shipping_address_line1: profile.shipping_address_line1 || '',
            shipping_address_line2: profile.shipping_address_line2 || '',
            shipping_city: profile.shipping_city || '',
            shipping_state: profile.shipping_state || '',
            shipping_pincode: profile.shipping_pincode || '',
            gst_enabled: !!profile.gst_enabled,
            gstin: profile.gstin || '',
            fssai_license: profile.fssai_license || '',
            prices_include_tax: !!profile.prices_include_tax,
            default_tax_rate: profile.default_tax_rate ?? 5,
            features_production_enabled: !!profile.features_production_enabled,
            features_credit_enabled: !!profile.features_credit_enabled,
            features_menu_images_enabled: !!profile.features_menu_images_enabled,
            features_table_ordering_enabled: !!profile.features_table_ordering_enabled,
            features_inventory_enabled: !!profile.features_inventory_enabled,
            features_counter_send_to_kitchen_enabled: profile.features_counter_send_to_kitchen_enabled !== false,
            swiggy_enabled: !!(profile.swiggy_api_key), zomato_enabled: !!(profile.zomato_api_key),
            delivery_radius_km: profile.delivery_radius_km ?? 10,
            owner_lat: profile.location ? profile.location.coordinates?.[1] ?? '' : '',
            owner_lng: profile.location ? profile.location.coordinates?.[0] ?? '' : '',

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
      if (!form.fssai_license) throw new Error("FSSAI License Number is required");
      
      const payload = {
          restaurant_id: restaurant.id,
          legal_name: form.legal_name,
          phone: form.phone,
          support_email: form.support_email,
          shipping_address_line1: form.shipping_address_line1,
          shipping_address_line2: form.shipping_address_line2,
          shipping_city: form.shipping_city,
          shipping_state: form.shipping_state,
          shipping_pincode: form.shipping_pincode,
          tables_count: Number(form.tables_count),
          table_prefix: form.table_prefix,
          upi_id: form.upi_id,
          gst_enabled: form.gst_enabled,
          gstin: form.gstin,
          fssai_license: form.fssai_license,
          prices_include_tax: form.prices_include_tax,
          default_tax_rate: Number(form.default_tax_rate),
          brand_color: form.brand_color,
          description: form.description,
          instagram_handle: form.instagram_handle,
          website_url: form.website_url,
          delivery_radius_km: Number(form.delivery_radius_km || 10),
          location: (form.owner_lat && form.owner_lng)
          ? `SRID=4326;POINT(${Number(form.owner_lng)} ${Number(form.owner_lat)})`
          : null,

          
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
      
      // Refresh the context to update sidebar features immediately
      refresh();
      
      // AUTO-SEND QR EMAIL IF TABLES INCREASED
      const prevCount = originalTables;
      const newCount = payload.tables_count;
      
      if (newCount > prevCount) {
        try {
          // Generate new QR codes
          const origin = window.location.origin;
          const newQrCodes = [];
          for (let i = prevCount + 1; i <= newCount; i++) {
            newQrCodes.push({
              tableNumber: String(i),
              qrUrl: `${origin}/menu/${restaurant.id}?table=${i}`
            });
          }
          
          if (newQrCodes.length > 0) {
            // Prepare recipient data
            // Use support email if available, else try restaurant owner email if available in context
            const recipientEmail = form.support_email || restaurant.owner_email; 
            
            const restaurantData = {
              restaurantName: form.restaurant_name,
              recipientName: form.legal_name,
              recipientPhone: form.phone,
              email: recipientEmail,
              address: [
                 form.shipping_address_line1, 
                 form.shipping_address_line2, 
                 form.shipping_city, 
                 form.shipping_state, 
                 form.shipping_pincode
              ].filter(Boolean).join(', ')
            };

            // Call API
            fetch('/api/send-qr-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                qrCodes: newQrCodes,
                restaurantData,
                isIncremental: true
              })
            })
            .then(res => res.json())
            .then(d => {
              if (d.success) console.log('QR Email sent successfully');
              else console.warn('QR Email failed', d.error);
            })
            .catch(e => console.error('QR Email exception', e));
          }
        } catch (qrErr) {
          console.error('Error triggering QR email', qrErr);
        }
      }

      setOriginalTables(payload.tables_count);
      setSuccess("Settings Saved");
      if (newCount > prevCount) setSuccess("Settings Saved & QR Codes Emailed!");
      setShowToast(true);
      setTimeout(refreshSubscription, 500);
    } catch (err) { setError(err.message); setShowToast(true); }
    finally { setSaving(false); }
  }

  if (loading) return <div style={{padding:80, textAlign:'center'}}>Loading settings...</div>;


  return (
    <>
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
                <Label>FSSAI License Number <Required>*</Required></Label>
                <Input 
                  value={form.fssai_license} 
                  onChange={onChange('fssai_license')} 
                  placeholder="e.g. 12345678901234"
                  maxLength={14}
                  required
                />
                <HelperText>14-digit FSSAI License Number (mandatory for food businesses)</HelperText>
              </FormField>
              <FormField span={2}>
                <Label>Address Line 1</Label>
                <Input value={form.shipping_address_line1} onChange={onChange('shipping_address_line1')} placeholder="Street address, building name..." />
              </FormField>
              <FormField span={2}>
                <Label>Address Line 2</Label>
                <Input value={form.shipping_address_line2} onChange={onChange('shipping_address_line2')} placeholder="Apartment, suite, unit..." />
              </FormField>
              <FormField>
                <Label>City</Label>
                <Input value={form.shipping_city} onChange={onChange('shipping_city')} placeholder="City" />
              </FormField>
              <FormField>
                <Label>State</Label>
                <Input value={form.shipping_state} onChange={onChange('shipping_state')} placeholder="State" />
              </FormField>
              <FormField>
                <Label>Pincode</Label>
                <Input value={form.shipping_pincode} onChange={onChange('shipping_pincode')} placeholder="Pincode" maxLength={6} />
              </FormField>
            </SectionBody>

  <SectionHeader>
    <SectionIcon>📍</SectionIcon>
    <div>
      <SectionTitle>Delivery Location</SectionTitle>
      <div style={{ fontSize: 13, color: 'gray', fontWeight: 400 }}>
        Used to show your restaurant to customers nearby
      </div>
    </div>
  </SectionHeader>

  <SectionBody>
    <FormField>
      <Label>Delivery radius (km)</Label>
      <Input
        type="number"
        min="1"
        max="50"
        value={form.delivery_radius_km}
        onChange={onChange('delivery_radius_km')}
      />
      <HelperText>Customers will see you within this radius.</HelperText>
    </FormField>

    <FormField>
      <Label>Latitude</Label>
      <Input value={form.owner_lat} onChange={onChange('owner_lat')} placeholder="e.g. 12.9716" />
    </FormField>

    <FormField>
      <Label>Longitude</Label>
      <Input value={form.owner_lng} onChange={onChange('owner_lng')} placeholder="e.g. 77.5946" />
    </FormField>

    <FormField span={2}>
      <ActionButton
        type="button"
        primary
        onClick={() => {
          if (!navigator.geolocation) return alert('Geolocation not supported')
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setForm(f => ({
                ...f,
                owner_lat: String(pos.coords.latitude),
                owner_lng: String(pos.coords.longitude)
              }))
            },
            (err) => alert(err.message),
            { enableHighAccuracy: true, timeout: 10000 }
          )
        }}
      >
        Use current location
      </ActionButton>
    </FormField>
  </SectionBody>


          </SectionCard>

          {/* UNITS CARD */}
          <SectionCard>
            <SectionHeader>
              <SectionIcon>📏</SectionIcon>
              <div>
                 <SectionTitle>UOM Management</SectionTitle>
                 <div style={{fontSize: 13, color:'gray', fontWeight:400}}>Manage measurement units and product quantity defaults</div>
              </div>
            </SectionHeader>
            <SectionBody>
               <FormField span={2}>
                  <div style={{
                     display:'flex', alignItems:'center', justifyContent:'space-between',
                     padding: '24px 28px', 
                     background: '#ffffff', 
                     border: '1px solid #e2e8f0', 
                     borderRadius: '16px',
                     boxShadow: '0 2px 4px rgba(15, 23, 42, 0.03)'
                  }}>
                     <div style={{flex:1, display:'flex', alignItems:'center', gap:16}}>
                        <div style={{fontWeight:600, color:'#0f172a', fontSize:16}}>
                          Units & Defaults
                        </div>
                        
                        <div style={{height: 24, width: 1, background: '#e2e8f0'}}></div>

                        {defaultUomName ? (
                            <div style={{
                                display:'flex', alignItems:'center', gap:6,
                                background: '#f8fafc',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0'
                            }}>
                                <span style={{fontSize:13, fontWeight:500, color:'#64748b'}}>Default:</span>
                                <span style={{fontSize:14, fontWeight:600, color:'#0f172a'}}>
                                  {defaultUomName}
                                </span>
                            </div>
                        ) : (
                            <div style={{
                                background:'#fff7ed', color:'#c2410c', 
                                padding:'6px 14px', borderRadius:'8px', 
                                border:'1px solid #ffedd5', fontSize:13, fontWeight:600
                            }}>
                                Setup Required
                            </div>
                        )}
                     </div>
                     <button 
                        type="button" 
                        onClick={(e) => { 
                          e.preventDefault(); 
                          e.stopPropagation();
                          setShowUomManager(true); 
                        }} 
                        style={{
                           padding:'8px 20px', 
                           fontSize:14, 
                           fontWeight:600, 
                           height:'40px', 
                           background:'white', 
                           color:'#0f172a', 
                           border:'1px solid #cbd5e1', 
                           boxShadow:'0 1px 2px rgba(0,0,0,0.05)',
                           borderRadius: '8px',
                           cursor: 'pointer'
                        }}
                     >
                        Manage
                     </button>
                  </div>
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
               {/* OPERATIONS CARD */}
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

              {form.gst_enabled && (
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
              )}

              {form.gst_enabled && (
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
              )}
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
            <SectionBody>
              
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

            </SectionBody>
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
  <Row>
    <ColorSwatch type="color" value={form.brand_color} onChange={onChange('brand_color')} />
    <FlexInput value={form.brand_color} onChange={onChange('brand_color')} />
  </Row>
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
               <UrlRow>
  <UrlInput readOnly value={`${window.location.origin}/kitchen?rid=${restaurant?.id || ''}`} />
  <CopyBtn onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(`${window.location.origin}/kitchen?rid=${restaurant?.id}`); alert('Copied!'); }}>
    Copy
  </CopyBtn>
</UrlRow>

            </div>
          </SectionCard>

        </ContentGrid>

        <SaveBar>
          <SaveBtn
            primary
            disabled={saving}
            onClick={save}
            style={{
              padding: '16px 32px',
              fontSize: 16,
              borderRadius: 100,
              boxShadow: '0 10px 20px -5px rgba(249, 115, 22, 0.4)',
            }}
          >
            {saving ? 'Saving...' : '✨ Save Changes'}
          </SaveBtn>
        </SaveBar>


      </form>
    </PageContainer>

    {showUomManager && (
      <UomManager 
        restaurantId={localRestaurantId || restaurant?.id}
        onClose={() => {
            setShowUomManager(false);
        }}
        onSaved={() => {
            fetchRestaurant(); 
        }}
      />
    )}
    </>
  );
}
