import { useState } from 'react';
import { supabase } from './supabaseClient';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Sign up
  const handleSignUp = async () => {
    setIsLoading(true);
    setAuthError('');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setAuthError(error.message);
    else alert("Sign up successful! Check your email for confirmation.");
    setIsLoading(false);
  };

  // Sign in
  const handleSignIn = async () => {
    setIsLoading(true);
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    setIsLoading(false);
  };

  // Sign out
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setEmail('');
    setPassword('');
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow flex flex-col items-center max-w-sm mx-auto">
      <h2 className="text-xl font-bold mb-4 text-gray-800">User Authentication</h2>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="border p-2 mb-2 w-full rounded"
        autoComplete="email"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        className="border p-2 mb-4 w-full rounded"
        autoComplete="current-password"
      />
      <div className="flex gap-2 w-full">
        <button
          onClick={handleSignUp}
          className="bg-blue-600 text-white px-4 py-2 rounded w-1/2"
          disabled={isLoading}
        >
          Sign Up
        </button>
        <button
          onClick={handleSignIn}
          className="bg-green-600 text-white px-4 py-2 rounded w-1/2"
          disabled={isLoading}
        >
          Sign In
        </button>
      </div>
      <button
        onClick={handleSignOut}
        className="mt-4 bg-gray-600 text-white px-4 py-2 rounded w-full"
      >
        Sign Out
      </button>
      {authError && <div className="text-red-500 mt-2 text-center">{authError}</div>}
    </div>
  );
}