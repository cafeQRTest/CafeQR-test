// components/CreateOrderModal.js - Premium Reusable Order Creation Modal
// Features: Vertical category carousel, customer details, dynamic cart

import React, { useState, useMemo, useRef, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { getSupabase } from '../services/supabase';
import { useAlert } from '../context/AlertContext';
import { useAvailableMenuItems } from '../hooks/useMenuItems';
import { useUpdateTableStatus } from '../hooks/useTables';
import { useRestaurant } from '../context/RestaurantContext';
import { useQueryClient } from '@tanstack/react-query';
import { useAllCustomers, useCreditCustomers, useRestaurantProfileConfig, orderKeys } from '../hooks/useCreateOrderData';
import { calculateOrderTotals } from '../utils/orderCalculations';
import { round2, roundP, normalizeQty, formatQty2, formatQtyP } from '../lib/qty';
import VariantSelector from './VariantSelector';
import DiscountModal from './DiscountModal';
import NiceSelect from './NiceSelect';
import PremiumTimeSelect from './PremiumTimeSelect';

const supabase = getSupabase();

// Animations
const fadeIn = keyframes`
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
`;

const slideIn = keyframes`
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

// Styled Components - Modern Premium Design
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 41, 59, 0.9) 100%);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${fadeIn} 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  padding: 20px;

  @media (max-width: 640px) {
    padding: 0;
  }
`;

const Container = styled.div`
  width: 100%;
  max-width: 1600px;
  height: 98vh;
  background: white;
  border-radius: 32px;
  box-shadow: 
    0 0 0 1px rgba(0, 0, 0, 0.05),
    0 10px 40px -10px rgba(0, 0, 0, 0.2),
    0 0 100px -20px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  position: relative;
  animation: ${fadeIn} 0.5s cubic-bezier(0.16, 1, 0.3, 1);

  @media (max-width: 640px) {
    height: 100vh;
    border-radius: 0;
    max-width: 100%;
  }
`;

const Header = styled.div`
  padding: 18px 28px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  flex-shrink: 0;
  position: relative;
  z-index: 100;
  border-top-left-radius: 32px;
  border-top-right-radius: 32px;

  @media (max-width: 640px) {
    padding: 14px 18px;
  }
`;

const Title = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  z-index: 10;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  backdrop-filter: blur(8px);
  border: 1.5px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 1000;
    color: #ffffff;
    letter-spacing: -0.04em;
    line-height: 1;
    text-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }

  p {
    margin: 0;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.9);
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 1.2px;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: #ffffff;
  font-size: 32px;
  font-weight: 300;
  cursor: pointer;
  padding: 8px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  z-index: 10;
  opacity: 0.7;

  &:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    transform: rotate(90deg);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const Content = styled.div`
  flex: 1;
  overflow: hidden;
  display: grid;
  grid-template-columns: 1fr 420px;
  gap: 0;
  position: relative;
  background: #f1f5f9;

  @media (max-width: 1400px) {
    grid-template-columns: 1fr 380px;
  }

  @media (max-width: 1200px) {
    grid-template-columns: 1fr 340px;
  }

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

// Left Sidebar - Filters & Categories
const MenuSection = styled.div`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(180deg, #ffffff 0%, #fafbfc 100%);

  @media (max-width: 1024px) {
    border-right: none;
  }
`;

const SearchFilterBar = styled.div`
  padding: 12px 20px;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  gap: 12px;
  flex-shrink: 0;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
  }
`;

const SearchBox = styled.div`
  flex: 1;
  position: relative;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,0.03));

  input {
    width: 100%;
    padding: 16px 20px 16px 52px;
    border: 2px solid transparent;
    border-radius: 18px;
    font-size: 15px;
    font-weight: 700;
    color: #1e293b;
    background: #ffffff;
    outline: none;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.02), 0 0 0 1px #e2e8f0;

    &:focus {
      background: #ffffff;
      border-color: ${props => props.orderMode === 'settle' ? '#16a34a' : '#f97316'};
      box-shadow: 
        0 0 0 5px ${props => props.orderMode === 'settle' ? 'rgba(22, 163, 74, 0.15)' : 'rgba(249, 115, 22, 0.15)'},
        0 8px 20px -4px ${props => props.orderMode === 'settle' ? 'rgba(22, 163, 74, 0.12)' : 'rgba(249, 115, 22, 0.12)'};
      transform: translateY(-1px);
    }

    &::placeholder {
      color: #94a3b8;
      font-weight: 600;
      letter-spacing: 0.2px;
    }
  }

  svg {
    position: absolute;
    left: 18px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
    pointer-events: none;
    transition: all 0.3s ease;
  }

  &:focus-within svg {
    color: ${props => props.orderMode === 'settle' ? '#16a34a' : '#f97316'};
    transform: translateY(-50%) scale(1.1);
  }
`;

const MenuItemCard = styled.div`
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 16px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.25s ease;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  overflow: hidden;
  animation: ${slideUp} 0.3s ease backwards;
  animation-delay: ${props => (props.index % 20) * 0.015}s;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, ${props => props.orderMode === 'settle' ? '#16a34a' : '#f97316'} 0%, ${props => props.orderMode === 'settle' ? '#86efac' : '#f59e0b'} 100%);
    opacity: 0;
    transition: opacity 0.25s ease;
  }

  &:hover {
    border-color: ${props => props.orderMode === 'settle' ? '#16a34a' : '#f97316'};
    box-shadow: 0 8px 24px -4px ${props => props.orderMode === 'settle' ? 'rgba(22, 163, 74, 0.2)' : 'rgba(249, 115, 22, 0.2)'};
    transform: translateY(-4px);

    &::before {
      opacity: 1;
    }
  }

  &:active {
    transform: translateY(-2px) scale(0.98);
  }
`;

const SuggestionItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  border-bottom: 1.5px solid #f1f5f9;
  cursor: pointer;
  background: ${props => props.active ? (props.orderMode === 'settle' ? 'linear-gradient(90deg, #f0fdf4 0%, #ffffff 100%)' : 'linear-gradient(90deg, #fff7ed 0%, #ffffff 100%)') : 'transparent'};
  border-left: 6px solid ${props => props.active ? (props.orderMode === 'settle' ? '#16a34a' : '#f97316') : 'transparent'};
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;

  &:hover {
    background: ${props => props.orderMode === 'settle' ? '#f0fdf4' : '#fff7ed'};
    padding-left: 32px;
  }

  &::after {
    content: 'ADD TO CART';
    position: absolute;
    right: 32px;
    bottom: 8px;
    font-size: 9px;
    font-weight: 900;
    color: ${props => props.orderMode === 'settle' ? '#16a34a' : '#f97316'};
    opacity: 0;
    transform: translateY(4px);
    transition: all 0.2s ease;
  }

  &:hover::after {
    opacity: ${props => props.active ? 0 : 0.6};
    transform: translateY(0);
  }

  .name-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .name {
    font-size: 16px;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: -0.02em;
  }

  .meta {
    font-size: 11px;
    font-weight: 800;
    color: #64748b;
    display: flex;
    align-items: center;
    gap: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .price-info {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .price {
    font-size: 20px;
    font-weight: 1000;
    color: ${props => props.orderMode === 'settle' ? '#16a34a' : '#f97316'};
    letter-spacing: -0.04em;
  }

  .cart-count {
    background: ${props => props.orderMode === 'settle' ? '#16a34a' : '#f97316'};
    color: white;
    padding: 4px 12px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 1000;
    box-shadow: 0 4px 12px ${props => props.orderMode === 'settle' ? 'rgba(22, 163, 74, 0.3)' : 'rgba(249, 115, 22, 0.3)'};
    animation: ${fadeIn} 0.2s ease;
  }
`;

const KeyboardInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 24px;
  background: white;
  border-top: 1px solid #e2e8f0;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  flex-shrink: 0;

  span {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  kbd {
    background: #f8fafc;
    padding: 2px 6px;
    border-radius: 6px;
    border: 1.5px solid #e2e8f0;
    color: #1e293b;
    font-family: inherit;
    font-size: 11px;
    box-shadow: 0 1.5px 0 rgba(0,0,0,0.05);
  }
`;

const MenuItemName = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.3;
  min-height: 34px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const MenuItemPrice = styled.div`
  font-size: 17px;
  font-weight: 900;
  color: ${props => props.orderMode === 'settle' ? '#16a34a' : '#f97316'};
  margin-top: auto;
  letter-spacing: -0.03em;
`;

const MenuItemBadge = styled.div`
  position: absolute;
  top: 10px;
  right: 10px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: ${props => props.veg ? '#22c55e' : '#ef4444'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 2;
`;

// Right Sidebar - Actions & Payment
const ActionSidebar = styled.div`
  background: white;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid #e2e8f0;

  @media (max-width: 1024px) {
    display: none;
  }
`;

const SidebarSection = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
  
  .section-label {
    font-size: 10px;
    font-weight: 800;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
`;

const PaymentGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`;

const MethodCard = styled.div`
  padding: 12px 10px;
  border: 2px solid ${props => props.active ? props.color : '#f1f5f9'};
  background: ${props => props.active ? props.bgColor : '#ffffff'};
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
  box-shadow: ${props => props.active ? `0 10px 20px -5px ${props.color}25` : 'none'};

  &:hover {
    border-color: ${props => props.color};
    transform: translateY(-2px);
    box-shadow: 0 12px 24px -8px rgba(0,0,0,0.1);
  }

  &:active {
    transform: translateY(-1px);
  }

  .icon {
    font-size: 20px;
    filter: ${props => props.active ? 'none' : 'grayscale(0.5)'};
    transition: all 0.3s ease;
  }

  .label {
    font-size: 10px;
    font-weight: 1000;
    color: ${props => props.active ? props.color : '#64748b'};
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
`;

const CustomerSection = styled.div`
  padding: 16px 18px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;

  .section-title {
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #94a3b8;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
`;

const DateTimeContainer = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  background: rgba(255, 255, 255, 0.1);
  padding: 4px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  position: relative;
  z-index: 1000;
  margin-right: 4px;
`;

const DateInputWrapper = styled.div`
  input[type="date"] {
    background: transparent;
    border: none;
    color: white;
    font-size: 12px;
    font-weight: 800;
    outline: none;
    cursor: pointer;
    padding: 6px 8px;
    font-family: inherit;

    &::-webkit-calendar-picker-indicator {
      filter: invert(1);
      cursor: pointer;
    }
  }
`;

const TimeInputWrapper = styled.div`
  border-left: 1px solid rgba(255, 255, 255, 0.2);
  padding-left: 4px;
`;

const CustomerSelectButton = styled.button`
  width: 100%;
  padding: 14px 18px;
  background: ${props => props.hasCustomer 
    ? (props.orderMode === 'settle' 
        ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' 
        : 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)')
    : '#ffffff'};
  border: 2px solid ${props => props.hasCustomer 
    ? (props.orderMode === 'settle' ? '#86efac' : '#fed7aa') 
    : '#f1f5f9'};
  border-radius: 14px;
  font-size: 14px;
  font-weight: 700;
  color: ${props => props.hasCustomer 
    ? (props.orderMode === 'settle' ? '#166534' : '#9a3412') 
    : '#64748b'};
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: ${props => props.hasCustomer ? '0 4px 12px rgba(0,0,0,0.05)' : 'none'};

  &:hover {
    border-color: ${props => props.hasCustomer 
      ? (props.orderMode === 'settle' ? '#16a34a' : '#f97316') 
      : '#cbd5e1'};
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0,0,0,0.08);
  }
`;

const CustomerBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
  border: 1.5px solid #86efac;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  color: #166534;
  margin-top: 6px;

  svg {
    width: 12px;
    height: 12px;
  }
`;

const CreditBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: ${props => props.balance > 0 
    ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)' 
    : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)'};
  border: 1.5px solid ${props => props.balance > 0 ? '#fcd34d' : '#fca5a5'};
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  color: ${props => props.balance > 0 ? '#92400e' : '#991b1b'};
  margin-top: 6px;
`;

const CartHeader = styled.div`
  padding: 20px 28px;
  background: white;
  border-bottom: 1.5px solid #f1f5f9;
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: ${props => props.orderMode === 'settle' ? '#16a34a' : '#f97316'};
    box-shadow: 0 0 16px ${props => props.orderMode === 'settle' ? 'rgba(22, 163, 74, 0.8)' : 'rgba(249, 115, 22, 0.8)'};
    animation: ${fadeIn} 0.6s infinite alternate;
  }

  h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 1000;
    color: #1e293b;
    text-transform: uppercase;
    letter-spacing: 1.5px;
  }
`;

const CartItems = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 14px;

  /* Custom Scrollbar */
  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, ${props => props.orderMode === 'settle' ? '#16a34a' : '#f97316'} 0%, ${props => props.orderMode === 'settle' ? '#15803d' : '#ea580c'} 100%);
    border-radius: 4px;
  }
`;

const CartItem = styled.div`
  background: #ffffff;
  border: 1.5px solid #eef2f6;
  border-radius: 20px;
  padding: 16px 20px;
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  animation: ${slideUp} 0.25s ease backwards;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.02);

  &::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    background: linear-gradient(180deg, ${props => props.orderMode === 'settle' ? '#16a34a' : '#f97316'} 0%, ${props => props.orderMode === 'settle' ? '#4ade80' : '#f59e0b'} 100%);
    opacity: 0.8;
  }

  &:hover {
    border-color: ${props => props.orderMode === 'settle' ? '#16a34a' : '#f97316'};
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
    transform: translateX(4px) translateY(-2px);
    
    &::after {
      opacity: 1;
      width: 8px;
    }
  }
`;

const CartItemHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 8px;
`;

const CartItemName = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: #0b1220;
  flex: 1;
  line-height: 1.3;
`;

const RemoveButton = styled.button`
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: #fee2e2;
  border: 1px solid #fecaca;
  color: #dc2626;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;

  &:hover {
    background: #fecaca;
    transform: scale(1.1);
  }
`;

const CartItemFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
`;

const QuantityControl = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 10px;
  padding: 4px;

  button {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: #ffffff;
    border: 1.5px solid #e2e8f0;
    color: #475569;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      background: ${props => props.orderMode === 'settle' 
        ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' 
        : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'};
      color: white;
      border-color: transparent;
      transform: scale(1.1);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  span {
    min-width: 30px;
    text-align: center;
    font-size: 14px;
    font-weight: 800;
    color: #1e293b;
  }
`;

const CartItemPrice = styled.div`
  font-size: 15px;
  font-weight: 800;
  color: ${props => props.orderMode === 'settle' ? '#16a34a' : '#f97316'};
  letter-spacing: -0.02em;
`;

const CartFooter = styled.div`
  padding: 16px 18px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border-top: 2px solid #e2e8f0;
  flex-shrink: 0;
`;

const CartTotal = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  padding: 16px 20px;
  background: ${props => props.orderMode === 'settle' 
    ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' 
    : 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)'};
  border: 2px solid ${props => props.orderMode === 'settle' ? '#86efac' : '#fed7aa'};
  border-radius: 16px;

  span:first-child {
    font-size: 11px;
    font-weight: 800;
    color: ${props => props.orderMode === 'settle' ? '#166534' : '#78350f'};
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  span:last-child {
    font-size: 26px;
    font-weight: 950;
    color: ${props => props.orderMode === 'settle' ? '#16a34a' : '#ea580c'};
    letter-spacing: -0.04em;
  }
`;

const ConfirmButton = styled.button`
  width: 100%;
  padding: 20px;
  border-radius: 20px;
  background: ${props => props.disabled 
    ? '#f1f5f9' 
    : (props.orderMode === 'settle' 
        ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' 
        : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)')};
  border: none;
  color: ${props => props.disabled ? '#94a3b8' : 'white'};
  font-size: 18px;
  font-weight: 1000;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  box-shadow: ${props => props.disabled 
    ? 'none' 
    : `0 15px 35px -10px ${props.orderMode === 'settle' ? 'rgba(22, 163, 74, 0.4)' : 'rgba(249, 115, 22, 0.4)'}`};
 
  &:hover:not(:disabled) {
    transform: translateY(-4px) scale(1.01);
    box-shadow: 0 25px 50px -12px ${props => props.orderMode === 'settle' ? 'rgba(22, 163, 74, 0.5)' : 'rgba(249, 115, 22, 0.5)'};
    background: ${props => props.orderMode === 'settle'
      ? 'linear-gradient(135deg, #15803d 0%, #166534 100%)'
      : 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)'};
  }
 
  &:active:not(:disabled) {
    transform: translateY(-1px) scale(0.98);
    opacity: 0.9;
  }
`;

const EmptyState = styled.div`
  grid-column: 1 / -1;
  text-align: center;
  padding: 120px 40px;
  background: transparent;
  border: none;
  margin: 0;
  animation: ${fadeIn} 0.6s ease-out;

  .icon {
    font-size: 64px;
    margin-bottom: 20px;
    filter: grayscale(1) opacity(0.2);
    display: inline-block;
    animation: pulse 2s infinite ease-in-out;
  }

  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }

  p {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: #94a3b8;
    
    &:first-of-type {
      font-size: 20px;
      color: #1e293b;
      font-weight: 1000;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
  }
`;

const AnimatedIcon = styled.div`
  width: ${props => props.size || '120px'};
  height: ${props => props.size || '120px'};
  border-radius: ${props => props.radius || '35%'};
  background: ${props => props.bg || 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${props => props.fontSize || '56px'};
  box-shadow: ${props => props.shadow || '0 20px 40px -10px rgba(249, 115, 22, 0.15)'};
  animation: ${fadeIn} ${props => props.duration || '0.5s'} ease-out;
`;

const QuickAddContainer = styled.div`
  background: white;
  border-radius: 24px;
  width: 90%;
  max-width: 440px;
  overflow: visible;
  box-shadow: 0 30px 60px -12px rgba(0,0,0,0.4);
  animation: ${fadeIn} 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  border: 1px solid rgba(255,255,255,0.1);
`;

const FadeInContainer = styled.div`
  animation: ${fadeIn} ${props => props.duration || '0.3s'} ${props => props.easing || 'ease-out'};
`;

const SlideInContainer = styled.div`
  animation: ${slideIn} ${props => props.duration || '0.3s'} ${props => props.easing || 'ease-out'};
`;

/**
 * CreateOrderModal - Premium reusable component for creating orders
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Controls modal visibility
 * @param {Function} props.onClose - Callback when modal closes
 * @param {Object} props.table - Table object with id and identifier
 * @param {string} props.restaurantId - Restaurant ID
 * @param {Function} props.onSuccess - Callback after successful order creation
 * @param {string} props.orderType - Type of order: 'dine-in', 'parcel', 'delivery'
 */


// Helper Component for Round Off Input
const THEME = { main: '#ea580c' };

const FormattedRoundOffInput = ({ mode, value, base, limit, onChange, theme }) => {
  const [localValue, setLocalValue] = useState(value ? value.toFixed(2) : '');
  const [isFocused, setIsFocused] = useState(false);

  // Sync with parent when not focused
  useEffect(() => {
    if (!isFocused && value !== undefined && value !== null) {
      setLocalValue(value.toFixed(2));
    }
  }, [value, isFocused]);

  const handleFocus = (e) => {
    setIsFocused(true);
    e.target.select();
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (value !== undefined && value !== null) {
      setLocalValue(value.toFixed(2));
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    
    // Allow empty string to clear
    if (val === '') {
      setLocalValue('');
      return;
    }

    const newVal = parseFloat(val);
    if (!isNaN(newVal)) {
      const maxAllowed = base + limit;
      const minAllowed = base - limit;
      
      let finalVal = newVal;
      
      // 1. Block Above: If > Max, clamp immediately
      if (newVal > maxAllowed) {
        finalVal = maxAllowed;
      }
      
      // 2. Block Below: Only if it's "finished" typing (comparable magnitude)
      // e.g. Min 90. Typing "5" (allowed). Typing "50" (clamped to 90).
      // We check if integer part length is >= min allowed integer part length
      // AND it's strictly less than min
      const valIntStr = String(Math.floor(newVal));
      const minIntStr = String(Math.floor(minAllowed));
      
      if (newVal < minAllowed && valIntStr.length >= minIntStr.length) {
         finalVal = minAllowed;
      }

      // Update Local State with the clamped/valid value
      // If we clamped, we format to fixed to show it clearly.
      // If we didn't clamp, we keep user's raw input (val) to allow "1." etc.
      if (finalVal !== newVal) {
         setLocalValue(finalVal.toFixed(2));
      } else {
         setLocalValue(val);
      }

      // Calculate diff from the FINAL valid value (not necessarily what changed)
      const diff = finalVal - base;
      onChange(diff);
    } else {
       // If NaN (e.g. "-"), just allow typing but don't trigger change yet
       setLocalValue(val);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
      <span style={{ 
        position: 'absolute', 
        left: 14, 
        top: '50%', 
        transform: 'translateY(-50%)', 
        fontWeight: 800, 
        color: '#94a3b8', 
        pointerEvents: 'none',
        fontSize: 16
      }}>₹</span>
      <input
        type="text"
        inputMode="decimal"
        value={localValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={mode === 'automatic'}
        style={{
          padding: '12px 16px 12px 32px',
          width: 140,
          borderRadius: 14,
          border: `2px solid ${mode === 'manual' ? theme.main : '#f1f5f9'}`,
          fontWeight: 800,
          textAlign: 'right',
          fontSize: 18,
          outline: 'none',
          background: mode === 'manual' ? '#fff' : '#f8fafc',
          color: mode === 'manual' ? '#1e293b' : '#94a3b8',
          cursor: mode === 'manual' ? 'text' : 'not-allowed',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: mode === 'manual' ? `0 4px 12px ${theme.main}15` : 'none',
          letterSpacing: '-0.5px'
        }}
        onMouseEnter={(e) => {
          if (mode === 'manual') {
            e.target.style.borderColor = theme.main;
            e.target.style.boxShadow = `0 6px 16px ${theme.main}20`;
          }
        }}
        onMouseLeave={(e) => {
          if (mode === 'manual' && !isFocused) {
            e.target.style.borderColor = theme.main;
            e.target.style.boxShadow = `0 4px 12px ${theme.main}15`;
          }
        }}
      />
    </div>
  );
};

export default function CreateOrderModal({ 
  isOpen, 
  onClose, 
  table, 
  restaurantId, 
  onSuccess,
  orderType = 'dine-in'
}) {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();
  const updateStatusMutation = useUpdateTableStatus();
  
  // React Query hook for menu items with cache management
  // Shows cached data immediately while refetching in background
  const { 
    data: menuItems = [], 
    isLoading: loadingMenu,
    isFetching,
    isStale 
  } = useAvailableMenuItems(restaurantId);
  
  const { restaurant } = useRestaurant();
  
  // Local state
  const [cart, setCart] = useState([]);
  const [qtyDrafts, setQtyDrafts] = useState({});
  const [discount, setDiscount] = useState({ type: 'amount', value: 0 });
  
  const [showVariantSelector, setShowVariantSelector] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(null); // null | cartId | 'bill'
  const [selectedItem, setSelectedItem] = useState(null);
  
  // Quick Add Product State
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickProduct, setQuickProduct] = useState({
    name: '',
    price: '',
    code: '',
    packaged: false,
    veg: true,
    category: 'Quick Add',
    tax_rate: '',
    has_variants: false
  });
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [numberOfCustomers, setNumberOfCustomers] = useState('');
  const [creating, setCreating] = useState(false);
  
  // NEW: Order Mode Toggle (settle vs kitchen)
  const [orderMode, setOrderMode] = useState('kitchen'); // 'settle' | 'kitchen'
  
  // Data Fetching Hooks (Cached)
  const { data: allCustomersData } = useAllCustomers(restaurantId);
  const { data: creditCustomersData } = useCreditCustomers(restaurantId);
  const { data: profileConfig } = useRestaurantProfileConfig(restaurantId);

  // Round-off state (initialized from profile, but editable locally)
  const [roundOffConfig, setRoundOffConfig] = useState({
    round_off_enabled: true,
    round_off_mode: 'automatic',
    round_off_auto_factor: 1,
    round_off_manual_value: 0,
    round_off_manual_limit: 10
  });

  // Sync local round-off config with fetched profile when it loads or when modal opens
  useEffect(() => {
    if (profileConfig && isOpen) {
       setRoundOffConfig(prev => ({
         ...prev,
         round_off_enabled: profileConfig.round_off_enabled,
         round_off_mode: profileConfig.round_off_mode,
         round_off_auto_factor: profileConfig.round_off_auto_factor,
         round_off_manual_limit: profileConfig.round_off_manual_limit,
         // Reset manual value on fresh open if desired, or keep previous?
         // Usually specific to an order, so reset makes sense.
         round_off_manual_value: 0 
       }));
    }
  }, [profileConfig, isOpen]);
  
  // NEW: Credit Customer States
  const [isCreditMode, setIsCreditMode] = useState(false);
  // creditCustomers is now derived from query data
  const creditCustomers = creditCustomersData || [];
  
  const [selectedCreditCustomerId, setSelectedCreditCustomerId] = useState('');
  const [creditCustomerBalance, setCreditCustomerBalance] = useState(0);
  const [showNewCreditCustomerModal, setShowNewCreditCustomerModal] = useState(false);
  const [creditProcessing, setCreditProcessing] = useState(false);
  const [creditError, setCreditError] = useState('');
  
  // Veg/Packaged Filters
  const [vegOnly, setVegOnly] = useState(false);
  const [packagedOnly, setPackagedOnly] = useState(false);
  
  // Payment States
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash'); // cash, online, mixed, credit
  const [cashPart, setCashPart] = useState('');
  const [onlinePart, setOnlinePart] = useState('');
  const [onlineType, setOnlineType] = useState('upi');

  // Customer Autocomplete States
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  // allCustomers is now derived from query data
  const allCustomers = allCustomersData || [];
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);

  // Date and Time states for backdating
  const [orderDate, setOrderDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  });
  const [orderTime, setOrderTime] = useState(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });

  // Upsells for cart
  const [cartUpsells, setCartUpsells] = useState([]);
  
  // Pagination state
  const PAGE_SIZE = 50; // Increased for search-first view
  const [page, setPage] = useState(1);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const searchInputRef = useRef(null);

  // Auto-focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Reset suggestion index when search query changes
  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [searchQuery]);

  // Global ESC Key Handler for Modal Hierarchy
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only handle ESC if this modal is open
      if (e.key === 'Escape' && isOpen) {
        // Priority 1: Close Discount Modal
        if (showDiscountModal) {
          setShowDiscountModal(null);
          return;
        }
        
        // Priority 2: Close Credit Customer Modal
        if (showNewCreditCustomerModal) {
          setShowNewCreditCustomerModal(false);
          setCreditError('');
          return;
        }

        // Priority 3: Close Quick Add Modal if defined and active
        // Assuming setShowQuickAddModal exists as I saw 'setShowQuickAddModal(false)' later in file
        // I need to check if 'showQuickAddModal' is in scope. 
        // Based on previous file content, it seems I missed its declaration in view, 
        // but it WAS used in lines 2905, 3172. So state must exist.
        // Let's try to reference it. If it fails, I'll need to find where it is defined.
        // But since I can't confirm it's in scope of this effect without seeing full file, 
        // I will assume it is available as it's used in JSX.
        if (typeof showQuickAddModal !== 'undefined' && showQuickAddModal) {
           setShowQuickAddModal(false);
           return;
        }
        
        // Final Priority: Close Main Modal
        if (onClose) onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showDiscountModal, showNewCreditCustomerModal, onClose]); // Add showQuickAddModal to deps if I can (but lint might complain if it thinks it's missing)

  // Filter menu items
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter(item => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        item.name.toLowerCase().includes(q) ||
        (item.code && item.code.toLowerCase().includes(q));
      
      const matchesVeg = !vegOnly || item.veg === true;
      const matchesPackaged = !packagedOnly || item.is_packaged_good === true;
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      return matchesSearch && matchesVeg && matchesPackaged && matchesCategory;
    });
  }, [menuItems, searchQuery, vegOnly, packagedOnly, categoryFilter]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(menuItems.map(i => i.category))).filter(Boolean);
    return [
      { value: 'all', label: 'All Items' },
      ...cats.map(c => ({ value: c, label: c }))
    ];
  }, [menuItems]);

  const selectedCustomerObj = useMemo(() => {
    if (isCreditMode) {
      return creditCustomers.find(c => c.id === selectedCreditCustomerId);
    }
    // For normal customers, if we have ID
    if (selectedCustomerId) {
      return allCustomers.find(c => c.customer_id === selectedCustomerId) || { name: customerName, phone: customerPhone };
    }
    return customerName ? { name: customerName, phone: customerPhone } : null;
  }, [isCreditMode, selectedCreditCustomerId, creditCustomers, selectedCustomerId, allCustomers, customerName, customerPhone]);

  const THEME = useMemo(() => {
    if (orderMode === 'settle') {
      return { main: '#16a34a', dark: '#15803d', soft: '#f0fdf4' }; // Green for Settle
    }
    return { main: '#f97316', dark: '#ea580c', soft: '#fff7ed' }; // Orange for Kitchen
  }, [orderMode]);

  // Cart helper functions from CounterSale
  const setDraft = (cartId, v) => setQtyDrafts(prev => ({ ...prev, [cartId]: v }));
  
  const clearDraft = (cartId) => setQtyDrafts(prev => {
    const next = { ...prev };
    delete next[cartId];
    return next;
  });

  const updateCartItem = (cartId, quantity, precision = 2) => {
    if (!cartId) return;
    const p = Number.isInteger(precision) ? precision : 2;
    const q = roundP(quantity, p);

    if (!Number.isFinite(q) || q <= 0) {
      setCart(p => p.filter(c => c.cartId !== cartId));
      clearDraft(cartId);
      return;
    }

    setCart(p => p.map(c => (c.cartId === cartId ? { ...c, quantity: q } : c)));
    clearDraft(cartId);
  };

  const removeFromCart = (cartId) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
    clearDraft(cartId);
  };

  const commitQtyDraft = (cartId, raw, precision) => {
    const p = Number.isInteger(precision) ? precision : 2;
    const q = normalizeQty(raw, { allowZero: true, precision: p });
    if (q === null) {
      clearDraft(cartId);
      return;
    }
    return updateCartItem(cartId, q, p);
  };

  const getDraftOrQtyNumber = (cartId, fallbackQty, precision = 2) => {
    const p = Number.isInteger(precision) ? precision : 2;
    const parsed = normalizeQty(qtyDrafts[cartId], { allowZero: true, precision: p });
    if (parsed === null) return Number(fallbackQty || 0);
    return parsed;
  };

  const onUpdateCartItem = (cartId, newItem) => {
    setCart(prev => prev.map(c => (c.cartId === cartId || c.id === cartId) ? { ...c, ...newItem } : c));
  };

  const addItemToCart = (itemWithVariant) => {
    // Flatten UOM info
    const uomPrecision = itemWithVariant.uom_precision ?? itemWithVariant.uom?.precision ?? 2;
    const uomShortCode = itemWithVariant.uom_short_code ?? itemWithVariant.uom?.short_code ?? '';

    const cartId = itemWithVariant.cartId || (itemWithVariant.variant_id ? `v_${itemWithVariant.id}_${itemWithVariant.variant_id}` : itemWithVariant.id);
    
    setCart(prev => {
      const existing = prev.find(i => i.cartId === cartId);
      if (existing) {
        return prev.map(i => i.cartId === cartId ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { 
        ...itemWithVariant, 
        cartId, 
        price: Number(Number(itemWithVariant.price || 0).toFixed(2)),
        quantity: itemWithVariant.quantity || 1,
        // Ensure flattened properties exist for UI controls
        uom_precision: uomPrecision,
        uom_short_code: uomShortCode
      }];
    });
  };

  const addToCart = (item) => {
    if (item.status && item.status !== 'available') {
      showAlert('Out of stock');
      return;
    }
    if ((item.has_variants && item.variants?.length > 0) || item.has_addons) {
      setSelectedItem(item);
      setShowVariantSelector(true);
      return;
    }
    addItemToCart(item);
  };

  const handleVariantSelect = (itemWithVariant) => {
    addItemToCart(itemWithVariant);
    setShowVariantSelector(false);
    setSelectedItem(null);
  };

  const addToCartDirect = (item) => addItemToCart(item);

  // Helper functions for +/- quantity from menu cards
  const incrementItemQty = (item, e) => {
    e.stopPropagation();
    // For items with variants, we need to handle differently
    const cartItem = cart.find(c => c.id === item.id && !c.variant_id);
    if (cartItem) {
      const p = cartItem.uom_precision ?? item.uom?.precision ?? 2;
      updateCartItem(cartItem.cartId, cartItem.quantity + 1, p);
    } else {
      addToCart(item);
    }
  };

  const decrementItemQty = (item, e) => {
    e.stopPropagation();
    const cartItem = cart.find(c => c.id === item.id && !c.variant_id);
    if (cartItem) {
      const p = cartItem.uom_precision ?? item.uom?.precision ?? 2;
      const newQty = cartItem.quantity - 1;
      if (newQty <= 0) {
        setCart(p => p.filter(c => c.cartId !== cartItem.cartId));
      } else {
        updateCartItem(cartItem.cartId, newQty, p);
      }
    }
  };

  const getItemQtyInCart = (itemId) => {
    return cart
      .filter(c => c.id === itemId)
      .reduce((sum, c) => sum + (c.quantity || 0), 0);
  };

  // --- CUSTOMER SEARCH LOGIC ---
  // No manual load here anymore - handled by useAllCustomers hook

  const handleNameChange = (val) => {
    setCustomerName(val);
    if (!val) {
      setFilteredSuggestions([]);
      setShowNameSuggestions(false);
      setSelectedCustomerId(null);
      return;
    }
    const filtered = allCustomers.filter(c => 
      (c.name || '').toLowerCase().includes(val.toLowerCase()) || 
      (c.phone || '').includes(val)
    ).slice(0, 5);
    setFilteredSuggestions(filtered);
    setShowNameSuggestions(filtered.length > 0);
  };

  const selectCustomer = (c) => {
    setCustomerName(c.name || '');
    setCustomerPhone(c.phone || '');
    setSelectedCustomerId(c.customer_id);
    setShowNameSuggestions(false);
  };

  // --- CREDIT CUSTOMER FUNCTIONS ---
  // loadCreditCustomers replaced by hook useCreditCustomers

  const handleSelectCreditCustomer = (customerId) => {
    const customer = creditCustomers.find(c => c.id === customerId);
    if (customer) {
      setSelectedCreditCustomerId(customerId);
      setCreditCustomerBalance(customer.current_balance);
      setCustomerName(customer.name);
      setCustomerPhone(customer.phone);
    }
  };

  const handleCreateNewCreditCustomer = async () => {
    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();
    if (trimmedName.length < 2 || trimmedPhone.length < 10) {
      setCreditError('Please enter a valid name and 10-digit phone number');
      setTimeout(() => setCreditError(''), 3000);
      return;
    }
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(trimmedPhone)) {
      setCreditError('Please enter a valid 10-digit phone number');
      setTimeout(() => setCreditError(''), 3000);
      return;
    }
    try {
      setCreditProcessing(true);
      setCreditError('');
      const { data: existing } = await supabase
        .from('credit_customers')
        .select('id, name, phone')
        .eq('restaurant_id', restaurantId)
        .eq('phone', trimmedPhone)
        .maybeSingle();
      if (existing) {
        if (existing.name.toLowerCase() === trimmedName.toLowerCase()) {
          setCreditError('A customer with this name and phone number already exists.');
        } else {
          setCreditError(`Phone number ${trimmedPhone} is already registered to "${existing.name}".`);
        }
        setCreditProcessing(false);
        return;
      }
      const { data, error: err } = await supabase
        .from('credit_customers')
        .insert({
          restaurant_id: restaurantId,
          name: trimmedName,
          phone: trimmedPhone,
          current_balance: 0,
          total_credit_extended: 0,
          status: 'active'
        })
        .select()
        .single();
      if (err) {
        setCreditError(`Failed to create customer: ${err.message}`);
        setCreditProcessing(false);
        return;
      }
      
      // Update cache
      queryClient.setQueryData(
         orderKeys.creditCustomers(restaurantId), 
         (old) => old ? [...old, { 
             id: data.id, 
             name: data.name, 
             phone: data.phone, 
             status: data.status, 
             current_balance: 0 
         }] : []
      );
      // Also potentially invalidate customers list if needed
      queryClient.invalidateQueries(orderKeys.customers(restaurantId));

      setSelectedCreditCustomerId(data.id);
      setCreditCustomerBalance(0);
      setShowNewCreditCustomerModal(false);
      setCustomerName(data.name);
      setCustomerPhone(data.phone);
      setCreditError('');
      showAlert(`Customer "${data.name}" created successfully`);
    } catch (err) {
      setCreditError(`Error: ${err.message || 'Failed to create customer'}`);
    } finally {
      setCreditProcessing(false);
    }
  };

  const handleQuickAddProduct = async () => {
    if (!quickProduct.name || !quickProduct.price) {
      showAlert('Name and Price are required');
      return;
    }
    setQuickAddLoading(true);
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .insert({
          restaurant_id: restaurantId,
          name: quickProduct.name,
          price: Number(Number(quickProduct.price).toFixed(2)),
          code_number: quickProduct.code || null,
          is_packaged_good: quickProduct.packaged,
          veg: quickProduct.veg,
          category: quickProduct.category || 'Quick Add',
          tax_rate: quickProduct.packaged ? Number(Number(quickProduct.tax_rate || 0).toFixed(2)) : null,
          has_variants: quickProduct.has_variants,
          status: 'available'
        })
        .select()
        .single();

      if (error) throw error;

      // Add to cart immediately if not having variants
      if (!data.has_variants) {
        addItemToCart(data);
      } else {
        showAlert('Product created. Please add variants from Menu to use it in cart.');
      }
      
      // Reset and close
      setShowQuickAddModal(false);
      setQuickProduct({
        name: '',
        price: '',
        code: '',
        packaged: false,
        veg: true,
        category: 'Quick Add',
        tax_rate: '',
        has_variants: false
      });
      showAlert('Product added successfully');
      
      // Invalidate menu query
      queryClient.invalidateQueries(['availableMenuItems', restaurantId]);
    } catch (err) {
      showAlert(`Error: ${err.message}`);
    } finally {
      setQuickAddLoading(false);
    }
  };



  // Fetch upsells effect
  useEffect(() => {
    if (cart.length === 0) {
      setCartUpsells([]);
      return;
    }

    const fetchUpsells = async () => {
      const itemIds = [...new Set(cart.map(i => i.id))];
      const { data } = await supabase
        .from('menu_items_with_upsells')
        .select('upsells')
        .in('menu_item_id', itemIds);

      const allUpsells = [];
      data?.forEach(row => {
          if (Array.isArray(row.upsells)) {
             allUpsells.push(...row.upsells);
          }
      });
      
      const uniqueMap = new Map();
      allUpsells.forEach(u => uniqueMap.set(u.id, u));
      
      const final = [];
      uniqueMap.forEach(u => {
         if (!cart.some(c => c.id === u.id)) {
            final.push(u);
         }
      });
      
      setCartUpsells(final);
    };

    fetchUpsells();
  }, [cart]);



  // Calculate totals using central utility
  const cartTotals = useMemo(() => {
    const profile = {
      gst_enabled: !!restaurant?.gst_enabled,
      default_tax_rate: Number(restaurant?.default_tax_rate || 5),
      prices_include_tax: !!restaurant?.prices_include_tax,
      round_off_config: roundOffConfig
    };
    return calculateOrderTotals(cart, discount, profile);
  }, [cart, discount, restaurant, roundOffConfig]);

  const total = cartTotals.total_amount;

  // Reset modal state
  const resetModal = () => {
    setCart([]);
    setSearchQuery('');
    setCategoryFilter('all');
    setCustomerName('');
    setCustomerPhone('');
    setPage(1);
    // Reset new states
    setOrderMode('kitchen');
    setIsCreditMode(false);
    setSelectedCreditCustomerId('');
    setCreditCustomerBalance(0);
    setVegOnly(false);
    setPackagedOnly(false);
    setDiscount({ type: 'amount', value: 0 });
    // Reset date/time to current
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setOrderDate(d.toISOString().slice(0, 10));
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    setOrderTime(`${hh}:${mm}`);
  };

  // Handle close
  const handleClose = () => {
    resetModal();
    onClose();
  };

  // Create order using API for consistency with CounterSale
  const handleCreateOrder = async () => {
    if (cart.length === 0) {
      showAlert('Please add items to the cart');
      return;
    }

    try {
      setCreating(true);

      const items = cart.map(item => ({
        id: item.id,
        name: item.name,
        price: Number(Number(item.price).toFixed(2)),
        quantity: item.quantity,
        tax_rate: Number(Number(item.tax_rate || 0).toFixed(2)),
        is_packaged_good: item.is_packaged_good || false,
        variant_id: item.variant_id || null,
        variant_name: item.variant_name || null,
        discount: item.discount || null,
        discount_amount: Number(
          ((item.price * item.quantity) * (item.discount?.type === 'percent' ? (item.discount.value/100) : 0) || (item.discount?.type === 'amount' ? item.discount.value : 0)).toFixed(2)
        )
      }));

      const finalOrderType = orderType; // 'dine-in', 'parcel', 'delivery'
      const finalTableNumber = (finalOrderType === 'dine-in' && table) ? table.identifier : null;

      const orderData = {
        restaurant_id: restaurantId,
        order_type: finalOrderType,
        table_number: finalTableNumber,
        table_id: (finalOrderType === 'dine-in' && table) ? table.id : null, 
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        customer_id: selectedCustomerId,
        number_of_customers: parseInt(numberOfCustomers) || null,
        status: orderMode === 'settle' ? 'completed' : 'new',
        items: items,
        payment_method: orderMode === 'settle' ? selectedPaymentMethod : null,
        payment_status: orderMode === 'settle' ? 'paid' : 'pending',
        discount_amount: cartTotals.discount_amount,
        total_discount_percent: discount.type === 'percent' ? discount.value : 0,
        base_tax_rate: Number(restaurant?.default_tax_rate || 5),
        prices_include_tax: !!restaurant?.prices_include_tax,
        round_off_amount: cartTotals.round_off_amount,
        // Add payment breakdown for mixed if applicable
        payment_breakdown: (orderMode === 'settle' && selectedPaymentMethod === 'mixed') ? {
            cash_amount: Number(cashPart || 0),
            online_amount: Number(onlinePart || 0),
            online_method: onlineType
        } : null,
        override_totals: {
            total_amount: cartTotals.total_amount,
            round_off_amount: cartTotals.round_off_amount,
            total_inc_tax: cartTotals.total_inc_tax,
            total_tax: cartTotals.total_tax,
            subtotal_ex: cartTotals.taxable_amount
        },
        custom_created_at: new Date(
            Number(orderDate.split('-')[0]),
            Number(orderDate.split('-')[1]) - 1,
            Number(orderDate.split('-')[2]),
            Number(orderTime.split(':')[0]),
            Number(orderTime.split(':')[1]),
            0
        ).toISOString()
      };

      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (!res.ok) {
        const j = await res.json();
        throw new Error(j?.error || 'Failed to create order');
      }

      const result = await res.json();

      // Update Table Status if Dine-in and Kitchen Mode
      if (finalOrderType === 'dine-in' && table && orderMode === 'kitchen') {
        updateStatusMutation.mutate({
          tableId: table.id,
          restaurantId: restaurantId,
          status: 'occupied'
        });
      }

      // Trigger Printing
      if (orderMode === 'settle') {
         // Print Bill
         window.dispatchEvent(
            new CustomEvent('auto-print-order', {
              detail: {
                ...result.order_for_print, 
                autoPrint: true,
                kind: 'bill'
              }
            })
         );
      } else {
         // Print KOT
         window.dispatchEvent(
           new CustomEvent('auto-print-order', {
             detail: {
               order_id: result.order_id,
               is_new_order: true,
               print_type: 'kot',
               kind: 'kot'
             }
           })
         );
      }

      showAlert(`Order created successfully!`);
      if (onSuccess) onSuccess(result);
      handleClose();

    } catch (error) {
      console.error('Error creating order:', error);
      showAlert(`Failed to create order: ${error.message}`);
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Overlay onClick={handleClose}>
      <Container 
        onClick={e => e.stopPropagation()}
        style={{
          border: orderMode === 'settle' 
            ? '3px solid #16a34a' 
            : '3px solid #f97316',
          background: orderMode === 'settle' 
            ? 'linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%)' 
            : 'linear-gradient(180deg, #fffbf5 0%, #fff7ed 100%)'
        }}
      >
        <Header style={{ 
          background: orderMode === 'settle' 
            ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' 
            : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          padding: '12px 24px'
        }}>
          <Title style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ fontSize: 18, margin: 0, fontWeight: 900 }}>
                {table ? `Table ${table.identifier}` : 'New Order'}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ 
                  background: 'rgba(255,255,255,0.2)', 
                  padding: '2px 8px', 
                  borderRadius: 6, 
                  fontSize: 10, 
                  fontWeight: 900, 
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  {orderType} {numberOfCustomers > 1 ? `• ${numberOfCustomers} GUESTS` : ''}
                </span>
              </div>
            </div>
            
            <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.15)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 1000, color: 'white', lineHeight: 1 }}>
                ₹{total.toFixed(2)}
              </div>
              <span style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Amount</span>
            </div>
          </Title>

          {/* Modes and Toggle in Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', padding: 4, borderRadius: 14, border: '1px solid rgba(255,255,255,0.2)' }}>
            <button
              onClick={() => setOrderMode('kitchen')}
              style={{
                padding: '8px 16px',
                borderRadius: 10,
                border: 'none',
                background: orderMode === 'kitchen' ? 'white' : 'transparent',
                color: orderMode === 'kitchen' ? '#f97316' : 'white',
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: orderMode === 'kitchen' ? '0 4px 10px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              Kitchen
            </button>
            <button
              onClick={() => setOrderMode('settle')}
              style={{
                padding: '8px 16px',
                borderRadius: 10,
                border: 'none',
                background: orderMode === 'settle' ? 'white' : 'transparent',
                color: orderMode === 'settle' ? '#16a34a' : 'white',
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: orderMode === 'settle' ? '0 4px 10px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              Settle
            </button>
          </div>

          <div style={{ flex: 1 }} />

          {/* Date & Time Picker */}
          <DateTimeContainer>
            <DateInputWrapper>
              <input
                type="date"
                max={new Date().toLocaleDateString('en-CA')}
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </DateInputWrapper>
            <TimeInputWrapper>
              <PremiumTimeSelect
                value={orderTime}
                onChange={(e) => setOrderTime(e.target.value)}
                themeColor={orderMode === 'settle' ? '#16a34a' : '#f97316'}
                triggerTextColor="white"
                overrideStyle={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: '800',
                  padding: '6px 8px',
                  height: 'auto',
                  width: 'auto',
                  boxShadow: 'none'
                }}
              />
            </TimeInputWrapper>
          </DateTimeContainer>

          {/* Credit Toggle in Header */}
          <button
            onClick={() => {
              setIsCreditMode(!isCreditMode);
              if (!isCreditMode) {
                // Data is auto-loaded by hook
                setSelectedCreditCustomerId('');
                setCreditCustomerBalance(0);
              }
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.3)',
              background: isCreditMode ? 'white' : 'rgba(255,255,255,0.1)',
              color: isCreditMode ? (orderMode === 'settle' ? '#16a34a' : '#f97316') : 'white',
              fontWeight: 800,
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Credit: {isCreditMode ? 'ON' : 'OFF'}
          </button>
          
          {/* Customer Details in Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, maxWidth: 540, position: 'relative' }}>
            {selectedCustomerObj ? (
              /* Detailed Selected Customer Card */
              <SlideInContainer style={{ 
                padding: '6px 14px', 
                background: 'rgba(255,255,255,0.22)', 
                backdropFilter: 'blur(12px)',
                borderRadius: 14, 
                border: '1px solid rgba(255,255,255,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                color: 'white',
                minWidth: 200,
                position: 'relative'
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', boxShadow: '0 0 10px #fff' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, lineHeight: 1.2, letterSpacing: '0.2px' }}>{selectedCustomerObj.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, opacity: 0.9, fontWeight: 800, letterSpacing: '0.3px' }}>{selectedCustomerObj.phone}</span>
                        {(selectedCustomerObj.loyalty_points !== undefined && selectedCustomerObj.loyalty_points > 0) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '1px 6px', background: 'rgba(255,255,255,0.2)', borderRadius: 6, fontSize: 9, fontWeight: 900, color: 'white' }}>
                                <span style={{ opacity: 0.7 }}>★</span> {selectedCustomerObj.loyalty_points}
                            </div>
                        )}
                        {isCreditMode && (
                             <div style={{ padding: '1px 6px', background: 'rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 9, fontWeight: 900, color: '#fde68a' }}>
                                ₹{selectedCustomerObj.current_balance?.toFixed(2)}
                            </div>
                        )}
                    </div>
                </div>
                <button 
                  onClick={() => {
                      if (isCreditMode) {
                        setSelectedCreditCustomerId('');
                      } else {
                        setSelectedCustomerId(null);
                        setCustomerName('');
                        setCustomerPhone('');
                        setShowNameSuggestions(false);
                      }
                  }}
                  style={{ 
                    marginLeft: 'auto',
                    width: 22, 
                    height: 22, 
                    borderRadius: 7, 
                    background: 'rgba(255,255,255,0.15)', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    color: 'white', 
                    fontSize: 16, 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                  }}
                >
                  ×
                </button>
              </SlideInContainer>
            ) : isCreditMode ? (
              /* Credit Customer NiceSelect */
              <div style={{ flex: 1 }}>
                <NiceSelect
                  value={selectedCreditCustomerId}
                  onChange={(val) => handleSelectCreditCustomer(val)}
                  options={creditCustomers.map(c => ({
                    value: c.id,
                    label: `${c.name} (${c.phone}) - ₹${c.current_balance.toFixed(2)}`
                  }))}
                  placeholder="Select Credit Customer"
                  style={{ 
                    background: 'rgba(255,255,255,0.1)', 
                    color: 'white', 
                    borderColor: 'rgba(255,255,255,0.2)' 
                  }}
                />
              </div>
            ) : (
              /* Normal Customer Search */
              <div style={{ flex: 1, position: 'relative' }}>
                <input 
                  type="text"
                  placeholder="Search Customer / Mobile..."
                  value={customerName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onFocus={() => customerName && setShowNameSuggestions(true)}
                  style={{ 
                    width: '100%', 
                    padding: '10px 18px', 
                    borderRadius: 12, 
                    border: '1.5px solid rgba(255,255,255,0.2)', 
                    background: 'rgba(255,255,255,0.15)',
                    backdropFilter: 'blur(10px)',
                    fontSize: 14, 
                    fontWeight: 600, 
                    color: 'white',
                    outline: 'none',
                    transition: 'all 0.25s ease'
                  }}
                  className="customer-search-input"
                />

                {showNameSuggestions && filteredSuggestions.length > 0 && (
                  <div style={{ 
                    position: 'absolute', 
                    top: '105%', 
                    left: 0, 
                    right: 0, 
                    background: 'white', 
                    borderRadius: 12, 
                    boxShadow: '0 10px 30px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.02)', 
                    zIndex: 9999, 
                    overflow: 'hidden',
                    border: '1px solid #e2e8f0'
                  }}>
                    {filteredSuggestions.map(c => (
                      <div 
                        key={c.customer_id}
                        onClick={() => selectCustomer(c)}
                        style={{ 
                          padding: '12px 18px', 
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}
                      >
                        <div style={{ fontWeight: 800, fontSize: 13, color: '#1e293b' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{c.phone}</div>
                      </div>
                    ))}
                  </div>
                )}
                <style jsx>{`
                  .customer-search-input::placeholder { color: rgba(255,255,255,0.7); }
                  .customer-search-input:focus { 
                    background: rgba(255,255,255,1); 
                    color: #1e293b;
                    border-color: white;
                  }
                  .customer-search-input:focus::placeholder { color: #94a3b8; }
                `}</style>
              </div>
            )}
          </div>
          <CloseButton 
            onClick={handleClose}
            style={{ marginLeft: '12px', background: 'none', border: 'none' }}
          >
            ×
          </CloseButton>
        </Header>
        
        <Content>
          {/* Main Search Experience */}
          <MenuSection>
            <SearchFilterBar>
              <SearchBox orderMode={orderMode}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input 
                  ref={searchInputRef}
                  type="text"
                  placeholder="Scan item or type name... (Use arrows to navigate)"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setActiveSuggestionIndex(prev => Math.min(prev + 1, filteredMenuItems.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActiveSuggestionIndex(prev => Math.max(prev - 1, 0));
                    } else if (e.key === 'Enter') {
                      const selectedItem = filteredMenuItems[activeSuggestionIndex];
                      if (selectedItem) {
                        addToCart(selectedItem);
                        setSearchQuery(''); 
                        setActiveSuggestionIndex(0);
                      }
                    }
                  }}
                />
              </SearchBox>

              <div style={{ width: 220, flexShrink: 0 }}>
                <NiceSelect 
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={categories}
                  placeholder="All Categories"
                  style={{ background: 'white', border: '1.5px solid #e2e8f0', height: 52, borderRadius: 18 }}
                />
              </div>

              {(searchQuery || categoryFilter !== 'all' || vegOnly || packagedOnly) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setCategoryFilter('all');
                    setVegOnly(false);
                    setPackagedOnly(false);
                  }}
                  style={{
                    padding: '0 16px',
                    height: 52,
                    borderRadius: 18,
                    border: '1.5px solid #fee2e2',
                    background: '#fef2f2',
                    color: '#ef4444',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Clear Filters
                </button>
              )}
            </SearchFilterBar>

            {/* Product Suggestions Section - Only visible while searching */}
            {searchQuery.length > 0 && (
              <div style={{ maxHeight: '280px', overflowY: 'auto', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', boxShadow: 'inset 0 -2px 10px rgba(0,0,0,0.05)', zIndex: 10 }}>
                {loadingMenu ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>Loading products...</div>
                ) : filteredMenuItems.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>No products found</div>
                ) : (
                  filteredMenuItems.slice(0, 10).map((item, index) => {
                    const totalQty = cart
                      .filter(c => c.id === item.id)
                      .reduce((sum, c) => sum + (c.quantity || 0), 0);
                    
                    return (
                      <SuggestionItem 
                        key={item.id}
                        active={index === activeSuggestionIndex}
                        orderMode={orderMode}
                        onClick={() => {
                          addToCart(item);
                          setSearchQuery('');
                          searchInputRef.current?.focus();
                        }}
                        style={{ padding: '12px 24px' }}
                      >
                        <div className="name-info">
                          <div className="name" style={{ fontSize: 14 }}>{item.name}</div>
                          <div className="meta">
                            {item.veg ? <span style={{ color: '#22c55e' }}>● Veg</span> : <span style={{ color: '#ef4444' }}>● Non-Veg</span>}
                            {item.code && <span>• Code: {item.code}</span>}
                            <span>• {item.category}</span>
                          </div>
                        </div>
                        <div className="price-info">
                          {totalQty > 0 && <span className="cart-count">+{formatQtyP(totalQty, item.uom_precision ?? 2)}</span>}
                          <div className="price" style={{ fontSize: 16 }}>₹{item.price.toFixed(2)}</div>
                        </div>
                      </SuggestionItem>
                    );
                  })
                )}
              </div>
            )}

            {/* New Main Area: Cart & Order Breakdown */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <CartHeader orderMode={orderMode}>
                <div className="header-left">
                  <div className="status-dot" />
                  <h3>Current Order</h3>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button 
                    onClick={() => setShowQuickAddModal(true)}
                    style={{
                      padding: '8px 18px',
                      background: orderMode === 'settle' ? '#f0fdf4' : '#fff7ed',
                      color: orderMode === 'settle' ? '#16a34a' : '#f97316',
                      border: `1.5px solid ${orderMode === 'settle' ? '#bbf7d0' : '#ffedd5'}`,
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 900,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: `0 2px 4px ${orderMode === 'settle' ? 'rgba(22, 163, 74, 0.1)' : 'rgba(249, 115, 22, 0.1)'}`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = orderMode === 'settle' ? '#dcfce7' : '#ffedd5';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = `0 4px 12px ${orderMode === 'settle' ? 'rgba(22, 163, 74, 0.15)' : 'rgba(249, 115, 22, 0.15)'}`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = orderMode === 'settle' ? '#f0fdf4' : '#fff7ed';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = `0 2px 4px ${orderMode === 'settle' ? 'rgba(22, 163, 74, 0.1)' : 'rgba(249, 115, 22, 0.1)'}`;
                    }}
                  >
                    <span style={{ fontSize: 16, marginTop: -1 }}>+</span> Product
                  </button>
                  {cart.length > 0 && (
                    <button 
                      onClick={() => { setCart([]); setDiscount({ type: 'amount', value: 0 }); }}
                      style={{ 
                        padding: '8px 16px', 
                        background: '#fff1f2', 
                        border: '1.5px solid #ffe4e6', 
                        borderRadius: 12, 
                        color: '#e11d48', 
                        fontSize: 11, 
                        fontWeight: 900, 
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#ffe4e6';
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#fff1f2';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      Clear Cart
                    </button>
                  )}
                </div>
              </CartHeader>
              
              <CartItems style={{ padding: '0 24px' }}>
                {cart.length === 0 ? (
                  <EmptyState>
                    <div className="icon">🛒</div>
                    <p style={{ fontSize: 16, color: '#1e293b', fontWeight: 700 }}>Cart is empty</p>
                    <p style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Type above to search and add items</p>
                  </EmptyState>
                ) : (
                  cart.map((item) => (
                    <div 
                      key={item.cartId} 
                      style={{
                        padding: '10px 16px 10px 8px',
                        background: '#ffffff',
                        border: '1.5px solid #eef2f6',
                        borderRadius: 18,
                        marginBottom: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        cursor: 'default',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                      onMouseEnter={(e) => {
                        const accentColor = (orderMode === 'settle' ? '#16a34a' : '#f97316');
                        e.currentTarget.style.borderColor = accentColor;
                        e.currentTarget.style.boxShadow = `0 20px 25px -5px ${accentColor}15, 0 10px 10px -5px ${accentColor}10`;
                        e.currentTarget.style.transform = 'translateX(6px) scale(1.02)';
                        e.currentTarget.querySelector('.remove-btn').style.opacity = '1';
                        e.currentTarget.querySelector('.remove-btn').style.transform = 'scale(1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#eef2f6';
                        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)';
                        e.currentTarget.style.transform = 'translateX(0) scale(1)';
                        e.currentTarget.querySelector('.remove-btn').style.opacity = '0.4';
                        e.currentTarget.querySelector('.remove-btn').style.transform = 'scale(0.9)';
                      }}
                    >
                      {/* Dynamic Mode Color Indicator Strip */}
                      <div style={{ 
                        width: 5, 
                        height: 38, 
                        borderRadius: 4, 
                        background: orderMode === 'settle' 
                          ? 'linear-gradient(180deg, #16a34a 0%, #22c55e 100%)' 
                          : 'linear-gradient(180deg, #f97316 0%, #fdba74 100%)',
                        boxShadow: `0 0 10px ${orderMode === 'settle' ? 'rgba(22, 163, 74, 0.2)' : 'rgba(0, 0, 0, 0.05)'}`,
                        flexShrink: 0
                      }} />

                      <div 
                        style={{ flex: 1, minWidth: 0, cursor: 'default', paddingLeft: 4 }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.3px' }}>
                          {item.name}
                        </div>
                        <div style={{ 
                          fontSize: 9, 
                          fontWeight: 800, 
                          color: item.veg ? '#16a34a' : '#dc2626', 
                          textTransform: 'uppercase', 
                          letterSpacing: '0.8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <span style={{ fontSize: 12 }}>{item.veg ? '🟢' : '🔴'}</span>
                           {item.category}
                        </div>
                      </div>
                      
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        background: '#f8fafc',
                        borderRadius: 12, 
                        padding: 3,
                        border: '1px solid #e2e8f0',
                        height: 36, 
                        flexShrink: 0,
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                      }}>
                        <button 
                          onClick={() => updateCartItem(item.cartId, item.quantity - 1, item.uom_precision)}
                          style={{ 
                            width: 28, 
                            height: 28, 
                            border: 'none', 
                            background: 'white', 
                            color: '#475569', 
                            fontWeight: 800, 
                            cursor: 'pointer', 
                            borderRadius: 8,
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#ef4444'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#475569'; }}
                        >−</button>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={qtyDrafts[item.cartId] ?? formatQtyP(item.quantity, item.uom_precision ?? 2)}
                          onChange={(e) => setDraft(item.cartId, e.target.value)}
                          onBlur={(e) => commitQtyDraft(item.cartId, e.target.value, item.uom_precision)}
                          onFocus={(e) => e.target.parentElement.style.borderColor = (orderMode === 'settle' ? '#16a34a' : '#f97316')}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          style={{ 
                            width: 40, 
                            border: 'none', 
                            background: 'transparent', 
                            height: '100%', 
                            textAlign: 'center', 
                            fontWeight: 900, 
                            fontSize: 14, 
                            color: '#1e293b',
                            outline: 'none',
                            padding: 0
                          }}
                        />
                        <button 
                          onClick={() => updateCartItem(item.cartId, item.quantity + 1, item.uom_precision)}
                          style={{ 
                            width: 28, 
                            height: 28, 
                            border: 'none', 
                            background: 'white', 
                            color: '#475569', 
                            fontWeight: 800, 
                            cursor: 'pointer', 
                            borderRadius: 8,
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#dcfce7'; e.currentTarget.style.color = '#16a34a'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#475569'; }}
                        >+</button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button 
                          onClick={() => !showDiscountModal && setShowDiscountModal(item.cartId)}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 10,
                            border: item.discount?.value > 0 ? `1.5px solid ${orderMode === 'settle' ? '#16a34a' : '#f97316'}` : '1.5px solid #e2e8f0',
                            background: item.discount?.value > 0 ? (orderMode === 'settle' ? '#f0fdf4' : '#fff7ed') : 'white',
                            color: item.discount?.value > 0 ? (orderMode === 'settle' ? '#16a34a' : '#f97316') : '#94a3b8',
                            fontSize: 14,
                            cursor: showDiscountModal ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            opacity: showDiscountModal ? 0.5 : 1,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                          }}
                          title="Apply Item Discount"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12.4498 2.65063C12.1932 2.39401 11.7774 2.394 11.5208 2.6506L2.65064 11.5208C2.394 11.7774 2.39401 12.1932 2.65063 12.4498L11.5208 21.32C11.7774 21.5766 12.1932 21.5766 12.4498 21.32L21.32 12.4498C21.5766 12.1932 21.5766 11.7774 21.32 11.5208L12.4498 2.65063Z" fill="#FBBF24" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <circle cx="7" cy="17" r="2" fill="white" transform="rotate(-45 7 17)" />
                          </svg>
                        </button>

                        <div style={{ textAlign: 'right', minWidth: '95px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <div 
                            style={{ fontSize: 16, fontWeight: 1000, color: '#0f172a', cursor: 'default', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', letterSpacing: '-0.5px' }}
                          >
                             <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                               ₹{(item.price * item.quantity).toFixed(2)}
                               {(!!restaurant?.gst_enabled && !restaurant?.prices_include_tax) && (
                                 <span style={{ 
                                   fontSize: 8, 
                                   color: orderMode === 'settle' ? '#166534' : '#9a3412', 
                                   fontWeight: 1000, 
                                   background: orderMode === 'settle' ? '#dcfce7' : '#ffedd5', 
                                   padding: '1px 6px', 
                                   borderRadius: 5,
                                   border: `1px solid ${orderMode === 'settle' ? '#bbf7d0' : '#fed7aa'}`,
                                   letterSpacing: '0.3px',
                                   textTransform: 'uppercase'
                                 }}>+ GST</span>
                               )}
                             </div>
                             {item.discount?.value > 0 && (
                               <div style={{ 
                                 fontSize: 9, 
                                 color: 'white', 
                                 fontWeight: 900, 
                                 background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                                 padding: '2px 8px', 
                                 borderRadius: 6, 
                                 marginTop: 1, 
                                 display: 'flex', 
                                 alignItems: 'center', 
                                 gap: 3,
                                 boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)'
                               }}>
                                 -{item.discount.type === 'percent' ? `${item.discount.value}% OFF` : `₹${item.discount.value} OFF`}
                               </div>
                             )}
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={() => removeFromCart(item.cartId)}
                        className="remove-btn"
                        style={{ 
                          width: 32, 
                          height: 32, 
                          borderRadius: 8, 
                          border: 'none', 
                          background: 'transparent', 
                          color: '#94a3b8', 
                          cursor: 'pointer', 
                          fontWeight: 500,
                          fontSize: 20,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          opacity: 0.6,
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.opacity = '0.6'; }}
                      >×</button>
                    </div>
                  ))
                )}
              </CartItems>


            </div>

            <KeyboardInfo style={{ padding: '12px 24px', borderTop: 'none', background: '#f8fafc' }}>
              <span><kbd>ESC</kbd> Close</span>
              <span><kbd>↑</kbd><kbd>↓</kbd> Select</span>
              <span><kbd>ENTER</kbd> Add Item</span>
            </KeyboardInfo>
          </MenuSection>
          
          {/* ActionSidebar - Payment & Customer Sidebar */}
          <ActionSidebar style={{ width: 420, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Scrollable Content Area */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Service & Guest Info Section - Compact */}
              <SidebarSection style={{ padding: '8px 16px' }}>
                 <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '6px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0' }}>
                       <span style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8' }}>GUESTS:</span>
                       <input 
                         type="number"
                         value={numberOfCustomers}
                         onChange={(e) => setNumberOfCustomers(e.target.value)}
                         style={{ width: '100%', background: 'transparent', border: 'none', fontSize: 14, fontWeight: 900, outline: 'none', padding: 0 }}
                       />
                    </div>
                    <div style={{ flex: 1.2, display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '6px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0' }}>
                       <span style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8' }}>MODE:</span>
                       <span style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#1e293b' }}>{orderType}</span>
                    </div>
                 </div>
              </SidebarSection>

              {/* Bill Summary Section - Compact */}
              <SidebarSection style={{ background: '#f8fafc', padding: '10px 16px' }}>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    
                    {/* Subtotal ex-tax - Only if different from Taxable */}
                    {Math.abs(cartTotals.subtotal_base_ex_tax - cartTotals.taxable_amount) > 0.01 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
                        <span>Subtotal (ex-tax)</span>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>₹{cartTotals.subtotal_base_ex_tax.toFixed(2)}</span>
                      </div>
                    )}

                    {/* Discount Row */}
                    {(cartTotals.line_discount_total + cartTotals.bill_discount_amount) > 0 ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#ef4444' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                           <span style={{ fontWeight: 600 }}>Discount (-)</span>
                           {orderMode === 'settle' && (
                             <button
                                onClick={() => setShowDiscountModal('bill')}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                  fontSize: 12, color: '#64748b', textDecoration: 'underline'
                                }}
                             >
                               Edit
                             </button>
                           )}
                        </div>
                        <span style={{ fontWeight: 600 }}>
                          -₹{(cartTotals.line_discount_total + cartTotals.bill_discount_amount).toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      /* If no discount, and in settle mode, show Add link if desired, or keep hidden until bottom button used. 
                         The user request implies we want to see the discount correctly applied. 
                         If 0, it wraps to null usually, but let's leave the bottom button to add. 
                         However, if we want to mimic counter.js exactly, it shows '+ Add Discount' inline if 0.
                         Let's stick to the current bottom button for adding, but ensure the ABOVE block correctly sums up line + bill discounts.
                      */
                      null
                    )}

                    {/* Taxable Value */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
                        <span>Taxable Value</span>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>
                            ₹{cartTotals.taxable_amount.toFixed(2)}
                        </span>
                    </div>

                    {/* Tax Breakdown */}
                    {cartTotals.total_tax_included > 0.01 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
                        <span>GST (incl)</span>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>
                          ₹{cartTotals.total_tax_included.toFixed(2)}
                        </span>
                      </div>
                    )}
                    
                    {cartTotals.total_tax_added > 0.01 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
                        <span>GST (+)</span>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>
                          ₹{cartTotals.total_tax_added.toFixed(2)}
                        </span>
                      </div>
                    )}

                    {/* Round Off */}
                    {Math.abs(cartTotals.round_off_amount || 0) > 0.001 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: (cartTotals.round_off_amount || 0) > 0 ? '#16a34a' : '#ef4444' }}>
                        <span>Round Off</span>
                        <span style={{ fontWeight: 600 }}>
                          {(cartTotals.round_off_amount || 0) > 0 ? '+' : ''}₹{(cartTotals.round_off_amount || 0).toFixed(2)}
                        </span>
                      </div>
                    )}

                    <div style={{ borderTop: '1px dashed #e2e8f0', marginTop: 4, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 1000, color: '#1e293b' }}>
                      <span>Total Payable</span>
                      <span style={{ color: orderMode === 'settle' ? '#16a34a' : '#f97316' }}>₹{total.toFixed(2)}</span>
                    </div>

                    {/* Quick Discount & Round Off Controls (Settle Mode Only) */}
                    {orderMode === 'settle' && (
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'white', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                         
                         {/* Manual Round Off Control */}
                         {roundOffConfig.round_off_enabled && (
                           <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>Round Off</span>
                                  {roundOffConfig.round_off_mode === 'manual' && (
                                    <span style={{ fontSize: 11, color: THEME.main, fontWeight: 600 }}>
                                      Max ±{roundOffConfig.round_off_manual_limit} allow
                                    </span>
                                  )}
                                  {roundOffConfig.round_off_mode === 'automatic' && (
                                     <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
                                       Auto-calculated
                                     </span>
                                  )}
                                </div>
                                
                                 <div style={{ position: 'relative' }}>
                                   <FormattedRoundOffInput 
                                      mode={roundOffConfig.round_off_mode}
                                      value={cartTotals.total_amount}
                                      base={cartTotals.total_inc_tax}
                                      limit={roundOffConfig.round_off_manual_limit}
                                      onChange={(diff) => {
                                         setRoundOffConfig(prev => ({ 
                                           ...prev, 
                                           round_off_mode: 'manual', 
                                           round_off_manual_value: diff 
                                         }));
                                      }}
                                      theme={THEME}
                                   />
                                 </div>
                              </div>
                           </div>
                         )}

                         {/* Discount Add/Edit Button */}
                         <div style={{ marginTop: 12 }}>
                           {discount.value === 0 ? (
                             <button 
                               onClick={() => setShowDiscountModal('bill')}
                               style={{ 
                                 width: '100%', 
                                 padding: '12px 16px',
                                 background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', 
                                 color: '#166534',
                                 border: '1px solid #bbf7d0',
                                 borderRadius: 12,
                                 fontSize: 13,
                                 fontWeight: 800,
                                 cursor: 'pointer',
                                 display: 'flex',
                                 alignItems: 'center',
                                 justifyContent: 'center',
                                 gap: 8,
                                 transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                 boxShadow: '0 2px 4px rgba(22, 163, 74, 0.05)',
                                 letterSpacing: '0.3px'
                               }}
                               onMouseEnter={(e) => {
                                 e.currentTarget.style.transform = 'translateY(-1px)';
                                 e.currentTarget.style.boxShadow = '0 4px 12px rgba(22, 163, 74, 0.12)';
                                 e.currentTarget.style.borderColor = '#86efac';
                               }}
                               onMouseLeave={(e) => {
                                 e.currentTarget.style.transform = 'translateY(0)';
                                 e.currentTarget.style.boxShadow = '0 2px 4px rgba(22, 163, 74, 0.05)';
                                 e.currentTarget.style.borderColor = '#bbf7d0';
                               }}
                             >
                               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                 <path d="M12.4498 2.65063C12.1932 2.39401 11.7774 2.394 11.5208 2.6506L2.65064 11.5208C2.394 11.7774 2.39401 12.1932 2.65063 12.4498L11.5208 21.32C11.7774 21.5766 12.1932 21.5766 12.4498 21.32L21.32 12.4498C21.5766 12.1932 21.5766 11.7774 21.32 11.5208L12.4498 2.65063Z" fill="#22c55e" fillOpacity="0.2" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                 <circle cx="12" cy="12" r="1.5" fill="#166534"/>
                               </svg>
                               Add Bill Discount
                             </button>
                           ) : (
                             <button 
                               onClick={() => setShowDiscountModal('bill')}
                               style={{ 
                                 width: '100%', 
                                 padding: '12px 16px',
                                 background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', 
                                 color: '#991b1b',
                                 border: '1.5px solid #fecaca',
                                 borderRadius: 14,
                                 fontSize: 13,
                                 fontWeight: 900,
                                 cursor: 'pointer',
                                 display: 'flex',
                                 justifyContent: 'space-between',
                                 alignItems: 'center',
                                 transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                 boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.08)',
                                 letterSpacing: '-0.2px'
                               }}
                               onMouseEnter={(e) => {
                                 e.currentTarget.style.transform = 'translateY(-1px)';
                                 e.currentTarget.style.boxShadow = '0 6px 15px rgba(220, 38, 38, 0.15)';
                                 e.currentTarget.style.borderColor = '#fca5a5';
                               }}
                               onMouseLeave={(e) => {
                                 e.currentTarget.style.transform = 'translateY(0)';
                                 e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(220, 38, 38, 0.08)';
                                 e.currentTarget.style.borderColor = '#fecaca';
                               }}
                             >
                                 <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                   <div style={{ background: '#ef4444', color: 'white', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900 }}>%</div>
                                   <span>Bill Discount Applied</span>
                                 </div>
                                 <span style={{ background: 'white', padding: '4px 10px', borderRadius: 8, border: '1px solid #fca5a5', color: '#dc2626', fontSize: 12, fontWeight: 1000, boxShadow: '0 2px 4px rgba(220, 38, 38, 0.05)' }}>
                                   {discount.type === 'percent' ? `${discount.value}%` : `₹${discount.value}`}
                                 </span>
                             </button>
                           )}
                         </div>
                 </div>
              )}
           </div>
        </SidebarSection>

              {/* Payment Controls */}
              {orderMode === 'settle' ? (
                <SidebarSection style={{ borderBottom: 'none', padding: '12px 16px' }}>
                  <div className="section-label" style={{ marginBottom: 8 }}>💳 Payment Method Selection</div>
                  <PaymentGrid>
                     <MethodCard 
                       active={selectedPaymentMethod === 'cash'} 
                       onClick={() => { setSelectedPaymentMethod('cash'); setIsCreditMode(false); }}
                       color="#16a34a" bgColor="#f0fdf4"
                     >
                       <span className="icon">💵</span>
                       <span className="label">Cash</span>
                     </MethodCard>
                     <MethodCard 
                       active={selectedPaymentMethod === 'online'} 
                       onClick={() => { setSelectedPaymentMethod('online'); setIsCreditMode(false); }}
                       color="#2563eb" bgColor="#eff6ff"
                     >
                       <span className="icon">💳</span>
                       <span className="label">Online</span>
                     </MethodCard>
                     <MethodCard 
                       active={selectedPaymentMethod === 'mixed'} 
                       onClick={() => { setSelectedPaymentMethod('mixed'); setIsCreditMode(false); }}
                       color="#9333ea" bgColor="#f5f3ff"
                     >
                       <span className="icon">🔀</span>
                       <span className="label">Mixed</span>
                     </MethodCard>
                     <MethodCard 
                       active={isCreditMode || selectedPaymentMethod === 'credit'} 
                       onClick={() => { setIsCreditMode(true); setSelectedPaymentMethod('credit'); loadCreditCustomers(); }}
                       color="#f59e0b" bgColor="#fffbeb"
                     >
                       <span className="icon">📖</span>
                       <span className="label">Credit</span>
                     </MethodCard>
                  </PaymentGrid>

                   {selectedPaymentMethod === 'online' && (
                     <div style={{ marginTop: 10, padding: '10px', background: '#eff6ff', borderRadius: 12, border: '1.5px solid #bfdbfe' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                           {['upi', 'card', 'net'].map(t => (
                             <button 
                               key={t}
                               onClick={() => setOnlineType(t)}
                               style={{ flex: 1, padding: '7px', borderRadius: 8, border: onlineType === t ? '2px solid #2563eb' : '1px solid #dbeafe', background: onlineType === t ? 'white' : 'transparent', color: onlineType === t ? '#2563eb' : '#64748b', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', cursor: 'pointer' }}
                             >
                               {t === 'upi' ? 'UPI' : t === 'card' ? 'Card' : 'Net'}
                             </button>
                           ))}
                        </div>
                     </div>
                   )}

                   {selectedPaymentMethod === 'mixed' && (
                     <div style={{ marginTop: 12, padding: '12px', background: '#f8fafc', borderRadius: 16, border: '1.5px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: 9, fontWeight: 800, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase' }}>Cash (₹)</label>
                            <input 
                              type="number" 
                              value={cashPart} 
                              onChange={(e) => {
                                 const val = e.target.value;
                                 setCashPart(val);
                                 const rem = (total - Number(val));
                                 setOnlinePart(rem > 0 ? rem.toFixed(2) : '0.00');
                              }}
                              style={{ width: '100%', padding: '8px', borderRadius: 8, border: '2px solid #16a34a', fontSize: 15, fontWeight: 900, outline: 'none' }}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: 9, fontWeight: 800, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase' }}>Online (₹)</label>
                            <div style={{ width: '100%', padding: '8px', borderRadius: 8, border: '2px solid #2563eb', fontSize: 15, fontWeight: 900, background: '#f1f5f9', color: '#2563eb' }}>
                              ₹{onlinePart || '0.00'}
                            </div>
                          </div>
                        </div>
                     </div>
                   )}
                </SidebarSection>
              ) : (
                <div style={{ padding: '60px 40px', textAlign: 'center', opacity: 0.5 }}>
                   <div style={{ fontSize: 40, marginBottom: 12 }}>👨‍🍳</div>
                   <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b' }}>KITCHEN MODE</div>
                   <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Order items will be sent to chef</div>
                </div>
              )}
            </div>

            {/* Final Submission Button - Sticky Bottom */}
            <div style={{ padding: '16px 20px', background: 'white', borderTop: '2.5px solid #f1f5f9' }}>
               <button 
                 onClick={handleCreateOrder}
                 disabled={cart.length === 0 || creating || (isCreditMode && !selectedCreditCustomerId)}
                 style={{
                   width: '100%',
                   padding: '16px',
                   borderRadius: 16,
                   border: 'none',
                   background: creating ? '#cbd5e1' : (orderMode === 'settle' ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'),
                   color: 'white',
                   fontSize: 16,
                   fontWeight: 900,
                   cursor: 'pointer',
                   boxShadow: `0 10px 20px -5px ${orderMode === 'settle' ? 'rgba(22, 163, 74, 0.4)' : 'rgba(249, 115, 22, 0.4)'}`,
                   transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center',
                   gap: 10
                 }}
               >
                 {creating ? 'PROCESSING...' : (
                   <>
                     <span style={{ fontSize: 13 }}>{orderMode === 'settle' ? 'SETTLE & PRINT BILL' : 'SEND TO KITCHEN (KOT)'}</span>
                     <span style={{ fontSize: 20, fontWeight: 950 }}>₹{total.toFixed(2)}</span>
                   </>
                 )}
               </button>
            </div>
          </ActionSidebar>

        </Content>
      </Container>
      <VariantSelector
        visible={showVariantSelector}
        item={selectedItem}
        onClose={() => setShowVariantSelector(false)}
        onSelect={handleVariantSelect}
        theme={THEME}
      />

      {showDiscountModal === 'bill' && (
        <DiscountModal
          visible={true}
          onClose={() => setShowDiscountModal(null)}
          onSaveTotal={setDiscount}
          cart={cart}
          onUpdateCartItem={onUpdateCartItem}
          currentTotalDiscount={discount}
          theme={THEME}
          totalAmount={cartTotals.gross_face_total}
        />
      )}

      {/* Item Level Discount Modal */}
      {typeof showDiscountModal === 'string' && showDiscountModal !== 'bill' && (
        <DiscountModal
          visible={true}
          onClose={() => setShowDiscountModal(null)}
          onSaveTotal={(d) => {
            const item = cart.find(c => c.cartId === showDiscountModal);
            if (item) {
              onUpdateCartItem(showDiscountModal, { 
                discount: d,
                // Recalculate discount_amount for the item based on its price/qty
                discount_amount: (item.price * item.quantity) * (d.type === 'percent' ? (d.value/100) : 0) || (d.type === 'amount' ? d.value : 0)
              });
            }
            setShowDiscountModal(null);
          }}
          cart={cart}
          currentTotalDiscount={cart.find(c => c.cartId === showDiscountModal)?.discount || { type: 'amount', value: 0 }}
          theme={THEME}
          totalAmount={(() => {
            const item = cart.find(c => c.cartId === showDiscountModal);
            return item ? item.price * item.quantity : 0;
          })()}
        />
      )}

      {/* New Credit Customer Modal */}
      {showNewCreditCustomerModal && (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(0,0,0,0.5)', 
            backdropFilter: 'blur(4px)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 10000 
          }} 
          onClick={() => setShowNewCreditCustomerModal(false)}
        >
          <div 
            style={{ 
              background: 'white', 
              borderRadius: 16, 
              width: '100%', 
              maxWidth: 400, 
              padding: 24,
              boxShadow: '0 20px 40px -12px rgba(0,0,0,0.25)'
            }} 
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800, color: '#1e293b' }}>
              New Credit Customer
            </h3>
            
            {creditError && (
              <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                {creditError}
              </div>
            )}
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Full Name</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
                style={{ 
                  width: '100%', 
                  padding: '12px 14px', 
                  borderRadius: 10, 
                  border: '1.5px solid #e5e7eb', 
                  fontSize: 14, 
                  fontWeight: 500, 
                  outline: 'none' 
                }}
              />
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Phone Number</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setCustomerPhone(val);
                }}
                placeholder="10-digit phone number"
                style={{ 
                  width: '100%', 
                  padding: '12px 14px', 
                  borderRadius: 10, 
                  border: '1.5px solid #e5e7eb', 
                  fontSize: 14, 
                  fontWeight: 500, 
                  outline: 'none' 
                }}
              />
              {customerPhone.length > 0 && customerPhone.length < 10 && (
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>Please enter a 10-digit phone number</div>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => { setShowNewCreditCustomerModal(false); setCreditError(''); }}
                style={{ 
                  flex: 1, 
                  padding: '12px', 
                  borderRadius: 10, 
                  border: '1px solid #e5e7eb', 
                  background: 'white', 
                  color: '#64748b', 
                  fontSize: 14, 
                  fontWeight: 700, 
                  cursor: 'pointer' 
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewCreditCustomer}
                disabled={creditProcessing || customerName.trim().length < 2 || customerPhone.length < 10}
                style={{ 
                  flex: 1, 
                  padding: '12px', 
                  borderRadius: 10, 
                  border: 'none', 
                  background: (creditProcessing || customerName.trim().length < 2 || customerPhone.length < 10) ? '#cbd5e1' : '#f59e0b',
                  color: 'white', 
                  fontSize: 14, 
                  fontWeight: 700, 
                  cursor: (creditProcessing || customerName.trim().length < 2 || customerPhone.length < 10) ? 'not-allowed' : 'pointer' 
                }}
              >
                {creditProcessing ? 'Saving...' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Quick Add Product Modal */}
      {showQuickAddModal && (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(0,0,0,0.6)', 
            backdropFilter: 'blur(8px)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 10000 
          }} 
          onClick={() => setShowQuickAddModal(false)}
        >
          <QuickAddContainer 
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ 
              padding: '24px 28px', 
              background: orderMode === 'settle' 
                ? 'linear-gradient(135deg, #065f46 0%, #059669 100%)' 
                : 'linear-gradient(135deg, #9a3412 0%, #ea580c 100%)',
              color: 'white',
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: '-0.5px' }}>
                  Quick Add Item
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Add to menu & cart instantly
                </p>
              </div>
              <button 
                onClick={() => setShowQuickAddModal(false)} 
                style={{ 
                  background: 'rgba(255,255,255,0.1)', 
                  border: 'none', 
                  width: 32, 
                  height: 32, 
                  borderRadius: 8, 
                  color: 'white', 
                  fontSize: 20, 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
                onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
              >
                ×
              </button>
            </div>
            
            <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Item Name */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  <span>🍴</span> Item Name
                </label>
                <input
                  type="text"
                  autoFocus
                  value={quickProduct.name}
                  onChange={(e) => setQuickProduct({ ...quickProduct, name: e.target.value })}
                  placeholder="e.g. Special Masala Tea"
                  style={{ 
                    width: '100%', 
                    padding: '14px 16px', 
                    borderRadius: 14, 
                    border: '2px solid #f1f5f9', 
                    background: '#f8fafc',
                    fontSize: 15, 
                    fontWeight: 600, 
                    color: '#1e293b',
                    outline: 'none', 
                    transition: 'all 0.2s' 
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = orderMode === 'settle' ? '#16a34a' : '#f97316';
                    e.target.style.background = 'white';
                    e.target.style.boxShadow = `0 0 0 4px ${orderMode === 'settle' ? 'rgba(22,163,74,0.1)' : 'rgba(249,115,22,0.1)'}`;
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#f1f5f9';
                    e.target.style.background = '#f8fafc';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
              
              {/* Price & Code Row */}
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1.2 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    <span>💰</span> Price (₹)
                  </label>
                  <input
                    type="number"
                    value={quickProduct.price}
                    onChange={(e) => setQuickProduct({ ...quickProduct, price: e.target.value })}
                    placeholder="0.00"
                    style={{ 
                      width: '100%', 
                      padding: '14px 16px', 
                      borderRadius: 14, 
                      border: '2px solid #f1f5f9', 
                      background: '#f8fafc', 
                      fontSize: 15, 
                      fontWeight: 700, 
                      color: '#1e293b', 
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = orderMode === 'settle' ? '#16a34a' : '#f97316';
                      e.target.style.background = 'white';
                      e.target.style.boxShadow = `0 0 0 4px ${orderMode === 'settle' ? 'rgba(22,163,74,0.1)' : 'rgba(249,115,22,0.1)'}`;
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#f1f5f9';
                      e.target.style.background = '#f8fafc';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <div style={{ flex: 0.8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    <span>🏷️</span> Code
                  </label>
                  <input
                    type="text"
                    value={quickProduct.code}
                    onChange={(e) => setQuickProduct({ ...quickProduct, code: e.target.value })}
                    placeholder="Opt"
                    style={{ 
                      width: '100%', 
                      padding: '14px 16px', 
                      borderRadius: 14, 
                      border: '2px solid #f1f5f9', 
                      background: '#f8fafc', 
                      fontSize: 15, 
                      fontWeight: 600, 
                      color: '#1e293b', 
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = orderMode === 'settle' ? '#16a34a' : '#f97316';
                      e.target.style.background = 'white';
                      e.target.style.boxShadow = `0 0 0 4px ${orderMode === 'settle' ? 'rgba(22,163,74,0.1)' : 'rgba(249,115,22,0.1)'}`;
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#f1f5f9';
                      e.target.style.background = '#f8fafc';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              {/* Category & Tax Row */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    <span>📂</span> Category
                  </label>
                  <NiceSelect
                    value={quickProduct.category}
                    onChange={(val) => setQuickProduct({ ...quickProduct, category: val })}
                    options={categories.filter(c => c.value !== 'all').map(c => ({ value: c.value, label: c.label }))}
                    placeholder="Select Category"
                    style={{ background: '#f8fafc', borderRadius: 14, height: 50 }}
                  />
                </div>
                {quickProduct.packaged && (
                  <SlideInContainer style={{ flex: 1 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      <span>🧾</span> Tax Rate (%)
                    </label>
                    <input
                      type="number"
                      value={quickProduct.tax_rate}
                      onChange={(e) => setQuickProduct({ ...quickProduct, tax_rate: e.target.value })}
                      placeholder="e.g. 18"
                      style={{ 
                        width: '100%', 
                        padding: '14px 16px', 
                        borderRadius: 14, 
                        border: '2px solid #f1f5f9', 
                        background: '#f8fafc', 
                        fontSize: 15, 
                        fontWeight: 600, 
                        color: '#1e293b', 
                        outline: 'none',
                        transition: 'all 0.2s'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = orderMode === 'settle' ? '#16a34a' : '#f97316';
                        e.target.style.background = 'white';
                        e.target.style.boxShadow = `0 0 0 4px ${orderMode === 'settle' ? 'rgba(22,163,74,0.1)' : 'rgba(249,115,22,0.1)'}`;
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#f1f5f9';
                        e.target.style.background = '#f8fafc';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </SlideInContainer>
                )}
              </div>

              {/* Toggles Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '8px 4px', borderTop: '1px solid #f1f5f9', paddingTop: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                   <div 
                    onClick={() => setQuickProduct({ ...quickProduct, veg: !quickProduct.veg })}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      background: quickProduct.veg ? '#22c55e' : '#e2e8f0',
                      position: 'relative',
                      transition: 'all 0.3s'
                    }}
                   >
                     <div style={{
                       width: 18,
                       height: 18,
                       background: 'white',
                       borderRadius: '50%',
                       position: 'absolute',
                       top: 3,
                       left: quickProduct.veg ? 23 : 3,
                       transition: 'all 0.3s',
                       boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                     }} />
                   </div>
                   <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Pure Veg</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                   <div 
                    onClick={() => setQuickProduct({ ...quickProduct, packaged: !quickProduct.packaged })}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      background: quickProduct.packaged ? '#3b82f6' : '#e2e8f0',
                      position: 'relative',
                      transition: 'all 0.3s'
                    }}
                   >
                     <div style={{
                       width: 18,
                       height: 18,
                       background: 'white',
                       borderRadius: '50%',
                       position: 'absolute',
                       top: 3,
                       left: quickProduct.packaged ? 23 : 3,
                       transition: 'all 0.3s',
                       boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                     }} />
                   </div>
                   <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Packaged</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                   <div 
                    onClick={() => setQuickProduct({ ...quickProduct, has_variants: !quickProduct.has_variants })}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      background: quickProduct.has_variants ? '#9333ea' : '#e2e8f0',
                      position: 'relative',
                      transition: 'all 0.3s'
                    }}
                   >
                     <div style={{
                       width: 18,
                       height: 18,
                       background: 'white',
                       borderRadius: '50%',
                       position: 'absolute',
                       top: 3,
                       left: quickProduct.has_variants ? 23 : 3,
                       transition: 'all 0.3s',
                       boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                     }} />
                   </div>
                   <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Has Variants</span>
                </label>
              </div>
              
              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                <button
                  onClick={() => setShowQuickAddModal(false)}
                  style={{ 
                    flex: 1, 
                    padding: '16px', 
                    borderRadius: 16, 
                    border: '2px solid #f1f5f9', 
                    background: 'white', 
                    color: '#64748b', 
                    fontWeight: 800, 
                    fontSize: 14, 
                    cursor: 'pointer', 
                    transition: 'all 0.2s' 
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#f8fafc';
                    e.target.style.borderColor = '#e2e8f0';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'white';
                    e.target.style.borderColor = '#f1f5f9';
                  }}
                >
                  Discard
                </button>
                <button
                  onClick={handleQuickAddProduct}
                  disabled={quickAddLoading || !quickProduct.name || !quickProduct.price}
                  style={{ 
                    flex: 1.6, 
                    padding: '16px', 
                    borderRadius: 16, 
                    border: 'none', 
                    background: (quickAddLoading || !quickProduct.name || !quickProduct.price) 
                      ? '#e2e8f0' 
                      : (orderMode === 'settle' 
                          ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' 
                          : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'), 
                    color: (quickAddLoading || !quickProduct.name || !quickProduct.price) ? '#94a3b8' : 'white', 
                    fontWeight: 900, 
                    fontSize: 15,
                    cursor: (quickAddLoading || !quickProduct.name || !quickProduct.price) ? 'not-allowed' : 'pointer',
                    boxShadow: (quickAddLoading || !quickProduct.name || !quickProduct.price) ? 'none' : `0 10px 20px -5px ${orderMode === 'settle' ? 'rgba(22,163,74,0.4)' : 'rgba(249,115,22,0.4)'}`,
                    transition: 'all 0.3s'
                  }}
                  onMouseEnter={(e) => {
                    if (!quickAddLoading && quickProduct.name && quickProduct.price) {
                      e.target.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'none';
                  }}
                >
                  {quickAddLoading ? 'Creating...' : 'Confirm & Add'}
                </button>
              </div>
            </div>
          </QuickAddContainer>
        </div>
      )}
    </Overlay>
  );
}
