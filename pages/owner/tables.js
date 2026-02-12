// pages/owner/table-management.js - Premium Table Management Screen
// Comprehensive table management with grid/list views, real-time status, sections, and advanced features

import React, { useEffect, useState, useMemo, useRef } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import { getSupabase } from '../../services/supabase';
import { useRouter } from 'next/router';
import NiceSelect from '../../components/NiceSelect';
import Layout from '../../components/Layout';
import UiButton from '../../components/ui/Button'; // Renamed to avoid conflict with styled-component Button
import OrderItemsModal from '../../components/OrderItemsModal';
import EditOrderPanel from '../../components/EditOrderPanel';
import { round2, roundP, formatQtyP } from '../../lib/qty';
import { LoyaltyService } from '../../services/loyaltyService';


import PaymentConfirmDialog from '../../components/PaymentConfirmDialog';
import CreateOrderModal from '../../components/CreateOrderModal';
import { calculateOrderTotals } from '../../utils/orderCalculations';
import { useAlert } from '../../context/AlertContext';
import { 
  useTables, 
  useSections, 
  useFloors, 
  useTableMutation, 
  useDeleteTable, 
  useUpdateTableStatus,
  useAddSection,
  useDeleteSection,
  useAddFloor,
  useDeleteFloor
} from '../../hooks/useTables';
import { useOrders } from '../../hooks/useOrders';

// Animations
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
`;

const slideIn = keyframes`
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
`;

// Styled Components
// Styled Components - Dynamic & Premium Design
const PageContainer = styled.div`
  width: 100%;
  max-width: 100%;
  padding: 8px 0 60px;
  min-height: 100dvh;
  font-family: 'Outfit', 'DM Sans', 'Inter', sans-serif;
  background-color: #f8fafc;
  animation: ${fadeIn} 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
  overflow-x: hidden;

  @media (max-width: 640px) {
    padding: 0 0 120px;
  }
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-bottom: 32px;
  width: 100%;
`;

const TitleBlock = styled.div``;

const Title = styled.h1`
  font-size: clamp(28px, 5vw, 42px);
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 0;
  background: linear-gradient(135deg, #0f172a 0%, #334155 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1.1;
  
  span {
    background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: #475569;
  margin: 12px 0 0;
  font-weight: 500;
  max-width: 600px;
  line-height: 1.6;
  opacity: 0.9;
`;

// Scrollable Stats for Mobile
const StatsScroll = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  
  @media (max-width: 768px) {
    display: flex;
    overflow-x: auto;
    padding-bottom: 20px;
    margin: 0 -16px;
    padding-left: 16px;
    padding-right: 16px;
    scroll-snap-type: x mandatory;
    
    &::-webkit-scrollbar {
      display: none;
    }
  }
`;

const StatCard = styled.div`
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.4);
  padding: 24px;
  border-radius: 32px;
  box-shadow: 
    0 10px 20px -5px rgba(0, 0, 0, 0.04),
    0 4px 6px -2px rgba(0, 0, 0, 0.01);
  display: flex;
  flex-direction: column;
  transition: all 0.4s cubic-bezier(0.2, 1, 0.2, 1);
  min-width: 180px;
  scroll-snap-align: start;
  position: relative;
  overflow: hidden;
  
  &:hover {
    transform: translateY(-8px);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.08);
    background: white;
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 4px;
    background: ${props => props.accent || '#cbd5e1'};
    opacity: 0.8;
  }
`;

const StatValue = styled.div`
  font-size: 32px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.03em;
  line-height: 1;
  margin-bottom: 4px;
`;

const StatLabel = styled.div`
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: 6px;
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,0.4);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
  margin-bottom: 32px;
  position: relative;
  z-index: 100;
  
  @media (max-width: 1024px) {
    background: transparent;
    border: none;
    box-shadow: none;
    padding: 0;
    flex-direction: column;
    align-items: stretch;
  }
`;

const MainLayout = styled.div`
  display: flex;
  gap: 40px;
  align-items: flex-start;
  width: 100%;
  
  @media (max-width: 1200px) {
    flex-direction: column;
    gap: 32px;
  }
`;

const Sidebar = styled.aside`
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
  position: sticky;
  top: 16px;
  padding: 20px;
  background: white;
  border-radius: 20px;
  border: 1px solid rgba(0,0,0,0.05);
  box-shadow: 0 4px 20px rgba(0,0,0,0.03);
  
  @media (max-width: 1200px) {
    width: 100%;
    position: static;
    padding: 12px;
    flex-direction: row;
    overflow-x: auto;
    border: none;
    background: transparent;
    box-shadow: none;
    gap: 12px;
  }
`;

const MainContent = styled.main`
  flex: 1;
  min-width: 0;
  width: 100%;
`;

const SidebarGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  
  @media (max-width: 1200px) {
    flex-shrink: 0;
    min-width: 200px;
  }
`;

const SidebarLabel = styled.h3`
  font-size: 13px;
  font-weight: 800;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #f1f5f9;
  }
`;

const SidebarFilterList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  
  @media (max-width: 1200px) {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 6px;
  }
`;

const ToolbarLeft = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
  flex: 1;
  
  @media (max-width: 1024px) {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    width: 100%;
  }
`;

const FilterCarousel = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 2px;
  max-width: calc(100vw - 400px);
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  
  &::-webkit-scrollbar {
    height: 4px;
    display: none;
  }
  
  &:hover::-webkit-scrollbar {
    display: block;
  }
  
  &::-webkit-scrollbar-track { background: #f1f5f9; }
  &::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }

  @media (max-width: 1024px) {
    max-width: 100%;
    width: 100%;
    padding: 4px 0;
    gap: 6px;
  }
`;

const FilterPill = styled.button`
  padding: 10px 18px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid ${props => props.active ? '#ea580c' : 'transparent'};
  background: ${props => props.active ? '#ea580c' : '#f8fafc'};
  color: ${props => props.active ? 'white' : '#64748b'};
  box-shadow: ${props => props.active ? '0 4px 12px rgba(234, 88, 12, 0.2)' : 'none'};
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  
  &:hover {
    border-color: #ea580c;
    color: ${props => props.active ? 'white' : '#ea580c'};
    background: ${props => props.active ? '#ea580c' : 'white'};
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  }
  
  &:active {
    transform: translateY(0);
  }

  @media (max-width: 1200px) {
    width: auto;
  }
`;

const AddOrderButton = styled.button`
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
  color: white;
  border: none;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 4px;
  box-shadow: 0 10px 20px -5px rgba(249, 115, 22, 0.3);

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 15px 30px -8px rgba(249, 115, 22, 0.4);
    background: linear-gradient(135deg, #ea580c 0%, #d97706 100%);
  }

  &:active {
    transform: translateY(-1px);
    box-shadow: 0 5px 10px -2px rgba(249, 115, 22, 0.4);
  }

  svg {
    width: 20px;
    height: 20px;
    stroke-width: 3;
  }

  @media (max-width: 1200px) {
    width: auto;
    margin-top: 0;
    padding: 10px 18px;
    border-radius: 14px;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 16px;
  border-right: 1px solid #e2e8f0;
  
  &:last-child {
    border-right: none;
    padding-right: 0;
  }
  
  @media (max-width: 640px) {
    border-right: none;
    padding-right: 0;
  }
`;

const FilterLabel = styled.span`
  font-size: 11px;
  font-weight: 800;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
`;

const ToolbarRight = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  
  @media (max-width: 1024px) {
    width: 100%;
    justify-content: space-between;
  }
  
  @media (max-width: 640px) {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
`;

const Button = styled.button`
  padding: 10px 20px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  
  ${props => props.primary && `
    background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(234, 88, 12, 0.25);
    
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(234, 88, 12, 0.35);
    }
  `}
  
  ${props => props.secondary && `
    background: white;
    color: #475569;
    border: 1px solid #e2e8f0;
    
    &:hover {
      background: #f8fafc;
      color: #1e293b;
      border-color: #cbd5e1;
    }
  `}
`;

const DangerButton = styled.button`
  padding: 10px 20px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1.5px solid #fee2e2;
  background: white;
  color: #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  
  &:hover:not(:disabled) {
    background: #ef4444;
    color: white;
    border-color: #ef4444;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #f1f5f9;
    border-color: #e2e8f0;
    color: #94a3b8;
  }
`;

const ConfigButton = styled.button`
  background: #ea580c;
  border: 1px solid #ea580c;
  padding: 10px 18px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 700;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(234, 88, 12, 0.2);
  
  &:hover {
    background: #f97316;
    border-color: #f97316;
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(234, 88, 12, 0.3);
  }

  svg {
    opacity: 1;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-self: center;
`;

const SearchInput = styled.input`
  padding: 14px 20px 14px 48px;
  border: 1.5px solid #e2e8f0;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 500;
  width: 450px;
  background: white url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="%23ea580c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>') no-repeat 16px center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
  color: #1e293b;
  
  &::placeholder {
    color: #94a3b8;
  }
  
  &:focus {
    outline: none;
    border-color: #ea580c;
    box-shadow: 0 10px 15px -3px rgba(234, 88, 12, 0.1), 0 4px 6px -2px rgba(234, 88, 12, 0.05);
    width: 550px;
    background-color: white;
  }

  @media (max-width: 1024px) {
    width: 100%;
    &:focus {
      width: 100%;
    }
  }
`;



const QrToggleContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: white;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  transition: all 0.2s;
  
  &:hover {
    border-color: #ea580c;
    box-shadow: 0 4px 12px rgba(234, 88, 12, 0.05);
  }
  
  @media (max-width: 640px) {
    display: none;
  }
`;

const ToggleSwitch = styled.label`
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  cursor: pointer;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  span {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #cbd5e1;
    transition: .4s;
    border-radius: 24px;
  }

  span:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: .4s;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  input:checked + span {
    background-color: #ea580c;
  }

  input:focus + span {
    box-shadow: 0 0 1px #ea580c;
  }

  input:checked + span:before {
    transform: translateX(20px);
  }
`;

const QrToggleLabel = styled.div`
  font-size: 11px;
  font-weight: 700;
  color: #475569;
  white-space: nowrap;
`;




const ManageList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 20px;
  max-height: 400px;
  overflow-y: auto;
  padding-right: 4px;
`;

const ManageItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  background: #f8fafc;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  transition: all 0.2s;
  
  &:hover {
    background: #f1f5f9;
    border-color: #cbd5e1;
  }
`;

const ItemInfo = styled.div`
  display: flex;
  flex-direction: column;
`;

const ItemName = styled.div`
  font-weight: 700;
  color: #0f172a;
  font-size: 15px;
`;

const ItemActions = styled.div`
  display: flex;
  gap: 8px;
`;

const TrashButton = styled.button`
  background: transparent;
  border: none;
  padding: 8px;
  color: #ef4444;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    background: rgba(239, 68, 68, 0.1);
    transform: scale(1.1);
  }
`;

const ViewToggle = styled.div`
  display: flex;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 12px;
  gap: 4px;
  
  @media (max-width: 640px) {
    background: white;
    border: 1px solid #e2e8f0;
    width: 100%;
  }
`;

const ViewButton = styled.button`
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: ${props => props.active ? 'white' : 'transparent'};
  color: ${props => props.active ? '#0f172a' : '#64748b'};
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  box-shadow: ${props => props.active ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'};
  transition: all 0.2s;
  
  @media (max-width: 640px) {
    flex: 1;
  }
`;

// Dynamic Grid
const TableGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 24px;
  max-width: 1600px;
  margin: 0 auto;
  perspective: 1000px;
  
  @media (max-width: 640px) {
    grid-template-columns: repeat(auto-fill, minmax(100%, 1fr));
    gap: 16px;
  }
`;

const TableCard = styled.div`
  border-radius: 32px;
  position: relative;
  transition: all 0.5s cubic-bezier(0.2, 1, 0.2, 1);
  background: ${props => {
     switch(props.status) {
       case 'occupied': return 'rgba(255, 255, 255, 0.95)';
       case 'reserved': return 'rgba(255, 255, 255, 0.95)';
       default: return 'rgba(255, 255, 255, 0.85)';
     }
  }};
  backdrop-filter: blur(10px);
  border: 1px solid ${props => {
     switch(props.status) {
       case 'occupied': return 'rgba(239, 68, 68, 0.2)'; 
       case 'reserved': return 'rgba(59, 130, 246, 0.2)';
       case 'cleaning': return 'rgba(249, 115, 22, 0.2)';
       default: return 'rgba(255, 255, 255, 0.5)';
     }
  }};
  box-shadow: 
    0 10px 30px -5px rgba(0, 0, 0, 0.04),
    0 4px 6px -2px rgba(0, 0, 0, 0.02);
  overflow: hidden;
  cursor: pointer;
  
  &:hover {
    transform: translateY(-8px);
    box-shadow: 
      0 30px 60px -12px rgba(0, 0, 0, 0.12),
      0 18px 36px -18px rgba(0, 0, 0, 0.06);
    z-index: 10;
  }

  ${props => props.status === 'occupied' && css`
    &::before {
       content: '';
       position: absolute;
       top: 0; left: 0; right: 0; height: 6px;
       background: linear-gradient(90deg, #ef4444, #f87171);
       z-index: 1;
    }
  `}
`;

const TableCardHeader = styled.div`
  padding: 20px 24px 16px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
`;

const TableNumber = styled.div`
  font-size: 24px;
  font-weight: 800;
  color: #1e293b;
  display: flex;
  flex-direction: column;
  line-height: 1;
  
  span {
    font-size: 13px;
    font-weight: 600;
    color: #64748b;
    margin-top: 4px;
  }
`;

const StatusBadge = styled.div`
  padding: ${props => props.minimal ? '0' : '8px 16px'};
  border-radius: 100px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  
  ${props => {
    const minimal = props.minimal;
    switch(props.status) {
      case 'available': return `
        background: ${minimal ? 'transparent' : 'rgba(16, 185, 129, 0.12)'}; color: #065f46;
      `;
      case 'occupied': return `
        background: ${minimal ? 'transparent' : 'rgba(239, 68, 68, 0.12)'}; color: #991b1b;
      `;
      case 'reserved': return `
        background: ${minimal ? 'transparent' : 'rgba(59, 130, 246, 0.12)'}; color: #1e40af;
      `;
      case 'cleaning': return `
        background: ${minimal ? 'transparent' : 'rgba(249, 115, 22, 0.12)'}; color: #9a3412;
      `;
      case 'maintenance': return `
        background: ${minimal ? 'transparent' : 'rgba(71, 85, 105, 0.12)'}; color: #1e293b;
      `;
      default: return `background: ${minimal ? 'transparent' : '#f1f5f9'}; color: #64748b;`;
    }
  }}

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    ${props => props.status === 'occupied' && `
      animation: pulse-dot 1s infinite alternate;
    `}
  }
  
  @keyframes pulse-dot {
    from { transform: scale(0.8); opacity: 0.5; }
    to { transform: scale(1.2); opacity: 1; }
  }
`;

const TableInfo = styled.div`
  padding: 0 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const InfoRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #475569;
  font-weight: 500;
`;

const TableActions = styled.div`
  padding: 16px 24px;
  background: rgba(255,255,255,0.6);
  border-top: 1px solid rgba(0,0,0,0.04);
  display: flex;
  flex-wrap: wrap;
  gap: 8px; 
`;

const ActionButton = styled.button`
  padding: 12px;
  border-radius: 16px;
  font-weight: 700;
  font-size: 11px;
  cursor: pointer;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-transform: uppercase;
  letter-spacing: 0.08em;

  ${props => props.variant === 'primary' && `
    background: #f0f9ff; color: #0369a1;
    &:hover { background: #0369a1; color: white; transform: translateY(-2px); }
  `}
  ${props => props.variant === 'success' && `
    background: #f0fdf4; color: #166534;
    &:hover { background: #166534; color: white; transform: translateY(-2px); }
  `}
  ${props => props.variant === 'warning' && `
    background: #fff7ed; color: #9a3412;
    &:hover { background: #9a3412; color: white; transform: translateY(-2px); }
  `}
  ${props => props.variant === 'danger' && `
    background: #fef2f2; color: #991b1b;
    &:hover { background: #991b1b; color: white; transform: translateY(-2px); }
  `}
  
  ${props => props.fullWidth ? `
    width: 100%;
    height: 48px;
    font-size: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  ` : `
    flex: 1;
    min-width: 90px;
  `}

  &:active {
    transform: scale(0.98);
  }
`;

const EditIcon = styled.button`
  width: 36px; height: 36px;
  border-radius: 12px;
  border: 1.5px solid rgba(3, 105, 161, 0.1);
  background: #f0f9ff;
  color: #0369a1;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  padding: 0;
  
  &:hover {
    background: #e0f2fe;
    color: #0284c7;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(3, 105, 161, 0.15);
    border-color: rgba(3, 105, 161, 0.3);
  }

  &:active {
    transform: translateY(0);
    background: #bae6fd;
  }
`;

const TableList = styled.div`
  background: white;
  border-radius: 20px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  max-width: 1600px;
  margin: 0 auto;
`;

const TableListHeader = styled.div`
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.8fr 1.2fr 1.5fr 3fr;
  padding: 18px 24px;
  background: #f8fafc;
  border-bottom: 2px solid #e2e8f0;
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  color: #64748b;
  letter-spacing: 0.05em;
  
  @media (max-width: 1024px) {
    display: none;
  }
`;

const TableListRow = styled.div`
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.8fr 1.2fr 1.5fr 3fr;
  padding: 18px 24px;
  border-bottom: 1px solid #f1f5f9;
  align-items: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: white;
  
  &:hover {
    background: #f8fafc;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
    z-index: 1;
  }

  @media (max-width: 1024px) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
`;

// Visual Floor Plan Components
const FloorPlanContainer = styled.div`
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 24px;
  padding: 40px;
  min-height: 600px;
  max-height: 800px;
  position: relative;
  overflow: auto;
  box-shadow: inset 0 2px 20px rgba(0,0,0,0.02);
  
  /* Smooth scrolling */
  scroll-behavior: smooth;
  
  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(241, 245, 249, 0.5);
    border-radius: 10px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.5);
    border-radius: 10px;
    
    &:hover {
      background: rgba(148, 163, 184, 0.7);
    }
  }
  
  /* Grid background */
  background-image:
    linear-gradient(to right, rgba(148, 163, 184, 0.08) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(148, 163, 184, 0.08) 1px, transparent 1px);
  background-size: 40px 40px;
  
  @media (max-width: 768px) {
    padding: 16px;
    min-height: 300px;
    max-height: calc(100vh - 250px);
    border-radius: 16px;
    background-size: 30px 30px;
    
    &::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
  }
`;

const VisualTable = styled.div`
  position: absolute;
  width: ${props => props.shape === 'round' ? '100px' : '120px'};
  height: ${props => props.shape === 'round' ? '100px' : '80px'};
  left: ${props => props.x || 0}px;
  top: ${props => props.y || 0}px;
  background: ${props => 
    props.status === 'available' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' :
    props.status === 'occupied' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' :
    props.status === 'reserved' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' :
    props.status === 'cleaning' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' :
    'linear-gradient(135deg, #64748b 0%, #475569 100%)'
  };
  border-radius: ${props => props.shape === 'round' ? '50%' : '16px'};
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
  z-index: ${props => props.isDragging ? 1000 : 1};
  
  &:hover {
    transform: scale(1.05) translateY(-4px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10;
  }
  
  &:active {
    cursor: grabbing;
    transform: scale(1.08);
  }
  
  @media (max-width: 768px) {
    width: ${props => props.shape === 'round' ? '70px' : '90px'};
    height: ${props => props.shape === 'round' ? '70px' : '60px'};
    border-radius: ${props => props.shape === 'round' ? '50%' : '12px'};
    
    &:hover {
      transform: scale(1.03);
    }
    
    &:active {
      transform: scale(1.05);
    }
  }
`;

const VisualTableNumber = styled.div`
  font-size: 24px;
  font-weight: 800;
  margin-bottom: 4px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  
  @media (max-width: 768px) {
    font-size: 18px;
    margin-bottom: 2px;
  }
`;

const VisualTableCapacity = styled.div`
  font-size: 11px;
  font-weight: 600;
  opacity: 0.9;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  
  @media (max-width: 768px) {
    font-size: 9px;
    letter-spacing: 0.3px;
  }
`;

const FloorPlanLegend = styled.div`
  position: absolute;
  top: 20px;
  right: 20px;
  background: white;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 10;
  
  @media (max-width: 768px) {
    top: auto;
    bottom: 12px;
    left: 12px;
    right: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    gap: 8px;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }
`;

const LegendItem = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  
  @media (max-width: 768px) {
    gap: 6px;
    font-size: 11px;
  }
`;

const LegendDot = styled.div`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${props => props.color};
  
  @media (max-width: 768px) {
    width: 10px;
    height: 10px;
  }
`;

const VisualTablePopover = styled.div`
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%);
  border-radius: 24px;
  padding: 24px;
  box-shadow: 
    0 30px 80px rgba(0, 0, 0, 0.25), 
    0 10px 30px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(0, 0, 0, 0.05);
  z-index: 1001;
  min-width: 380px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  animation: ${fadeIn} 0.2s ease-out;
  border: 1px solid rgba(255, 255, 255, 0.8);
  
  /* Custom scrollbar for popover content */
  &::-webkit-scrollbar {
    width: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
    
    &:hover {
      background: #94a3b8;
    }
  }
  
  @media (max-width: 768px) {
    max-width: 95vw;
    max-height: 85vh;
    padding: 20px 16px;
    min-width: 320px;
  }
`;

const PopoverHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 2px solid #f1f5f9;
  gap: 16px;
`;

const PopoverTitle = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const PopoverTableNumber = styled.div`
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;
`;

const PopoverCloseButton = styled.button`
  background: transparent;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  color: #64748b;
  padding: 0;
  
  &:hover {
    color: #ef4444;
    transform: scale(1.15);
  }
  
  &:active {
    transform: scale(0.95);
  }
  
  svg {
    width: 22px;
    height: 22px;
    stroke-width: 2.5;
  }
`;

const PopoverContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const PopoverActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 2px solid #f1f5f9;
`;

const PopoverBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  z-index: 1000;
  animation: ${fadeIn} 0.2s ease-out;
`;


const InfoIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
`;

const InfoText = styled.span`
  color: #334155;
`;

// Helper: Restore stock for a set of order_items (imported/copied from orders.js)
async function restoreStockForOrder(supabase, restaurantId, orderItems) {
  console.log('[STOCK RESTORE] Starting restoration for', orderItems?.length, 'items');
  if (!Array.isArray(orderItems) || !orderItems.length) {
    console.log('[STOCK RESTORE] No order items to restore');
    return;
  }

  for (const oi of orderItems) {
    console.log('[STOCK RESTORE] Processing item:', { menu_item_id: oi.menu_item_id, quantity: oi.quantity, is_packaged: oi.is_packaged_good });
    
    if (!oi.menu_item_id || !oi.quantity) {
      console.log('[STOCK RESTORE] Skipping - no menu_item_id or quantity');
      continue;
    }

    let recipeQuery = supabase
      .from('recipes')
      .select('id, variant_option_id, recipe_items(ingredient_id, quantity)')
      .eq('menu_item_id', oi.menu_item_id)
      .eq('restaurant_id', restaurantId);

    const { data: potentialRecipes, error: recipeErr } = await recipeQuery;
    
    if (recipeErr || !potentialRecipes?.length) {
      console.log('[STOCK RESTORE] No recipes found or error');
      continue;
    }

    let targetVariantId = oi.variant_option_id || oi.variant_id || null;

    if (!targetVariantId && oi.variant_name) {
      const { data: vpData, error: vpErr } = await supabase
        .from('variant_pricing')
        .select('variant_options!inner(id, name)')
        .eq('menu_item_id', oi.menu_item_id);
      
      if (vpData) {
        const normName = oi.variant_name.trim().toLowerCase();
        const match = vpData.find(v => v.variant_options?.name?.trim().toLowerCase() === normName);
        if (match && match.variant_options?.id) {
            targetVariantId = match.variant_options.id;
        }
      }
    }

    let recipe = potentialRecipes.find(r => {
      const rId = r.variant_option_id;
      if (!rId && !targetVariantId) return true;
      if (!rId || !targetVariantId) return false;
      return String(rId) === String(targetVariantId);
    });
    
    if (!recipe && targetVariantId) {
      recipe = potentialRecipes.find(r => r.variant_option_id === null);
    }

    if (!recipe && !targetVariantId && potentialRecipes.length > 0) {
        recipe = potentialRecipes.find(r => r.variant_option_id === null);
    }

    if (!recipe?.recipe_items?.length) continue;

    for (const ri of recipe.recipe_items) {
      const { data: ing, error: ingErr } = await supabase
        .from('ingredients')
        .select('id, current_stock, name, uom:unit_of_measures(precision)')
        .eq('id', ri.ingredient_id)
        .eq('restaurant_id', restaurantId)
        .single();
      
      if (ingErr || !ing) continue;

      const precision = ing.uom?.precision ?? 2;
      const addBack = roundP(Number(ri.quantity) * Number(oi.quantity), precision);

      const oldStock = Number(ing.current_stock || 0);
      const newStock = roundP(oldStock + addBack, precision);
      
      await supabase
        .from('ingredients')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', ing.id);
    }
  }
}

function CancelConfirmDialog({ order, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    await onConfirm(reason);
    setSubmitting(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 12
    }}>
      <div style={{ 
        backgroundColor: 'white', padding: 20, borderRadius: 16, maxWidth: 320, width: '100%',
        boxShadow: '0 12px 24px -10px rgba(0, 0, 0, 0.15)',
      }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0' }}>Cancel Order</h3>
        <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4, marginBottom: 16 }}>
          Are you sure you want to cancel order <strong>#{order.id.slice(0, 8)}</strong>? This will release the table and restore stock.
        </p>
        
        <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Reason</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={2}
          style={{ 
            width: '100%', padding: '10px', fontSize: 12, borderRadius: 10, border: '1.5px solid #e2e8f0',
            outline: 'none', background: '#f8fafc', color: '#1e293b', marginBottom: 20
          }}
          placeholder="e.g. Guest changed mind"
        />
        
        <div style={{ display: 'flex', gap: 8 }}>
          <UiButton onClick={onCancel} variant="outline" style={{ flex: 1, padding: '8px', fontSize: 13 }} disabled={submitting}>
            Keep
          </UiButton>
          <UiButton onClick={handleConfirm} variant="danger" style={{ flex: 1.5, padding: '8px', fontSize: 13, background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px' }} disabled={!reason.trim() || submitting}>
            {submitting ? '...' : 'Confirm'}
          </UiButton>
        </div>
      </div>
    </div>
  );
}

const Modal = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
  animation: ${fadeIn} 0.2s ease-out;
  
  @media (max-width: 640px) {
    align-items: flex-end; /* Bottom sheet on mobile */
    padding: 0;
  }
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 24px;
  padding: 32px;
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  animation: ${slideIn} 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  
  @media (max-width: 640px) {
    border-radius: 24px 24px 0 0;
    padding: 24px;
    max-height: 85vh;
  }
`;

const ModalHeader = styled.div`
  margin-bottom: 28px;
  padding-bottom: 20px;
  border-bottom: 2px solid #f1f5f9;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 8px;
`;

const ModalSubtitle = styled.p`
  font-size: 14px;
  color: #64748b;
  margin: 0;
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-bottom: 24px;
  
  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const FormField = styled.div`
  ${props => props.span && `grid-column: span ${props.span};`}
`;

const ToggleCardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 24px;
  
  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const ToggleCard = styled.div`
  padding: 16px;
  border-radius: 16px;
  border: 2px solid ${props => props.active ? '#ea580c' : '#f1f5f9'};
  background: ${props => props.active ? 'rgba(234, 88, 12, 0.02)' : 'white'};
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  
  &:hover {
    border-color: ${props => props.active ? '#ea580c' : '#e2e8f0'};
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }
`;

const ToggleCardIcon = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: ${props => props.active ? 'rgba(234, 88, 12, 0.1)' : '#f8fafc'};
  color: ${props => props.active ? '#ea580c' : '#64748b'};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
`;

const ToggleCardContent = styled.div`
  flex: 1;
`;

const ToggleCardTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 2px;
`;

const ToggleCardDescription = styled.div`
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
`;

const Label = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
`;

const Input = styled.input`
  width: 100%;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  font-size: 16px; /* Larger font for mobile inputs */
  color: #0f172a;
  background: #f8fafc;
  transition: all 0.2s ease;
  
  &:focus {
    outline: none;
    border-color: #ea580c;
    background: white;
    box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.1);
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  font-size: 16px;
  color: #0f172a;
  background: #f8fafc;
  min-height: 120px;
  resize: vertical;
  
  &:focus {
    outline: none;
    border-color: #ea580c;
    background: white;
    box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.1);
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: ${props => props.split ? 'space-between' : 'flex-end'};
  padding-top: 24px;
  border-top: 2px solid #f1f5f9;
  align-items: center;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 80px 24px;
  max-width: 500px;
  margin: 0 auto;
`;

const EmptyIcon = styled.div`
  font-size: 80px;
  margin-bottom: 24px;
  opacity: 0.5;
`;

const EmptyTitle = styled.h3`
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 8px;
`;

const EmptyText = styled.p`
  font-size: 15px;
  color: #64748b;
  line-height: 1.6;
  margin: 0 0 24px;
`;

export default function TableManagement() {
  const supabase = getSupabase();
  const { checking } = useRequireAuth(supabase);
  const { restaurant, loading: loadingRestaurant } = useRestaurant();
  const router = useRouter();
  const { showAlert, showConfirm } = useAlert();
  
  // Component State
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list' or 'visual'
  const [serviceMode, setServiceMode] = useState('dine-in'); // 'dine-in' or 'takeaway' or 'delivery'
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSection, setFilterSection] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterFloor, setFilterFloor] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showSectionsModal, setShowSectionsModal] = useState(false);
  const [showFloorsModal, setShowFloorsModal] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [viewOrder, setViewOrder] = useState(null);
  const [cancelOrderDialog, setCancelOrderDialog] = useState(null);
  
  // React Query hooks for data fetching
  const { data: tables = [], isLoading: loading, error, refetch } = useTables(restaurant?.id);
  const { data: sections = [] } = useSections(restaurant?.id);
  const { data: floors = [] } = useFloors(restaurant?.id, tables);
  const { data: orders = [], isLoading: loadingOrders } = useOrders(
    restaurant?.id, 
    serviceMode === 'dine-in' ? 'all' : (serviceMode === 'takeaway' ? 'parcel' : 'delivery')
  );
  
  // React Query mutations
  const tableMutation = useTableMutation();
  const deleteTableMutation = useDeleteTable();
  const updateStatusMutation = useUpdateTableStatus();
  
  const addSectionMutation = useAddSection();
  const deleteSectionMutation = useDeleteSection();
  const addFloorMutation = useAddFloor();
  const deleteFloorMutation = useDeleteFloor();
  
  // Status Note Modal State
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteTableData, setNoteTableData] = useState({ id: null, status: null, title: '', placeholder: '' });
  const [tempNote, setTempNote] = useState('');
  
  // QR Code state
  const [sendingQr, setSendingQr] = useState({});
  const [newSectionName, setNewSectionName] = useState('');
  const [newFloorName, setNewFloorName] = useState('');
  const [modalQrSent, setModalQrSent] = useState(false);
  const [modalQrError, setModalQrError] = useState(null);
  
  // Visual view popover state
  const [activeVisualTable, setActiveVisualTable] = useState(null);
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
  
  // Create Order Modal State
  const [showCreateOrderModal, setShowCreateOrderModal] = useState(false);
  const [createOrderTable, setCreateOrderTable] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    identifier: '',
    capacity: 4,
    section: 'Main',
    floor_level: 'Ground Floor',
    status: 'available',
    shape: 'rectangle',
    allow_online_reservation: true,
    notes: '',
    createMultiple: false,
    tableCount: 1,
    sendEmail: false
  });
  
  // Dynamic Page Info
  const pageInfo = useMemo(() => {
    switch(serviceMode) {
      case 'takeaway':
        return {
          title: 'Takeaway',
          accent: 'Orders',
          subtitle: 'Manage active parcel and takeaway orders',
          primaryStat: 'Takeaway Pending',
          secondaryStat: 'Ready for Pickup'
        };
      case 'delivery':
        return {
          title: 'Delivery',
          accent: 'Management',
          subtitle: 'Track home deliveries and logistics in real-time',
          primaryStat: 'Active Deliveries',
          secondaryStat: 'Pending Dispatch'
        };
      default:
        return {
          title: 'Table',
          accent: 'Management',
          subtitle: 'Real-time floor plan and order management system'
        };
    }
  }, [serviceMode]);
  
  const handleSendQrCode = async (table) => {
    try {
      setSendingQr(prev => ({ ...prev, [table.id]: true }));
      
      // Prepare restaurant data for the email
      const restaurantData = {
        restaurantName: restaurant.restaurant_name || restaurant.name,
        email: restaurant.support_email || restaurant.owner_email || restaurant.email,
        recipientName: restaurant.legal_name,
        recipientPhone: restaurant.phone,
        address: [
          restaurant.shipping_address_line1,
          restaurant.shipping_address_line2,
          restaurant.shipping_city,
          restaurant.shipping_state,
          restaurant.shipping_pincode
        ].filter(Boolean).join(', ')
      };

      const response = await fetch('/api/tables/send-qr-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: table.id,
          identifier: table.identifier,
          qrUrl: table.qr_code_url,
          restaurantId: restaurant.id,
          restaurantData
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send QR code');
      }
      
      showAlert(`QR code email sent successfully for table ${table.identifier}!`);
    } catch (error) {
      console.error('Error sending QR code:', error);
      showAlert(`Failed to send QR code: ${error.message}`);
    } finally {
      setSendingQr(prev => ({ ...prev, [table.id]: false }));
    }
  };

const handleSendBulkQrCodes = async (newTables) => {
  try {
    // Set a global sending state if needed, or just individual tables
    const tableIds = newTables.map(t => t.id);
    setSendingQr(prev => {
      const next = { ...prev };
      tableIds.forEach(id => next[id] = true);
      return next;
    });

    const restaurantData = {
      restaurantName: restaurant.restaurant_name || restaurant.name,
      email: restaurant.support_email || restaurant.owner_email || restaurant.email,
      recipientName: restaurant.legal_name,
      recipientPhone: restaurant.phone,
      address: [
        restaurant.shipping_address_line1,
        restaurant.shipping_address_line2,
        restaurant.shipping_city,
        restaurant.shipping_state,
        restaurant.shipping_pincode
      ].filter(Boolean).join(', ')
    };

    const qrCodes = newTables.map(t => ({
      tableNumber: t.identifier,
      qrUrl: t.qr_code_url
    }));

    const response = await fetch('/api/send-qr-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qrCodes,
        restaurantData,
        restaurantId: restaurant.id,
        isIncremental: true // Creating new tables, so incremental is appropriate
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to send bulk QR codes');
    }

    showAlert(`Single email with ${newTables.length} QR codes sent successfully to ${restaurantData.email}!`);
  } catch (error) {
    console.error('Error sending bulk QR codes:', error);
    showAlert(`Failed to send consolidated QR email: ${error.message}`);
  } finally {
    const tableIds = newTables.map(t => t.id);
    setSendingQr(prev => {
      const next = { ...prev };
      tableIds.forEach(id => next[id] = false);
      return next;
    });
  }
};

const handleModalResend = async (table) => {
  if (!table) return;
  try {
    setModalQrSent(false);
    setModalQrError(null);
    setSendingQr(prev => ({ ...prev, [table.id]: true }));
    
    // Prepare restaurant data for the email
    const restaurantData = {
      restaurantName: restaurant.restaurant_name || restaurant.name,
      email: restaurant.support_email || restaurant.owner_email || restaurant.email,
      recipientName: restaurant.legal_name,
      recipientPhone: restaurant.phone,
      address: [
        restaurant.shipping_address_line1,
        restaurant.shipping_address_line2,
        restaurant.shipping_city,
        restaurant.shipping_state,
        restaurant.shipping_pincode
      ].filter(Boolean).join(', ')
    };

    console.log('📧 Sending QR email with data:', {
      tableId: table.id,
      identifier: table.identifier,
      qrUrl: table.qr_code_url,
      restaurantId: restaurant.id,
      restaurantData
    });

    const response = await fetch('/api/tables/send-qr-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableId: table.id,
        identifier: table.identifier,
        qrUrl: table.qr_code_url,
        restaurantId: restaurant.id,
        restaurantData
      })
    });
    
    const data = await response.json();
    
    console.log('📧 Email API response:', { status: response.status, data });
    
    if (!response.ok) throw new Error(data.error || 'Failed to send QR code');
    
    setModalQrSent(true);
    showAlert('QR code email sent successfully!');
    // Auto-reset "Sent" indication after 5 seconds
    setTimeout(() => setModalQrSent(false), 5000);
    
  } catch (error) {
    console.error('❌ Error in modal QR resend:', error);
    setModalQrError(error.message);
    showAlert(`Failed to send email: ${error.message}`);
  } finally {
    setSendingQr(prev => ({ ...prev, [table.id]: false }));
  }
};

  // Helper to fetch full order for actions
  async function fetchFullOrder(orderId) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, menu_items(name, uom:unit_of_measures(precision)))')
      .eq('id', orderId)
      .single();
    if (!error && data) return data;
    return null;
  }

  // Payment Handlers
  const handlePaymentClick = async (e, table) => {
    e.stopPropagation();
    if (!table.current_order) return;

    try {
      const full = await fetchFullOrder(table.current_order.id);
      if (!full) throw new Error("Order not found");

      // Calculate totals
      const totals = calculateOrderTotals(
        full.order_items || [],
        full.discount || { type: 'amount', value: 0 },
        restaurant
      );

      setPaymentOrder({ ...full, mode: 'collect' });
      setPaymentTotals(totals);
      setShowPaymentModal(true);
    } catch (error) {
       console.error(error);
       showAlert("Failed to load order for payment");
    }
  };

  const handlePaymentConfirm = async (method, details) => {
     if (!paymentOrder || !restaurant?.id) return;
     
     try {
       const response = await fetch('/api/orders/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: paymentOrder.id,
            restaurant_id: restaurant.id,
            payment_method: method,
            discount_obj: details?.discount_obj,
            round_off_amount: details?.round_off_amount,
            updated_items: details?.updated_items,
            mixed_payment_details: details?.mixed_payment_details,
            base_tax_rate: details?.base_tax_rate,
            loyalty_amount_used: details?.loyalty_amount_used,
            loyalty_points_used: details?.loyalty_points_used
          })
       });

       if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Payment failed');
       }

       // Success
       setShowPaymentModal(false);
       setPaymentOrder(null);
       setPaymentTotals(null);
       refetch(); // Reload to see table as available
       
       // Alert updated order? No, just finish.
     } catch (e) {
       showAlert(e.message);
     }
  };

  const [editingOrder, setEditingOrder] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [paymentTotals, setPaymentTotals] = useState(null);

  const handleEditSave = async (edited) => {
    try {
      if (!restaurant?.id) return;

      const resp = await fetch('/api/orders/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: edited.id,
          restaurant_id: restaurant.id,
          lines: edited.lines,
          table_number: edited.table_number,
          order_type: edited.order_type,
          reason: 'Order edited from tables view',
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        showAlert(data.error || 'Failed to edit order');
        return;
      }
  
      // Insert into print queue for cross-device KOT printing
      if (data.order_for_print) {
        try {
          await supabase
            .from('kot_print_queue')
            .insert({
              restaurant_id: restaurant.id,
              order_id: edited.id,
              print_data: data.order_for_print,
              processed: false
            });
        } catch (err) {
          console.error('[EDIT] Failed to insert into print queue:', err);
        }

        // Dispatch locally
        window.dispatchEvent(
          new CustomEvent('auto-print-order', {
            detail: {
              ...data.order_for_print,
              autoPrint: true,
              kind: 'kot',
            },
          })
        );
      }

      // Refresh & close
      await refetch();
      setEditingOrder(null);
     
    } catch (e) {
      showAlert(e.message || 'Failed to save order changes');
    }
  };

  const handleViewOrder = async (orderId) => {
    if (!orderId) return;
    try {
      // Fetch full order details including items
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*, menu_items(name))')
        .eq('id', orderId)
        .single();

      if (error) throw error;
      
      // Transform items to match expected format if needed
      if (data.order_items) {
          data.items = data.order_items.map(item => ({
              ...item,
              name: item.menu_items?.name || 'Unknown Item',
              price: item.price,
              quantity: item.quantity
          }));
      }
      
      setViewOrder(data);
    } catch (err) {
      console.error('Error fetching order details:', err);
      showAlert('Failed to load order details');
    }
  };

  const handleOrderStatusChange = async (orderId, newStatus) => {
      try {
          const { error } = await supabase
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId);
            
          if (error) throw error;
          
          // Refresh data using React Query
          refetch();
          if (viewOrder && viewOrder.id === orderId) {
             setViewOrder(prev => ({ ...prev, status: newStatus }));
          }
      } catch (err) {
          console.error('Error updating order status:', err);
          showAlert('Failed to update order status');
      }
  };

  const handleCancelConfirm = async (reason) => {
    if (!cancelOrderDialog) return;
    const orderId = cancelOrderDialog.id;
    const tableId = cancelOrderDialog.table_id;
    console.log('[CANCEL ORDER] Starting cancellation for order:', orderId);
    
    try {
        // 1. Get full order with items (to restore stock)
        const { data: fullOrder, error: fetchErr } = await supabase
            .from('orders')
            .select('*, order_items(*, menu_items(name, uom:unit_of_measures(precision)))')
            .eq('id', orderId)
            .single();
        
        if (fetchErr || !fullOrder) throw new Error('Order not found');

        // 2. Mark order as cancelled
        const { error: cancelErr } = await supabase
            .from('orders')
            .update({ 
                status: 'cancelled', 
                description: reason,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);
        
        if (cancelErr) throw cancelErr;

        // 3. Void invoice if it exists
        const { data: invoice } = await supabase
            .from('invoices')
            .select('id')
            .eq('order_id', orderId)
            .maybeSingle();

        if (invoice) {
            console.log('[CANCEL ORDER] Voiding invoice:', invoice.id);
            const res = await fetch('/api/invoices/void', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invoice_id: invoice.id,
                    restaurant_id: restaurant.id,
                    reason: reason,
                }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                console.warn('[CANCEL ORDER] Invoice void failed:', j?.error);
            }
        } else if (restaurant?.loyalty_enabled) {
            // Reversal for non-invoiced orders
            try {
                await LoyaltyService.handleOrderReversal(supabase, {
                    restaurant_id: restaurant.id,
                    order_id: orderId
                });
            } catch (lErr) {
                console.error('[CANCEL ORDER] Loyalty reversal failed:', lErr);
            }
        }

        // 4. Restore stock
        let itemsToRestore = fullOrder.order_items;
        if ((!itemsToRestore || itemsToRestore.length === 0) && fullOrder.items && Array.isArray(fullOrder.items)) {
            // Convert JSONB items if necessary
            const itemsToConvert = [];
            for (const item of fullOrder.items) {
                let menuItemId = item.id || item.menu_item_id || null;
                if (!menuItemId && item.name) {
                    const { data: menuItem } = await supabase
                        .from('menu_items')
                        .select('id')
                        .eq('restaurant_id', restaurant.id)
                        .ilike('name', item.name)
                        .maybeSingle();
                    if (menuItem) menuItemId = menuItem.id;
                }
                itemsToConvert.push({
                    menu_item_id: menuItemId,
                    quantity: item.quantity || item.qty || 1,
                    variant_option_id: item.variant_id || item.variant_option_id || null,
                    variant_name: item.variant_name || null
                });
            }
            itemsToRestore = itemsToConvert;
        }

        if (itemsToRestore && itemsToRestore.length > 0) {
            await restoreStockForOrder(supabase, restaurant.id, itemsToRestore);
        }

        // 5. Release table if it was a dine-in order
        if (fullOrder.table_id) {
            await supabase
                .from('tables')
                .update({ status: 'available', current_order_id: null })
                .eq('id', fullOrder.table_id);
        } else if (fullOrder.table_number) {
            // Find table by identifier if table_id is missing
            const { data: tableObj } = await supabase
                .from('tables')
                .select('id')
                .eq('restaurant_id', restaurant.id)
                .eq('identifier', fullOrder.table_number)
                .maybeSingle();
            
            if (tableObj) {
                await supabase
                    .from('tables')
                    .update({ status: 'available', current_order_id: null })
                    .eq('id', tableObj.id);
            }
        }

        showAlert('Order cancelled and table released successfully');
        setCancelOrderDialog(null);
        refetch(); // Refresh tables and orders
    } catch (err) {
        console.error('[CANCEL ORDER] Error:', err);
        showAlert(`Failed to cancel order: ${err.message}`);
    }
  };
  
  // Real-time subscription - refetch when tables change
  useEffect(() => {
    if (!restaurant?.id) return;

    const channel = supabase
      .channel('table-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tables',
          filter: `restaurant_id=eq.${restaurant.id}`
        },
        (payload) => {
          console.log('Real-time table update:', payload);
          // Use React Query's refetch instead of manual loading
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurant, supabase, refetch]);
  
  
  // Statistics
  const stats = useMemo(() => {
    const total = tables.length;
    const available = tables.filter(t => t.status === 'available').length;
    const occupied = tables.filter(t => t.status === 'occupied').length;
    const reserved = tables.filter(t => t.status === 'reserved').length;
    const cleaning = tables.filter(t => t.status === 'cleaning').length;
    
    return { total, available, occupied, reserved, cleaning };
  }, [tables]);
  
  // Filtered tables
  const filteredTables = useMemo(() => {
    return tables.filter(table => {
      const matchesSearch = searchQuery === '' || 
        table.identifier.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSection = filterSection === 'all' || table.section === filterSection;
      const matchesStatus = filterStatus === 'all' || table.status === filterStatus;
      const matchesFloor = filterFloor === 'all' || table.floor_level === filterFloor;
      
      return matchesSearch && matchesSection && matchesStatus && matchesFloor;
    });
  }, [tables, searchQuery, filterSection, filterStatus, filterFloor]);

  // Filtered orders for non-dine-in modes
  const filteredOrders = useMemo(() => {
    if (serviceMode === 'dine-in') return [];
    return orders.filter(order => {
      const matchesSearch = !searchQuery || 
        (order.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
         order.customer_phone?.includes(searchQuery) ||
         order.id.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
      
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, filterStatus, serviceMode]);
  
  const handleAddTable = () => {
    setEditingTable(null);
    setFormData({
      identifier: '',
      capacity: 4,
      section: sections[0]?.section_name || 'Main',
      floor_level: floors[0]?.floor_name || 'Ground Floor',
      status: 'available',
      shape: 'rectangle',
      allow_online_reservation: true,
      notes: '',
      createMultiple: false,
      tableCount: 1,
      sendEmail: false
    });
    setModalQrSent(false);
    setModalQrError(null);
    setShowModal(true);
  };
  
  const handleEditTable = (table) => {
    setEditingTable(table);
    setFormData({
      identifier: table.identifier,
      capacity: table.capacity || 4,
      section: table.section || 'Main',
      floor_level: table.floor_level || floors[0]?.floor_name || 'Ground Floor',
      status: table.status,
      shape: table.shape || 'rectangle',
      allow_online_reservation: table.allow_online_reservation !== false,
      notes: table.notes || '',
      createMultiple: false,
      tableCount: 1,
      sendEmail: false
    });
    setModalQrSent(false);
    setModalQrError(null);
    setShowModal(true);
  };
  
  const handleSaveTable = async () => {
    try {
      if (!formData.identifier.trim()) {
        showAlert('Table identifier is required');
        return;
      }

      const tablesToCreate = [];
      const baseIdentifier = formData.identifier.trim();

      if (!editingTable && formData.createMultiple) {
        // Prepare multiple tables
        for (let i = 1; i <= formData.tableCount; i++) {
          const identifier = `${baseIdentifier}${i}`;
          
          // Check for duplicate identifier in existing tables
          const isDuplicate = tables.some(t => t.identifier.toLowerCase().trim() === identifier.toLowerCase().trim());
          if (isDuplicate) {
            showAlert(`Block: Table with identifier "${identifier}" already exists. Bulk creation cancelled to avoid duplicates.`);
            return;
          }

          tablesToCreate.push({
            identifier,
            capacity: formData.capacity,
            section: formData.section,
            floor_level: formData.floor_level,
            status: formData.status,
            shape: formData.shape,
            allow_online_reservation: formData.allow_online_reservation,
            notes: formData.notes,
            restaurant_id: restaurant.id,
            qr_code_url: `/order?r=${restaurant.id}&t=${identifier}`
          });
        }
      } else {
        // Single table (Add or Edit)
        const isDuplicate = tables.some(t => 
          t.identifier.toLowerCase().trim() === baseIdentifier.toLowerCase().trim() && 
          (!editingTable || t.id !== editingTable.id)
        );

        if (isDuplicate) {
          showAlert(`Error: A table with the identifier "${baseIdentifier}" already exists. Please use a unique name.`);
          return;
        }

        tablesToCreate.push({
          identifier: baseIdentifier,
          capacity: formData.capacity,
          section: formData.section,
          floor_level: formData.floor_level,
          status: formData.status,
          shape: formData.shape,
          allow_online_reservation: formData.allow_online_reservation,
          notes: formData.notes,
          restaurant_id: restaurant.id,
          qr_code_url: `/order?r=${restaurant.id}&t=${baseIdentifier}`
        });
      }
      
      let data;
      if (editingTable) {
        // Update existing table
        data = await tableMutation.mutateAsync({
          table: { ...tablesToCreate[0], id: editingTable.id },
          isEdit: true,
          restaurantId: restaurant.id
        });
      } else {
        // Create new table(s)
        data = await tableMutation.mutateAsync({
          table: tablesToCreate,
          isEdit: false,
          restaurantId: restaurant.id
        });

        // Automatically send QR email if enabled
        if (formData.sendEmail && data && data.length > 0) {
          if (data.length > 1) {
            handleSendBulkQrCodes(data);
          } else {
            handleSendQrCode(data[0]);
          }
        }
      }
      
      setShowModal(false);
      setEditingTable(null); // Clear editing state
    } catch (error) {
      console.error('Error saving table:', error);
      showAlert(error.message || 'Failed to save table');
    }
  };
  
  const openNoteModal = (tableId, status, title = 'Enter Details', placeholder = '') => {
    setNoteTableData({ id: tableId, status, title, placeholder });
    setTempNote('');
    setShowNoteModal(true);
  };

  const handleDeleteTable = async (tableId) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    if (table.status === 'occupied' || table.status === 'reserved') {
      showAlert(`Block: Cannot delete table "${table.identifier}" while it is ${table.status.toUpperCase()}. Please clear the table or cancel the reservation first.`);
      return;
    }

    if (!await showConfirm(`Are you sure you want to delete Table "${table.identifier}"? This will remove it from the floor plan.`)) return;
    
    try {
      await deleteTableMutation.mutateAsync({ 
        tableId, 
        restaurantId: restaurant.id 
      });
      
      setShowModal(false);
      setEditingTable(null);
    } catch (error) {
      console.error('Error deleting table:', error);
      showAlert('Failed to delete table');
    }
  };

  const handleAddSection = async (name) => {
    try {
      const isDuplicate = sections.some(s => s.section_name.toLowerCase().trim() === name.toLowerCase().trim());
      if (isDuplicate) {
        showAlert(`Error: A section named "${name}" already exists.`);
        return;
      }

      await addSectionMutation.mutateAsync({ name: name.trim(), restaurantId: restaurant.id });
    } catch (error) {
      showAlert(error.message || 'Failed to add section');
    }
  };

  const handleDeleteSection = async (id) => {
    // Find the section name to check dependencies
    const section = sections.find(s => s.id === id);
    if (section) {
      const tablesUsingSection = tables.filter(t => t.section === section.section_name);
      if (tablesUsingSection.length > 0) {
        showAlert(`Block: Cannot delete "${section.section_name}" section. There are ${tablesUsingSection.length} tables currently using this section. Please reassign those tables first.`);
        return;
      }
    }

    if (!await showConfirm('Are you sure you want to delete this section?')) return;
    try {
      await deleteSectionMutation.mutateAsync({ sectionId: id, restaurantId: restaurant.id });
    } catch (error) {
      showAlert(error.message || 'Failed to delete section');
    }
  };

  const handleAddFloor = async (name) => {
    try {
      const isDuplicate = floors.some(f => f.floor_name.toLowerCase().trim() === name.toLowerCase().trim());
      if (isDuplicate) {
        showAlert(`Error: A floor level named "${name}" already exists.`);
        return;
      }

      await addFloorMutation.mutateAsync({ name: name.trim(), restaurantId: restaurant.id });
    } catch (error) {
       console.error(error);
       showAlert(error.message || "Failed to add floor level.");
    }
  };

  const handleDeleteFloor = async (id) => {
    // Find the floor name to check dependencies
    const floor = floors.find(f => f.id === id);
    if (floor) {
      const tablesUsingFloor = tables.filter(t => t.floor_level === floor.floor_name);
      if (tablesUsingFloor.length > 0) {
        showAlert(`Block: Cannot delete "${floor.floor_name}" level. There are ${tablesUsingFloor.length} tables currently using this floor. Please reassign those tables first.`);
        return;
      }
    }

    if (!await showConfirm('Are you sure you want to delete this floor level?')) return;
    try {
      await deleteFloorMutation.mutateAsync({ floorId: id, restaurantId: restaurant.id });
    } catch (error) {
      showAlert(error.message || 'Failed to delete floor level');
    }
  };
  
  const handleChangeStatus = async (tableId, newStatus, extraUpdates = {}) => {
    try {
      console.log('Changing status:', { tableId, newStatus, extraUpdates });
      
      await updateStatusMutation.mutateAsync({
        tableId,
        restaurantId: restaurant.id,
        status: newStatus,
        extraUpdates
      });
      
      console.log('Status updated successfully');
    } catch (error) {
      console.error('Error changing status:', error);
      showAlert(`Failed to change status: ${error.message}`);
    }
  };

  const handleKotClick = async (orderId) => {
    if (!orderId) return;
    try {
      const full = await fetchFullOrder(orderId);
      if (!full) throw new Error("Order not found");

      const { data: profile } = await supabase
        .from('restaurant_profiles')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .maybeSingle();

      const orderForPrint = {
        ...full,
        restaurant_name: restaurant.name,
        _profile: profile
      };

      window.dispatchEvent(
        new CustomEvent('auto-print-order', {
          detail: {
            ...orderForPrint,
            autoPrint: true,
            kind: 'kot',
          },
        })
      );
    } catch (err) {
      console.error('KOT print error:', err);
      showAlert('Failed to trigger KOT print');
    }
  };

  const handlePrintBill = async (orderId) => {
    if (!orderId) return;
    try {
        const { data: fullOrder, error } = await supabase
            .from('orders')
            .select('*, order_items(*, menu_items(name, uom:unit_of_measures(precision)))')
            .eq('id', orderId)
            .single();

        if (error || !fullOrder) {
            console.error('Error fetching order for print:', error);
            showAlert('Failed to fetch order details for printing');
            return;
        }

        const { data: profile } = await supabase
            .from('restaurant_profiles')
            .select('*')
            .eq('restaurant_id', restaurant.id)
            .maybeSingle();

        const orderForPrint = {
            ...fullOrder,
            restaurant_name: restaurant.name,
            _profile: profile,
             bill: {
                grand_total: fullOrder.total_amount,
                subtotal: fullOrder.subtotal, 
                tax_total: fullOrder.total_tax,
                order_discount_total: fullOrder.discount_amount,
                discount_amount: fullOrder.discount_amount,
                round_off_amount: fullOrder.round_off_amount,
                invoice_no: fullOrder.invoice_no,
                bill_no: fullOrder.bill_no
            }
        };

        window.dispatchEvent(
            new CustomEvent('auto-print-order', {
                detail: {
                    ...orderForPrint,
                    autoPrint: true,
                    kind: 'bill',
                },
            })
        );
        
    } catch (err) {
        console.error('Print bill error:', err);
        showAlert('Failed to trigger print');
    }
  };
  
  if (checking || loadingRestaurant || loading) {
    return (
      <PageContainer>
        <div style={{ textAlign: 'center', padding: '80px 24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <div style={{ fontSize: '18px', color: '#64748b' }}>Loading table management...</div>
        </div>
      </PageContainer>
    );
  }
  
  return (
    <PageContainer>
      <MainLayout>
        <Sidebar>
          <SidebarGroup>
            <SidebarLabel>Order Type</SidebarLabel>
            <SidebarFilterList>
              {[
                { id: 'dine-in', label: 'Dine In', icon: '🪑' },
                { id: 'takeaway', label: 'Takeaway', icon: '🥡' },
                { id: 'delivery', label: 'Delivery', icon: '🚲' }
              ].map(mode => (
                <FilterPill 
                  key={mode.id} 
                  active={serviceMode === mode.id}
                  onClick={() => setServiceMode(mode.id)}
                >
                  <span style={{ fontSize: '16px' }}>{mode.icon}</span>
                  {mode.label}
                </FilterPill>
              ))}
            </SidebarFilterList>
            {(serviceMode === 'takeaway' || serviceMode === 'delivery') && (
              <AddOrderButton 
                onClick={() => {
                  setCreateOrderTable(null);
                  setShowCreateOrderModal(true);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                {serviceMode === 'takeaway' ? 'New Takeaway' : 'New Delivery'}
              </AddOrderButton>
            )}
          </SidebarGroup>

          {serviceMode === 'dine-in' && (
            <>
              <SidebarGroup>
                <SidebarLabel>Status</SidebarLabel>
                <SidebarFilterList>
                  {['all', 'available', 'occupied', 'reserved', 'cleaning', 'maintenance'].map(status => (
                    <FilterPill 
                      key={status} 
                      active={filterStatus === status}
                      onClick={() => setFilterStatus(status)}
                    >
                      <div style={{ 
                        width: '8px', 
                        height: '8px', 
                        borderRadius: '50%', 
                        background: status === 'available' ? '#10b981' : 
                                  status === 'occupied' ? '#ef4444' : 
                                  status === 'reserved' ? '#3b82f6' : 
                                  status === 'cleaning' ? '#f59e0b' : 
                                  status === 'maintenance' ? '#6366f1' : '#cbd5e1'
                      }} />
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </FilterPill>
                  ))}
                </SidebarFilterList>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarLabel>Section</SidebarLabel>
                <SidebarFilterList>
                  <FilterPill 
                    active={filterSection === 'all'} 
                    onClick={() => setFilterSection('all')}
                  >
                    All Sections
                  </FilterPill>
                  {sections.map(s => (
                    <FilterPill 
                      key={s.id} 
                      active={filterSection === s.section_name}
                      onClick={() => setFilterSection(s.section_name)}
                    >
                      {s.section_name}
                    </FilterPill>
                  ))}
                </SidebarFilterList>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarLabel>Floor</SidebarLabel>
                <SidebarFilterList>
                  <FilterPill 
                    active={filterFloor === 'all'} 
                    onClick={() => setFilterFloor('all')}
                  >
                    All Floors
                  </FilterPill>
                  {floors.map(f => (
                    <FilterPill 
                      key={f.id} 
                      active={filterFloor === f.floor_name}
                      onClick={() => setFilterFloor(f.floor_name)}
                    >
                      {f.floor_name}
                    </FilterPill>
                  ))}
                </SidebarFilterList>
              </SidebarGroup>
            </>
          )}
        </Sidebar>

        <MainContent>
          <Header>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
              <TitleBlock>
                <Title>{pageInfo.title} <span>{pageInfo.accent}</span></Title>
                <Subtitle>{pageInfo.subtitle}</Subtitle>
              </TitleBlock>
              
              {serviceMode === 'dine-in' && (
                <HeaderActions>
                  <ConfigButton onClick={() => setShowSectionsModal(true)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3H3v18h18V12"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Manage Sections
                  </ConfigButton>
                  <ConfigButton onClick={() => setShowFloorsModal(true)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9h18"></path>
                      <path d="M3 15h18"></path>
                      <path d="M3 3v18"></path>
                      <path d="M21 3v18"></path>
                    </svg>
                    Manage Floors
                  </ConfigButton>
                </HeaderActions>
              )}
            </div>
            
            {serviceMode === 'dine-in' ? (
              <StatsScroll>
                <StatCard accent="linear-gradient(135deg, #f97316 0%, #ea580c 100%)">
                  <StatLabel>Total Tables</StatLabel>
                  <StatValue>{stats.total}</StatValue>
                </StatCard>
                <StatCard accent="linear-gradient(135deg, #10b981 0%, #059669 100%)">
                  <StatLabel>Available</StatLabel>
                  <StatValue style={{color: '#059669'}}>{stats.available}</StatValue>
                </StatCard>
                <StatCard accent="linear-gradient(135deg, #ef4444 0%, #dc2626 100%)">
                  <StatLabel>Occupied</StatLabel>
                  <StatValue style={{color: '#dc2626'}}>{stats.occupied}</StatValue>
                </StatCard>
                <StatCard accent="linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)">
                  <StatLabel>Reserved</StatLabel>
                  <StatValue style={{color: '#2563eb'}}>{stats.reserved}</StatValue>
                </StatCard>
              </StatsScroll>
            ) : (
              <StatsScroll>
                <StatCard accent="linear-gradient(135deg, #f97316 0%, #ea580c 100%)">
                  <StatLabel>{pageInfo.primaryStat}</StatLabel>
                  <StatValue>
                    {filteredOrders.filter(o => ['new', 'pending', 'in_progress'].includes(o.status)).length}
                  </StatValue>
                </StatCard>
                <StatCard accent="linear-gradient(135deg, #10b981 0%, #059669 100%)">
                  <StatLabel>{pageInfo.secondaryStat}</StatLabel>
                  <StatValue style={{color: '#059669'}}>
                    {filteredOrders.filter(o => o.status === 'ready').length}
                  </StatValue>
                </StatCard>
              </StatsScroll>
            )}
            
            <Toolbar>
              <ToolbarLeft>
                <SearchInput 
                  placeholder={serviceMode === 'dine-in' ? "Search tables..." : `Search ${serviceMode} orders...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </ToolbarLeft>
              <ToolbarRight>
                <ViewToggle>
                  <ViewButton active={viewMode === 'grid'} onClick={() => setViewMode('grid')}>
                    Grid
                  </ViewButton>
                  <ViewButton active={viewMode === 'list'} onClick={() => setViewMode('list')}>
                    List
                  </ViewButton>
                  {serviceMode === 'dine-in' && (
                    <ViewButton active={viewMode === 'visual'} onClick={() => setViewMode('visual')}>
                      Visual
                    </ViewButton>
                  )}
                </ViewToggle>
                {serviceMode === 'dine-in' && (
                  <UiButton primary onClick={handleAddTable}>
                    <span style={{fontSize: '18px', fontWeight: 300}}>+</span> Add Table
                  </UiButton>
                )}
              </ToolbarRight>
            </Toolbar>
          </Header>
          
          {serviceMode !== 'dine-in' ? (
            filteredOrders.length === 0 ? (
              <EmptyState>
                <EmptyIcon>{serviceMode === 'takeaway' ? '🥡' : '🚲'}</EmptyIcon>
                <EmptyTitle>No {serviceMode === 'takeaway' ? 'Takeaway' : 'Delivery'} Orders Found</EmptyTitle>
                <EmptyText>
                  {searchQuery || filterStatus !== 'all' 
                    ? 'Try adjusting your search or filters' 
                    : `Active ${serviceMode} orders will appear here`}
                </EmptyText>
              </EmptyState>
            ) : viewMode === 'grid' ? (
              <TableGrid>
                {filteredOrders.map(order => (
                  <TableCard 
                    key={order.id} 
                    status={order.status === 'ready' ? 'available' : (order.status === 'in_progress' ? 'cleaning' : 'occupied')}
                    onClick={() => handleViewOrder(order.id)}
                    style={{ borderRadius: '24px', padding: '0' }}
                  >
                    <TableCardHeader style={{ padding: '16px 20px 12px' }}>
                      <TableNumber style={{ fontSize: '20px' }}>
                        #{order.id.slice(-6).toUpperCase()}
                        <span style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                          {order.customer_name || 'Guest'}
                        </span>
                      </TableNumber>
                      <StatusBadge status={order.status === 'ready' ? 'available' : (order.status === 'in_progress' ? 'cleaning' : 'occupied')} style={{ padding: '4px 10px', fontSize: '10px' }}>
                        {order.status}
                      </StatusBadge>
                    </TableCardHeader>
                    
                    <div style={{ padding: '0 20px 12px' }}>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path>
                          <path d="M3 6h18"></path>
                          <path d="M16 10a4 4 0 0 1-8 0"></path>
                        </svg>
                        {order.order_items?.length || 0} Items • ₹{(order.total_amount || 0).toFixed(2)}
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', minHeight: '44px' }}>
                        {order.order_items?.slice(0, 2).map((item, i) => (
                          <div key={i} style={{ fontSize: '10px', background: '#f8fafc', padding: '3px 8px', borderRadius: '6px', color: '#475569', border: '1px solid #f1f5f9', fontWeight: 600 }}>
                            {item.quantity}x {item.menu_items?.name}
                          </div>
                        ))}
                        {(order.order_items?.length > 2) && (
                          <div style={{ fontSize: '10px', color: '#94a3b8', padding: '3px 4px', fontWeight: 600 }}>+{order.order_items.length - 2} more</div>
                        )}
                      </div>
                    </div>

                    <div style={{ 
                      padding: '12px 16px 16px', 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(2, 1fr)', 
                      gap: '8px', 
                      background: '#fcfcfc',
                      borderTop: '1px solid #f5f5f5' 
                    }}>
                      <ActionButton variant="primary" onClick={(e) => { e.stopPropagation(); handleKotClick(order.id); }} style={{ fontSize: '11px', minWidth: '0' }}>KOT</ActionButton>
                      <ActionButton variant="warning" onClick={(e) => { e.stopPropagation(); handlePrintBill(order.id); }} style={{ fontSize: '11px', minWidth: '0' }}>Bill</ActionButton>
                      <ActionButton variant="success" onClick={(e) => { e.stopPropagation(); handlePaymentClick(e, { current_order: { id: order.id } }); }} style={{ fontSize: '11px', minWidth: '0' }}>Pay</ActionButton>
                      <ActionButton variant="primary" onClick={(e) => { e.stopPropagation(); setEditingOrder(order); }} style={{ fontSize: '11px', minWidth: '0', background: '#e0f2fe', color: '#0369a1' }}>Edit</ActionButton>
                      <ActionButton variant="danger" onClick={(e) => { e.stopPropagation(); setCancelOrderDialog(order); }} style={{ fontSize: '11px', minWidth: '0' }}>Cancel</ActionButton>
                    </div>
                  </TableCard>
                ))}
              </TableGrid>
            ) : (
              <TableList>
                <TableListHeader>
                  <div>Order ID</div>
                  <div>Customer</div>
                  <div>Status</div>
                  <div>Items</div>
                  <div>Total</div>
                  <div>Actions</div>
                </TableListHeader>
                {filteredOrders.map(order => (
                  <TableListRow key={order.id} onClick={() => handleViewOrder(order.id)}>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>#{order.id.slice(-8).toUpperCase()}</div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{order.customer_name || 'Guest'}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{order.customer_phone || '-'}</div>
                    </div>
                    <div><StatusBadge status={order.status === 'ready' ? 'available' : (order.status === 'in_progress' ? 'cleaning' : 'occupied')} minimal>{order.status}</StatusBadge></div>
                    <div style={{ fontSize: '13px' }}>{order.order_items?.length || 0} items</div>
                    <div style={{ fontWeight: 700 }}>₹{(order.total_amount || 0).toFixed(2)}</div>
                    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: '6px' }}>
                      <ActionButton variant="primary" onClick={() => handleKotClick(order.id)} style={{ fontSize: '11px', padding: '6px 10px' }}>KOT</ActionButton>
                      <ActionButton variant="warning" onClick={() => handlePrintBill(order.id)} style={{ fontSize: '11px', padding: '6px 10px' }}>Bill</ActionButton>
                      <ActionButton variant="success" onClick={(e) => handlePaymentClick(e, { current_order: { id: order.id } })} style={{ fontSize: '11px', padding: '6px 10px' }}>Pay</ActionButton>
                      <ActionButton variant="primary" onClick={() => setEditingOrder(order)} style={{ fontSize: '11px', padding: '6px 10px', background: '#e0f2fe', color: '#0369a1' }}>Edit</ActionButton>
                      <ActionButton variant="danger" onClick={() => setCancelOrderDialog(order)} style={{ fontSize: '11px', padding: '6px 10px' }}>Cancel</ActionButton>
                    </div>
                  </TableListRow>
                ))}
              </TableList>
            )
          ) : filteredTables.length === 0 ? (
            <EmptyState>
              <EmptyTitle>No Tables Found</EmptyTitle>
              <EmptyText>
                {searchQuery || filterSection !== 'all' || filterStatus !== 'all' 
                  ? 'Try adjusting your filters' 
                  : 'Get started by adding your first table'}
              </EmptyText>
              {!searchQuery && filterSection === 'all' && filterStatus === 'all' && (
                <Button primary onClick={handleAddTable}>
                  + Add Your First Table
                </Button>
              )}
            </EmptyState>
          ) : viewMode === 'visual' ? (
            <>
              <FloorPlanContainer>
                <FloorPlanLegend>
                  <LegendItem>
                    <LegendDot color="#10b981" />
                    Available
                  </LegendItem>
                  <LegendItem>
                    <LegendDot color="#ef4444" />
                    Occupied
                  </LegendItem>
                  <LegendItem>
                    <LegendDot color="#3b82f6" />
                    Reserved
                  </LegendItem>
                  <LegendItem>
                    <LegendDot color="#f59e0b" />
                    Cleaning
                  </LegendItem>
                  <LegendItem>
                    <LegendDot color="#64748b" />
                    Maintenance
                  </LegendItem>
                </FloorPlanLegend>
                
                {filteredTables.map((table, index) => {
                  // Responsive grid layout
                  const isMobile = window.innerWidth <= 768;
                  const cols = isMobile ? 3 : 5; // 3 columns on mobile, 5 on desktop
                  const spacingX = isMobile ? 100 : 150; // Tighter spacing on mobile
                  const spacingY = isMobile ? 85 : 130;
                  const offsetX = isMobile ? 10 : 50;
                  const offsetY = isMobile ? 10 : 50;
                  
                  // Use position_x and position_y from database, or auto-arrange
                  const x = table.position_x || (index % cols) * spacingX + offsetX;
                  const y = table.position_y || Math.floor(index / cols) * spacingY + offsetY;
                  
                  return (
                    <VisualTable
                      key={table.id}
                      x={x}
                      y={y}
                      status={table.status}
                      shape={table.shape}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setPopoverPosition({
                          x: rect.left + rect.width / 2,
                          y: rect.top
                        });
                        setActiveVisualTable(table);
                      }}
                      title={`Table ${table.identifier} - ${table.status}\n${table.capacity} seats - ${table.section}`}
                    >
                      <VisualTableNumber>{table.identifier}</VisualTableNumber>
                      <VisualTableCapacity>{table.capacity} seats</VisualTableCapacity>
                    </VisualTable>
                  );
                })}
              </FloorPlanContainer>
              
              {/* Visual Table Popover */}
              {activeVisualTable && (
                <>
                  <PopoverBackdrop onClick={() => setActiveVisualTable(null)} />
                  <VisualTablePopover x={popoverPosition.x} y={popoverPosition.y}>
                    <PopoverHeader>
                      <PopoverTitle>
                        <PopoverTableNumber>Table {activeVisualTable.identifier}</PopoverTableNumber>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <StatusBadge status={activeVisualTable.status}>{activeVisualTable.status}</StatusBadge>
                          <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                            {activeVisualTable.capacity} Seats
                          </span>
                        </div>
                      </PopoverTitle>
                      <PopoverCloseButton onClick={() => setActiveVisualTable(null)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6L6 18M6 6l12 12"></path>
                        </svg>
                      </PopoverCloseButton>
                    </PopoverHeader>
                    
                    <PopoverContent>
                      <InfoRow>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color: '#94a3b8'}}>
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                          <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        <InfoText>{activeVisualTable.section}</InfoText>
                      </InfoRow>
                      
                      {activeVisualTable.current_order && (
                        <InfoRow 
                          onClick={() => {
                            handleViewOrder(activeVisualTable.current_order.id);
                          }}
                          style={{ 
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            padding: '8px 12px',
                            borderRadius: '10px',
                            margin: '-4px -12px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color: '#ef4444'}}>
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                          </svg>
                          <InfoText style={{fontWeight: 700, color: '#ef4444'}}>Order #{activeVisualTable.current_order.id.substr(0, 8)} →</InfoText>
                        </InfoRow>
                      )}
                      
                      {activeVisualTable.notes && (activeVisualTable.status === 'reserved' || activeVisualTable.status === 'cleaning' || activeVisualTable.status === 'maintenance') && (
                        <InfoRow style={{ 
                          color: activeVisualTable.status === 'reserved' ? '#1d4ed8' : 
                                activeVisualTable.status === 'cleaning' ? '#c2410c' : '#475569',
                          background: activeVisualTable.status === 'reserved' ? 'rgba(59, 130, 246, 0.05)' : 
                                     activeVisualTable.status === 'cleaning' ? 'rgba(249, 115, 22, 0.05)' : 'rgba(0,0,0,0.03)',
                          padding: '8px 12px',
                          borderRadius: '12px',
                          border: '1px solid rgba(0,0,0,0.02)'
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                          </svg>
                          <InfoText style={{ fontWeight: 600, fontSize: '12px' }}>{activeVisualTable.notes}</InfoText>
                        </InfoRow>
                      )}
                    </PopoverContent>
                    
                    <PopoverActions>
                      {/* Occupied table actions */}
                      {activeVisualTable.status === 'occupied' && activeVisualTable.current_order && (
                        <>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <ActionButton 
                              variant="primary"
                              onClick={() => {
                                handlePrintBill(activeVisualTable.current_order.id);
                                setActiveVisualTable(null);
                              }}
                            >
                              Bill
                            </ActionButton>
                            
                            <ActionButton 
                              variant="warning"
                              onClick={async () => {
                                const full = await fetchFullOrder(activeVisualTable.current_order.id);
                                if(full) {
                                  window.dispatchEvent(
                                    new CustomEvent('auto-print-order', {
                                      detail: { ...full, autoPrint: true, kind: 'kot' }
                                    })
                                  );
                                }
                                setActiveVisualTable(null);
                              }}
                            >
                              KOT
                            </ActionButton>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                            <ActionButton 
                              variant="success"
                              style={{ flex: 1, height: '48px' }}
                              onClick={async () => {
                                const full = await fetchFullOrder(activeVisualTable.current_order.id);
                                if(full) setEditingOrder(full);
                                setActiveVisualTable(null);
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                              Edit
                            </ActionButton>

                            <ActionButton 
                              variant="danger"
                              style={{ flex: 1, height: '48px' }}
                              onClick={async () => {
                                const full = await fetchFullOrder(activeVisualTable.current_order.id);
                                if(full) setCancelOrderDialog(full);
                                setActiveVisualTable(null);
                              }}
                            >
                              Cancel
                            </ActionButton>
                          </div>
                          

                          <ActionButton 
                            variant="danger"
                            fullWidth
                            onClick={(e) => {
                              handlePaymentClick(e, activeVisualTable);
                              setActiveVisualTable(null);
                            }}
                          >
                            Pay & Finish
                          </ActionButton>
                        </>
                      )}
                      
                      {/* Available table actions */}
                      {activeVisualTable.status === 'available' && (
                        <>
                          <ActionButton 
                            variant="success"
                            fullWidth
                            style={{ marginBottom: '8px', background: '#0f172a', border: 'none' }}
                            onClick={() => {
                              setCreateOrderTable(activeVisualTable);
                              setShowCreateOrderModal(true);
                              setActiveVisualTable(null);
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                              <path d="M12 5v14M5 12h14"></path>
                            </svg>
                            Create Order
                          </ActionButton>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <ActionButton 
                              variant="primary"
                              onClick={() => {
                                openNoteModal(activeVisualTable.id, 'reserved', 'Reservation Details', 'e.g. Reserved for John at 7 PM');
                                setActiveVisualTable(null);
                              }}
                            >
                              Reservation
                            </ActionButton>
                            <ActionButton 
                              variant="warning"
                              onClick={() => {
                                handleChangeStatus(activeVisualTable.id, 'cleaning');
                                setActiveVisualTable(null);
                              }}
                            >
                              Cleaning
                            </ActionButton>
                          </div>
                          <ActionButton 
                            variant="warning"
                            fullWidth
                            onClick={() => {
                              handleChangeStatus(activeVisualTable.id, 'maintenance');
                              setActiveVisualTable(null);
                            }}
                          >
                            Maintenance
                          </ActionButton>
                        </>
                      )}
                      
                      {/* Status-specific actions */}
                      {activeVisualTable.status === 'cleaning' && (
                        <ActionButton 
                          variant="warning" 
                          fullWidth 
                          onClick={() => {
                            handleChangeStatus(activeVisualTable.id, 'available', { notes: '' });
                            setActiveVisualTable(null);
                          }}
                        >
                          Finish Cleaning
                        </ActionButton>
                      )}
                      
                      {activeVisualTable.status === 'maintenance' && (
                        <ActionButton 
                          variant="warning" 
                          fullWidth 
                          onClick={() => {
                            handleChangeStatus(activeVisualTable.id, 'available', { notes: '' });
                            setActiveVisualTable(null);
                          }}
                        >
                          Finish Maintenance
                        </ActionButton>
                      )}
                      
                      {activeVisualTable.status === 'reserved' && (
                        <ActionButton 
                          variant="warning" 
                          fullWidth 
                          onClick={() => {
                            handleChangeStatus(activeVisualTable.id, 'available', { notes: '' });
                            setActiveVisualTable(null);
                          }}
                        >
                          Cancel Reservation
                        </ActionButton>
                      )}
                      
                      {/* Edit table settings (available for all statuses) */}
                      <ActionButton 
                        variant="secondary"
                        fullWidth
                        onClick={() => {
                          handleEditTable(activeVisualTable);
                          setActiveVisualTable(null);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                          <circle cx="12" cy="12" r="3"></circle>
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                        Edit Table Settings
                      </ActionButton>
                    </PopoverActions>
                  </VisualTablePopover>
                </>
              )}
            </>
          ) : viewMode === 'grid' ? (
            <TableGrid>
          {filteredTables.map(table => (
            <TableCard 
              key={table.id} 
              status={table.status}
              onClick={() => {
                if (table.current_order?.id) {
                   handleViewOrder(table.current_order.id);
                } else if (table.status === 'available') {
                   setCreateOrderTable(table);
                   setShowCreateOrderModal(true);
                }
              }}
              style={{ cursor: (table.current_order || table.status === 'available') ? 'pointer' : 'default' }}
            >
                <TableCardHeader>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <TableNumber>
                      {table.identifier}
                      <span>{table.capacity} Seats</span>
                    </TableNumber>
                    <StatusBadge status={table.status}>{table.status}</StatusBadge>
                  </div>
                  <EditIcon onClick={(e) => { e.stopPropagation(); handleEditTable(table); }} title="Edit Table Settings">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"></circle>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                  </EditIcon>
                </TableCardHeader>
              
              <TableInfo>
                <InfoRow>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color: '#94a3b8'}}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  <InfoText>{table.section}</InfoText>
                </InfoRow>
                {table.current_order && (
                  <InfoRow>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color: '#ef4444'}}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                      <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <InfoText style={{fontWeight: 700}}>Order #{table.current_order.id.substr(0, 8)}</InfoText>
                  </InfoRow>
                )}
                {table.status === 'available' && (
                  <InfoRow style={{ opacity: 0.6 }}>
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                       <circle cx="12" cy="12" r="10"></circle>
                       <polyline points="12 6 12 12 16 14"></polyline>
                     </svg>
                     <InfoText>Ready for guests</InfoText>
                  </InfoRow>
                )}
                {table.notes && (table.status === 'reserved' || table.status === 'cleaning' || table.status === 'maintenance') && (
                  <InfoRow style={{ 
                    color: table.status === 'reserved' ? '#1d4ed8' : 
                          table.status === 'cleaning' ? '#c2410c' : '#475569',
                    background: table.status === 'reserved' ? 'rgba(59, 130, 246, 0.05)' : 
                               table.status === 'cleaning' ? 'rgba(249, 115, 22, 0.05)' : 'rgba(0,0,0,0.03)',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    marginTop: '4px',
                    border: '1px solid rgba(0,0,0,0.02)'
                  }}>
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                       <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                     </svg>
                     <InfoText style={{ fontWeight: 600, fontSize: '12px' }}>{table.notes}</InfoText>
                  </InfoRow>
                )}
              </TableInfo>
              
               <TableActions onClick={(e) => e.stopPropagation()}>
                 {table.status === 'occupied' && table.current_order && (
                   <>
                    <ActionButton 
                      variant="primary"
                      onClick={() => handlePrintBill(table.current_order.id)}
                    >
                       Bill
                    </ActionButton>

                    <ActionButton 
                      variant="warning"
                      onClick={async () => {
                        const full = await fetchFullOrder(table.current_order.id);
                        if(full) {
                          window.dispatchEvent(
                            new CustomEvent('auto-print-order', {
                              detail: { ...full, autoPrint: true, kind: 'kot' }
                            })
                          );
                        }
                      }}
                    >
                       KOT
                    </ActionButton>

                    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                      <ActionButton 
                        variant="success"
                        style={{ flex: 1.5, height: 48 }}
                        onClick={async () => {
                          const full = await fetchFullOrder(table.current_order.id);
                          if(full) setEditingOrder(full);
                        }}
                      >
                         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                           <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                           <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                         </svg>
                         Edit
                      </ActionButton>
                      <ActionButton 
                        variant="danger"
                        style={{ flex: 1, height: 48 }}
                        onClick={async () => {
                          const full = await fetchFullOrder(table.current_order.id);
                          if(full) setCancelOrderDialog(full);
                        }}
                      >
                         Cancel
                      </ActionButton>
                    </div>
                  </>
                )}
                
                {table.status === 'available' && (
                   <>
                     <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                       <ActionButton 
                         variant="primary" 
                         onClick={() => openNoteModal(table.id, 'reserved', 'Reservation Details', 'e.g. Reserved for John at 7 PM')}
                       >
                         Reservation
                       </ActionButton>
                       <ActionButton 
                         variant="warning" 
                         onClick={() => handleChangeStatus(table.id, 'cleaning')}
                       >
                         Cleaning
                       </ActionButton>
                     </div>
                     <ActionButton 
                       variant="warning" 
                       fullWidth
                       onClick={() => handleChangeStatus(table.id, 'maintenance')}
                     >
                       Maintenance
                     </ActionButton>
                   </>
                 )}

                 {table.status === 'cleaning' && (
                    <ActionButton variant="warning" fullWidth onClick={() => handleChangeStatus(table.id, 'available', { notes: '' })}>
                       Finish Cleaning
                    </ActionButton>
                 )}

                 {table.status === 'maintenance' && (
                    <ActionButton variant="warning" fullWidth onClick={() => handleChangeStatus(table.id, 'available', { notes: '' })}>
                       Finish Maintenance
                    </ActionButton>
                 )}

                 {table.status === 'reserved' && (
                    <ActionButton variant="warning" fullWidth onClick={() => handleChangeStatus(table.id, 'available', { notes: '' })}>
                       Cancel Reservation
                    </ActionButton>
                 )}

                 {table.status === 'occupied' && (
                   <>

                    <ActionButton 
                      variant="danger"
                      fullWidth
                      onClick={(e) => handlePaymentClick(e, table)}
                    >
                      Pay & Finish
                    </ActionButton>
                   </>
                 )}
              </TableActions>
            </TableCard>
          ))}
        </TableGrid>
      ) : (
        <TableList>
          <TableListHeader>
            <div>Identifier</div>
            <div>Section</div>
            <div>Capacity</div>
            <div>Status</div>
            <div>Current Order</div>
            <div>Actions</div>
          </TableListHeader>
          {filteredTables.map(table => (
            <TableListRow 
              key={table.id}
              onClick={() => {
                if (table.current_order?.id) {
                   handleViewOrder(table.current_order.id);
                } else if (table.status === 'available') {
                   setCreateOrderTable(table);
                   setShowCreateOrderModal(true);
                }
              }}
              style={{ cursor: (table.current_order || table.status === 'available') ? 'pointer' : 'default' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <EditIcon onClick={(e) => { e.stopPropagation(); handleEditTable(table); }} title="Edit Table Settings">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                </EditIcon>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>
                  {table.identifier}
                  {table.notes && (table.status === 'reserved' || table.status === 'cleaning' || table.status === 'maintenance') && (
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 400, fontStyle: 'italic', marginTop: '2px' }}>
                      {table.notes}
                    </div>
                  )}
                </div>
              </div>
              <div>{table.section}</div>
              <div>{table.capacity} seats</div>
              <div><StatusBadge status={table.status} minimal>{table.status}</StatusBadge></div>
              <div>{table.current_order ? `ID: ${table.current_order.id.substr(0, 8)}` : '-'}</div>
              <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {/* Print Bill */}
                {table.current_order && (
                   <ActionButton 
                      variant="primary"
                      onClick={() => handlePrintBill(table.current_order.id)}
                   >
                     Bill
                   </ActionButton>
                )}

                {/* Print KOT */}
                {table.current_order && (
                   <ActionButton 
                      variant="warning"
                      onClick={async () => {
                         const full = await fetchFullOrder(table.current_order.id);
                         if(full) {
                           window.dispatchEvent(
                             new CustomEvent('auto-print-order', {
                               detail: { ...full, autoPrint: true, kind: 'kot' }
                             })
                           );
                         }
                      }}
                   >
                     KOT
                   </ActionButton>
                )}

                {/* Edit Order */}
                {table.current_order && (
                   <>
                    <ActionButton 
                       variant="success"
                       onClick={async () => {
                          const full = await fetchFullOrder(table.current_order.id);
                          if(full) setEditingOrder(full);
                       }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                      Edit
                    </ActionButton>
                    <ActionButton 
                       variant="danger"
                       onClick={async () => {
                          const full = await fetchFullOrder(table.current_order.id);
                          if(full) setCancelOrderDialog(full);
                       }}
                    >
                      Cancel
                    </ActionButton>
                   </>
                )}

                {table.status === 'available' && (
                  <>
                    <ActionButton variant="primary" onClick={() => openNoteModal(table.id, 'reserved', 'Reservation Details', 'Reservation name/time...')}>Reservation</ActionButton>
                    <ActionButton variant="warning" onClick={() => handleChangeStatus(table.id, 'cleaning')}>Cleaning</ActionButton>
                    <ActionButton variant="warning" onClick={() => handleChangeStatus(table.id, 'maintenance')}>Maintenance</ActionButton>
                  </>
                )}

                {table.status === 'cleaning' && (
                  <ActionButton variant="warning" onClick={() => handleChangeStatus(table.id, 'available', { notes: '' })}>
                    Finish Cleaning
                  </ActionButton>
                )}

                {table.status === 'maintenance' && (
                  <ActionButton variant="warning" onClick={() => handleChangeStatus(table.id, 'available', { notes: '' })}>
                    Finish Maintenance
                  </ActionButton>
                )}

                {table.status === 'reserved' && (
                  <ActionButton variant="warning" onClick={() => handleChangeStatus(table.id, 'available', { notes: '' })}>
                    Cancel Reservation
                  </ActionButton>
                )}

                {table.status === 'occupied' && (
                  <>
                    <ActionButton 
                      variant="danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePaymentClick(e, table);
                      }}
                    >
                      Pay & Finish
                    </ActionButton>
                  </>
                )}
              </div>
            </TableListRow>
          ))}
        </TableList>
      )}
        </MainContent>
      </MainLayout>
      
      {showModal && (
        <Modal onClick={() => {
          setShowModal(false);
          setEditingTable(null);
        }}>
          <ModalContent onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px' }}>
            <ModalHeader>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{ 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '12px', 
                  background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  boxShadow: '0 4px 12px rgba(234, 88, 12, 0.2)'
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="3" x2="9" y2="21"></line>
                  </svg>
                </div>
                <div>
                  <ModalTitle style={{ margin: 0 }}>{editingTable ? 'Edit Table' : 'Add New Table'}</ModalTitle>
                  <ModalSubtitle>{editingTable ? 'Configure table properties and placement' : 'Create a new seating location'}</ModalSubtitle>
                </div>
              </div>
            </ModalHeader>
            
            <ToggleCardGrid style={{ gridTemplateColumns: editingTable ? '1fr' : 'repeat(2, 1fr)' }}>
              {!editingTable && (
                <ToggleCard 
                  active={formData.createMultiple}
                  onClick={() => setFormData({...formData, createMultiple: !formData.createMultiple})}
                >
                  <ToggleCardIcon active={formData.createMultiple}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7"></rect>
                      <rect x="14" y="3" width="7" height="7"></rect>
                      <rect x="14" y="14" width="7" height="7"></rect>
                      <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                  </ToggleCardIcon>
                  <ToggleCardContent>
                    <ToggleCardTitle>Bulk Create</ToggleCardTitle>
                    <ToggleCardDescription>Generate multiple tables at once</ToggleCardDescription>
                  </ToggleCardContent>
                  <ToggleSwitch style={{ pointerEvents: 'none' }}>
                    <input type="checkbox" checked={formData.createMultiple} readOnly />
                    <span></span>
                  </ToggleSwitch>
                </ToggleCard>
              )}

              {restaurant?.features?.qr_ordering_enabled && (
                editingTable ? (
                  <ToggleCard 
                    active={modalQrSent}
                    onClick={() => !modalQrSent && !sendingQr[editingTable.id] && handleModalResend(editingTable)}
                    style={{ 
                      cursor: (sendingQr[editingTable.id] || modalQrSent) ? 'not-allowed' : 'pointer',
                      opacity: (sendingQr[editingTable.id] || modalQrSent) ? 0.8 : 1,
                      transition: 'all 0.3s ease',
                      minHeight: '80px'
                    }}
                  >
                    <ToggleCardIcon active={modalQrSent || sendingQr[editingTable.id]}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        {sendingQr[editingTable.id] ? (
                          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                        ) : (
                          <>
                            <path d="m22 2-7 20-4-9-9-4Z"></path>
                            <path d="M22 2 11 13"></path>
                          </>
                        )}
                      </svg>
                    </ToggleCardIcon>
                    <ToggleCardContent>
                      <ToggleCardTitle style={{ color: modalQrSent ? '#10b981' : 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {sendingQr[editingTable.id] ? 'Sending...' : modalQrSent ? 'Email Sent Successfully!' : 'Send QR Code Now'}
                        {modalQrSent && (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        )}
                      </ToggleCardTitle>
                      <ToggleCardDescription style={{ color: modalQrError ? '#ef4444' : 'inherit' }}>
                        {modalQrSent ? 'Owner will receive it shortly.' : modalQrError ? `Error: ${modalQrError}` : 'Click to send the QR code to the owner email immediately.'}
                      </ToggleCardDescription>
                    </ToggleCardContent>
                    {!sendingQr[editingTable.id] && !modalQrSent && (
                       <div style={{ color: '#ea580c', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>Send Now →</div>
                    )}
                  </ToggleCard>
                ) : (
                  <ToggleCard 
                    active={formData.sendEmail}
                    onClick={() => setFormData({...formData, sendEmail: !formData.sendEmail})}
                  >
                    <ToggleCardIcon active={formData.sendEmail}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m22 2-7 20-4-9-9-4Z"></path>
                        <path d="M22 2 11 13"></path>
                      </svg>
                    </ToggleCardIcon>
                    <ToggleCardContent>
                      <ToggleCardTitle>Email QR codes</ToggleCardTitle>
                      <ToggleCardDescription>Send access links to owner</ToggleCardDescription>
                    </ToggleCardContent>
                    <ToggleSwitch style={{ pointerEvents: 'none' }}>
                      <input type="checkbox" checked={formData.sendEmail} readOnly />
                      <span></span>
                    </ToggleSwitch>
                  </ToggleCard>
                )
              )}
            </ToggleCardGrid>

            <FormGrid>
              <FormField span={formData.createMultiple ? 1 : 2}>
                <Label>{formData.createMultiple ? 'Identifier Prefix *' : 'Table Identifier *'}</Label>
                <Input 
                  value={formData.identifier}
                  onChange={(e) => setFormData({...formData, identifier: e.target.value})}
                  placeholder={formData.createMultiple ? 'e.g., T, A, B' : 'e.g., T1, A5, Window-1'}
                />
              </FormField>
              
              {formData.createMultiple && (
                <FormField>
                  <Label>Table Count</Label>
                  <Input 
                    type="number"
                    min="2"
                    max="50"
                    value={formData.tableCount}
                    onChange={(e) => setFormData({...formData, tableCount: parseInt(e.target.value) || 2})}
                    placeholder="Number of tables"
                  />
                </FormField>
              )}
              
              <FormField>
                <Label>Capacity (Seats)</Label>
                <Input 
                  type="number"
                  min="1"
                  max="20"
                  value={formData.capacity}
                  onChange={(e) => setFormData({...formData, capacity: parseInt(e.target.value) || ''})}
                />
              </FormField>
              
              <FormField>
                <Label>Section</Label>
                <NiceSelect 
                  value={formData.section}
                  onChange={(value) => setFormData({...formData, section: value})}
                  options={sections.map(s => ({ label: s.section_name, value: s.section_name }))}
                />
              </FormField>
              
              <FormField>
                <Label>Floor Level</Label>
                <NiceSelect 
                  value={formData.floor_level}
                  onChange={(value) => setFormData({...formData, floor_level: value})}
                  options={floors.map(f => ({ label: f.floor_name, value: f.floor_name }))}
                />
              </FormField>
              
              <FormField>
                <Label>Status</Label>
                <NiceSelect 
                  value={formData.status}
                  onChange={(value) => setFormData({...formData, status: value})}
                  options={[
                    { label: 'Available', value: 'available' },
                    { label: 'Occupied', value: 'occupied' },
                    { label: 'Reserved', value: 'reserved' },
                    { label: 'Cleaning', value: 'cleaning' },
                    { label: 'Maintenance', value: 'maintenance' }
                  ]}
                />
              </FormField>

              <FormField>
                <Label>Visual Shape</Label>
                <NiceSelect 
                  value={formData.shape}
                  onChange={(value) => setFormData({...formData, shape: value})}
                  options={[
                    { label: 'Rectangle', value: 'rectangle' },
                    { label: 'Square', value: 'square' },
                    { label: 'Circle', value: 'circle' }
                  ]}
                />
              </FormField>
            </FormGrid>

            <FormGrid>
              <FormField span={2}>
                <Label>Internal Notes</Label>
                <Textarea 
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  placeholder="Any special notes about this table's location or usage..."
                  style={{ minHeight: '80px' }}
                />
              </FormField>
            </FormGrid>
        
            <ModalActions split={!!editingTable}>
              {editingTable ? (
                <DangerButton 
                  onClick={() => handleDeleteTable(editingTable.id)}
                  disabled={editingTable.status === 'occupied' || editingTable.status === 'reserved'}
                  title={editingTable.status === 'occupied' || editingTable.status === 'reserved' ? 'Cannot delete active tables' : 'Delete this table'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                  </svg>
                  Delete Table
                </DangerButton>
              ) : <div />}
              
              <div style={{ display: 'flex', gap: '12px' }}>
                <UiButton secondary onClick={() => {
                  setShowModal(false);
                  setEditingTable(null);
                }}>Cancel</UiButton>
                <UiButton primary onClick={handleSaveTable}>
                  {editingTable ? 'Save Changes' : 'Create Table'}
                </UiButton>
              </div>
            </ModalActions>
          </ModalContent>
        </Modal>
      )}

      {viewOrder && (
        <OrderItemsModal
          order={viewOrder}
          onClose={() => setViewOrder(null)}
          onStatusChange={handleOrderStatusChange}
        />
      )}

      {editingOrder && (
         <EditOrderPanel 
            order={editingOrder} 
            onClose={() => setEditingOrder(null)}
            onSave={handleEditSave}
            tablesCount={10} 
         />
      )}

      {showPaymentModal && paymentOrder && (
        <PaymentConfirmDialog
          order={paymentOrder}
          onConfirm={handlePaymentConfirm}
          onCancel={() => setShowPaymentModal(false)}
        />
      )}
      {showNoteModal && (
        <Modal>
          <ModalContent style={{ maxWidth: '450px' }}>
            <ModalHeader>
              <Title style={{ fontSize: '24px' }}>{noteTableData.title}</Title>
              <Subtitle>Please enter a brief note for this state change.</Subtitle>
            </ModalHeader>
            
            <FormField style={{ marginBottom: '24px' }}>
              <Label>Note / Description</Label>
              <Textarea 
                autoFocus
                value={tempNote}
                onChange={e => setTempNote(e.target.value)}
                placeholder={noteTableData.placeholder}
                style={{ minHeight: '100px' }}
              />
            </FormField>

            <ModalActions>
              <UiButton secondary onClick={() => setShowNoteModal(false)}>Cancel</UiButton>
              <UiButton primary onClick={() => {
                handleChangeStatus(noteTableData.id, noteTableData.status, { notes: tempNote });
                setShowNoteModal(false);
              }}>Confirm Status</UiButton>
            </ModalActions>
          </ModalContent>
        </Modal>
      )}

      {showSectionsModal && (
        <Modal onClick={() => setShowSectionsModal(false)}>
          <ModalContent onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <ModalHeader>
              <ModalTitle>Manage Sections</ModalTitle>
              <ModalSubtitle>Create and organize dining areas</ModalSubtitle>
            </ModalHeader>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <Input 
                value={newSectionName} 
                onChange={e => setNewSectionName(e.target.value)} 
                placeholder="New section name..." 
              />
              <UiButton primary onClick={() => {
                if (newSectionName.trim()) {
                  handleAddSection(newSectionName.trim());
                  setNewSectionName('');
                }
              }}>Add</UiButton>
            </div>
            
            <ManageList>
              {sections.map((section) => {
                const tableCount = tables.filter(t => t.section === section.section_name).length;
                return (
                  <ManageItem key={section.id}>
                    <ItemInfo>
                      <ItemName>{section.section_name}</ItemName>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{tableCount} {tableCount === 1 ? 'Table' : 'Tables'}</span>
                    </ItemInfo>
                    <ItemActions>
                      <TrashButton 
                        onClick={() => handleDeleteSection(section.id)}
                        title={tableCount > 0 ? "Cannot delete section with active tables" : "Delete section"}
                        style={{ opacity: tableCount > 0 ? 0.4 : 1 }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                        </svg>
                      </TrashButton>
                    </ItemActions>
                  </ManageItem>
                );
              })}
            </ManageList>
            
            <ModalActions>
              <UiButton secondary onClick={() => setShowSectionsModal(false)}>Close</UiButton>
            </ModalActions>
          </ModalContent>
        </Modal>
      )}

      {showFloorsModal && (
        <Modal onClick={() => setShowFloorsModal(false)}>
          <ModalContent onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <ModalHeader>
              <ModalTitle>Manage Floors</ModalTitle>
              <ModalSubtitle>Define floor levels for your restaurant</ModalSubtitle>
            </ModalHeader>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <Input 
                value={newFloorName} 
                onChange={e => setNewFloorName(e.target.value)} 
                placeholder="New floor level..." 
              />
              <UiButton primary onClick={() => {
                if (newFloorName.trim()) {
                  handleAddFloor(newFloorName.trim());
                  setNewFloorName('');
                }
              }}>Add</UiButton>
            </div>
            
            <ManageList>
              {floors.map((floor) => {
                const tableCount = tables.filter(t => t.floor_level === floor.floor_name).length;
                return (
                  <ManageItem key={floor.id}>
                    <ItemInfo>
                      <ItemName>{floor.floor_name}</ItemName>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{tableCount} {tableCount === 1 ? 'Table' : 'Tables'}</span>
                    </ItemInfo>
                    <ItemActions>
                      {!floor.fallback && (
                        <TrashButton 
                          onClick={() => handleDeleteFloor(floor.id)}
                          title={tableCount > 0 ? "Cannot delete floor with active tables" : "Delete floor"}
                          style={{ opacity: tableCount > 0 ? 0.4 : 1 }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                          </svg>
                        </TrashButton>
                      )}
                    </ItemActions>
                  </ManageItem>
                );
              })}
            </ManageList>
            
            <ModalActions>
              <UiButton secondary onClick={() => setShowFloorsModal(false)}>Close</UiButton>
            </ModalActions>
          </ModalContent>
        </Modal>
      )}

      {/* Create Order Modal - Reusable Component */}
      <CreateOrderModal
        isOpen={showCreateOrderModal}
        onClose={() => {
          setShowCreateOrderModal(false);
          setCreateOrderTable(null);
        }}
        table={createOrderTable}
        restaurantId={restaurant?.id}
        onSuccess={() => {
          refetch(); // Refresh tables list
        }}
        orderType={serviceMode === 'dine-in' ? 'dine-in' : (serviceMode === 'takeaway' ? 'parcel' : 'delivery')}
      />
      {cancelOrderDialog && (
        <CancelConfirmDialog 
          order={cancelOrderDialog} 
          onConfirm={handleCancelConfirm} 
          onCancel={() => setCancelOrderDialog(null)} 
        />
      )}
    </PageContainer>
  );
}
