import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Slot } from '../types';

export default function SlotBooking() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasActiveSlot, setHasActiveSlot] = useState(false);

  // Login/Register states
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [formData, setFormData] = useState({
    start_time: '',
  });

  useEffect(() => {
    // Check if user is logged in
    const storedUsername = localStorage.getItem('bgmi_username');
    const storedAuth = localStorage.getItem('bgmi_authenticated');
    
    if (storedUsername && storedAuth === 'true') {
      setUserName(storedUsername);
      setIsAuthenticated(true);
    }

    fetchSlots();

    // Auto-refresh every minute
    const interval = setInterval(() => {
      fetchSlots();
    }, 60000);

    // Subscribe to realtime changes
    const channel = supabase
      .channel('slots-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, () => {
        fetchSlots();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (userName && isAuthenticated) {
      checkUserSlot();
    }
  }, [userName, slots, isAuthenticated]);

  const checkUserSlot = () => {
    const userSlot = slots.find(
      (slot) => slot.creator_name.toLowerCase() === userName.toLowerCase() && slot.status === 'active'
    );
    setHasActiveSlot(!!userSlot);
  };

  const fetchSlots = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('slots')
      .select('*')
      .eq('status', 'active')
      .gte('start_time', today.toISOString())
      .order('start_time', { ascending: true });
    
    if (error) {
      console.error('Error fetching slots:', error);
      return;
    }
    
    if (data) setSlots(data);
  };

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      // Check if user exists and password matches
      const { data, error } = await supabase
        .from('user_credentials')
        .select('*')
        .eq('username', loginUsername.toLowerCase())
        .single();

      if (error || !data) {
        setAuthError('Username not found. Please register first.');
        setAuthLoading(false);
        return;
      }

      // Simple password check (in production, use proper hashing like bcrypt)
      if (data.password_hash !== loginPassword) {
        setAuthError('Incorrect password!');
        setAuthLoading(false);
        return;
      }

      // Login successful
      localStorage.setItem('bgmi_username', loginUsername);
      localStorage.setItem('bgmi_authenticated', 'true');
      setUserName(loginUsername);
      setIsAuthenticated(true);
      
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    // Validation
    if (registerPassword !== confirmPassword) {
      setAuthError('Passwords do not match!');
      setAuthLoading(false);
      return;
    }

    if (registerPassword.length < 6) {
      setAuthError('Password must be at least 6 characters long!');
      setAuthLoading(false);
      return;
    }

    if (registerUsername.length < 3) {
      setAuthError('Username must be at least 3 characters long!');
      setAuthLoading(false);
      return;
    }

    try {
      // Check if username already exists
      const { data: existingUser } = await supabase
        .from('user_credentials')
        .select('username')
        .eq('username', registerUsername.toLowerCase())
        .single();

      if (existingUser) {
        setAuthError('Username already taken. Please choose another.');
        setAuthLoading(false);
        return;
      }

      // Register new user (in production, hash the password properly)
      const { error } = await supabase
        .from('user_credentials')
        .insert({
          username: registerUsername.toLowerCase(),
          password_hash: registerPassword, // In production, use bcrypt or similar
        });

      if (error) throw error;

      // Auto-login after registration
      localStorage.setItem('bgmi_username', registerUsername);
      localStorage.setItem('bgmi_authenticated', 'true');
      setUserName(registerUsername);
      setIsAuthenticated(true);
      
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem('bgmi_username');
    localStorage.removeItem('bgmi_authenticated');
    setUserName('');
    setIsAuthenticated(false);
  };

  const handleSlotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (hasActiveSlot) {
      alert('You already have an active slot! Cancel it first to create a new one.');
      return;
    }

    setLoading(true);

    try {
      const today = new Date();
      const [hours, minutes] = formData.start_time.split(':');
      today.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const { error } = await supabase.from('slots').insert({
        creator_name: userName,
        start_time: today.toISOString(),
        player1: userName,
        player2: '',
        player3: '',
        player4: '',
        substitute: '',
      });

      if (error) throw error;

      setFormData({
        start_time: '',
      });
      setShowForm(false);
      fetchSlots();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSlot = async () => {
    const userSlot = slots.find(
      (slot) => slot.creator_name.toLowerCase() === userName.toLowerCase() && slot.status === 'active'
    );

    if (!userSlot) return;

    const confirmCancel = window.confirm('Are you sure you want to cancel your slot?');
    if (!confirmCancel) return;

    try {
      const { error } = await supabase
        .from('slots')
        .update({ status: 'cancelled' })
        .eq('id', userSlot.id);

      if (error) throw error;
      fetchSlots();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const isUserInSlot = (slot: Slot) => {
    const lowerUserName = userName.toLowerCase();
    return (
      slot.player1.toLowerCase() === lowerUserName ||
      slot.player2.toLowerCase() === lowerUserName ||
      slot.player3.toLowerCase() === lowerUserName ||
      slot.player4.toLowerCase() === lowerUserName ||
      slot.substitute.toLowerCase() === lowerUserName
    );
  };

  const getNextAvailablePosition = (slot: Slot) => {
    if (!slot.player2) return 'player2';
    if (!slot.player3) return 'player3';
    if (!slot.player4) return 'player4';
    if (!slot.substitute) return 'substitute';
    return null;
  };

  const handleJoinSlot = async (slotId: string) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;

    if (isUserInSlot(slot)) {
      alert('You are already in this slot!');
      return;
    }

    const nextPosition = getNextAvailablePosition(slot);
    if (!nextPosition) {
      alert('This slot is full!');
      return;
    }

    try {
      const { error } = await supabase
        .from('slots')
        .update({ [nextPosition]: userName })
        .eq('id', slotId);

      if (error) throw error;
      fetchSlots();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleLeaveSlot = async (slotId: string) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;

    if (slot.creator_name.toLowerCase() === userName.toLowerCase()) {
      alert('You cannot leave your own slot! Cancel the slot instead.');
      return;
    }

    const confirmLeave = window.confirm('Are you sure you want to leave this slot?');
    if (!confirmLeave) return;

    try {
      const updates: any = {};
      const lowerUserName = userName.toLowerCase();
      
      if (slot.player2.toLowerCase() === lowerUserName) updates.player2 = '';
      if (slot.player3.toLowerCase() === lowerUserName) updates.player3 = '';
      if (slot.player4.toLowerCase() === lowerUserName) updates.player4 = '';
      if (slot.substitute.toLowerCase() === lowerUserName) updates.substitute = '';

      const { error } = await supabase
        .from('slots')
        .update(updates)
        .eq('id', slotId);

      if (error) throw error;
      fetchSlots();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const getCurrentTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  const getTodayFormatted = () => {
    const today = new Date();
    return today.toLocaleDateString('en-IN', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Login/Register Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-gray-900 to-black rounded-lg shadow-2xl p-8 w-full max-w-md border-2 border-yellow-500">
          <div className="flex justify-center mb-4">
            <img 
              src="/EF.jpg" 
              alt="Ethical Fire Logo" 
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-yellow-500"
            />
          </div>
          <h1 className="text-3xl font-bold text-center mb-2 text-yellow-500">
            ETHICAL FIRE
          </h1>
          <p className="text-center text-yellow-400 mb-6 font-semibold">
            {isLoginMode ? 'Login to Continue' : 'Create Your Account'}
          </p>

          {/* Toggle Login/Register */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => {
                setIsLoginMode(true);
                setAuthError('');
              }}
              className={`flex-1 py-2 rounded-lg font-bold transition ${
                isLoginMode
                  ? 'bg-yellow-500 text-black'
                  : 'bg-gray-800 text-gray-400'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => {
                setIsLoginMode(false);
                setAuthError('');
              }}
              className={`flex-1 py-2 rounded-lg font-bold transition ${
                !isLoginMode
                  ? 'bg-yellow-500 text-black'
                  : 'bg-gray-800 text-gray-400'
              }`}
            >
              Register
            </button>
          </div>

          {/* Login Form */}
          {isLoginMode ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-yellow-400 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  required
                  placeholder="Enter your username"
                  className="w-full px-4 py-3 bg-black border-2 border-yellow-500 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-white placeholder-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-yellow-400 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 bg-black border-2 border-yellow-500 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-white placeholder-gray-600"
                />
              </div>

              {authError && (
                <div className="bg-red-900 bg-opacity-50 border-2 border-red-500 text-red-300 p-3 rounded-lg text-sm">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black py-3 rounded-lg font-bold hover:from-yellow-400 hover:to-yellow-500 transition shadow-lg border-2 border-yellow-400 disabled:opacity-50"
              >
                {authLoading ? 'Logging in...' : 'Login'}
              </button>
            </form>
          ) : (
            /* Register Form */
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-yellow-400 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={registerUsername}
                  onChange={(e) => setRegisterUsername(e.target.value)}
                  required
                  placeholder="Choose a username"
                  className="w-full px-4 py-3 bg-black border-2 border-yellow-500 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-white placeholder-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-yellow-400 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  required
                  placeholder="Create a password (min 6 characters)"
                  className="w-full px-4 py-3 bg-black border-2 border-yellow-500 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-white placeholder-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-yellow-400 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Re-enter your password"
                  className="w-full px-4 py-3 bg-black border-2 border-yellow-500 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-white placeholder-gray-600"
                />
              </div>

              {authError && (
                <div className="bg-red-900 bg-opacity-50 border-2 border-red-500 text-red-300 p-3 rounded-lg text-sm">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black py-3 rounded-lg font-bold hover:from-yellow-400 hover:to-yellow-500 transition shadow-lg border-2 border-yellow-400 disabled:opacity-50"
              >
                {authLoading ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600 text-black shadow-2xl border-b-4 border-yellow-400">
        
        <div className="container mx-auto px-4 py-4">
          {/* Top Row - Logo, Title and User Info */}
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-3">
            <div className="flex items-center gap-3">
              <img 
                src="/EF.jpg" 
                alt="Ethical Fire Logo" 
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-yellow-500"
              />
              <div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-wide">
                  ETHICAL FIRE
                </h1>
                <p className="text-xs sm:text-sm text-yellow-900 font-semibold">
                  Slot Booking System
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between md:justify-end gap-4">
              <div className="text-left md:text-right">
                <p className="text-xs text-yellow-900">Logged in as</p>
                <p className="font-bold text-sm md:text-base">{userName}</p>
                <button
                  onClick={handleLogout}
                  className="text-xs text-yellow-900 hover:text-black underline"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>

          {/* Date Display */}
          <div className="bg-black bg-opacity-20 rounded-lg px-3 py-2 mb-3">
            <p className="text-xs sm:text-sm text-yellow-900 font-semibold text-center">
              {getTodayFormatted()}
            </p>
          </div>
          
          {/* WhatsApp Group Button */}
          <div className="flex justify-center">
            <a
              href="https://chat.whatsapp.com/LUgeb25JcgR14sPXytyjV5"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 sm:py-3 sm:px-6 rounded-lg shadow-lg transition flex items-center gap-2 border-2 border-green-800 text-sm sm:text-base w-full sm:w-auto justify-center"
            >
              <svg 
                className="w-5 h-5" 
                fill="currentColor" 
                viewBox="0 0 24 24"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              <span>Join WhatsApp Group</span>
            </a>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-4 sm:p-6">
        {/* Create/Cancel Slot Buttons */}
        <div className="mb-6 flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => setShowForm(!showForm)}
            disabled={hasActiveSlot}
            className={`px-6 py-3 rounded-lg font-bold transition shadow-lg border-2 text-base ${
              hasActiveSlot
                ? 'bg-gray-700 text-gray-400 border-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black border-yellow-400 hover:from-yellow-400 hover:to-yellow-500'
            }`}
          >
            {showForm ? 'Cancel' : '+ Create New Slot'}
          </button>

          {hasActiveSlot && (
            <button
              onClick={handleCancelSlot}
              className="bg-gradient-to-r from-red-600 to-red-700 text-white px-6 py-3 rounded-lg font-bold hover:from-red-500 hover:to-red-600 transition shadow-lg border-2 border-red-500 text-base"
            >
              Cancel My Slot
            </button>
          )}
        </div>

        {hasActiveSlot && (
          <div className="mb-6 bg-gradient-to-r from-yellow-600 to-yellow-500 text-black p-3 rounded-lg font-bold border-2 border-yellow-400 text-sm sm:text-base">
            You already have an active slot. Cancel it to create a new one.
          </div>
        )}

        {/* Slot Creation Form */}
        {showForm && !hasActiveSlot && (
          <div className="bg-gradient-to-br from-gray-900 to-black rounded-lg shadow-2xl p-6 sm:p-8 mb-6 border-2 border-yellow-500">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-yellow-500">Create BGMI Slot</h2>
            <form onSubmit={handleSlotSubmit} className="space-y-6">
              <div>
                <label className="block text-base sm:text-lg font-bold text-yellow-400 mb-2">
                  Start Time (Today: {getTodayFormatted()})
                </label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  min={getCurrentTime()}
                  required
                  className="w-full px-4 py-3 bg-black border-2 border-yellow-500 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-yellow-400 font-bold text-lg"
                />
              </div>

              <div className="bg-gray-800 p-4 rounded-lg border-2 border-yellow-600">
                <p className="text-yellow-400 font-semibold mb-2 text-sm sm:text-base">You will be added as Player 1: {userName}</p>
                <p className="text-gray-400 text-xs sm:text-sm">Other players can join by clicking the join button.</p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black py-4 rounded-lg font-bold text-base sm:text-lg hover:from-yellow-400 hover:to-yellow-500 transition disabled:opacity-50 shadow-lg border-2 border-yellow-400"
              >
                {loading ? 'Creating...' : 'Create Slot'}
              </button>
            </form>
          </div>
        )}

        {/* Slots List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {slots.map((slot) => {
            const userInSlot = isUserInSlot(slot);
            const nextPosition = getNextAvailablePosition(slot);
            const isFull = !nextPosition;
            const isCreator = slot.creator_name.toLowerCase() === userName.toLowerCase();

            return (
              <div
                key={slot.id}
                className={`rounded-lg shadow-2xl p-4 sm:p-6 border-2 ${
                  slot.status === 'cancelled' 
                    ? 'bg-gray-800 border-gray-600' 
                    : 'bg-gradient-to-br from-gray-900 to-black border-yellow-500'
                }`}
              >
                <div className="flex justify-between items-start mb-3 sm:mb-4">
                  <h3 className="text-xl sm:text-2xl font-bold text-yellow-400">
                    {new Date(slot.start_time).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </h3>
                  <span
                    className={`px-2 sm:px-3 py-1 rounded-full text-xs font-bold ${
                      slot.status === 'active'
                        ? 'bg-yellow-500 text-black'
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    {slot.status === 'active' ? 'ACTIVE' : 'CANCELLED'}
                  </span>
                </div>

                <div className="mb-3 sm:mb-4 bg-yellow-900 bg-opacity-20 p-2 sm:p-3 rounded-lg border border-yellow-600">
                  <p className="text-yellow-300 font-bold text-xs sm:text-sm">Created by: {slot.creator_name}</p>
                </div>

                <div className="space-y-2 text-xs sm:text-sm mb-3 sm:mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1 min-w-0">
                      <span className="font-bold text-yellow-400 w-20 sm:w-28 flex-shrink-0">Player 1:</span>
                      <span className="text-white font-semibold truncate ml-2">{slot.player1 || '—'}</span>
                    </div>
                    {slot.player1 && <span className="text-green-500 ml-2 flex-shrink-0">✓</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1 min-w-0">
                      <span className="font-bold text-yellow-400 w-20 sm:w-28 flex-shrink-0">Player 2:</span>
                      <span className="text-white font-semibold truncate ml-2">{slot.player2 || '—'}</span>
                    </div>
                    {slot.player2 && <span className="text-green-500 ml-2 flex-shrink-0">✓</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1 min-w-0">
                      <span className="font-bold text-yellow-400 w-20 sm:w-28 flex-shrink-0">Player 3:</span>
                      <span className="text-white font-semibold truncate ml-2">{slot.player3 || '—'}</span>
                    </div>
                    {slot.player3 && <span className="text-green-500 ml-2 flex-shrink-0">✓</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1 min-w-0">
                      <span className="font-bold text-yellow-400 w-20 sm:w-28 flex-shrink-0">Player 4:</span>
                      <span className="text-white font-semibold truncate ml-2">{slot.player4 || '—'}</span>
                    </div>
                    {slot.player4 && <span className="text-green-500 ml-2 flex-shrink-0">✓</span>}
                  </div>
                  <div className="flex items-center justify-between border-t-2 border-yellow-600 pt-2">
                    <div className="flex items-center flex-1 min-w-0">
                      <span className="font-bold text-yellow-300 w-20 sm:w-28 flex-shrink-0">Substitute:</span>
                      <span className="text-yellow-100 font-semibold truncate ml-2">{slot.substitute || '—'}</span>
                    </div>
                    {slot.substitute && <span className="text-green-500 ml-2 flex-shrink-0">✓</span>}
                  </div>
                </div>

                {/* Join/Leave Buttons */}
                {slot.status === 'active' && !isCreator && (
                  <div className="mt-3 sm:mt-4">
                    {userInSlot ? (
                      <button
                        onClick={() => handleLeaveSlot(slot.id)}
                        className="w-full bg-gradient-to-r from-red-600 to-red-700 text-white py-2 rounded-lg font-bold hover:from-red-500 hover:to-red-600 transition shadow-lg border-2 border-red-500 text-sm sm:text-base"
                      >
                        Leave Slot
                      </button>
                    ) : (
                      <button
                        onClick={() => handleJoinSlot(slot.id)}
                        disabled={isFull}
                        className={`w-full py-2 rounded-lg font-bold transition shadow-lg border-2 text-sm sm:text-base ${
                          isFull
                            ? 'bg-gray-700 text-gray-400 border-gray-600 cursor-not-allowed'
                            : 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-500 hover:to-green-600 border-green-500'
                        }`}
                      >
                        {isFull ? 'Slot Full' : 'Join Slot'}
                      </button>
                    )}
                  </div>
                )}

                {slot.status === 'active' && isCreator && (
                  <div className="mt-3 sm:mt-4 bg-yellow-600 bg-opacity-20 p-2 rounded-lg border border-yellow-600 text-center">
                    <p className="text-yellow-300 font-bold text-xs">Your Slot</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {slots.length === 0 && (
          <div className="text-center py-12 sm:py-16 text-yellow-500 text-lg sm:text-xl font-bold border-2 border-yellow-600 rounded-lg bg-gradient-to-br from-gray-900 to-black">
            No slots created yet. Create your first slot!
          </div>
        )}
      </div>
    </div>
  );
}
