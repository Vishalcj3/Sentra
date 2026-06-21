import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, FlatList, TextInput, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import functions from '@react-native-firebase/functions';
import { colors, radius, shadow, avatarColors, initials, base } from '../styles/theme';
import { decryptPrescription } from '../crypto';

const Tab = createBottomTabNavigator();
const PStack = createNativeStackNavigator();
const bookApptFn = functions().httpsCallable('bookAppointment');

// ── Shared context via props drilling (small app, no context needed) ──────────

export default function PatientApp({ user, profile, onProfileUpdate, onSignOut }) {
  const patientId = user.uid;
  const [prescriptions, setPrescriptions]   = useState([]);
  const [consents, setConsents]             = useState([]);
  const [appointments, setAppointments]     = useState([]);
  const [notifications, setNotifications]   = useState([]);
  const [scans, setScans]                   = useState([]);
  const [toast, setToast]                   = useState(null);
  const [activeConsent, setActiveConsent]   = useState(null);
  const [showNotifs, setShowNotifs]         = useState(false);
  const [providerMap, setProviderMap]       = useState({});

  useEffect(() => {
    const onErr = (label) => (e) => console.warn(`[${label}] listener error:`, e?.message || e);

    const unsubs = [
      firestore().collection('prescriptions').where('patientId','==',patientId).orderBy('createdAt','desc')
        .onSnapshot(async (snap) => {
          if (!snap) return;
          const list = await Promise.all(snap.docs.map(async (d) => {
            const data = d.data();
            return decryptPrescription({ id: d.id, ...data }, data.encryptedBy || data.providerId);
          }));
          setPrescriptions(list);
        }, onErr('prescriptions')),
      firestore().collection('consents').where('patientId','==',patientId)
        .onSnapshot((snap) => { if (!snap) return; setConsents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); }, onErr('consents')),
      firestore().collection('appointments').where('patientId','==',patientId).orderBy('scheduledAt','desc')
        .onSnapshot((snap) => { if (!snap) return; setAppointments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); }, onErr('appointments')),
      firestore().collection('notifications').where('patientId','==',patientId).orderBy('createdAt','desc')
        .onSnapshot((snap) => {
          if (!snap) return;
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setNotifications(list);
          if (list[0] && !list[0].read) showToast(list[0].message);
        }, onErr('notifications')),
      firestore().collection('labScans').where('patientId','==',patientId).orderBy('createdAt','desc')
        .onSnapshot((snap) => { if (!snap) return; setScans(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); }, onErr('labScans')),
    ];
    return () => unsubs.forEach((u) => u());
  }, [patientId]);

  // Resolve provider names/hospitals for any consents missing denormalized info
  useEffect(() => {
    const ids = [...new Set(consents.map((c) => c.providerId).filter(Boolean))];
    const missing = ids.filter((id) => !providerMap[id]);
    if (!missing.length) return;
    Promise.all(missing.map((id) => firestore().collection('providers').doc(id).get()))
      .then((snaps) => {
        const add = {};
        snaps.forEach((sn) => { if (sn.exists) add[sn.id] = sn.data(); });
        if (Object.keys(add).length) setProviderMap((prev) => ({ ...prev, ...add }));
      })
      .catch(() => {});
  }, [consents]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 5000); };

  const bookAppointment = async (providerId, when) => {
    try {
      const res = await bookApptFn({ patientId, providerId, scheduledAt: when });
      showToast(`Booked ✓  Token #${res.data.tokenNumber}`);
    } catch (e) {
      showToast('Booking failed: ' + e.message);
    }
  };

  const approveConsent = async (c) => {
    try {
      await firestore().collection('consents').doc(c.id).update({ approved: true, approvedAt: firestore.FieldValue.serverTimestamp() });
      showToast('✓ Access granted');
    } catch (e) { showToast('Error: ' + e.message); }
  };
  const denyConsent = async (c) => {
    try {
      await firestore().collection('consents').doc(c.id).update({ revokedAt: firestore.FieldValue.serverTimestamp() });
      showToast('Request denied');
    } catch (e) { showToast('Error: ' + e.message); }
  };
  const revokeConsent = async (c) => {
    try {
      await firestore().collection('consents').doc(c.id).update({ approved: false, revokedAt: firestore.FieldValue.serverTimestamp() });
      showToast('🔒 Access revoked');
    } catch (e) { showToast('Error: ' + e.message); }
  };

  const addAllergy = async (text) => {
    const v = text.trim();
    if (!v) return;
    const next = [...(profile?.allergies || []), v];
    try {
      await firestore().collection('patients').doc(patientId).update({ allergies: next });
      onProfileUpdate({ allergies: next });
      showToast(`Added allergy: ${v}`);
    } catch (e) { showToast('Error: ' + e.message); }
  };
  const removeAllergy = async (text) => {
    const next = (profile?.allergies || []).filter((a) => a !== text);
    try {
      await firestore().collection('patients').doc(patientId).update({ allergies: next });
      onProfileUpdate({ allergies: next });
    } catch (e) { showToast('Error: ' + e.message); }
  };

  const now = Date.now();
  const isActive = (c) => c.approved && !c.revokedAt && (!c.expiresAt || (c.expiresAt.toDate ? c.expiresAt.toDate().getTime() : 0) > now);
  const pendingRequests = consents.filter((c) => !c.approved && !c.revokedAt);
  const activeAccess = consents.filter(isActive);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const sharedProps = { user, profile, patientId, prescriptions, consents, appointments, notifications, scans, providerMap, pendingRequests, activeAccess, onProfileUpdate, onSignOut, bookAppointment, approveConsent, denyConsent, revokeConsent, addAllergy, removeAllergy, showToast };

  const HomeScreen = () => (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Gradient topbar */}
      <View style={s.topbar}>
        <View>
          <Text style={s.topbarTitle}>{profile?.name || 'Patient'}</Text>
          <View style={s.topbarRow}>
            <View style={s.rolePill}><Text style={s.rolePillText}>🧑‍⚕️ PATIENT</Text></View>
            {!!profile?.dob && <Text style={s.topbarSub}>DOB: {profile.dob}</Text>}
          </View>
          <Text style={s.idText}>🆔 {patientId.slice(0, 10).toUpperCase()}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Notification bell */}
          <TouchableOpacity style={s.bellBtn} onPress={() => setShowNotifs(true)}>
            <Text style={{ fontSize: 20 }}>🔔</Text>
            {unreadCount > 0 && (
              <View style={s.bellBadge}><Text style={s.bellBadgeText}>{unreadCount}</Text></View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={s.signOutBtn} onPress={onSignOut}>
            <Text style={s.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: s.tabBar,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: s.tabLabel,
          tabBarIconStyle: { marginBottom: -4 },
        })}
      >
        <Tab.Screen name="Vault" options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>🗄️</Text> }}>
          {() => <VaultTab {...sharedProps} />}
        </Tab.Screen>
        <Tab.Screen name="Appointments" options={{ tabBarIcon: () => <Text style={{ fontSize: 18 }}>📅</Text> }}>
          {() => <AppointmentsTab {...sharedProps} />}
        </Tab.Screen>
        <Tab.Screen
          name="Requests"
          options={{
            tabBarIcon: () => <Text style={{ fontSize: 18 }}>📨</Text>,
            tabBarBadge: pendingRequests.length > 0 ? pendingRequests.length : undefined,
          }}
        >
          {() => <RequestsTab {...sharedProps} />}
        </Tab.Screen>
        <Tab.Screen name="Security" options={{ tabBarIcon: () => <Text style={{ fontSize: 18 }}>🔐</Text> }}>
          {() => <SecurityTab {...sharedProps} />}
        </Tab.Screen>
      </Tab.Navigator>
    </SafeAreaView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PStack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#0C4A6E' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <PStack.Screen name="PatientHome" options={{ headerShown: false }}>
          {() => HomeScreen()}
        </PStack.Screen>
        <PStack.Screen name="Medications" options={{ title: 'Current Medications' }}>
          {() => <MedicationsScreen {...sharedProps} />}
        </PStack.Screen>
        <PStack.Screen name="Allergies" options={{ title: 'Allergies' }}>
          {() => <AllergiesScreen {...sharedProps} />}
        </PStack.Screen>
        <PStack.Screen name="AccessControls" options={{ title: 'Live Access Controls' }}>
          {() => <AccessControlsScreen {...sharedProps} />}
        </PStack.Screen>
      </PStack.Navigator>

      {/* Notifications modal (bell) */}
      <Modal visible={showNotifs} animationType="slide" transparent onRequestClose={() => setShowNotifs(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>🔔 Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotifs(false)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 460 }}>
              {notifications.length === 0
                ? <View style={s.emptyState}><Text style={s.emptyIcon}>🔔</Text><Text style={s.emptySub}>No reminders yet</Text></View>
                : notifications.map((n) => (
                    <TouchableOpacity key={n.id} style={[s.notifRow, !n.read && { backgroundColor: colors.primaryTint }]}
                      onPress={() => !n.read && firestore().collection('notifications').doc(n.id).update({ read: true })}>
                      <Text style={{ fontSize: 20 }}>{n.type === 'safety_alert' ? '⚠️' : n.type === 'token_reminder' ? '🏥' : '💊'}</Text>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={s.listTitle}>{n.message}</Text>
                        <Text style={s.listSub}>{n.createdAt?.toDate?.().toLocaleString() || ''}</Text>
                      </View>
                      {!n.read && <View style={s.unreadDot} />}
                    </TouchableOpacity>
                  ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {!!toast && (
        <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>
      )}
    </View>
  );
}

/* ── VAULT TAB ─────────────────────────────────────────────── */
function VaultTab({ profile, patientId, prescriptions, scans = [] }) {
  const navigation = useNavigation();
  const allergies = profile?.allergies || [];
  const meds = profile?.currentMeds || [];

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={[s.card, { backgroundColor: colors.indigoTint, borderColor: colors.indigo + '40' }]}>
        <Text style={[s.cardSub, { color: colors.indigo, fontWeight: '700', marginBottom: 2 }]}>YOUR PATIENT ID</Text>
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.indigo, letterSpacing: 1 }}>{patientId.slice(0, 10).toUpperCase()}</Text>
        <Text style={[s.cardSub, { color: colors.indigo + 'CC' }]}>Share this ID with your doctor or lab to link records.</Text>
      </View>

      {/* Allergies — navigate to detail page */}
      <TouchableOpacity style={s.navCard} activeOpacity={0.8} onPress={() => navigation.navigate('Allergies')}>
        <Text style={{ fontSize: 22 }}>🧬</Text>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.cardTitle}>Allergies</Text>
          <Text style={s.cardSub}>{allergies.length ? allergies.join(', ') : 'None recorded — tap to add'}</Text>
        </View>
        <Text style={s.chevron}>›</Text>
      </TouchableOpacity>

      {/* Current medications — navigate to detail page */}
      <TouchableOpacity style={s.navCard} activeOpacity={0.8} onPress={() => navigation.navigate('Medications')}>
        <Text style={{ fontSize: 22 }}>💊</Text>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.cardTitle}>Current medications</Text>
          <Text style={s.cardSub}>{meds.length ? `${meds.length} active — tap for schedule` : 'None recorded'}</Text>
        </View>
        <Text style={s.chevron}>›</Text>
      </TouchableOpacity>

      <Text style={s.sectionLabel}>Prescription history</Text>
      {prescriptions.length === 0
        ? <View style={s.emptyState}><Text style={s.emptyIcon}>💊</Text><Text style={s.emptySub}>No prescriptions yet</Text></View>
        : prescriptions.map((p) => <PrescriptionCard key={p.id} p={p} />)}

      <Text style={s.sectionLabel}>🩻 Lab scans & results</Text>
      {scans.length === 0
        ? <View style={s.emptyState}><Text style={s.emptyIcon}>🩻</Text><Text style={s.emptySub}>No scans on record</Text></View>
        : scans.map((sc) => {
            const c = sc.status === 'abnormal' ? colors.danger : sc.status === 'pending' ? colors.warning : colors.accent;
            return (
              <View key={sc.id} style={s.card}>
                <View style={base.spaceBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{sc.scanType} · {sc.bodyPart}</Text>
                    <Text style={s.cardSub}>{sc.orgName || sc.labTechName}</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: c + '22' }]}><Text style={[s.badgeText, { color: c }]}>{sc.status}</Text></View>
                </View>
                {!!sc.findings && <View style={s.reasoningBlock}><Text style={s.reasoningText}>{sc.findings}</Text></View>}
              </View>
            );
          })}
    </ScrollView>
  );
}

/* ── MEDICATION DETAIL ─────────────────────────────────────── */
function MedDetail({ m }) {
  // Support legacy string meds and structured objects
  if (typeof m === 'string') {
    return <View style={s.medCard}><Text style={s.medName}>{m}</Text></View>;
  }
  const slots = [
    ['🌅', 'Morning', m.morning],
    ['☀️', 'Afternoon', m.afternoon],
    ['🌙', 'Night', m.night],
  ];
  return (
    <View style={s.medCard}>
      <View style={base.spaceBetween}>
        <Text style={s.medName}>{m.name}{m.dosage ? ` · ${m.dosage}` : ''}</Text>
        {!!m.quantity && <Text style={s.medQty}>{m.quantity}</Text>}
      </View>
      <View style={s.timingRow}>
        {slots.map(([icon, label, on]) => (
          <View key={label} style={[s.timingChip, on ? s.timingOn : s.timingOff]}>
            <Text style={[s.timingText, on ? { color: '#fff' } : { color: colors.textMuted }]}>{icon} {label}</Text>
          </View>
        ))}
      </View>
      {!!m.purpose && <Text style={s.medPurpose}>📋 {m.purpose}</Text>}
    </View>
  );
}

/* ── MEDICATIONS DETAIL PAGE ───────────────────────────────── */
function MedicationsScreen({ profile }) {
  const meds = profile?.currentMeds || [];
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32, paddingTop: 12 }}>
      <Text style={[s.cardSub, { marginBottom: 12 }]}>Your active medications with dosing schedule.</Text>
      {meds.length === 0
        ? <View style={s.emptyState}><Text style={s.emptyIcon}>💊</Text><Text style={s.emptySub}>No medications recorded</Text></View>
        : meds.map((m, i) => <MedDetail key={i} m={m} />)}
    </ScrollView>
  );
}

/* ── ALLERGIES DETAIL PAGE ─────────────────────────────────── */
function AllergiesScreen({ profile, addAllergy, removeAllergy }) {
  const [newAllergy, setNewAllergy] = useState('');
  const allergies = profile?.allergies || [];
  const submit = () => { if (newAllergy.trim()) { addAllergy(newAllergy); setNewAllergy(''); } };
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32, paddingTop: 12 }} keyboardShouldPersistTaps="handled">
      <Text style={[s.cardSub, { marginBottom: 12 }]}>Allergies on your record. Add or remove at any time.</Text>

      <View style={s.card}>
        <Text style={s.sectionLabel}>Current allergies</Text>
        <View style={s.tagRow}>
          {allergies.length
            ? allergies.map((a) => (
                <View key={a} style={s.tagDanger}>
                  <Text style={s.tagDangerText}>{a}</Text>
                  <TouchableOpacity onPress={() => removeAllergy(a)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={s.tagRemove}> ✕</Text>
                  </TouchableOpacity>
                </View>
              ))
            : <Text style={s.cardSub}>None recorded yet</Text>}
        </View>
      </View>

      <Text style={s.sectionLabel}>Add new allergy</Text>
      <View style={s.searchRow}>
        <TextInput
          style={[s.input, { flex: 1 }]}
          value={newAllergy}
          onChangeText={setNewAllergy}
          onSubmitEditing={submit}
          placeholder="e.g. Ibuprofen, Peanuts…"
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
        />
        <TouchableOpacity style={s.addCircleBtn} onPress={submit}>
          <Text style={s.addCircleText}>＋</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

/* ── ACCESS CONTROLS DETAIL PAGE ───────────────────────────── */
function AccessControlsScreen({ activeAccess = [], providerMap, revokeConsent }) {
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32, paddingTop: 12 }}>
      <Text style={[s.cardSub, { marginBottom: 12 }]}>Providers who currently have access to your records. Revoke any at any time.</Text>
      {activeAccess.length === 0
        ? <View style={s.emptyState}><Text style={s.emptyIcon}>🔒</Text><Text style={s.emptySub}>No one currently has access</Text></View>
        : activeAccess.map((c) => {
            const d = provDisplay(c, providerMap);
            const exp = expiryLabel(c);
            return (
              <View key={c.id} style={[s.card, c.emergency && { borderColor: colors.danger, borderWidth: 1.5 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[s.avatar, { backgroundColor: avatarColors(d.name)[0], width: 44, height: 44, borderRadius: 22 }]}>
                    <Text style={[s.avatarText, { fontSize: 15 }]}>{initials(d.name)}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.cardTitle}>{d.name}</Text>
                      {c.emergency && <View style={s.emergencyTag}><Text style={s.emergencyTagText}>🚨 EMERGENCY</Text></View>}
                    </View>
                    <Text style={s.cardSub}>🏥 {d.org}</Text>
                    <Text style={s.listSub}>{purposeOf(c)}{exp ? ` · ${exp}` : ' · permanent'}</Text>
                  </View>
                </View>
                <TouchableOpacity style={s.revokeBtn} onPress={() => revokeConsent(c)}>
                  <Text style={s.revokeBtnText}>🔒 Revoke access</Text>
                </TouchableOpacity>
              </View>
            );
          })}
    </ScrollView>
  );
}

/* ── APPOINTMENTS TAB ──────────────────────────────────────── */
function AppointmentsTab({ patientId, appointments, bookAppointment }) {
  const [doctors, setDoctors]           = useState([]);
  const [loadingDrs, setLoadingDrs]     = useState(true);
  const [selectedDoc, setSelectedDoc]   = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookedSlots, setBookedSlots]   = useState([]);
  const [viewDate, setViewDate]         = useState(new Date());
  const [docVisits, setDocVisits]       = useState({});

  useEffect(() => {
    firestore().collection('providers').where('role','==','doctor').get()
      .then((snap) => setDoctors(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .finally(() => setLoadingDrs(false));
  }, []);

  const selectDoctor = async (doc) => {
    setSelectedDoc(selectedDoc?.id === doc.id ? null : doc);
    setSelectedDate(null); setSelectedSlot(null);
    const apptSnap = await firestore().collection('appointments')
      .where('patientId','==',patientId).where('providerId','==',doc.id).get();
    const rxSnap = await firestore().collection('prescriptions')
      .where('patientId','==',patientId).where('providerId','==',doc.id).get();
    setDocVisits((prev) => ({ ...prev, [doc.id]: { visits: apptSnap.size, rxCount: rxSnap.size } }));
  };

  const loadSlots = async (doc, date) => {
    const start = new Date(date); start.setHours(0,0,0,0);
    const end   = new Date(date); end.setHours(23,59,59,999);
    const snap  = await firestore().collection('appointments')
      .where('providerId','==',doc.id)
      .where('scheduledAt','>=',start)
      .where('scheduledAt','<=',end).get();
    const taken = snap.docs.map((d) => {
      const ts = d.data().scheduledAt?.toDate?.() || new Date(d.data().scheduledAt);
      return `${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}`;
    });
    setBookedSlots(taken);
  };

  const handleDateSelect = (date) => {
    setSelectedDate(date); setSelectedSlot(null);
    if (selectedDoc) loadSlots(selectedDoc, date);
  };

  const handleBook = () => {
    if (!selectedDoc || !selectedDate || !selectedSlot) return;
    const [h, m] = selectedSlot.split(':').map(Number);
    const dt = new Date(selectedDate); dt.setHours(h, m, 0, 0);
    bookAppointment(selectedDoc.id, dt.toISOString());
    setSelectedDoc(null); setSelectedDate(null); setSelectedSlot(null);
  };

  const slots = [];
  for (let h = 10; h < 18; h++) { slots.push(`${h}:00`); slots.push(`${h}:30`); }

  const formatSlot = (t) => {
    const [h, mm] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(mm).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  const today = new Date(); today.setHours(0,0,0,0);
  const calDays = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    calDays.push(d);
  }

  if (loadingDrs) return <View style={s.screen}><ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /></View>;

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={s.sectionLabel}>Choose a doctor</Text>

      {doctors.map((doc) => {
        const [c1, c2] = avatarColors(doc.name);
        const isExpanded = selectedDoc?.id === doc.id;
        const stats = docVisits[doc.id];
        return (
          <TouchableOpacity key={doc.id} style={[s.doctorCard, isExpanded && s.doctorCardActive]} onPress={() => selectDoctor(doc)} activeOpacity={0.85}>
            <View style={s.doctorCardRow}>
              <View style={[s.avatar, { backgroundColor: c1 }]}>
                <Text style={s.avatarText}>{initials(doc.name)}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.doctorName}>{doc.name}</Text>
                <Text style={s.doctorSpecialty}>{doc.specialty || doc.role}</Text>
                <Text style={s.doctorOrg}>{doc.orgName}</Text>
              </View>
              <View style={s.availChip}>
                <View style={s.availDot} />
                <Text style={s.availText}>10–6 PM</Text>
              </View>
            </View>

            {isExpanded && (
              <View style={{ marginTop: 14 }}>
                {stats && (
                  <View style={s.statRow}>
                    <View style={s.statBox}>
                      <Text style={s.statNum}>{stats.visits}</Text>
                      <Text style={s.statLabel}>Visits</Text>
                    </View>
                    <View style={s.statBox}>
                      <Text style={s.statNum}>{stats.rxCount}</Text>
                      <Text style={s.statLabel}>Prescriptions</Text>
                    </View>
                    <View style={s.statBox}>
                      <Text style={s.statNum}>0</Text>
                      <Text style={s.statLabel}>Admissions</Text>
                    </View>
                  </View>
                )}

                {/* Date strip */}
                <Text style={[s.sectionLabel, { marginTop: 14 }]}>Select date</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  {calDays.map((d, i) => {
                    const isSel = selectedDate?.toDateString() === d.toDateString();
                    return (
                      <TouchableOpacity key={i} style={[s.dayChip, isSel && s.dayChipActive]} onPress={() => handleDateSelect(d)}>
                        <Text style={[s.dayChipDay, isSel && { color: '#fff' }]}>{['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()]}</Text>
                        <Text style={[s.dayChipDate, isSel && { color: '#fff', fontWeight: '700' }]}>{d.getDate()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Time slots */}
                {selectedDate && (
                  <>
                    <Text style={s.sectionLabel}>Available slots</Text>
                    <View style={s.slotGrid}>
                      {slots.map((sl) => {
                        const booked = bookedSlots.includes(sl);
                        const isSel  = selectedSlot === sl;
                        return (
                          <TouchableOpacity
                            key={sl} disabled={booked}
                            style={[s.slot, isSel && s.slotActive, booked && s.slotBooked]}
                            onPress={() => setSelectedSlot(sl)}
                          >
                            <Text style={[s.slotText, isSel && { color: '#fff' }, booked && { color: colors.border, textDecorationLine: 'line-through' }]}>
                              {formatSlot(sl)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}

                {selectedDate && selectedSlot && (
                  <TouchableOpacity style={[s.primaryBtn, { marginTop: 14 }]} onPress={handleBook}>
                    <Text style={s.primaryBtnText}>Confirm — {selectedDate.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})} at {formatSlot(selectedSlot)}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      <Text style={s.sectionLabel}>Your appointments</Text>
      {appointments.length === 0
        ? <View style={s.emptyState}><Text style={s.emptyIcon}>📅</Text><Text style={s.emptySub}>No appointments booked yet</Text></View>
        : appointments.map((a) => (
            <View key={a.id} style={s.card}>
              <View style={base.spaceBetween}>
                <View><Text style={s.tokenLabel}>Token</Text><Text style={s.tokenNum}>#{a.tokenNumber}</Text></View>
                <View style={{ alignItems: 'flex-end' }}>
                  <View style={[s.badge, a.status === 'booked' ? s.badgePending : s.badgeClear]}>
                    <Text style={s.badgeText}>{a.status}</Text>
                  </View>
                  <Text style={[s.listSub, { marginTop: 4 }]}>{a.scheduledAt?.toDate?.().toLocaleString()}</Text>
                </View>
              </View>
            </View>
          ))}
    </ScrollView>
  );
}

/* ── helpers: provider display + access timing ─────────────── */
function provDisplay(c, providerMap) {
  const p = providerMap?.[c.providerId] || {};
  return {
    name: c.providerName || p.name || `Provider ${c.providerId?.slice(0, 6)}`,
    org: c.orgName || p.orgName || 'Unknown hospital',
    specialty: c.specialty || p.specialty || '',
  };
}
function purposeOf(c) { return c.purpose || c.scope?.replace(/_/g, ' ') || 'Record access'; }
function timeAgo(ts) {
  const d = ts?.toDate?.(); if (!d) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return d.toLocaleDateString();
}
function expiryLabel(c) {
  const d = c.expiresAt?.toDate?.(); if (!d) return null;
  const mins = Math.floor((d.getTime() - Date.now()) / 60000);
  if (mins <= 0) return 'expired';
  if (mins < 60) return `expires in ${mins}m`;
  return `expires in ${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/* ── REQUESTS TAB ──────────────────────────────────────────── */
function RequestsTab({ pendingRequests, consents, providerMap, approveConsent, denyConsent }) {
  const handled = consents.filter((c) => c.approved || c.revokedAt);
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={s.sectionLabel}>Pending access requests</Text>
      {pendingRequests.length === 0
        ? <View style={s.emptyState}><Text style={s.emptyIcon}>📨</Text><Text style={s.emptySub}>No pending requests</Text></View>
        : pendingRequests.map((c) => {
            const d = provDisplay(c, providerMap);
            return (
              <View key={c.id} style={[s.card, { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' }]}>
                <View style={base.spaceBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{d.name}</Text>
                    <Text style={s.cardSub}>{d.org}{d.specialty ? ` · ${d.specialty}` : ''}</Text>
                  </View>
                  <Text style={s.listSub}>{timeAgo(c.createdAt)}</Text>
                </View>
                <View style={s.purposeBox}><Text style={s.purposeText}>📋 {purposeOf(c)}</Text></View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity style={[s.primaryBtn, { flex: 1 }]} onPress={() => approveConsent(c)}>
                    <Text style={s.primaryBtnText}>✓ Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.denyBtn, { flex: 1 }]} onPress={() => denyConsent(c)}>
                    <Text style={s.denyBtnText}>✕ Deny</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

      <Text style={s.sectionLabel}>Request history</Text>
      {handled.length === 0
        ? <Text style={s.cardSub}>No past requests</Text>
        : handled.map((c) => {
            const d = provDisplay(c, providerMap);
            const granted = c.approved && !c.revokedAt;
            return (
              <View key={c.id} style={s.card}>
                <View style={base.spaceBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.listTitle}>{d.name}</Text>
                    <Text style={s.listSub}>{purposeOf(c)} · {d.org}</Text>
                  </View>
                  <View style={[s.badge, granted ? s.badgeClear : s.badgeDanger]}>
                    <Text style={s.badgeText}>{c.revokedAt ? (c.approved ? 'revoked' : 'denied') : 'granted'}</Text>
                  </View>
                </View>
              </View>
            );
          })}
    </ScrollView>
  );
}

/* ── SECURITY TAB ──────────────────────────────────────────── */
function SecurityTab({ profile, patientId, activeAccess = [] }) {
  const navigation = useNavigation();
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Live access controls — navigate to detail page */}
      <Text style={s.sectionLabel}>Privacy & access</Text>
      <TouchableOpacity style={s.navCard} activeOpacity={0.8} onPress={() => navigation.navigate('AccessControls')}>
        <Text style={{ fontSize: 22 }}>🛡️</Text>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.cardTitle}>Live access controls</Text>
          <Text style={s.cardSub}>{activeAccess.length} provider(s) currently have access — tap to manage</Text>
        </View>
        <Text style={s.chevron}>›</Text>
      </TouchableOpacity>

      <Text style={s.sectionLabel}>Identity verification</Text>
      <Text style={[s.cardSub, { marginBottom: 16 }]}>Your signature and PIN are used to approve provider access requests.</Text>

      <View style={s.card}>
        <View style={base.spaceBetween}>
          <View>
            <Text style={s.cardTitle}>✍️ Signature</Text>
            <Text style={s.cardSub}>{profile?.signatureUrl ? 'Registered ✓' : 'Not set up'}</Text>
          </View>
          <TouchableOpacity style={profile?.signatureUrl ? s.ghostSmBtn : s.primarySmBtn}>
            <Text style={profile?.signatureUrl ? s.ghostSmBtnText : s.primarySmBtnText}>{profile?.signatureUrl ? 'Update' : 'Set up'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.card}>
        <View style={base.spaceBetween}>
          <View>
            <Text style={s.cardTitle}>🔢 PIN</Text>
            <Text style={s.cardSub}>{profile?.pinHash ? '6-digit PIN set ✓' : 'Not set up'}</Text>
          </View>
          <TouchableOpacity style={profile?.pinHash ? s.ghostSmBtn : s.primarySmBtn}>
            <Text style={profile?.pinHash ? s.ghostSmBtnText : s.primarySmBtnText}>{profile?.pinHash ? 'Change' : 'Set up'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[s.card, { backgroundColor: colors.indigoTint, borderColor: colors.indigo + '40' }]}>
        <Text style={[s.cardTitle, { color: colors.indigo }]}>🔒 E2E Encryption</Text>
        <Text style={[s.cardSub, { color: colors.indigo + 'CC', marginBottom: 0 }]}>Your prescriptions and consents are end-to-end encrypted. Only you and your authorised providers can read them. Keys are stored only on this device.</Text>
      </View>
    </ScrollView>
  );
}

/* ── PRESCRIPTION CARD ─────────────────────────────────────── */
function PrescriptionCard({ p }) {
  const status = p.safetyCheck?.status;
  return (
    <View style={s.card}>
      <View style={base.spaceBetween}>
        <View style={{ flex: 1 }}>
          <Text style={[s.cardTitle, { textTransform: 'capitalize' }]}>{p.drugName}</Text>
          <Text style={s.cardSub}>{p.dosage} · {p.frequency} · {p.durationDays}d</Text>
        </View>
        <View style={[s.badge, status === 'flagged' ? s.badgeDanger : status === 'clear' ? s.badgeClear : s.badgePending]}>
          <Text style={s.badgeText}>{status || 'checking'}</Text>
        </View>
      </View>
      {!!p.safetyCheck?.reasoning && (
        <View style={s.reasoningBlock}><Text style={s.reasoningText}>{p.safetyCheck.reasoning}</Text></View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#0C4A6E',
  },
  topbarTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  topbarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  topbarSub: { fontSize: 11, color: 'rgba(255,255,255,.6)' },
  idText: { fontSize: 11, color: 'rgba(255,255,255,.85)', fontWeight: '700', marginTop: 4, letterSpacing: 0.5 },
  bellBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.12)', alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingTop: 4 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalClose: { fontSize: 20, color: colors.textMuted, paddingHorizontal: 8 },
  notifRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  purposeBox: { marginTop: 10, backgroundColor: 'rgba(255,255,255,.6)', borderRadius: radius.sm, padding: 10 },
  purposeText: { fontSize: 13, color: '#92400E', fontWeight: '600' },
  denyBtn: { borderWidth: 1.5, borderColor: colors.danger, borderRadius: radius.sm, paddingVertical: 12, alignItems: 'center' },
  denyBtnText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  emergencyTag: { backgroundColor: colors.dangerTint, borderRadius: 100, paddingHorizontal: 6, paddingVertical: 2 },
  emergencyTagText: { fontSize: 8, fontWeight: '800', color: colors.danger },
  revokeBtn: { marginTop: 12, borderWidth: 1.5, borderColor: colors.danger, borderRadius: radius.sm, paddingVertical: 11, alignItems: 'center' },
  revokeBtnText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  rolePill: { backgroundColor: 'rgba(255,255,255,.15)', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  rolePillText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,.9)', letterSpacing: 0.5 },
  signOutBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,.2)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  signOutText: { fontSize: 12, color: 'rgba(255,255,255,.7)', fontWeight: '600' },
  tabBar: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, height: 60, paddingBottom: 8 },
  tabLabel: { fontSize: 10, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  cardTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 4 },
  cardSub: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  listTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  listSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tagDanger: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.dangerTint, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 },
  tagRemove: { color: '#B91C1C', fontSize: 12, fontWeight: '800' },
  chevron: { fontSize: 22, color: colors.textMuted, fontWeight: '300' },
  navCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  input: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: colors.text },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addCircleBtn: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  addCircleText: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: -2 },
  medCard: { backgroundColor: colors.bg, borderRadius: radius.sm, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  medName: { fontSize: 14, fontWeight: '700', color: colors.text },
  medQty: { fontSize: 12, fontWeight: '600', color: colors.primary },
  timingRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  timingChip: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1 },
  timingOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  timingOff: { backgroundColor: colors.surface, borderColor: colors.border },
  timingText: { fontSize: 10, fontWeight: '700' },
  medPurpose: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  accessRow: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  tagDangerText: { fontSize: 11, fontWeight: '700', color: '#B91C1C' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptySub: { fontSize: 13, color: colors.textMuted },
  reasoningBlock: { marginTop: 10, backgroundColor: colors.primaryTint, borderRadius: radius.sm, padding: 12, borderWidth: 1, borderColor: '#A5F3FC' },
  reasoningText: { fontSize: 12, color: '#155E75', lineHeight: 18 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 100 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  badgeClear: { backgroundColor: colors.accentTint },
  badgeDanger: { backgroundColor: colors.dangerTint },
  badgePending: { backgroundColor: colors.warningTint },
  badgeInfo: { backgroundColor: colors.primaryTint },
  tokenLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, marginBottom: 2 },
  tokenNum: { fontSize: 36, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] },
  doctorCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  doctorCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  doctorCardRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  doctorName: { fontSize: 15, fontWeight: '700', color: colors.text },
  doctorSpecialty: { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 2 },
  doctorOrg: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  availChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accentTint, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 4 },
  availDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  availText: { fontSize: 10, fontWeight: '700', color: colors.accent },
  statRow: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.sm, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statNum: { fontSize: 24, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', marginTop: 2 },
  dayChip: { width: 44, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sm, paddingVertical: 8, marginRight: 6, borderWidth: 1, borderColor: colors.border },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipDay: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  dayChipDate: { fontSize: 16, color: colors.text, fontWeight: '600', marginTop: 2 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '22%', alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  slotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotBooked: { backgroundColor: colors.bg },
  slotText: { fontSize: 11, color: colors.text, fontWeight: '500' },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: 13, alignItems: 'center', ...shadow.sm },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  primarySmBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 7 },
  primarySmBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  ghostSmBtn: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 7 },
  ghostSmBtnText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  toast: { position: 'absolute', bottom: 90, alignSelf: 'center', backgroundColor: colors.text, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 100, ...shadow.lg },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '500' },
});
