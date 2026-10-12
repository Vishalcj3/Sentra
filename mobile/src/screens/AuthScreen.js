import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import { colors, radius, shadow } from '../styles/theme';

const COUNTRY_CODE = '+91';

export default function AuthScreen() {
  const [mode, setMode]         = useState('phone'); // 'phone' | 'email'
  const [phone, setPhone]       = useState('');
  const [email, setEmail]       = useState('');
  const [otp, setOtp]           = useState(['', '', '', '', '', '']);
  const [step, setStep]         = useState('input'); // 'input' | 'otp' | 'email-sent'
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [confirm, setConfirm]   = useState(null);
  const otpRefs = useRef([]);

  const sendOtp = async () => {
    if (phone.length < 10) { setError('Enter a valid 10-digit number'); return; }
    setLoading(true); setError('');
    try {
      const confirmation = await auth().signInWithPhoneNumber(COUNTRY_CODE + phone);
      setConfirm(confirmation);
      setStep('otp');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    const code = otp.join('');
    if (code.length < 6) { setError('Enter all 6 digits'); return; }
    setLoading(true); setError('');
    try {
      await confirm.confirm(code);
    } catch {
      setError('Invalid OTP. Try again.');
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const sendEmailLink = async () => {
    if (!email.includes('@')) { setError('Enter a valid email'); return; }
    setLoading(true); setError('');
    try {
      await auth().sendSignInLinkToEmail(email, {
        handleCodeInApp: true,
        url: 'https://vortexa-d430e.firebaseapp.com/__/auth/action',
        iOS: { bundleId: 'com.vortexa.app' },
        android: { packageName: 'com.vortexa.app', installApp: true },
      });
      setStep('email-sent');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (val, idx) => {
    const next = [...otp];
    next[idx] = val.slice(-1);
    setOtp(next);
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus();
    if (!val && idx > 0) otpRefs.current[idx - 1]?.focus();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.bg} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={s.logoWrap}>
          <View style={s.logoMark}><Text style={s.logoLetter}>V</Text></View>
          <Text style={s.logoTitle}>VORTEXA</Text>
          <Text style={s.logoSub}>Patient-Sovereign Prescription Intelligence</Text>
        </View>

        <View style={s.card}>

          {/* Tab toggle */}
          {step === 'input' && (
            <View style={s.toggle}>
              {['phone', 'email'].map((m) => (
                <TouchableOpacity key={m} style={[s.toggleBtn, mode === m && s.toggleActive]} onPress={() => { setMode(m); setError(''); }}>
                  <Text style={[s.toggleText, mode === m && s.toggleActiveText]}>{m === 'phone' ? '📱 Phone' : '✉️ Email'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Error */}
          {!!error && <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>}

          {/* Phone input */}
          {step === 'input' && mode === 'phone' && (
            <>
              <Text style={s.label}>Mobile number</Text>
              <View style={s.phoneRow}>
                <View style={s.prefix}><Text style={s.prefixText}>{COUNTRY_CODE}</Text></View>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="9876543210"
                  placeholderTextColor="rgba(255,255,255,.3)"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  maxLength={10}
                />
              </View>
              <TouchableOpacity style={s.primaryBtn} onPress={sendOtp} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Send OTP →</Text>}
              </TouchableOpacity>
            </>
          )}

          {/* Email input */}
          {step === 'input' && mode === 'email' && (
            <>
              <Text style={s.label}>Email address</Text>
              <TextInput
                style={s.input}
                placeholder="you@example.com"
                placeholderTextColor="rgba(255,255,255,.3)"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
              <TouchableOpacity style={s.primaryBtn} onPress={sendEmailLink} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Send magic link →</Text>}
              </TouchableOpacity>
            </>
          )}

          {/* OTP boxes */}
          {step === 'otp' && (
            <>
              <Text style={s.cardTitle}>Enter OTP</Text>
              <Text style={s.cardSub}>Sent to {COUNTRY_CODE}{phone}</Text>
              <View style={s.otpRow}>
                {otp.map((d, i) => (
                  <TextInput
                    key={i}
                    ref={(r) => { otpRefs.current[i] = r; }}
                    style={s.otpBox}
                    value={d}
                    onChangeText={(v) => handleOtpChange(v, i)}
                    keyboardType="number-pad"
                    maxLength={1}
                    textAlign="center"
                    selectionColor={colors.primary}
                  />
                ))}
              </View>
              <TouchableOpacity style={s.primaryBtn} onPress={verifyOtp} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Verify →</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={s.ghostBtn} onPress={() => { setStep('input'); setOtp(['','','','','','']); }}>
                <Text style={s.ghostBtnText}>← Change number</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Email sent */}
          {step === 'email-sent' && (
            <>
              <View style={s.sentIcon}><Text style={{ fontSize: 32 }}>📧</Text></View>
              <Text style={s.cardTitle}>Check your email</Text>
              <Text style={s.cardSub}>A sign-in link was sent to {email}. Tap it on this device to sign in.</Text>
              <TouchableOpacity style={s.ghostBtn} onPress={() => setStep('input')}>
                <Text style={s.ghostBtnText}>← Use a different email</Text>
              </TouchableOpacity>
            </>
          )}

        </View>

        <Text style={s.hint}>🔒 E2E encrypted · Your data belongs to you</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  bg: { flexGrow: 1, backgroundColor: '#0C4A6E', alignItems: 'center', justifyContent: 'center', padding: 24, paddingTop: 60 },
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoMark: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
    ...shadow.lg,
  },
  logoLetter: { fontSize: 28, fontWeight: '800', color: '#fff' },
  logoTitle: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  logoSub: { fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 4, textAlign: 'center' },
  card: {
    backgroundColor: 'rgba(255,255,255,.07)',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.12)',
  },
  toggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 8, padding: 3, marginBottom: 20 },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  toggleActive: { backgroundColor: 'rgba(255,255,255,.15)' },
  toggleText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,.55)' },
  toggleActiveText: { color: '#fff' },
  label: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  input: {
    backgroundColor: 'rgba(255,255,255,.08)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,.15)',
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#fff', marginBottom: 14,
  },
  phoneRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  prefix: {
    backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,.15)', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
  },
  prefixText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: 8,
    paddingVertical: 13, alignItems: 'center', marginBottom: 10,
    ...shadow.sm,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  ghostBtn: {
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,.2)',
    borderRadius: 8, paddingVertical: 11, alignItems: 'center', marginTop: 8,
  },
  ghostBtnText: { color: 'rgba(255,255,255,.7)', fontSize: 14, fontWeight: '600' },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 20 },
  otpBox: {
    width: 44, height: 54, backgroundColor: 'rgba(255,255,255,.08)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,.2)',
    borderRadius: 10, fontSize: 22, fontWeight: '700', color: '#fff',
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 6 },
  cardSub: { fontSize: 13, color: 'rgba(255,255,255,.55)', marginBottom: 20 },
  sentIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(8,145,178,.2)',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 16,
  },
  errorBox: {
    backgroundColor: 'rgba(220,38,38,.15)', borderWidth: 1,
    borderColor: 'rgba(220,38,38,.3)', borderRadius: 8,
    padding: 10, marginBottom: 14,
  },
  errorText: { color: '#FCA5A5', fontSize: 13 },
  hint: { fontSize: 11, color: 'rgba(255,255,255,.35)', marginTop: 24, textAlign: 'center' },
});
