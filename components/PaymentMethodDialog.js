//components/PaymentMethodDialog.js

import React, { useState } from 'react';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import Card from './ui/Card';

export default function PaymentMethodDialog({ 
  isOpen, 
  totalAmount, 
  onSelect, 
  onClose 
}) {
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [cashAmount, setCashAmount] = useState('');
  const [onlineAmount, setOnlineAmount] = useState('');
  const [onlineMethod, setOnlineMethod] = useState('upi');

  const handleMethodSelect = (method) => {
    setSelectedMethod(method);
    if (method !== 'mixed') {
      setCashAmount('');
      setOnlineAmount('');
    }
  };

  const handleMixedPayment = () => {
    const cash = Number(cashAmount || 0);
    const online = Number(onlineAmount || 0);

    if (cash + online !== totalAmount) {
      alert(`Amounts must equal ₹${totalAmount.toFixed(2)}`);
      return;
    }

    if (cash > 0 && online > 0) {
      onSelect('mixed', {
        cash_amount: cash,
        online_amount: online,
        online_method: onlineMethod
      });
    }
  };

  const handleProceed = () => {
    if (selectedMethod === 'mixed') {
      handleMixedPayment();
    } else if (selectedMethod) {
      onSelect(selectedMethod, null);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Select Payment Method">
      <div className="payment-methods-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        
        {/* Cash Payment */}
        <Card 
          onClick={() => handleMethodSelect('cash')}
          style={{
            padding: '16px',
            cursor: 'pointer',
            border: selectedMethod === 'cash' ? '2px solid #2563eb' : '1px solid #e5e7eb',
            borderRadius: '8px'
          }}
        >
          <div style={{ fontSize: '16px', fontWeight: '600' }}>💵 Cash</div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>Pay full amount in cash</div>
        </Card>

        {/* Online Payment */}
        <Card 
          onClick={() => handleMethodSelect('online')}
          style={{
            padding: '16px',
            cursor: 'pointer',
            border: selectedMethod === 'online' ? '2px solid #2563eb' : '1px solid #e5e7eb',
            borderRadius: '8px'
          }}
        >
          <div style={{ fontSize: '16px', fontWeight: '600' }}>🔗 Online (UPI/Card)</div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>Pay full amount online</div>
        </Card>

        {/* Mixed Payment */}
        <Card 
          onClick={() => handleMethodSelect('mixed')}
          style={{
            padding: '16px',
            cursor: 'pointer',
            border: selectedMethod === 'mixed' ? '2px solid #2563eb' : '1px solid #e5e7eb',
            borderRadius: '8px'
          }}
        >
          <div style={{ fontSize: '16px', fontWeight: '600' }}>🔀 Mixed Payment</div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>Part cash + Part online</div>
        </Card>

        {/* Mixed Payment Details Form */}
        {selectedMethod === 'mixed' && (
          <Card style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                Cash Amount (₹)
              </label>
              <input
                type="number"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder="Enter cash amount"
                min="0"
                max={totalAmount}
                step="0.01"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                Online Amount (₹)
              </label>
              <input
                type="number"
                value={onlineAmount}
                onChange={(e) => setOnlineAmount(e.target.value)}
                placeholder="Enter online amount"
                min="0"
                max={totalAmount}
                step="0.01"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                Online Payment Method
              </label>
              <select
                value={onlineMethod}
                onChange={(e) => setOnlineMethod(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                <option value="upi">UPI</option>
                <option value="card">Credit/Debit Card</option>
                <option value="netbanking">Net Banking</option>
              </select>
            </div>

            <div style={{ 
              padding: '8px 12px', 
              backgroundColor: '#eff6ff', 
              borderLeft: '4px solid #2563eb',
              borderRadius: '4px',
              fontSize: '14px'
            }}>
              Total: ₹{totalAmount.toFixed(2)} | 
              Cash: ₹{cashAmount || '0'} + Online: ₹{onlineAmount || '0'}
            </div>
          </Card>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        <Button onClick={onClose} variant="secondary" fullWidth>Cancel</Button>
        <Button 
          onClick={handleProceed} 
          fullWidth
          disabled={!selectedMethod}
        >
          Proceed
        </Button>
      </div>
    </Dialog>
  );
}
