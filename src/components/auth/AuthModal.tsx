import React, { useState } from 'react';
import { 
  Coffee, 
  Lock, 
  Mail, 
  User as UserIcon, 
  Store as StoreIcon, 
  ShieldCheck, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  X,
  Sparkles,
  KeyRound
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth, RegisterData } from '../../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'signin' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'signin',
}) => {
  const { t, locale } = useTranslation();
  const { login, register } = useAuth();

  const [activeTab, setActiveTab] = useState<'signin' | 'register'>(defaultTab);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sign In state (backend authenticates by email)
  const [signInIdentifier, setSignInIdentifier] = useState('');
  const [signInPassword, setSignInPassword] = useState('');

  // Register state (backend RegisterRequest accepts only these fields;
  // roles and branch assignments are granted server-side, never chosen here)
  const [regData, setRegData] = useState<RegisterData>({
    fullName: '',
    email: '',
    password: '',
  });

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!signInIdentifier || !signInIdentifier.includes('@')) {
      setErrorMsg(locale === 'km' ? 'សូមបញ្ចូលអាសយដ្ឋានអ៊ីមែល' : 'Please enter your account email.');
      return;
    }
    if (!signInPassword) {
      setErrorMsg(locale === 'km' ? 'សូមបញ្ចូលពាក្យសម្ងាត់' : 'Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    const res = await login(signInIdentifier, signInPassword);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMsg(locale === 'km' ? 'ចូលប្រព័ន្ធបានជោគជ័យ!' : 'Successfully signed in!');
      setTimeout(() => {
        onClose();
      }, 500);
    } else {
      setErrorMsg(res.error || 'Authentication failed');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!regData.fullName || !regData.email || !regData.password) {
      setErrorMsg(locale === 'km' ? 'សូមបំពេញព័ត៌មានដែលចាំបាច់ទាំងអស់' : 'Please fill in all required fields.');
      return;
    }

    setIsSubmitting(true);
    const res = await register(regData);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMsg(locale === 'km' ? 'ការចុះឈ្មោះគណនីបានជោគជ័យ!' : 'Account registered successfully!');
      setTimeout(() => {
        onClose();
      }, 600);
    } else {
      setErrorMsg(res.error || 'Registration failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-3xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-[#2A2421] to-[#3A322E] p-6 text-white">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 rounded-lg p-1.5 text-[#A89D94] hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#C48A56] to-[#A36C3D] text-white shadow-lg">
              <Coffee className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Smart Coffee & Bakery ERP</h2>
              <p className="text-xs text-[#D4A87A]">
                {activeTab === 'signin' 
                  ? (locale === 'km' ? 'ផ្ទាំងចូលប្រើប្រាស់ប្រព័ន្ធរដ្ឋបាល' : 'Management Portal Sign In') 
                  : (locale === 'km' ? 'ចុះឈ្មោះគណនីបុគ្គលិកថ្មី' : 'Register New Staff Account')}
              </p>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="mt-5 flex rounded-xl bg-black/30 p-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('signin');
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'signin'
                  ? 'bg-[#C48A56] text-white shadow-sm'
                  : 'text-[#A89D94] hover:text-white'
              }`}
            >
              {locale === 'km' ? 'ចូលប្រើប្រាស់ (Sign In)' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('register');
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'register'
                  ? 'bg-[#C48A56] text-white shadow-sm'
                  : 'text-[#A89D94] hover:text-white'
              }`}
            >
              {locale === 'km' ? 'ចុះឈ្មោះថ្មី (Register)' : 'Register Account'}
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3 text-xs text-[#DC2626] font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="rounded-xl border border-[#2E7D32]/30 bg-[#2E7D32]/10 p-3 text-xs text-[#2E7D32] font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* SIGN IN TAB */}
          {activeTab === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1.5">
                  {locale === 'km' ? 'អ៊ីមែល' : 'Email'}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#8C7C6B]" />
                  <input
                    type="email"
                    required
                    value={signInIdentifier}
                    onChange={(e) => setSignInIdentifier(e.target.value)}
                    placeholder="you@smartcoffee.com.kh"
                    className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] pl-9 pr-4 py-2.5 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:border-[#C48A56] focus:outline-none focus:ring-1 focus:ring-[#C48A56]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1.5">
                  {locale === 'km' ? 'ពាក្យសម្ងាត់' : 'Password'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[#8C7C6B]" />
                  <input
                    type="password"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] pl-9 pr-4 py-2.5 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:border-[#C48A56] focus:outline-none focus:ring-1 focus:ring-[#C48A56]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#C48A56] py-2.5 text-xs font-bold text-white hover:bg-[#B37947] disabled:opacity-50 transition-colors shadow-xs"
              >
                <span>{isSubmitting ? 'Authenticating...' : (locale === 'km' ? 'ចូលប្រព័ន្ធ' : 'Sign In to Dashboard')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

            </form>
          )}

          {/* REGISTER TAB */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">
                  {locale === 'km' ? 'ឈ្មោះពេញ' : 'Full Name'}
                </label>
                <input
                  type="text"
                  required
                  value={regData.fullName}
                  onChange={(e) => setRegData({ ...regData, fullName: e.target.value })}
                  placeholder="e.g. Chan Minea"
                  className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:border-[#C48A56] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">
                  {locale === 'km' ? 'អ៊ីមែលការងារ' : 'Work Email'}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2 h-4 w-4 text-[#8C7C6B]" />
                  <input
                    type="email"
                    required
                    value={regData.email}
                    onChange={(e) => setRegData({ ...regData, email: e.target.value })}
                    placeholder="minea@smartcoffee.com.kh"
                    className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] pl-9 pr-3 py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:border-[#C48A56] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">
                  {locale === 'km' ? 'ពាក្យសម្ងាត់' : 'Password'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2 h-4 w-4 text-[#8C7C6B]" />
                  <input
                    type="password"
                    required
                    value={regData.password}
                    onChange={(e) => setRegData({ ...regData, password: e.target.value })}
                    placeholder={locale === 'km' ? 'អប្បបរមា ១០ តួអក្សរ' : 'Minimum 10 characters'}
                    className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] pl-9 pr-3 py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:border-[#C48A56] focus:outline-none"
                  />
                </div>
              </div>

              <p className="text-[11px] text-[#8C7C6B] leading-relaxed">
                {locale === 'km'
                  ? 'តួនាទី និងការចូលប្រើប្រាស់សាខា ត្រូវបានផ្តល់ដោយអ្នកគ្រប់គ្រងនៅខាងក្នុងប្រព័ន្ធ។'
                  : 'Roles and branch access are granted by an administrator on the server; new accounts sign in with no management permissions until assigned.'}
              </p>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#C48A56] py-2.5 text-xs font-bold text-white hover:bg-[#B37947] disabled:opacity-50 transition-colors shadow-xs mt-2"
              >
                <span>{isSubmitting ? 'Registering...' : (locale === 'km' ? 'បង្កើតគណនី' : 'Register Account & Sign In')}</span>
                <Sparkles className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
