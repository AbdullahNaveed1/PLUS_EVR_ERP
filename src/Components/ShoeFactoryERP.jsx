import React, { useState } from 'react';
import axios from 'axios';

// --- API Service Layer ---
// Using relative '/api' so it automatically adapts to whichever port/host the .exe is serving on
const API = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const loginUser = async (credentials) => {
  const response = await API.post('/auth/login', credentials);
  if (response.data.token) {
    localStorage.setItem('token', response.data.token);
  }
  return response.data;
};

export const deductStock = async (deductData) => {
  const response = await API.post('/inventory/deduct', deductData);
  return response.data;
};

export const getCustomerByPhone = async (phone) => {
  const response = await API.get(`/customers/by-phone/${phone}`);
  return response.data;
};

// --- Login Component ---
function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      await loginUser({ username, password });
      onLoginSuccess();
    } catch (err) {
      setError('Invalid username or password.');
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '80px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif' }}>
      <h2>Shoe Factory ERP - Login</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <label>Username:</label><br />
          <input 
            type="text" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            required 
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label>Password:</label><br />
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        <button type="submit" style={{ padding: '10px', background: '#000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Sign In
        </button>
      </form>
    </div>
  );
}

// --- Dashboard Component (Billing & Inventory) ---
function Dashboard({ onLogout }) {
  // Stock Deduction States
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [stockError, setStockError] = useState('');

  // Customer Phone Lookup States (Billing Section)
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerError, setCustomerError] = useState('');

  // Handle Customer Phone Search
  const handlePhoneChange = async (e) => {
    const phone = e.target.value;
    setCustomerPhone(phone);
    setCustomerError('');
    setCustomerName('');

    if (phone.trim().length < 3) return; // Wait for meaningful input length

    try {
      const data = await getCustomerByPhone(phone.trim());
      setCustomerName(data.name || data.customerName || 'Customer Found');
    } catch (err) {
      setCustomerError('Customer not found with this phone number.');
    }
  };

  // Handle Stock Deduction Submission
  const handleDeduct = async (e) => {
    e.preventDefault();
    setStatusMessage('');
    setStockError('');

    try {
      const response = await deductStock({
        productId: parseInt(productId, 10),
        quantity: parseInt(quantity, 10),
        referenceNumber
      });
      setStatusMessage(response.message || 'Stock successfully updated!');
    } catch (err) {
      setStockError(err.response?.data?.message || 'Failed to deduct stock. Check product ID or permissions.');
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Shoe Factory ERP Dashboard</h2>
        <button onClick={onLogout} style={{ padding: '6px 12px', background: '#d9534f', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Logout
        </button>
      </div>
      <hr style={{ margin: '20px 0' }} />

      {/* --- Billing / Customer Lookup Section --- */}
      <h3>Billing & Customer Lookup</h3>
      <div style={{ marginBottom: '25px', padding: '15px', background: '#f9f9f9', borderRadius: '6px', border: '1px solid #eee' }}>
        <label>Customer Phone Number:</label><br />
        <input 
          type="text" 
          value={customerPhone} 
          onChange={handlePhoneChange} 
          placeholder="Enter phone number to lookup..."
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box', marginTop: '5px' }}
        />
        {customerName && <p style={{ color: 'green', fontWeight: 'bold', marginTop: '8px' }}>Customer Name: {customerName}</p>}
        {customerError && <p style={{ color: 'red', fontSize: '14px', marginTop: '8px' }}>{customerError}</p>}
      </div>

      <hr style={{ margin: '20px 0' }} />

      {/* --- Inventory Stock Deduction Section --- */}
      <h3>Deduct Shoe Stock (Atomic Transaction)</h3>
      {statusMessage && <p style={{ color: 'green', fontWeight: 'bold' }}>{statusMessage}</p>}
      {stockError && <p style={{ color: 'red' }}>{stockError}</p>}

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

// --- Main Container Export ---
export default function ShoeFactoryERP() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
  };

  return (
    <div>
      {!isAuthenticated ? (
        <Login onLoginSuccess={() => setIsAuthenticated(true)} />
      ) : (
        <Dashboard onLogout={handleLogout} />
      )}
    </div>
  );
}