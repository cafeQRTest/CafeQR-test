// components/VariantSelector.js
// Modal for customers to select product variants when ordering

import React, { useState } from 'react';
import styled from 'styled-components';

export default function VariantSelector({ item, onSelect, onClose, gstEnabled = false, pricesIncludeTax = true, onCartOpen, showImage = true, zIndex }) {
  // Track quantity for each variant (key: variant_id, value: quantity)
  const [variantQuantities, setVariantQuantities] = useState({});
  // Track quantity for each add-on (key: addon_id, value: quantity)
  const [addonQuantities, setAddonQuantities] = useState({});

  const quantityStep = 1;      // change if you want button step like 0.25, etc.
const decimalPlaces = 2;
const minQuantity = 0;
const maxQuantity = 99;

const [variantQtyDrafts, setVariantQtyDrafts] = useState({}); // variantId -> string

const clampQty = (n) => {
  if (!Number.isFinite(n)) return minQuantity;
  let v = Math.max(minQuantity, Math.min(maxQuantity, n));
  return Number(v.toFixed(decimalPlaces));
};

const getDisplayQty = (variantId) => {
  if (variantQtyDrafts[variantId] !== undefined) return variantQtyDrafts[variantId];
  const q = variantQuantities[variantId] || 0;
  return q > 0 ? String(q) : '';
};

const setQtyNumber = (variantId, qty) => {
  const q = clampQty(qty);
  setVariantQuantities(prev => {
    if (q <= 0) {
      const { [variantId]: _, ...rest } = prev;
      return rest;
    }
    return { ...prev, [variantId]: q };
  });
};

const bumpQty = (variantId, dir) => {
  const current = variantQuantities[variantId] || 0;
  setQtyNumber(variantId, current + dir * quantityStep);
};

  const variants = item.variants || [];
  const hasVariants = variants.length > 0;
  const addonGroups = item.addon_groups || [];
  const hasAddons = addonGroups.length > 0;

  // Calculate totals
  const selectedVariants = Object.entries(variantQuantities);
  const selectedAddons = Object.entries(addonQuantities);

  // Total items = variants + base item (if no variants) + addons?
  // Logic: 
  // If hasVariants: user selects variants.
  // If NO hasVariants: user buys base item (quantity?) -> VariantSelector usually implies selecting options. 
  // If NO variants but hasAddons: We need a way to select Base Item Quantity.
  // Current VariantSelector is designed for "One entry per variant".
  // If we have only Upsells, we are essentially adding "Main Item + Upsell A + Upsell B".
  // Let's stick to the pattern:
  // If variants exist: Sum of variants.
  // If NO variants: We need a "Base Item" stepper? 
  //   - Current VariantSelector returns NULL if no variants. 
  //   - We need to enable it for "Just Addons" case.
  //   - For "Just Addons", we act as if the Main Item is selected (qty 1 usually, or we add a main qty stepper).
  //   - Let's simplify: If no variants, we assume 1 Main Item (conceptually) OR we hide main item qty and just let them pick upsells?
  //   - No, if I click "Burger" (no variants) and it has "Fries" upsell. I want "1 Burger + 1 Fries". 
  //   - So I need a main quantity state if no variants.
  
  const [mainQty, setMainQty] = useState(1); // Only used if !hasVariants
  
  const totalItems = (hasVariants 
    ? selectedVariants.reduce((sum, [_, qty]) => sum + qty, 0)
    : mainQty) + selectedAddons.reduce((sum, [_, qty]) => sum + qty, 0);

  const totalPrice = (hasVariants
    ? selectedVariants.reduce((sum, [variantId, qty]) => {
        const variant = variants.find(v => v.variant_id === variantId);
        return sum + (variant?.price || 0) * qty;
      }, 0)
    : (item.price || 0) * mainQty) 
    + selectedAddons.reduce((sum, [addonId, qty]) => {
        // Find addon price
        for (const g of addonGroups) {
          const opt = g.options.find(o => o.id === addonId);
          if (opt) return sum + (opt.price || 0) * qty;
        }
        return sum;
    }, 0);

  const handleAddToCart = () => {
    if (totalItems === 0) return;

    // 1. Add Main Items (Variants or Base)
    if (hasVariants) {
       selectedVariants.forEach(([variantId, qty]) => {
        const variant = variants.find(v => String(v.variant_id) === String(variantId));
        if (variant && qty > 0) {
          onSelect({
            ...item,
            selectedVariant: variant,
            price: variant.price,
            name: `${item.name} (${variant.variant_name})`,
            displayName: `${item.name} (${variant.variant_name})`,
            quantity: qty,
            variant_id: variant.variant_id,
            variant_name: variant.variant_name
          });
        }
      });
    } else {
       // Add Base Item
       if (mainQty > 0) {
         onSelect({
           ...item,
           quantity: mainQty
         });
       }
    }

    // 2. Add Upsells (Separate Items)
    selectedAddons.forEach(([addonId, qty]) => {
       if (qty <= 0) return;
       // Find payload
       let addonOpt = null;
       for (const g of addonGroups) {
         const found = g.options.find(o => o.id === addonId);
         if (found) { addonOpt = found; break; }
       }
       if (addonOpt) {
         // Create a standalone item for the upsell
         onSelect({
           id: addonOpt.id,
           name: addonOpt.name,
           price: addonOpt.price,
           quantity: qty,
           veg: addonOpt.veg, // Assumes passed from OrderPage
           status: 'available',
           is_upsell: true,
           image_url: addonOpt.image_url // Flag to maybe style differently in cart?
         });
       }
    });
    
    onClose();
  };

  if (!hasVariants && !hasAddons) {
    return null;
  }

  const vegIcon = item.veg ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="1" y="1" width="22" height="22" stroke="#16a34a" strokeWidth="2.5" />
      <circle cx="12" cy="12" r="6" fill="#16a34a" />
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="1" y="1" width="22" height="22" stroke="#dc2626" strokeWidth="2.5" />
      <path d="M12 6L18 16H6L12 6Z" fill="#dc2626" />
    </svg>
  );

  // GST Label Logic:
  // 1. If Packaged Good -> NEVER show +GST (always inclusive/hidden).
  // 2. If Not Packaged -> Show ONLY if GST enabled AND Prices Exclude Tax.
  const showGstIndicator = !item.is_packaged_good && gstEnabled && !pricesIncludeTax;
  const gstSuffix = showGstIndicator ? ' +GST' : '';

  return (
    <Overlay onClick={onClose} zIndex={zIndex}>
      <Modal onClick={(e) => e.stopPropagation()}>
        {/* Enhanced Header with Item Details */}
        <Header>
          <HeaderTop>
            <ItemInfo>
              {showImage && item.image_url && (
                <ItemImageWrapper>
                  <ItemImage src={item.image_url} alt={item.name} />
                </ItemImageWrapper>
              )}
              <ItemDetails>
                <ItemNameRow>
                  {vegIcon}
                  <ItemName>{item.name}</ItemName>
                </ItemNameRow>
                {item.description && (
                  <ItemDescription>{item.description}</ItemDescription>
                )}
                <MetaRow>
                  {item.category && (
                    <CategoryBadge>{item.category}</CategoryBadge>
                  )}
                  <BasePrice>Base: ₹{Number(item.price).toFixed(2)}{gstSuffix}</BasePrice>
                </MetaRow>
              </ItemDetails>
            </ItemInfo>
            <CloseButton onClick={onClose}>&times;</CloseButton>
          </HeaderTop>
        </Header>

        <Content>
          {!hasVariants && (
             <div style={{ paddingBottom: 20, borderBottom: '1px solid #f3f4f6', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <div style={{ fontWeight: 600, color: '#374151' }}>Quantity</div>
                   <QuantityControls>
                      <QuantityButton onClick={() => setMainQty(q => Math.max(1, q - 1))} disabled={mainQty <= 1}>−</QuantityButton>
                      <QuantityDisplay>{mainQty}</QuantityDisplay>
                      <QuantityButton onClick={() => setMainQty(q => q + 1)}>+</QuantityButton>
                   </QuantityControls>
                </div>
             </div>
          )}

          <VariantList>
            {variants.map((variant, index) => {
              const quantity = variantQuantities[variant.variant_id] || 0;
              const isSelected = quantity > 0;
              const isDisabled = !variant.is_available;
              
              return (
                <VariantOption
                  key={variant.variant_id}
                  selected={isSelected}
                  disabled={isDisabled}
                  index={index}
                  onClick={() => {
                    if (isDisabled) return;
                    if (quantity === 0) {
                      setQtyNumber(variant.variant_id, 1);
                    } else {
                      setQtyNumber(variant.variant_id, 0);
                    }
                  }}
                  style={{ 
                    cursor: isDisabled ? 'not-allowed' : 'pointer'
                  }}
                >
                  <VariantLeftSection>
                    {/* Selection indicator */}
                    <SelectionCircle selected={isSelected}>
                      {isSelected && <CheckMark>✓</CheckMark>}
                    </SelectionCircle>
                    
                    <VariantDetails>
                      <VariantNameRow>
                        <VariantName>
                          {variant.variant_name}
                        </VariantName>
                        {!variant.is_available && <UnavailableTag>Out of Stock</UnavailableTag>}
                      </VariantNameRow>
                      <PriceRow>
                        <VariantPrice disabled={isDisabled}>
                          ₹{variant.price?.toFixed(2)}
                        </VariantPrice>
                        {/* Only show GST label if global flag allows AND item is NOT packaged */}
                        {showGstIndicator && !isDisabled && (
                          <GstLabel>+GST</GstLabel>
                        )}
                      </PriceRow>
                    </VariantDetails>
                  </VariantLeftSection>
                  
                  {!isDisabled && isSelected && (
                    <VariantRightSection onClick={(e) => e.stopPropagation()}>
                      <QuantityControls>
                        <QuantityButton onClick={() => bumpQty(variant.variant_id, -1)}>−</QuantityButton>

<input
  type="text"
  inputMode="decimal"
  value={getDisplayQty(variant.variant_id)}
  onChange={(e) => {
    const raw = e.target.value.replace(',', '.');
    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      setVariantQtyDrafts(prev => ({ ...prev, [variant.variant_id]: raw }));
    }
  }}
  onBlur={() => {
    const raw = variantQtyDrafts[variant.variant_id];
    if (raw === undefined) return;
    if (raw === '') {
      setQtyNumber(variant.variant_id, 0);
    } else {
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed)) setQtyNumber(variant.variant_id, parsed);
    }
    setVariantQtyDrafts(prev => {
      const { [variant.variant_id]: _, ...rest } = prev;
      return rest;
    });
  }}
  onKeyDown={(e) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setVariantQtyDrafts(prev => {
        const { [variant.variant_id]: _, ...rest } = prev;
        return rest;
      });
      e.currentTarget.blur();
    }
  }}
  style={{ width: 56, textAlign: 'center' }}
/>
                        <QuantityButton onClick={() => bumpQty(variant.variant_id, +1)}>+</QuantityButton>

                      </QuantityControls>
                    </VariantRightSection>
                  )}
                </VariantOption>
              );
            })}
          </VariantList>
          

          </Content>

        {/* Footer with Summary and Add to Cart Button */}
        <Footer>
          <FooterInfo>
            {totalItems > 0 ? (
              <SelectedSummary>
                <SummaryLeft>
                  <TotalItemsLabel>
                    {totalItems} {totalItems === 1 ? 'item' : 'items'} • {selectedVariants.length} {selectedVariants.length === 1 ? 'variant' : 'variants'}
                  </TotalItemsLabel>
                  <SelectedList>
                    {selectedVariants.map(([variantId, qty]) => {
                      const variant = variants.find(v => v.variant_id === variantId);
                      return (
                        <SelectedItem key={variantId}>
                          {qty}× {variant?.variant_name}
                        </SelectedItem>
                      );
                    })}
                  </SelectedList>
                </SummaryLeft>
                <PriceWithGst>
                  <TotalPrice>₹{totalPrice.toFixed(2)}</TotalPrice>
                  {showGstIndicator && <GstNote>+GST</GstNote>}
                </PriceWithGst>
              </SelectedSummary>
            ) : (
              <PlaceholderText>👆 Tap any option to select</PlaceholderText>
            )}
          </FooterInfo>
          <FooterButtons>
            <CancelButton onClick={onClose}>Cancel</CancelButton>
            <AddToCartButton 
              onClick={handleAddToCart} 
              disabled={totalItems === 0}
            >
              {totalItems > 0 
                ? `✓ Add to Cart (${totalItems})` 
                : 'Add to Cart'
              }
            </AddToCartButton>
          </FooterButtons>
        </Footer>
      </Modal>
    </Overlay>
  );
}

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${props => props.zIndex || 9999};
  padding: 20px;
  animation: fadeIn 0.2s ease;

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;

const Modal = styled.div`
  background: white;
  border-radius: 20px;
  width: 100%;
  max-width: 550px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;

  @keyframes slideUp {
    from { 
      opacity: 0;
      transform: translateY(30px) scale(0.95);
    }
    to { 
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
`;

const Header = styled.div`
  padding: 28px 24px 24px;
  border-bottom: 1px solid #f1f5f9;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  position: relative;
  
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, #e2e8f0 50%, transparent);
  }
`;

const HeaderTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
`;

const ItemInfo = styled.div`
  display: flex;
  gap: 18px;
  flex: 1;
  align-items: flex-start;
`;

const ItemImageWrapper = styled.div`
  position: relative;
  flex-shrink: 0;
`;

const ItemImage = styled.img`
  width: 100px;
  height: 100px;
  border-radius: 16px;
  object-fit: cover;
  border: 3px solid #f1f5f9;
  box-shadow: 0 8px 16px rgba(0,0,0,0.1);
`;

const ItemDetails = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ItemNameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ItemName = styled.h2`
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.2;
  letter-spacing: -0.5px;
`;

const ItemDescription = styled.p`
  margin: 0;
  font-size: 14px;
  color: #64748b;
  line-height: 1.6;
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const CategoryBadge = styled.span`
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  color: #475569;
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  padding: 6px 12px;
  border-radius: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border: 1px solid #e2e8f0;
`;

const BasePrice = styled.span`
  font-size: 13px;
  font-weight: 700;
  color: #94a3b8;
`;

const TemplateTitleRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0 0 0;
  border-top: 1px solid #f3f4f6;
  display: none; /* Hidden as per original, or keep it if it was there? Original didn't show it in usage */
`;

const TemplateTitle = styled.h3`
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #374151;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const SelectionBadge = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: var(--brand);
  background: var(--brand-50, #eff6ff);
  padding: 6px 14px;
  border-radius: 999px;
  border: 2px solid var(--brand-200, #bfdbfe);
  animation: pulse 0.3s ease;
  
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 32px;
  color: #cbd5e1;
  cursor: pointer;
  padding: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  transition: all 0.2s;
  flex-shrink: 0;

  &:hover {
    background: #f1f5f9;
    color: #0f172a;
    transform: scale(1.1);
  }
`;

const Content = styled.div`
  padding: 24px;
  flex: 1;
  overflow-y: auto;
  
  &::-webkit-scrollbar {
    width: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: #f8fafc;
    border-radius: 10px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 10px;
    
    &:hover {
      background: #94a3b8;
    }
  }
`;

const VariantList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const VariantOption = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px;
  border: 2px solid ${props => props.selected ? 'var(--brand)' : '#e2e8f0'};
  border-radius: 14px;
  background: ${props => {
    if (props.disabled) return '#fafafa';
    if (props.selected) return 'linear-gradient(135deg, var(--brand-50, #eff6ff) 0%, #ffffff 100%)';
    return 'white';
  }};
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: ${props => props.disabled ? 0.5 : 1};
  box-shadow: ${props => props.selected ? '0 8px 16px rgba(0,0,0,0.08)' : '0 2px 4px rgba(0,0,0,0.04)'};
  
  &:hover {
    ${props => !props.disabled && !props.selected && `
      border-color: #cbd5e1;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      transform: translateY(-2px);
    `}
  }
`;

const Footer = styled.div`
  padding: 20px 24px;
  border-top: 1px solid #f1f5f9;
  background: linear-gradient(to top, #ffffff, #fafafa);
  box-shadow: 0 -4px 12px rgba(0,0,0,0.03);
`;

const FooterInfo = styled.div`
  margin-bottom: 16px;
`;

const SelectedSummary = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 12px;
  border: 1px solid #e2e8f0;
`;

const TotalPrice = styled.div`
  font-size: 28px;
  font-weight: 800;
  color: var(--brand);
  letter-spacing: -0.5px;
`;

const AddToCartButton = styled.button`
  width: 100%;
  padding: 12px;
  background: ${props => props.disabled ? '#e2e8f0' : 'var(--brand)'};
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  text-transform: uppercase;
  letter-spacing: 0.3px;
`;

const VariantLeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
`;

const SelectionCircle = styled.div`
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2.5px solid ${props => props.selected ? 'var(--brand)' : '#d1d5db'};
  background: ${props => props.selected ? 'var(--brand)' : 'white'};
  display: flex;
  align-items: center;
  justifyContent: center;
  flex-shrink: 0;
  transition: all 0.2s;
  box-shadow: ${props => props.selected ? '0 2px 8px rgba(0,0,0,0.15)' : 'none'};
`;

const CheckMark = styled.span`
  color: white;
  font-size: 13px;
  font-weight: 700;
  animation: checkPop 0.3s ease;
  
  @keyframes checkPop {
    0% { transform: scale(0); }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); }
  }
`;

const VariantRightSection = styled.div`
  flex-shrink: 0;
`;

const QuickAddButton = styled.button`
  padding: 8px 20px;
  background: linear-gradient(135deg, var(--brand) 0%, var(--brand-600, #2563eb) 100%);
  color: white;
  border: none;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  min-width: 70px;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0,0,0,0.2);
  }
  
  &:active {
    transform: translateY(0);
  }
`;

const VariantDetails = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const VariantNameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const VariantName = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  `;

const PriceRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const UnavailableTag = styled.span`
  font-size: 10px;
  font-weight: 700;
  color: #dc2626;
  background: #fee2e2;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid #fecaca;
`;

const VariantPrice = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${props => props.disabled ? '#9ca3af' : '#374151'};
  text-decoration: ${props => props.disabled ? 'line-through' : 'none'};
`;

const GstLabel = styled.span`
  font-size: 10px;
  font-weight: 700;
  color: #f97316;
  background: #fff7ed;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #fed7aa;
`;

const QuantityControls = styled.div`
  display: flex;
  align-items: center;
  gap: 0;
  border: 2px solid var(--brand);
  border-radius: 8px;
  overflow: hidden;
  background: white;
`;

const QuantityButton = styled.button`
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: ${props => props.disabled ? '#f9fafb' : 'white'};
  color: ${props => props.disabled ? '#d1d5db' : 'var(--brand)'};
  font-size: 18px;
  font-weight: 600;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.2s;
  
  &:hover {
    ${props => !props.disabled && `
      background: var(--brand-50, #eff6ff);
    `}
  }
  
  &:active {
    ${props => !props.disabled && `
      transform: scale(0.95);
    `}
  }
`;

const QuantityDisplay = styled.div`
  min-width: 38px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  border-left: 2px solid #e5e7eb;
  border-right: 2px solid #e5e7eb;
  background: #fafafa;
`;


const SummaryLeft = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TotalItemsLabel = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: #111827;
`;

const SelectedList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const SelectedItem = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: var(--brand);
  background: var(--brand-50, #eff6ff);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--brand-200, #bfdbfe);
`;

const PriceWithGst = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
`;

const GstNote = styled.span`
  font-size: 11px;
  font-weight: 700;
  color: var(--brand);
  background: var(--brand-50, #eff6ff);
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--brand-200, #bfdbfe);
`;

const PlaceholderText = styled.div`
  font-size: 15px;
  color: #9ca3af;
  text-align: center;
`;

const FooterButtons = styled.div`
  display: flex;
  gap: 12px;
`;

const CancelButton = styled.button`
  flex: 1;
  padding: 12px;
  background: white;
  color: #6b7280;
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  font-size: 14px;
  fontWeight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #ecfdf5;
    border-color: #a7f3d0;
    color: #059669;
  }
`;
