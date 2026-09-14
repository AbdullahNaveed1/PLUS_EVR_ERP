import React, { useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5008';

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        username,
        password
      });
      
      // Save token and role in localStorage
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('role', response.data.role);
      localStorage.setItem('username', response.data.username);

      // Notify parent component that login succeeded
      onLoginSuccess(response.data);
    } catch (err) {
      setError('Invalid username or password');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc' }}>
      <form onSubmit={handleLogin} style={{ background: '#fff', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ marginBottom: '20px', color: '#714B67', textAlign: 'center' }}>PLUS EVR ERP Login</h2>
        
        {error && <p style={{ color: '#dc2626', marginBottom: '15px', fontSize: '14px', textAlign: 'center' }}>{error}</p>}
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '600', color: '#475569' }}>Username</label>
          <input 
            type="text" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} 
            required 
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '600', color: '#475569' }}>Password</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} 
            required 
          />
        </div>

        <button type="submit" style={{ width: '100%', backgroundColor: '#714B67', color: '#fff', padding: '12px', border: 'none', borderRadius: '6px', fontWeight: '700', cursor: 'pointer' }}>
          Sign In
        </button>
      </form>
    </div>
  );
}