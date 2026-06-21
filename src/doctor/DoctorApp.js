import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput, ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import { colors, radius, shadow, avatarColors, initials, base } from '../styles/theme';
import { encryptPrescription, getMySecretKey } from '../crypto';

const Tab = createBottomTabNavigator();
const bookApptFn  = functions().httpsCallable('bookAppointment');
const askAgentFn  = functions().httpsCallable('askSafetyAgent');

export default function DoctorApp({ user, profile, onSignOut }) {
  const providerId = user.uid;
  const [patients, setPatients]       = useState([]);
  const [queue, setQueue]             = useState([]);
  const [notifications, setNotif]     = useState([]);
  const [toast, setToast]             = useState(null);

  useEffect(() => {
    const onErr = (label) => (e) => console.warn(`[${label}] listener error:`, e?.message || e);

    const unsubs = [
      firestore().collection('appointments')
        .where('providerId', '==', providerId)
        .where('status', '==', 'booked')
        .orderBy('scheduledAt', 'asc')
        .onSnapshot((snap) => { if (!snap) return; setQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); }, onErr('queue')),
      firestore().collection('notifications')
        .where('providerId', '==', providerId)
        .orderBy('createdAt', 'desc')
        .onSnapshot((snap) => { if (!snap) return; setNotif(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); }, onErr('notifications')),
    ];
    return () => unsubs.forEach((u) => u());
  }, [providerId]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 5000); };

  const sharedProps = { user, profile, providerId, patients, setPatients, queue, notifications, showToast };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.topbar}>
        <View>
          <Text style={s.topbarTitle}>{profile?.name || 'Doctor'}</Text>
          <View style={s.topbarRow}>
            <View style={s.rolePill}><Text style={s.rolePillText}>👨‍⚕️ {(profile?.specialty || 'Doctor').toUpperCase()}</Text></View>
            {!!profile?.orgName && <Text style={s.topbarSub}>{profile.orgName}</Text>}
          </View>
        </View>
        <TouchableOpacity style={s.signOutBtn} onPress={onSignOut}>
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: s.tabBar, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textMuted, tabBarLabelStyle: s.tabLabel }}>
        <Tab.Screen name="Patients" options={{ tabBarIcon: () => <Text style={{ fontSize: 18 }}>👥</Text> }}>
          {() => <PatientsTab {...sharedProps} />}
        </Tab.Screen>
        <Tab.Screen name="Prescribe" options={{ tabBarIcon: () => <Text style={{ fontSize: 18 }}>💊</Text> }}>
          {() => <PrescribeTab {...sharedProps} />}
        </Tab.Screen>
        <Tab.Screen name="Queue" options={{ tabBarIcon: () => <Text style={{ fontSize: 18 }}>🏥</Text>, tabBarBadge: queue.length > 0 ? queue.length : undefined }}>
          {() => <QueueTab {...sharedProps} bookApptFn={bookApptFn} />}
        </Tab.Screen>
      </Tab.Navigator>

      {!!toast && <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>}
    </SafeAreaView>
  );
}

/* ── PATIENTS TAB ──────────────────────────────────────────── */
function PatientsTab({ providerId, showToast }) {
  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState([]);
  const [searching, setSearching]     = useState(false);
  const [selected, setSelected]       = useState(null);
  const [stats, setStats]             = useState(null);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const snap = await firestore().collection('patients')
        .orderBy('name').startAt(query.trim()).endAt(query.trim() + '').limit(20).get();
      setResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally { setSearching(false); }
  };

  const [patScans, setPatScans] = useState([]);

  const openPatient = async (p) => {
    setSelected(selected?.id === p.id ? null : p);
    if (selected?.id !== p.id) {
      const [apptSnap, rxSnap, consentSnap, scanSnap] = await Promise.all([
        firestore().collection('appointments').where('patientId','==',p.id).where('providerId','==',providerId).get(),
        firestore().collection('prescriptions').where('patientId','==',p.id).where('providerId','==',providerId).get(),
        firestore().collection('consents').where('patientId','==',p.id).where('providerId','==',providerId).get(),
        firestore().collection('labScans').where('patientId','==',p.id).get(),
      ]);
      setStats({ visits: apptSnap.size, prescriptions: rxSnap.size, consents: consentSnap.size });
      setPatScans(scanSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <Text style={s.sectionLabel}>Patient search</Text>
      <View style={s.searchRow}>
        <TextInput
          style={[s.input, { flex: 1 }]}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          placeholder="Search by name…"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
        />
        <TouchableOpacity style={s.searchBtn} onPress={search} disabled={searching}>
          {searching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontSize: 16 }}>🔍</Text>}
        </TouchableOpacity>
      </View>

      {results.map((p) => {
        const [c1] = avatarColors(p.name);
        const isOpen = selected?.id === p.id;
        return (
          <TouchableOpacity key={p.id} style={[s.patientCard, isOpen && s.patientCardActive]} onPress={() => openPatient(p)} activeOpacity={0.85}>
            <View style={s.cardRow}>
              <View style={[s.avatar, { backgroundColor: c1 }]}>
                <Text style={s.avatarText}>{initials(p.name)}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.patientName}>{p.name}</Text>
                <Text style={s.idText}>🆔 {p.id.slice(0, 10).toUpperCase()}</Text>
                <Text style={s.patientSub}>{p.phone || p.email || 'No contact'}</Text>
                {!!p.dob && <Text style={s.patientSub}>DOB: {p.dob}</Text>}
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>{isOpen ? '▲' : '▼'}</Text>
            </View>
            {isOpen && stats && (
              <View style={{ marginTop: 12 }}>
                <View style={s.statRow}>
                  <View style={s.statBox}><Text style={s.statNum}>{stats.visits}</Text><Text style={s.statLabel}>Visits</Text></View>
                  <View style={s.statBox}><Text style={s.statNum}>{stats.prescriptions}</Text><Text style={s.statLabel}>Prescriptions</Text></View>
                  <View style={s.statBox}><Text style={s.statNum}>{stats.consents}</Text><Text style={s.statLabel}>Consents</Text></View>
                </View>
                {p.allergies?.length > 0 && (
                  <View style={[s.alertBox, { marginTop: 10 }]}>
                    <Text style={s.alertText}>⚠ Allergies: {p.allergies.join(', ')}</Text>
                  </View>
                )}
                {patScans.length > 0 && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={s.sectionLabel}>🩻 Lab scans ({patScans.length})</Text>
                    {patScans.map((sc) => {
                      const c = sc.status === 'abnormal' ? colors.danger : sc.status === 'pending' ? colors.warning : colors.accent;
                      return (
                        <View key={sc.id} style={s.scanRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.listTitle}>{sc.scanType} · {sc.bodyPart}</Text>
                            <Text style={s.listSub}>{sc.findings || '—'}</Text>
                          </View>
                          <View style={[s.badge, { backgroundColor: c + '22' }]}><Text style={[s.badgeText, { color: c }]}>{sc.status}</Text></View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      {results.length === 0 && !searching && !!query && (
        <View style={s.emptyState}><Text style={s.emptyIcon}>🔍</Text><Text style={s.emptySub}>No patients found</Text></View>
      )}
    </ScrollView>
  );
}

/* ── PRESCRIBE TAB ─────────────────────────────────────────── */
function PrescribeTab({ providerId, showToast }) {
  const [patQuery, setPatQuery]       = useState('');
  const [patResults, setPatResults]   = useState([]);
  const [selectedPat, setSelectedPat] = useState(null);
  const [items, setItems]             = useState([{ drugName: '', dosage: '', frequency: '', durationDays: '', notes: '' }]);
  const [submitting, setSubmitting]   = useState(false);

  const searchPat = async () => {
    if (!patQuery.trim()) return;
    const snap = await firestore().collection('patients')
      .orderBy('name').startAt(patQuery.trim()).endAt(patQuery.trim() + '').limit(10).get();
    setPatResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  const addItem = () => setItems((prev) => [...prev, { drugName: '', dosage: '', frequency: '', durationDays: '', notes: '' }]);
  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i, field, val) => setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));

  const submit = async () => {
    if (!selectedPat) { showToast('Select a patient first'); return; }
    const valid = items.filter((it) => it.drugName.trim() && it.dosage.trim());
    if (!valid.length) { showToast('Add at least one drug with name and dosage'); return; }
    setSubmitting(true);
    try {
      const secretKey = await getMySecretKey();
      await Promise.all(valid.map(async (item) => {
        const encrypted = await encryptPrescription(item, selectedPat.id, providerId);
        await firestore().collection('prescriptions').add({
          ...encrypted,
          patientId: selectedPat.id,
          providerId,
          createdAt: firestore.FieldValue.serverTimestamp(),
          safetyCheck: { status: 'pending' },
        });
      }));
      showToast(`✓ ${valid.length} prescription(s) submitted — safety check running`);
      setItems([{ drugName: '', dosage: '', frequency: '', durationDays: '', notes: '' }]);
      setSelectedPat(null); setPatQuery(''); setPatResults([]);
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

      <Text style={[s.sectionLabel, { marginTop: 18 }]}>Prescription items</Text>

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
              <TextInput
                style={s.input} value={item[field]} onChangeText={(v) => updateItem(i, field, v)}
                placeholder={ph} placeholderTextColor={colors.textMuted}
                keyboardType={field === 'durationDays' ? 'number-pad' : 'default'}
              />
            </React.Fragment>
          ))}
        </View>
      ))}

      <TouchableOpacity style={s.addItemBtn} onPress={addItem}>
        <Text style={s.addItemBtnText}>+ Add item</Text>
      </TouchableOpacity>

      <View style={[s.encryptNote, { marginTop: 10 }]}>
        <Text style={s.encryptNoteText}>🔒 Prescription will be E2E encrypted for this patient before upload.</Text>
      </View>

      <TouchableOpacity style={[s.primaryBtn, { marginTop: 14 }]} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Submit prescription →</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

/* ── QUEUE TAB ─────────────────────────────────────────────── */
function QueueTab({ providerId, queue, showToast, bookApptFn }) {
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
      .orderBy('name').startAt(patQuery).endAt(patQuery + '').limit(10).get();
    setPatResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  const loadSlots = async (date) => {
    const start = new Date(date); start.setHours(0,0,0,0);
    const end   = new Date(date); end.setHours(23,59,59,999);
    const snap  = await firestore().collection('appointments')
      .where('providerId','==',providerId).where('scheduledAt','>=',start).where('scheduledAt','<=',end).get();
    const taken = snap.docs.map((d) => {
      const ts = d.data().scheduledAt?.toDate?.() || new Date(d.data().scheduledAt);
      return `${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}`;
    });
    setBookedSlots(taken);
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

  const completeAppt = (id) => firestore().collection('appointments').doc(id).update({ status: 'completed' });

  const today = new Date(); today.setHours(0,0,0,0);
  const calDays = Array.from({ length: 14 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i); return d; });
  const slots = [];
  for (let h = 10; h < 18; h++) { slots.push(`${h}:00`); slots.push(`${h}:30`); }
  const formatSlot = (t) => { const [h, mm] = t.split(':').map(Number); return `${h % 12 || 12}:${String(mm).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`; };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={base.spaceBetween}>
        <Text style={s.sectionLabel}>Today's queue ({queue.length})</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowPicker(!showPicker)}>
          <Text style={s.addBtnText}>+ Add appointment</Text>
        </TouchableOpacity>
      </View>

      {queue.length === 0 && !showPicker && (
        <View style={s.emptyState}><Text style={s.emptyIcon}>🏥</Text><Text style={s.emptySub}>No upcoming appointments</Text></View>
      )}

      {queue.map((appt) => (
        <View key={appt.id} style={s.card}>
          <View style={base.spaceBetween}>
            <View>
              <Text style={s.tokenLabel}>Token</Text>
              <Text style={s.tokenNum}>#{appt.tokenNumber}</Text>
              <Text style={s.patientSub}>{appt.scheduledAt?.toDate?.().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
            <TouchableOpacity style={s.completeBtn} onPress={() => completeAppt(appt.id)}>
              <Text style={s.completeBtnText}>✓ Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {showPicker && (
        <View style={[s.card, { borderColor: colors.primary, borderWidth: 2 }]}>
          <Text style={[s.cardTitle, { marginBottom: 12 }]}>Add appointment</Text>

          {/* Patient picker */}
          {selPat ? (
            <View style={s.selectedPat}>
              <View style={[s.avatarSm, { backgroundColor: avatarColors(selPat.name)[0] }]}>
                <Text style={s.avatarSmText}>{initials(selPat.name)}</Text>
              </View>
              <Text style={s.patientName}>{selPat.name}</Text>
              <TouchableOpacity style={s.clearBtn} onPress={() => { setSelPat(null); setPatResults([]); }}>
                <Text style={s.clearBtnText}>✕</Text>
              </TouchableOpacity>
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

          {/* Date strip */}
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

          {/* Slots */}
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
  tabBar: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, height: 60, paddingBottom: 8 },
  tabLabel: { fontSize: 10, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  cardTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  cardSub: { fontSize: 12, color: colors.textMuted },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  searchBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, width: 44, alignItems: 'center', justifyContent: 'center' },
  input: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: colors.text, marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 2 },
  listTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  listSub: { fontSize: 11, color: colors.textMuted },
  patientCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  patientCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  avatarSm: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarSmText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  patientName: { fontSize: 15, fontWeight: '700', color: colors.text },
  patientSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  idText: { fontSize: 11, color: colors.primary, fontWeight: '700', marginTop: 2, letterSpacing: 0.3 },
  scanRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: radius.sm, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.border },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 100 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  statRow: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.sm, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statNum: { fontSize: 24, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', marginTop: 2 },
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
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptySub: { fontSize: 13, color: colors.textMuted },
  tokenLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  tokenNum: { fontSize: 36, fontWeight: '800', color: colors.primary },
  completeBtn: { backgroundColor: colors.accentTint, borderRadius: radius.sm, paddingHorizontal: 16, paddingVertical: 8 },
  completeBtnText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
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
