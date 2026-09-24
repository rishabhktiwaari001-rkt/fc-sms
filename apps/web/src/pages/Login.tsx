import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const [phone, setPhone]   = useState('');
  const [pass, setPass]     = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(phone, pass);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Login failed. Check credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg1)',
    }}>
      <div className="card" style={{ width: 360, padding: '32px 36px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 48, height: 48,
            background: 'var(--brand)',
            borderRadius: 12,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            marginBottom: 16,
          }}>🏪</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' }}>FC SMS</h1>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
            Franchise Store Management System
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label>Phone / Username</label>
            <input
              className="inp"
              type="text"
              placeholder="9140259050"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label>Password</label>
            <input
              className="inp"
              type="password"
              placeholder="••••••••"
              value={pass}
              onChange={e => setPass(e.target.value)}
              required
            />
          </div>

          {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

          <button className="btn btn-brand" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 20 }}>
          Admin: 0000000000 / admin
        </p>
      </div>
    </div>
  );
}
