import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { colors, radius, shadow } from '../styles/theme';
import { generateAndStoreKeyPair } from '../crypto';

const ROLES = [
  { id: 'patient',    icon: '🧑‍⚕️', name: 'Patient',     desc: 'Manage my health records' },
  { id: 'doctor',     icon: '👨‍⚕️', name: 'Doctor',      desc: 'Prescribe & manage patients' },
  { id: 'pharmacist', icon: '💊',   name: 'Pharmacist',  desc: 'Dispense & verify medications' },
  { id: 'lab',        icon: '🔬',   name: 'Lab Tech',    desc: 'Upload & manage lab results' },
];

const SPECIALTIES = [
  'General Physician','Cardiologist','Neurologist','Orthopedic',
  'Pediatrician','Dermatologist','ENT Specialist','Psychiatrist',
  'Gynecologist','Oncologist',
];

export default function RegisterScreen({ user, onComplete }) {
  const [role, setRole]       = useState('');
  const [name, setName]       = useState('');
  const [orgName, setOrgName] = useState('');
  const [specialty, setSpecialty] = useState('General Physician');
  const [dob, setDob]         = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [specOpen, setSpecOpen] = useState(false);

  const isProvider = role && role !== 'patient';

  const handleCreate = async () => {
    if (!role || !name.trim()) { setError('Choose a role and enter your name'); return; }
    if (isProvider && !orgName.trim()) { setError('Enter your organisation name'); return; }
    setLoading(true); setError('');
    try {
      const uid = user.uid;
      const base = {
        name: name.trim(),
        email: user.email || null,
        phone: user.phoneNumber || null,
        createdAt: firestore.FieldValue.serverTimestamp(),
      };

      // Generate E2E keypair for every user on registration
      await generateAndStoreKeyPair(uid);

      if (role === 'patient') {
        await firestore().collection('patients').doc(uid).set({
          ...base, dob: dob || null,
          allergies: [], currentMeds: [],
          pinHash: null, signatureUrl: null,
        });
      } else {
        await firestore().collection('providers').doc(uid).set({
          ...base, role, orgName: orgName.trim(), specialty,
        });
      }
      onComplete(role, { ...base, role: role === 'patient' ? undefined : role, specialty });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={s.bg} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <Text style={s.title}>Set up your profile</Text>
        <Text style={s.sub}>Signed in as {user?.phoneNumber || user?.email}</Text>
      </View>

      {!!error && <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>}

      <Text style={s.sectionLabel}>I am a…</Text>
      <View style={s.roleGrid}>
        {ROLES.map((r) => (
          <TouchableOpacity
            key={r.id}
            style={[s.roleCard, role === r.id && s.roleCardActive]}
            onPress={() => setRole(r.id)}
          >
            <Text style={s.roleIcon}>{r.icon}</Text>
            <Text style={s.roleName}>{r.name}</Text>
            <Text style={s.roleDesc}>{r.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!!role && (
        <View style={s.form}>
          <Text style={s.label}>Full name</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Dr. Anitha Raman" placeholderTextColor={colors.textMuted} />

          {isProvider && (
            <>
              <Text style={s.label}>Organisation / Hospital</Text>
              <TextInput style={s.input} value={orgName} onChangeText={setOrgName} placeholder="Apollo Hospital, Chennai" placeholderTextColor={colors.textMuted} />

              <Text style={s.label}>Specialty</Text>
              <TouchableOpacity style={s.select} onPress={() => setSpecOpen(!specOpen)}>
                <Text style={s.selectText}>{specialty}</Text>
                <Text style={s.selectArrow}>{specOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {specOpen && (
                <View style={s.dropdown}>
                  {SPECIALTIES.map((sp) => (
                    <TouchableOpacity key={sp} style={[s.dropItem, specialty === sp && s.dropItemActive]} onPress={() => { setSpecialty(sp); setSpecOpen(false); }}>
                      <Text style={[s.dropItemText, specialty === sp && { color: colors.primary, fontWeight: '700' }]}>{sp}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {role === 'patient' && (
            <>
              <Text style={s.label}>Date of birth</Text>
              <TextInput style={s.input} value={dob} onChangeText={setDob} placeholder="DD/MM/YYYY" placeholderTextColor={colors.textMuted} keyboardType="numbers-and-punctuation" />
            </>
          )}

          <TouchableOpacity style={s.primaryBtn} onPress={handleCreate} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Create profile →</Text>}
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={s.ghostBtn} onPress={() => auth().signOut()}>
        <Text style={s.ghostBtnText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  header: { paddingVertical: 20, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 4 },
  sub: { fontSize: 13, color: colors.textMuted },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  roleCard: {
    width: '47%', borderWidth: 2, borderColor: colors.border,
    borderRadius: radius.md, padding: 16, alignItems: 'center',
    backgroundColor: colors.surface, ...shadow.sm,
  },
  roleCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  roleIcon: { fontSize: 28, marginBottom: 8 },
  roleName: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 3 },
  roleDesc: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  form: { gap: 0 },
  label: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: colors.text, marginBottom: 14,
  },
  select: {
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 13,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  selectText: { fontSize: 14, color: colors.text },
  selectArrow: { fontSize: 12, color: colors.textMuted },
  dropdown: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, marginBottom: 14, ...shadow.md, overflow: 'hidden',
  },
  dropItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropItemActive: { backgroundColor: colors.primaryTint },
  dropItemText: { fontSize: 14, color: colors.text },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: radius.sm,
    paddingVertical: 13, alignItems: 'center', marginTop: 8, marginBottom: 12, ...shadow.sm,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  ghostBtn: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
  ghostBtnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  errorBox: { backgroundColor: colors.dangerTint, borderWidth: 1, borderColor: '#FECACA', borderRadius: radius.sm, padding: 10, marginBottom: 14 },
  errorText: { color: '#B91C1C', fontSize: 13 },
});
