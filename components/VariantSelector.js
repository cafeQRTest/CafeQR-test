// components/VariantSelector.js
// Modal for customers to select product variants when ordering

import React, { useState } from 'react';
import styled from 'styled-components';

export default function VariantSelector({ item, onSelect, onClose, gstEnabled = false, pricesIncludeTax = true, onCartOpen, showImage = true }) {
  // Track quantity for each variant (key: variant_id, value: quantity)
  const [variantQuantities, setVariantQuantities] = useState({});

  const variants = item.variants || [];
  const hasVariants = variants.length > 0;

  // Get variant template name (e.g., "Size", "Portion")
  const templateName = item.variant_template_name || "Options";

  // Update quantity for a specific variant
  const updateVariantQuantity = (variantId, delta) => {
    setVariantQuantities(prev => {
      const currentQty = prev[variantId] || 0;
      const newQty = Math.max(0, Math.min(99, currentQty + delta));
      
      if (newQty === 0) {
        const { [variantId]: removed, ...rest } = prev;
        return rest;
      }
      
      return { ...prev, [variantId]: newQty };
    });
  };

  // Calculate totals
  const selectedVariants = Object.entries(variantQuantities);
  const totalItems = selectedVariants.reduce((sum, [_, qty]) => sum + qty, 0);
  const totalPrice = selectedVariants.reduce((sum, [variantId, qty]) => {
    const variant = variants.find(v => v.variant_id === variantId);
    return sum + (variant?.price || 0) * qty;
  }, 0);

  const handleAddToCart = () => {
    if (selectedVariants.length === 0) return;

    // Add each selected variant with its quantity to cart
    selectedVariants.forEach(([variantId, qty]) => {
      const variant = variants.find(v => v.variant_id === variantId);
      if (variant) {
        onSelect({
          ...item,
          selectedVariant: variant,
          price: variant.price,
          displayName: `${item.name} (${variant.variant_name})`,
          quantity: qty
        });
      }
    });
    
    onClose();
    
    // Open cart drawer after adding
    if (onCartOpen) {
      setTimeout(() => onCartOpen(), 100);
    }
  };

  if (!hasVariants) {
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

  const showGstIndicator = gstEnabled && !pricesIncludeTax;
  const gstSuffix = showGstIndicator ? ' +GST' : '';

  return (
    <Overlay onClick={onClose}>
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
                    if (!isDisabled && quantity === 0) {
                      updateVariantQuantity(variant.variant_id, 1);
                    }
                  }}
                  style={{ 
                    cursor: isDisabled ? 'not-allowed' : (quantity === 0 ? 'pointer' : 'default')
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
                        {showGstIndicator && !isDisabled && (
                          <GstLabel>+GST</GstLabel>
                        )}
                      </PriceRow>
                    </VariantDetails>
                  </VariantLeftSection>
                  
                  {!isDisabled && isSelected && (
                    <VariantRightSection onClick={(e) => e.stopPropagation()}>
                      <QuantityControls>
                        <QuantityButton 
                          onClick={() => updateVariantQuantity(variant.variant_id, -1)}
                        >
                          −
                        </QuantityButton>
                        <QuantityDisplay>{quantity}</QuantityDisplay>
                        <QuantityButton 
                          onClick={() => updateVariantQuantity(variant.variant_id, 1)}
                          disabled={quantity >= 99}
                        >
                          +
                        </QuantityButton>
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
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  animation: fadeIn 0.2s ease;
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;

const Modal = styled.div`
  background: white;
  border-radius: 16px;
  max-width: 650px;
  width: 100%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  animation: slideUp 0.3s ease;
  
  @keyframes slideUp {
    from { 
      opacity: 0;
      transform: translateY(20px);
    }
    to { 
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const Header = styled.div`
  padding: 24px;
  border-bottom: 1px solid #f3f4f6;
  background: linear-gradient(to bottom, #ffffff, #fafafa);
`;

const HeaderTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
`;

const ItemInfo = styled.div`
  display: flex;
  gap: 16px;
  flex: 1;
  align-items: flex-start;
`;

const ItemImageWrapper = styled.div`
  position: relative;
  flex-shrink: 0;
`;

const ItemImage = styled.img`
  width: 90px;
  height: 90px;
  border-radius: 14px;
  object-fit: cover;
  border: 3px solid #f3f4f6;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
`;

const ItemDetails = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ItemNameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const ItemName = styled.h2`
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  line-height: 1.2;
`;

const ItemDescription = styled.p`
  margin: 0;
  font-size: 14px;
  color: #6b7280;
  line-height: 1.5;
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const CategoryBadge = styled.span`
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  background: #f3f4f6;
  padding: 5px 12px;
  border-radius: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const BasePrice = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
`;

const TemplateTitleRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0 0 0;
  border-top: 1px solid #f3f4f6;
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
  color: #9ca3af;
  cursor: pointer;
  padding: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
  flex-shrink: 0;

  &:hover {
    background: #f3f4f6;
    color: #111827;
  }
`;

const Content = styled.div`
  padding: 24px;
  flex: 1;
  overflow-y: auto;
`;

const InstructionText = styled.div`
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: #f9fafb;
  border-radius: 10px;
  border-left: 3px solid var(--brand);
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
  padding: 14px 16px;
  border: 2px solid ${props => props.selected ? 'var(--brand)' : '#e5e7eb'};
  border-radius: 10px;
  background: ${props => {
    if (props.disabled) return '#fafafa';
    if (props.selected) return 'linear-gradient(135deg, var(--brand-50, #eff6ff) 0%, #ffffff 100%)';
    return 'white';
  }};
  transition: all 0.2s;
  opacity: ${props => props.disabled ? 0.5 : 1};
  box-shadow: ${props => props.selected ? '0 4px 12px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.05)'};
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

const Footer = styled.div`
  padding: 20px 24px;
  border-top: 2px solid #f3f4f6;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const FooterInfo = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  background: white;
  border-radius: 12px;
  border: 2px solid #e5e7eb;
  min-height: 60px;
`;

const SelectedSummary = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 16px;
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
  align-items: center;
  gap: 8px;
`;

const TotalPrice = styled.div`
  font-size: 22px;
  font-weight: 700;
  color: var(--brand);
`;

const GstNote = styled.span`
  font-size: 11px;
  font-weight: 700;
  color: #f97316;
  background: #fff7ed;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid #fed7aa;
`;

const PlaceholderText = styled.div`
  font-size: 14px;
  color: #9ca3af;
  font-style: italic;
  text-align: center;
  width: 100%;
`;

const FooterButtons = styled.div`
  display: flex;
  gap: 12px;
`;

const CancelButton = styled.button`
  flex: 1;
  padding: 14px;
  border: 2px solid #e5e7eb;
  background: white;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }
`;

const AddToCartButton = styled.button`
  flex: 2;
  padding: 14px;
  border: none;
  background: ${props => props.disabled ? '#e5e7eb' : 'linear-gradient(135deg, var(--brand) 0%, var(--brand-600, #2563eb) 100%)'};
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
  color: white;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.2s;
  box-shadow: ${props => props.disabled ? 'none' : '0 4px 12px rgba(0,0,0,0.15)'};

  &:hover {
    ${props => !props.disabled && `
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(0,0,0,0.2);
    `}
  }
  
  &:active {
    ${props => !props.disabled && `
      transform: translateY(0);
    `}
  }
`;
