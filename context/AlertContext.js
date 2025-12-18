import React, { createContext, useContext, useState, useCallback } from 'react';

const AlertContext = createContext();

export function AlertProvider({ children }) {
  const [dialog, setDialog] = useState(null); // { type: 'alert'|'confirm', message, title, onConfirm, onCancel }

  const showAlert = useCallback((message, title = 'Notice') => {
    return new Promise((resolve) => {
      setDialog({
        type: 'alert',
        title,
        message,
        onConfirm: () => {
          setDialog(null);
          resolve(true);
        }
      });
    });
  }, []);

  const showConfirm = useCallback((message, title = 'Confirm') => {
    return new Promise((resolve) => {
      setDialog({
        type: 'confirm',
        title,
        message,
        onConfirm: () => {
          setDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setDialog(null);
          resolve(false);
        }
      });
    });
  }, []);

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {dialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div style={{
            background: 'white', padding: 24, borderRadius: 12, maxWidth: 400, width: '100%',
            boxShadow: '0 20px 50px rgba(0,0,0,0.2)', 
            // Minimal pop in animation
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: '#111827' }}>{dialog.title}</h3>
            <p style={{ margin: '0 0 24px', fontSize: 15, lineHeight: 1.5, color: '#4b5563', whiteSpace: 'pre-wrap' }}>{dialog.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              {dialog.type === 'confirm' && (
                <button 
                  onClick={dialog.onCancel}
                  style={{
                    padding: '10px 16px', borderRadius: 8, border: '1px solid #d1d5db',
                    background: 'white', color: '#374151', cursor: 'pointer', fontWeight: 600,
                    fontSize: 14
                  }}
                >
                  Cancel
                </button>
              )}
              <button 
                onClick={dialog.onConfirm}
                style={{
                  padding: '10px 16px', borderRadius: 8, border: 'none',
                  background: '#f97316', color: 'white', cursor: 'pointer', fontWeight: 600,
                  fontSize: 14
                }}
              >
                {dialog.type === 'confirm' ? 'Confirm' : 'OK'}
              </button>
            </div>
          </div>
          <style jsx>{`
            @keyframes fadeIn {
              from { opacity: 0; transform: scale(0.95); }
              to { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </div>
      )}
    </AlertContext.Provider>
  );
}

export const useAlert = () => useContext(AlertContext);
