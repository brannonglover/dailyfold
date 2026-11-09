'use client';

import { useEffect, useState } from 'react';

const APP_SCHEME = 'dailyfold://';

/**
 * Landing page for Supabase email-confirmation links (Authentication → URL Configuration → Site URL).
 * Supabase verifies the token on its own server, then redirects here with a one-time PKCE `?code=`.
 * On failure (expired or reused link) it appends `#error=...` (or `?error=...`) instead.
 *
 * The "Open dailyfold" button hands the code to the app via `dailyfold://auth-callback?code=…`; the
 * app exchanges it for a session and signs the user in. The code is only usable on the device that
 * started sign-up, so opening this link on another device falls back to a normal sign-in.
 */
export default function EmailConfirmed() {
  const [failed, setFailed] = useState(false);
  const [appUrl, setAppUrl] = useState(APP_SCHEME);
  const [hasCode, setHasCode] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);

    setFailed(
      hash.has('error') || hash.has('error_code') || query.has('error') || query.has('error_code'),
    );

    const code = query.get('code');
    setHasCode(Boolean(code));
    setAppUrl(
      code ? `${APP_SCHEME}auth-callback?code=${encodeURIComponent(code)}` : APP_SCHEME,
    );
  }, []);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        textAlign: 'center',
        background: '#121212',
        color: '#F5F5F5',
        fontFamily: 'system-ui, sans-serif',
      }}>
      <h1 style={{ fontSize: 40, margin: 0 }}>
        <span style={{ color: '#FF7A6B' }}>d</span>ailyfold
      </h1>
      <h2 style={{ marginTop: 32 }}>{failed ? 'This link has expired' : 'Email confirmed'}</h2>
      <p style={{ maxWidth: 360, lineHeight: 1.5, color: '#B0B0B0' }}>
        {failed
          ? 'Open dailyfold and create your account again, or sign in if you already confirmed.'
          : hasCode
            ? "Thanks for confirming your email. Tap below and you'll be signed in."
            : 'Thanks for confirming your email. Open dailyfold and sign in.'}
      </p>
      <a
        href={appUrl}
        style={{
          marginTop: 8,
          padding: '14px 32px',
          borderRadius: 999,
          background: '#FF7A6B',
          color: '#121212',
          fontWeight: 600,
          fontSize: 17,
          textDecoration: 'none',
        }}>
        Open dailyfold
      </a>
      {failed || !hasCode ? null : (
        <p style={{ maxWidth: 320, marginTop: 24, fontSize: 13, lineHeight: 1.5, color: '#808080' }}>
          Opened this on a different device? Open dailyfold on the device where you signed up, or
          sign in with your email and password.
        </p>
      )}
    </main>
  );
}
