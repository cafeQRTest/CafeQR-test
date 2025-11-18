// components/TestPrintButton.jsx
import React from 'react';
import { printUniversal } from '../utils/printGateway';

export default function TestPrintButton() {
  const go = async () => {
    await printUniversal({ text: '*** TEST PRINT ***\nCafe QR\n\nOK\n', allowSystemDialog: false });
  };
  return <button onClick={go}>Test USB Print</button>;
}
