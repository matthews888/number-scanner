'use client';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import Scanner from './components/Scanner';
import AuthScreen from './components/AuthScreen';
export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  if (loading)
    return (
      <main className="authPage">
        <div className="authLoading">Loading NumberScan…</div>
      </main>
    );
  if (!session) return <AuthScreen />;
  return <Scanner session={session} />;
}
