import React, { useState } from 'react';
import { deductStock } from '../services/shoeService';

export default function Dashboard({ onLogout }) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const handleDeduct = async (e) => {
    e.preventDefault();
    setStatusMessage('');
    setError('');

    try {
      const response = await deductStock({
        productId: parseInt(productId, 10),
        quantity: parseInt(quantity, 10),
        referenceNumber
      });
      setStatusMessage(response.message || 'Stock successfully updated!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to deduct stock. Check product ID or permissions.');
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Inventory Management</h2>
        <button onClick={onLogout} style={{ padding: '6px 12px', background: '#d9534f', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Logout
        </button>
      </div>
      <hr style={{ margin: '20px 0' }} />

      <h3>Deduct Shoe Stock (Atomic Transaction)</h3>
      {statusMessage && <p style={{ color: 'green', fontWeight: 'bold' }}>{statusMessage}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleDeduct} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <label>Product ID:</label><br />
          <input 
            type="number" 
            value={productId} 
            onChange={(e) => setProductId(e.target.value)} 
            placeholder="e.g. 1"
            required 
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label>Quantity to Deduct:</label><br />
          <input 
            type="number" 
            value={quantity} 
            onChange={(e) => setQuantity(e.target.value)} 
            placeholder="e.g. 2"
            required 
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label>Reference Number / Order ID:</label><br />
          <input 
            type="text" 
            value={referenceNumber} 
            onChange={(e) => setReferenceNumber(e.target.value)} 
            placeholder="e.g. ORDER-9988"
            required 
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        <button type="submit" style={{ padding: '10px', background: '#0275d8', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Process Deduction
        </button>
      </form>
    </div>
  );
}