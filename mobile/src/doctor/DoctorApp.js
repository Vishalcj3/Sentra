import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation, useRoute } from '@react-navigation/native';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import { colors, radius, shadow, avatarColors, initials, base } from '../styles/theme';
import { encryptPrescription } from '../crypto';

const Tab = createBottomTabNavigator();
const DStack = createNativeStackNavigator();
const bookApptFn = functions().httpsCallable('bookAppointment');

const ANNOUNCEMENTS = [
  { id: 'a1', icon: '🩺', title: 'OPD timings extended', body: 'OPD hours extended to 9 PM on weekdays from July 1.', date: 'Jun 20' },
  { id: 'a2', icon: '💉', title: 'Flu vaccination drive', body: 'Free staff & patient flu shots in Block C all week.', date: 'Jun 18' },
  { id: 'a3', icon: '🖥️', title: 'EMR maintenance', body: 'Records system maintenance Sunday 2–4 AM. Brief downtime expected.', date: 'Jun 15' },
];

// Record types a provider can request access to
const RECORD_TYPES = ['Lab records', 'Prescriptions', 'Health report'];

export default function DoctorApp({ user, profile, onSignOut }) {
  const providerId = user.uid;
  const [appointments, setAppointments] = useState([]);
  const [notifications, setNotif]        = useState([]);
  const [recent, setRecent]              = useState([]);
  const [toast, setToast]                = useState(null);
  const [emOpen, setEmOpen]              = useState(false);
  const [emCode, setEmCode]              = useState('');
  const [emPurpose, setEmPurpose]        = useState('');
  const [emBusy, setEmBusy]              = useState(false);
  const [emResult, setEmResult]          = useState(null);

  useEffect(() => {
    const onErr = (label) => (e) => console.warn(`[${label}] listener error:`, e?.message || e);
    const unsubs = [
      firestore().collection('appointments').where('providerId', '==', providerId)
        .onSnapshot((snap) => { if (!snap) return; setAppointments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); }, onErr('appointments')),
      firestore().collection('notifications').where('providerId', '==', providerId)
        .onSnapshot((snap) => { if (!snap) return; setNotif(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); }, onErr('notifications')),
    ];
    return () => unsubs.forEach((u) => u());
  }, [providerId]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 5000); };

  const byTime = (a, b) => (a.scheduledAt?.toDate?.() || 0) - (b.scheduledAt?.toDate?.() || 0);
  const pending   = appointments.filter((a) => a.status === 'booked').sort(byTime);
  const delayed   = appointments.filter((a) => a.status === 'delayed').sort(byTime);
  const completed = appointments.filter((a) => a.status === 'completed');

  const addRecent = (p) => setRecent((prev) => [p, ...prev.filter((x) => x.id !== p.id)].slice(0, 8));

  const requestAccess = async (patientId, purpose, records) => {
    if (!records?.length) { showToast('Select at least one record type'); return false; }
    if (!purpose?.trim()) { showToast('Enter a purpose'); return false; }
    try {
      await firestore().collection('consents').add({
        patientId, providerId,
        providerName: profile?.name || 'Doctor',
        orgName: profile?.orgName || null,
        specialty: profile?.specialty || null,
        scope: records.join(', '),
        requestedRecords: records,
        purpose: purpose.trim(),
        approved: false,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
      showToast('📨 Access request sent to patient');
      return true;
    } catch (e) { showToast('Error: ' + e.message); return false; }
  };

  const completeAppt = (id) => firestore().collection('appointments').doc(id).update({ status: 'completed' }).catch((e) => showToast(e.message));
  const delayAppt    = (id) => firestore().collection('appointments').doc(id).update({ status: 'delayed' }).catch((e) => showToast(e.message));
  const deleteAppt   = (id) => firestore().collection('appointments').doc(id).delete().then(() => showToast('Appointment deleted')).catch((e) => showToast('Delete failed: ' + e.message));

  const grantEmergencyAccess = async () => {
    const code = emCode.trim();
    if (!code || !emPurpose.trim()) { setEmResult({ ok: false, msg: 'Enter patient ID and purpose' }); return; }
    setEmBusy(true); setEmResult(null);
    try {
      let target = null;
      const direct = await firestore().collection('patients').doc(code).get();
      if (direct.exists) target = { id: direct.id, ...direct.data() };
      if (!target) {
        const all = await firestore().collection('patients').get();
        const up = code.toUpperCase();
        const m = all.docs.find((d) => d.id.slice(0, 10).toUpperCase() === up);
        if (m) target = { id: m.id, ...m.data() };
      }
      if (!target) { setEmResult({ ok: false, msg: `No patient found for ID "${code}"` }); setEmBusy(false); return; }
      const expiresAt = firestore.Timestamp.fromDate(new Date(Date.now() + 2 * 60 * 60 * 1000));
      await firestore().collection('consents').add({
        patientId: target.id, providerId,
        providerName: profile?.name || 'Doctor', orgName: profile?.orgName || null, specialty: profile?.specialty || null,
        scope: 'emergency_full_access', purpose: emPurpose.trim(),
        approved: true, emergency: true,
        approvedAt: firestore.FieldValue.serverTimestamp(), expiresAt,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
      setEmResult({ ok: true, msg: `🚨 Emergency access granted for ${target.name} — valid 2 hours.` });
      setEmCode(''); setEmPurpose('');
    } catch (e) {
      setEmResult({ ok: false, msg: 'Failed: ' + e.message });
    } finally { setEmBusy(false); }
  };

  const shared = { user, profile, providerId, appointments, pending, delayed, completed, notifications, recent, addRecent, requestAccess, completeAppt, delayAppt, deleteAppt, showToast };

  const HomeScreen = () => (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.topbar}>
        <View>
          <Text style={s.topbarTitle}>{profile?.name || 'Doctor'}</Text>
          <View style={s.topbarRow}>
            <View style={s.rolePill}><Text style={s.rolePillText}>👨‍⚕️ {(profile?.specialty || 'Doctor').toUpperCase()}</Text></View>
            {!!profile?.orgName && <Text style={s.topbarSub}>{profile.orgName}</Text>}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity style={s.emBtn} onPress={() => { setEmResult(null); setEmOpen(true); }}>
            <Text style={s.emBtnText}>🚨 Emergency</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.signOutBtn} onPress={onSignOut}>
            <Text style={s.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: s.tabBar, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textMuted, tabBarLabelStyle: s.tabLabel }}>
        <Tab.Screen name="Home" options={{ tabBarIcon: () => <Text style={{ fontSize: 18 }}>🏠</Text> }}>
          {() => <HomeTab {...shared} />}
        </Tab.Screen>
        <Tab.Screen name="Prescribe" options={{ tabBarIcon: () => <Text style={{ fontSize: 18 }}>💊</Text> }}>
          {() => <PrescribeTab {...shared} />}
        </Tab.Screen>
        <Tab.Screen name="Queue" options={{ tabBarIcon: () => <Text style={{ fontSize: 18 }}>🏥</Text>, tabBarBadge: (pending.length + delayed.length) || undefined }}>
          {() => <QueueTab {...shared} bookApptFn={bookApptFn} />}
        </Tab.Screen>
      </Tab.Navigator>
    </SafeAreaView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <DStack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#0C4A6E' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }}>
        <DStack.Screen name="DoctorHome" options={{ headerShown: false }}>
          {() => HomeScreen()}
        </DStack.Screen>
        <DStack.Screen name="PatientRecords" options={{ title: 'Patient Records' }}>
          {() => <PatientRecordsScreen {...shared} />}
        </DStack.Screen>
        <DStack.Screen name="PatientDetail" options={{ title: 'Patient' }}>
          {() => <PatientDetailScreen {...shared} />}
        </DStack.Screen>
      </DStack.Navigator>

      {/* Emergency break-glass modal */}
      <Modal visible={emOpen} animationType="slide" transparent onRequestClose={() => setEmOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.danger }]}>🚨 Emergency Access</Text>
              <TouchableOpacity onPress={() => setEmOpen(false)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
            </View>
            <Text style={s.emWarn}>Break-glass access grants a patient's full records for 2 hours. It is logged and the patient can revoke it at any time.</Text>
            {emResult && (
              <View style={[s.emResultBox, { backgroundColor: emResult.ok ? colors.accentTint : colors.dangerTint, borderColor: emResult.ok ? colors.accent : colors.danger }]}>
                <Text style={{ color: emResult.ok ? colors.accent : colors.danger, fontSize: 13, fontWeight: '600' }}>{emResult.msg}</Text>
              </View>
            )}
            <Text style={s.label}>Patient ID</Text>
            <TextInput style={s.input} value={emCode} onChangeText={setEmCode} placeholder="e.g. BQOOCBYNKX" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
            <Text style={s.label}>Purpose of access</Text>
            <TextInput style={[s.input, { height: 80, textAlignVertical: 'top' }]} value={emPurpose} onChangeText={setEmPurpose} placeholder="e.g. Unconscious patient in ER" placeholderTextColor={colors.textMuted} multiline />
            <TouchableOpacity style={[s.emConfirmBtn, emBusy && { opacity: 0.6 }]} onPress={grantEmergencyAccess} disabled={emBusy}>
              {emBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.emConfirmText}>🚨 Grant 2-hour emergency access</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {!!toast && <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>}
    </View>
  );
}

/* ── HOME DASHBOARD ────────────────────────────────────────── */
function HomeTab({ profile, pending, completed, delayed }) {
  const navigation = useNavigation();
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={s.sectionLabel}>Dashboard</Text>

      <View style={s.statRow}>
        <View style={[s.dashStat, { borderColor: colors.primary }]}>
          <Text style={[s.dashNum, { color: colors.primary }]}>{pending.length}</Text>
          <Text style={s.dashLabel}>Upcoming{'\n'}consultations</Text>
        </View>
        <View style={[s.dashStat, { borderColor: colors.accent }]}>
          <Text style={[s.dashNum, { color: colors.accent }]}>{completed.length}</Text>
          <Text style={s.dashLabel}>Completed{'\n'}consultations</Text>
        </View>
      </View>

      {delayed.length > 0 && (
        <View style={[s.card, { borderColor: colors.warning, backgroundColor: colors.warningTint }]}>
          <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 13 }}>⏳ {delayed.length} delayed appointment(s) — see Queue</Text>
        </View>
      )}

      <Text style={s.sectionLabel}>Quick actions</Text>
      <TouchableOpacity style={s.navCard} activeOpacity={0.8} onPress={() => navigation.navigate('PatientRecords')}>
        <Text style={{ fontSize: 24 }}>📋</Text>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.cardTitle}>View Patient Records</Text>
          <Text style={s.cardSub}>Search patients & open their records</Text>
        </View>
        <Text style={s.chevron}>›</Text>
      </TouchableOpacity>

      {/* Announcements */}
      <Text style={s.sectionLabel}>📢 Announcements</Text>
      {ANNOUNCEMENTS.map((a) => (
        <View key={a.id} style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 20 }}>{a.icon}</Text>
            <Text style={[s.cardTitle, { flex: 1, marginLeft: 10 }]}>{a.title}</Text>
            <Text style={s.listSub}>{a.date}</Text>
          </View>
          <Text style={[s.cardSub, { marginTop: 6 }]}>{a.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

/* ── PATIENT RECORDS (search + recent) ─────────────────────── */
function PatientRecordsScreen({ recent, addRecent }) {
  const navigation = useNavigation();
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [searching, setSearch]  = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setSearch(true); setSearched(true);
    try {
      const snap = await firestore().collection('patients')
        .orderBy('name').startAt(query.trim()).endAt(query.trim() + '').limit(20).get();
      setResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally { setSearch(false); }
  };

  const open = (p) => { addRecent(p); navigation.navigate('PatientDetail', { patient: p }); };

  const PatientRow = ({ p }) => {
    const [c1] = avatarColors(p.name);
    return (
      <TouchableOpacity style={s.navCard} activeOpacity={0.8} onPress={() => open(p)}>
        <View style={[s.avatar, { backgroundColor: c1, width: 44, height: 44, borderRadius: 22 }]}>
          <Text style={[s.avatarText, { fontSize: 15 }]}>{initials(p.name)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.patientName}>{p.name}</Text>
          <Text style={s.idText}>🆔 {p.id.slice(0, 10).toUpperCase()}</Text>
          <Text style={s.patientSub}>{p.phone || p.email || 'No contact'}</Text>
        </View>
        <Text style={s.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32, paddingTop: 12 }} keyboardShouldPersistTaps="handled">
      <View style={s.searchRow}>
        <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={query} onChangeText={setQuery} onSubmitEditing={search}
          placeholder="Search patient by name…" placeholderTextColor={colors.textMuted} returnKeyType="search" autoFocus />
        <TouchableOpacity style={s.searchBtn} onPress={search}>{searching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontSize: 16 }}>🔍</Text>}</TouchableOpacity>
      </View>

      {searched && (
        <>
          <Text style={s.sectionLabel}>Results</Text>
          {results.length === 0 && !searching
            ? <View style={s.emptyState}><Text style={s.emptyIcon}>🔍</Text><Text style={s.emptySub}>No patients found</Text></View>
            : results.map((p) => <PatientRow key={p.id} p={p} />)}
        </>
      )}

      <Text style={s.sectionLabel}>Recently searched</Text>
      {recent.length === 0
        ? <Text style={s.cardSub}>Patients you open will appear here</Text>
        : recent.map((p) => <PatientRow key={p.id} p={p} />)}
    </ScrollView>
  );
}

/* ── PATIENT DETAIL (doctor view) ──────────────────────────── */
function PatientDetailScreen({ providerId, requestAccess }) {
  const { patient } = useRoute().params || {};
  const [stats, setStats]   = useState(null);
  const [nextAppt, setNext] = useState(undefined);
  const [firstAppt, setFirst] = useState(undefined);
  const [purpose, setPurpose] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [selRecords, setSelRecords]   = useState([]);
  const toggleRecord = (r) => setSelRecords((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);

  useEffect(() => {
    (async () => {
      const [apptSnap, rxSnap] = await Promise.all([
        firestore().collection('appointments').where('patientId', '==', patient.id).where('providerId', '==', providerId).get(),
        firestore().collection('prescriptions').where('patientId', '==', patient.id).where('providerId', '==', providerId).get(),
      ]);
      const appts = apptSnap.docs.map((d) => d.data());
      const dates = appts.map((a) => a.scheduledAt?.toDate?.()).filter(Boolean).sort((a, b) => a - b);
      setFirst(dates[0] || null);
      const now = Date.now();
      const upcoming = dates.filter((d) => d.getTime() >= now);
      setNext(upcoming[0] || null);
      setStats({ visits: apptSnap.size, prescriptions: rxSnap.size });
    })().catch(() => setStats({ visits: 0, prescriptions: 0 }));
  }, [patient?.id]);

  const period = firstAppt
    ? `Consulting since ${firstAppt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`
    : firstAppt === null ? 'No prior consultations' : 'Loading…';

  const submitRequest = async () => {
    setRequesting(true);
    const ok = await requestAccess(patient.id, purpose, selRecords);
    setRequesting(false);
    if (ok) { setPurpose(''); setSelRecords([]); setRecordsOpen(false); }
  };

  const [c1] = avatarColors(patient.name);

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 40, paddingTop: 12 }} keyboardShouldPersistTaps="handled">
      <View style={[s.card, { flexDirection: 'row', alignItems: 'center' }]}>
        <View style={[s.avatar, { backgroundColor: c1, width: 56, height: 56, borderRadius: 28 }]}>
          <Text style={[s.avatarText, { fontSize: 20 }]}>{initials(patient.name)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={s.patientName}>{patient.name}</Text>
          <Text style={s.idText}>🆔 {patient.id.slice(0, 10).toUpperCase()}</Text>
          {!!patient.dob && <Text style={s.patientSub}>DOB: {patient.dob}</Text>}
        </View>
      </View>

      {patient.allergies?.length > 0 && (
        <View style={[s.alertBox, { marginBottom: 10 }]}><Text style={s.alertText}>⚠ Allergies: {patient.allergies.join(', ')}</Text></View>
      )}

      <View style={s.statRow}>
        <View style={s.statBox}><Text style={s.statNum}>{stats?.visits ?? '—'}</Text><Text style={s.statLabel}>Visits</Text></View>
        <View style={s.statBox}><Text style={s.statNum}>{stats?.prescriptions ?? '—'}</Text><Text style={s.statLabel}>Prescriptions</Text></View>
      </View>

      <View style={s.card}>
        <Text style={s.label}>Consulting period</Text>
        <Text style={s.cardTitle}>🗓️ {period}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.label}>Next appointment</Text>
        <Text style={s.cardTitle}>
          📅 {nextAppt === undefined ? 'Loading…' : nextAppt === null ? 'None scheduled' : nextAppt.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>

      {/* Request document access */}
      <Text style={s.sectionLabel}>Request document access</Text>
      <View style={s.card}>
        <Text style={s.cardSub}>The patient will receive this request and can approve or deny it.</Text>

        {/* Step 1: which records (dropdown) */}
        <Text style={[s.label, { marginTop: 12 }]}>Records requested</Text>
        <TouchableOpacity style={s.select} onPress={() => setRecordsOpen(!recordsOpen)}>
          <Text style={[s.selectText, !selRecords.length && { color: colors.textMuted }]} numberOfLines={1}>
            {selRecords.length ? selRecords.join(', ') : 'Select records…'}
          </Text>
          <Text style={s.selectArrow}>{recordsOpen ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {recordsOpen && (
          <View style={s.dropdown}>
            {RECORD_TYPES.map((r) => {
              const on = selRecords.includes(r);
              return (
                <TouchableOpacity key={r} style={s.dropItem} onPress={() => toggleRecord(r)}>
                  <Text style={[s.checkbox, on && { color: colors.primary }]}>{on ? '☑' : '☐'}</Text>
                  <Text style={[s.dropItemText, on && { color: colors.primary, fontWeight: '700' }]}>{r}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Step 2: purpose */}
        <Text style={[s.label, { marginTop: 12 }]}>Purpose</Text>
        <TextInput style={[s.input, { marginBottom: 10, height: 70, textAlignVertical: 'top' }]}
          value={purpose} onChangeText={setPurpose} multiline
          placeholder="e.g. Review past prescriptions for follow-up"
          placeholderTextColor={colors.textMuted} />

        {/* Step 3: send */}
        <TouchableOpacity style={[s.primaryBtn, requesting && { opacity: 0.6 }]} onPress={submitRequest} disabled={requesting}>
          {requesting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>📨 Send access request</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

/* ── PRESCRIBE TAB ─────────────────────────────────────────── */
function PrescribeTab({ providerId, showToast }) {
  const [patQuery, setPatQuery]       = useState('');
  const [patResults, setPatResults]   = useState([]);
  const [selectedPat, setSelectedPat] = useState(null);
  const [purpose, setPurpose]         = useState('');
  const [items, setItems]             = useState([{ drugName: '', dosage: '', frequency: '', durationDays: '', notes: '' }]);
  const [submitting, setSubmitting]   = useState(false);

  const searchPat = async () => {
    if (!patQuery.trim()) return;
    const snap = await firestore().collection('patients')
      .orderBy('name').startAt(patQuery.trim()).endAt(patQuery.trim() + '').limit(10).get();
    setPatResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  const addItem = () => setItems((prev) => [...prev, { drugName: '', dosage: '', frequency: '', durationDays: '', notes: '' }]);
  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i, field, val) => setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));

  const submit = async () => {
    if (!selectedPat) { showToast('Select a patient first'); return; }
    if (!purpose.trim()) { showToast('Enter the purpose of this prescription'); return; }
    const valid = items.filter((it) => it.drugName.trim() && it.dosage.trim());
    if (!valid.length) { showToast('Add at least one drug with name and dosage'); return; }
    setSubmitting(true);
    try {
      await Promise.all(valid.map(async (item) => {
        const encrypted = await encryptPrescription(item, selectedPat.id, providerId);
        await firestore().collection('prescriptions').add({
          ...encrypted,
          patientId: selectedPat.id,
          providerId,
          purpose: purpose.trim(),
          createdAt: firestore.FieldValue.serverTimestamp(),
          safetyCheck: { status: 'pending' },
        });
      }));
      showToast(`✓ ${valid.length} prescription(s) submitted`);
      setItems([{ drugName: '', dosage: '', frequency: '', durationDays: '', notes: '' }]);
      setPurpose(''); setSelectedPat(null); setPatQuery(''); setPatResults([]);
    } catch (e) {
      showToast('Error: ' + e.message);
    } finally { setSubmitting(false); }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Text style={s.sectionLabel}>Patient</Text>
      {selectedPat ? (
        <View style={s.selectedPat}>
          <View style={[s.avatarSm, { backgroundColor: avatarColors(selectedPat.name)[0] }]}>
            <Text style={s.avatarSmText}>{initials(selectedPat.name)}</Text>
          </View>
          <Text style={s.patientName}>{selectedPat.name}</Text>
          <TouchableOpacity style={s.clearBtn} onPress={() => { setSelectedPat(null); setPatQuery(''); setPatResults([]); }}>
            <Text style={s.clearBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={s.searchRow}>
            <TextInput style={[s.input, { flex: 1 }]} value={patQuery} onChangeText={setPatQuery} onSubmitEditing={searchPat} placeholder="Search patient…" placeholderTextColor={colors.textMuted} returnKeyType="search" />
            <TouchableOpacity style={s.searchBtn} onPress={searchPat}><Text style={{ color: '#fff', fontSize: 16 }}>🔍</Text></TouchableOpacity>
          </View>
          {patResults.map((p) => (
            <TouchableOpacity key={p.id} style={s.patPickRow} onPress={() => { setSelectedPat(p); setPatResults([]); }}>
              <View style={[s.avatarSm, { backgroundColor: avatarColors(p.name)[0] }]}><Text style={s.avatarSmText}>{initials(p.name)}</Text></View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.patientName}>{p.name}</Text>
                <Text style={s.patientSub}>{p.phone || p.email}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}

      <Text style={[s.sectionLabel, { marginTop: 18 }]}>Purpose / diagnosis</Text>
      <TextInput style={[s.input, { height: 70, textAlignVertical: 'top' }]} value={purpose} onChangeText={setPurpose} multiline
        placeholder="e.g. Hypertension management; viral fever" placeholderTextColor={colors.textMuted} />

      <Text style={[s.sectionLabel, { marginTop: 8 }]}>Prescription items</Text>
      {items.map((item, i) => (
        <View key={i} style={[s.rxItem, { borderColor: colors.border }]}>
          <View style={base.spaceBetween}>
            <Text style={s.rxItemTitle}>Drug #{i + 1}</Text>
            {items.length > 1 && (
              <TouchableOpacity onPress={() => removeItem(i)}><Text style={{ color: colors.danger, fontWeight: '700' }}>✕ Remove</Text></TouchableOpacity>
            )}
          </View>
          {[
            ['drugName', 'Drug name', 'Amoxicillin'],
            ['dosage',   'Dosage',    '500 mg'],
            ['frequency','Frequency', 'Twice daily'],
            ['durationDays','Duration (days)','7'],
            ['notes',    'Notes (optional)','Before meals'],
          ].map(([field, label, ph]) => (
            <React.Fragment key={field}>
              <Text style={s.label}>{label}</Text>
              <TextInput style={s.input} value={item[field]} onChangeText={(v) => updateItem(i, field, v)}
                placeholder={ph} placeholderTextColor={colors.textMuted}
                keyboardType={field === 'durationDays' ? 'number-pad' : 'default'} />
            </React.Fragment>
          ))}
        </View>
      ))}

      <TouchableOpacity style={s.addItemBtn} onPress={addItem}>
        <Text style={s.addItemBtnText}>+ Add item</Text>
      </TouchableOpacity>

      <View style={[s.encryptNote, { marginTop: 10 }]}>
        <Text style={s.encryptNoteText}>🔒 Prescription is E2E encrypted for the patient before upload.</Text>
      </View>

      <TouchableOpacity style={[s.primaryBtn, { marginTop: 14 }]} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Submit prescription →</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

/* ── QUEUE TAB (pending + delayed) ─────────────────────────── */
function QueueTab({ providerId, pending, delayed, showToast, bookApptFn, completeAppt, delayAppt, deleteAppt }) {
  const [showPicker, setShowPicker] = useState(false);
  const [patQuery, setPatQuery]     = useState('');
  const [patResults, setPatResults] = useState([]);
  const [selPat, setSelPat]         = useState(null);
  const [selDate, setSelDate]       = useState(null);
  const [selSlot, setSelSlot]       = useState(null);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [booking, setBooking]       = useState(false);

  const searchPat = async () => {
    const snap = await firestore().collection('patients')
      .orderBy('name').startAt(patQuery).endAt(patQuery + '').limit(10).get();
    setPatResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  const loadSlots = async (date) => {
    const start = new Date(date); start.setHours(0,0,0,0);
    const end   = new Date(date); end.setHours(23,59,59,999);
    const snap  = await firestore().collection('appointments')
      .where('providerId','==',providerId).where('scheduledAt','>=',start).where('scheduledAt','<=',end).get();
    setBookedSlots(snap.docs.map((d) => {
      const ts = d.data().scheduledAt?.toDate?.() || new Date(d.data().scheduledAt);
      return `${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}`;
    }));
  };

  const handleDateSel = (d) => { setSelDate(d); setSelSlot(null); loadSlots(d); };

  const bookSlot = async () => {
    if (!selPat || !selDate || !selSlot) { showToast('Select patient, date and time'); return; }
    const [h, m] = selSlot.split(':').map(Number);
    const dt = new Date(selDate); dt.setHours(h, m, 0, 0);
    setBooking(true);
    try {
      const res = await bookApptFn({ patientId: selPat.id, providerId, scheduledAt: dt.toISOString() });
      showToast(`✓ Booked — Token #${res.data.tokenNumber}`);
      setShowPicker(false); setSelPat(null); setSelDate(null); setSelSlot(null); setPatResults([]);
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setBooking(false); }
  };

  const today = new Date(); today.setHours(0,0,0,0);
  const calDays = Array.from({ length: 14 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i); return d; });
  const slots = [];
  for (let h = 10; h < 18; h++) { slots.push(`${h}:00`); slots.push(`${h}:30`); }
  const formatSlot = (t) => { const [h, mm] = t.split(':').map(Number); return `${h % 12 || 12}:${String(mm).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`; };

  const ApptCard = ({ appt, isDelayed }) => (
    <View style={[s.card, isDelayed && { borderColor: colors.warning }]}>
      <View style={base.spaceBetween}>
        <View>
          <Text style={s.tokenLabel}>Token</Text>
          <Text style={s.tokenNum}>#{appt.tokenNumber}</Text>
          <Text style={s.patientSub}>{appt.scheduledAt?.toDate?.().toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
        {isDelayed && <View style={[s.badge, { backgroundColor: colors.warningTint }]}><Text style={[s.badgeText, { color: '#92400E' }]}>delayed</Text></View>}
      </View>
      <View style={s.actionRow}>
        <TouchableOpacity style={[s.actBtn, { backgroundColor: colors.accentTint }]} onPress={() => completeAppt(appt.id)}>
          <Text style={[s.actText, { color: colors.accent }]}>✓ Completed</Text>
        </TouchableOpacity>
        {!isDelayed && (
          <TouchableOpacity style={[s.actBtn, { backgroundColor: colors.warningTint }]} onPress={() => delayAppt(appt.id)}>
            <Text style={[s.actText, { color: '#B45309' }]}>⏳ Delay</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[s.actBtn, { backgroundColor: colors.dangerTint }]}
          onPress={() => Alert.alert('Delete appointment', 'Remove this appointment?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteAppt(appt.id) }])}>
          <Text style={[s.actText, { color: colors.danger }]}>🗑 Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={base.spaceBetween}>
        <Text style={s.sectionLabel}>Queue</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowPicker(!showPicker)}>
          <Text style={s.addBtnText}>+ Add appointment</Text>
        </TouchableOpacity>
      </View>

      {showPicker && (
        <View style={[s.card, { borderColor: colors.primary, borderWidth: 2 }]}>
          <Text style={[s.cardTitle, { marginBottom: 12 }]}>Add appointment</Text>
          {selPat ? (
            <View style={s.selectedPat}>
              <View style={[s.avatarSm, { backgroundColor: avatarColors(selPat.name)[0] }]}><Text style={s.avatarSmText}>{initials(selPat.name)}</Text></View>
              <Text style={s.patientName}>{selPat.name}</Text>
              <TouchableOpacity style={s.clearBtn} onPress={() => { setSelPat(null); setPatResults([]); }}><Text style={s.clearBtnText}>✕</Text></TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={s.label}>Patient</Text>
              <View style={s.searchRow}>
                <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={patQuery} onChangeText={setPatQuery} onSubmitEditing={searchPat} placeholder="Search patient…" placeholderTextColor={colors.textMuted} />
                <TouchableOpacity style={s.searchBtn} onPress={searchPat}><Text style={{ color: '#fff' }}>🔍</Text></TouchableOpacity>
              </View>
              {patResults.map((p) => (
                <TouchableOpacity key={p.id} style={s.patPickRow} onPress={() => { setSelPat(p); setPatResults([]); }}>
                  <Text style={s.listTitle}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
          <Text style={[s.label, { marginTop: 14 }]}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {calDays.map((d, i) => {
              const isSel = selDate?.toDateString() === d.toDateString();
              return (
                <TouchableOpacity key={i} style={[s.dayChip, isSel && s.dayChipActive]} onPress={() => handleDateSel(d)}>
                  <Text style={[s.dayChipDay, isSel && { color: '#fff' }]}>{['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()]}</Text>
                  <Text style={[s.dayChipDate, isSel && { color: '#fff', fontWeight: '700' }]}>{d.getDate()}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {selDate && (
            <>
              <Text style={s.label}>Time</Text>
              <View style={s.slotGrid}>
                {slots.map((sl) => {
                  const booked = bookedSlots.includes(sl);
                  const isSel  = selSlot === sl;
                  return (
                    <TouchableOpacity key={sl} disabled={booked} style={[s.slot, isSel && s.slotActive, booked && s.slotBooked]} onPress={() => setSelSlot(sl)}>
                      <Text style={[s.slotText, isSel && { color: '#fff' }, booked && { color: colors.border, textDecorationLine: 'line-through' }]}>{formatSlot(sl)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
          <TouchableOpacity style={[s.primaryBtn, { marginTop: 14 }]} onPress={bookSlot} disabled={booking}>
            {booking ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Confirm booking →</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Pending section */}
      <Text style={s.sectionLabel}>⏰ Pending ({pending.length})</Text>
      {pending.length === 0
        ? <View style={s.emptyState}><Text style={s.emptyIcon}>🏥</Text><Text style={s.emptySub}>No pending appointments</Text></View>
        : pending.map((a) => <ApptCard key={a.id} appt={a} isDelayed={false} />)}

      {/* Delayed section */}
      <Text style={s.sectionLabel}>⏳ Delayed ({delayed.length})</Text>
      {delayed.length === 0
        ? <Text style={s.cardSub}>No delayed appointments</Text>
        : delayed.map((a) => <ApptCard key={a.id} appt={a} isDelayed />)}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#0C4A6E' },
  topbarTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  topbarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  topbarSub: { fontSize: 11, color: 'rgba(255,255,255,.6)' },
  rolePill: { backgroundColor: 'rgba(255,255,255,.15)', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  rolePillText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,.9)', letterSpacing: 0.5 },
  signOutBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,.2)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  signOutText: { fontSize: 12, color: 'rgba(255,255,255,.7)', fontWeight: '600' },
  emBtn: { backgroundColor: colors.danger, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  emBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingTop: 4 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalClose: { fontSize: 20, color: colors.textMuted, paddingHorizontal: 8 },
  emWarn: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginBottom: 14, backgroundColor: colors.dangerTint, padding: 10, borderRadius: radius.sm },
  emResultBox: { borderWidth: 1, borderRadius: radius.sm, padding: 12, marginBottom: 12 },
  emConfirmBtn: { backgroundColor: colors.danger, borderRadius: radius.sm, paddingVertical: 14, alignItems: 'center', marginTop: 8, ...shadow.sm },
  emConfirmText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  tabBar: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, height: 60, paddingBottom: 8 },
  tabLabel: { fontSize: 10, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  cardTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  cardSub: { fontSize: 12, color: colors.textMuted },
  navCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  chevron: { fontSize: 22, color: colors.textMuted, fontWeight: '300' },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  searchBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, width: 44, alignItems: 'center', justifyContent: 'center' },
  input: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: colors.text, marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 2 },
  select: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectText: { fontSize: 14, color: colors.text, flex: 1 },
  selectArrow: { fontSize: 12, color: colors.textMuted, marginLeft: 8 },
  dropdown: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginTop: 4, ...shadow.md, overflow: 'hidden' },
  dropItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropItemText: { fontSize: 14, color: colors.text },
  checkbox: { fontSize: 16, color: colors.textMuted, marginRight: 10 },
  listTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  listSub: { fontSize: 11, color: colors.textMuted },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  avatarSm: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarSmText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  patientName: { fontSize: 15, fontWeight: '700', color: colors.text },
  patientSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  idText: { fontSize: 11, color: colors.primary, fontWeight: '700', marginTop: 2, letterSpacing: 0.3 },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 100 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  statRow: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.sm, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statNum: { fontSize: 24, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', marginTop: 2 },
  dashStat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: 18, alignItems: 'center', borderWidth: 1.5, ...shadow.sm },
  dashNum: { fontSize: 40, fontWeight: '800' },
  dashLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', textAlign: 'center', marginTop: 4 },
  alertBox: { backgroundColor: colors.warningTint, borderRadius: radius.sm, padding: 10 },
  alertText: { fontSize: 12, color: '#92400E', fontWeight: '600' },
  rxItem: { backgroundColor: colors.surface, borderWidth: 1.5, borderRadius: radius.md, padding: 16, marginBottom: 10 },
  rxItemTitle: { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  addItemBtn: { borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.sm, paddingVertical: 13, alignItems: 'center', marginBottom: 4 },
  addItemBtnText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  encryptNote: { backgroundColor: colors.primaryTint, borderRadius: radius.sm, padding: 10 },
  encryptNoteText: { fontSize: 12, color: '#155E75', fontWeight: '500' },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: 13, alignItems: 'center', ...shadow.sm },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  selectedPat: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primaryTint, borderRadius: radius.sm, padding: 10, marginBottom: 10 },
  clearBtn: { marginLeft: 'auto', backgroundColor: colors.danger, borderRadius: 100, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  clearBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  patPickRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptySub: { fontSize: 13, color: colors.textMuted },
  tokenLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  tokenNum: { fontSize: 32, fontWeight: '800', color: colors.primary },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm },
  actText: { fontSize: 12, fontWeight: '700' },
  addBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6, marginTop: 14 },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  dayChip: { width: 44, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sm, paddingVertical: 8, marginRight: 6, borderWidth: 1, borderColor: colors.border },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipDay: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  dayChipDate: { fontSize: 16, color: colors.text, fontWeight: '600', marginTop: 2 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  slot: { width: '22%', alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  slotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotBooked: { backgroundColor: colors.bg },
  slotText: { fontSize: 11, color: colors.text, fontWeight: '500' },
  toast: { position: 'absolute', bottom: 80, alignSelf: 'center', backgroundColor: colors.text, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 100, ...shadow.lg },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '500' },
});
