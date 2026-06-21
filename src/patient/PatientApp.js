import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, FlatList, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import functions from '@react-native-firebase/functions';
import { colors, radius, shadow, avatarColors, initials, base } from '../styles/theme';
import { decryptPrescription } from '../crypto';

const Tab = createBottomTabNavigator();
const bookApptFn = functions().httpsCallable('bookAppointment');

// ── Shared context via props drilling (small app, no context needed) ──────────

export default function PatientApp({ user, profile, onProfileUpdate, onSignOut }) {
  const patientId = user.uid;
  const [prescriptions, setPrescriptions]   = useState([]);
  const [consents, setConsents]             = useState([]);
  const [appointments, setAppointments]     = useState([]);
  const [notifications, setNotifications]   = useState([]);
  const [toast, setToast]                   = useState(null);
  const [activeConsent, setActiveConsent]   = useState(null);

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
      firestore().collection('consents').where('patientId','==',patientId).where('approved','==',false)
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
    ];
    return () => unsubs.forEach((u) => u());
  }, [patientId]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 5000); };

  const bookAppointment = async (providerId, when) => {
    try {
      const res = await bookApptFn({ patientId, providerId, scheduledAt: when });
      showToast(`Booked ✓  Token #${res.data.tokenNumber}`);
    } catch (e) {
      showToast('Booking failed: ' + e.message);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const sharedProps = { user, profile, patientId, prescriptions, consents, appointments, notifications, onProfileUpdate, onSignOut, bookAppointment, openConsent: setActiveConsent, showToast };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Gradient topbar */}
      <View style={s.topbar}>
        <View>
          <Text style={s.topbarTitle}>{profile?.name || 'Patient'}</Text>
          <View style={s.topbarRow}>
            <View style={s.rolePill}><Text style={s.rolePillText}>🧑‍⚕️ PATIENT</Text></View>
            {!!profile?.dob && <Text style={s.topbarSub}>DOB: {profile.dob}</Text>}
          </View>
        </View>
        <TouchableOpacity style={s.signOutBtn} onPress={onSignOut}>
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
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
          name="Alerts"
          options={{
            tabBarIcon: () => <Text style={{ fontSize: 18 }}>🔔</Text>,
            tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          }}
        >
          {() => <AlertsTab {...sharedProps} />}
        </Tab.Screen>
        <Tab.Screen name="Security" options={{ tabBarIcon: () => <Text style={{ fontSize: 18 }}>🔐</Text> }}>
          {() => <SecurityTab {...sharedProps} />}
        </Tab.Screen>
      </Tab.Navigator>

      {!!toast && (
        <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>
      )}
    </SafeAreaView>
  );
}

/* ── VAULT TAB ─────────────────────────────────────────────── */
function VaultTab({ profile, prescriptions, consents, openConsent }) {
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      {consents.length > 0 && (
        <View style={[s.card, { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' }]}>
          <Text style={[s.cardTitle, { color: '#92400E' }]}>⚠ {consents.length} access request(s) waiting</Text>
          <Text style={[s.cardSub, { color: '#B45309' }]}>Your signature or PIN is required.</Text>
          {consents.map((c) => (
            <View key={c.id} style={s.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.listTitle}>{c.scope?.replace(/_/g, ' ') || 'Record access'}</Text>
                <Text style={s.listSub}>Provider: {c.providerId?.slice(0, 8)}…</Text>
              </View>
              <TouchableOpacity style={s.primarySmBtn} onPress={() => openConsent(c)}>
                <Text style={s.primarySmBtnText}>Review →</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={s.card}>
        <Text style={s.cardTitle}>🧬 Allergies</Text>
        <View style={s.tagRow}>
          {profile?.allergies?.length
            ? profile.allergies.map((a) => <View key={a} style={s.tagDanger}><Text style={s.tagDangerText}>{a}</Text></View>)
            : <Text style={s.cardSub}>None recorded</Text>}
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>💊 Current medications</Text>
        {profile?.currentMeds?.length
          ? profile.currentMeds.map((m) => <Text key={m} style={s.listTitle}>{m}</Text>)
          : <Text style={s.cardSub}>None recorded</Text>}
      </View>

      <Text style={s.sectionLabel}>Prescription history</Text>
      {prescriptions.length === 0
        ? <View style={s.emptyState}><Text style={s.emptyIcon}>💊</Text><Text style={s.emptySub}>No prescriptions yet</Text></View>
        : prescriptions.map((p) => <PrescriptionCard key={p.id} p={p} />)}
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

/* ── ALERTS TAB ────────────────────────────────────────────── */
function AlertsTab({ notifications }) {
  const markRead = (id) => firestore().collection('notifications').doc(id).update({ read: true });
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={s.sectionLabel}>Notifications</Text>
      {notifications.length === 0
        ? <View style={s.emptyState}><Text style={s.emptyIcon}>🔔</Text><Text style={s.emptySub}>No notifications yet</Text></View>
        : notifications.map((n) => (
            <TouchableOpacity key={n.id} style={[s.card, !n.read && { borderColor: colors.primary, backgroundColor: colors.primaryTint }]} onPress={() => !n.read && markRead(n.id)}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Text style={{ fontSize: 20 }}>{n.type === 'safety_alert' ? '⚠️' : n.type === 'token_reminder' ? '🏥' : '💊'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.listTitle}>{n.message}</Text>
                  <Text style={[s.listSub, { marginTop: 4 }]}>{n.createdAt?.toDate?.().toLocaleTimeString()}</Text>
                </View>
                {!n.read && <View style={[s.badge, s.badgeInfo]}><Text style={s.badgeText}>New</Text></View>}
              </View>
            </TouchableOpacity>
          ))}
    </ScrollView>
  );
}

/* ── SECURITY TAB ──────────────────────────────────────────── */
function SecurityTab({ profile, patientId, onProfileUpdate }) {
  const [view, setView] = useState('home');
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32 }}>
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
  tagDanger: { backgroundColor: colors.dangerTint, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
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
