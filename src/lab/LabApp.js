import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import firestore from '@react-native-firebase/firestore';
import { colors, radius, shadow, avatarColors, initials, base } from '../styles/theme';

const Tab = createBottomTabNavigator();

const SCAN_TYPES = ['X-Ray', 'MRI', 'CT Scan', 'Ultrasound', 'Blood Test', 'ECG'];
const BODY_PARTS = ['Chest', 'Head', 'Abdomen', 'Spine', 'Limb', 'Full Body', 'Cardiac', 'N/A'];

export default function LabApp({ user, profile, onSignOut }) {
  const labTechId = user.uid;
  const [scans, setScans]   = useState([]);
  const [toast, setToast]   = useState(null);

  useEffect(() => {
    const onErr = (e) => console.warn('[labScans] listener error:', e?.message || e);
    const unsub = firestore().collection('labScans')
      .where('labTechId', '==', labTechId)
      .orderBy('createdAt', 'desc')
      .onSnapshot((snap) => { if (!snap) return; setScans(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); }, onErr);
    return () => unsub();
  }, [labTechId]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 5000); };
  const shared = { user, profile, labTechId, scans, showToast };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.topbar}>
        <View>
          <Text style={s.topbarTitle}>{profile?.name || 'Lab Technician'}</Text>
          <View style={s.topbarRow}>
            <View style={s.rolePill}><Text style={s.rolePillText}>🔬 LAB TECHNICIAN</Text></View>
            {!!profile?.orgName && <Text style={s.topbarSub}>{profile.orgName}</Text>}
          </View>
        </View>
        <TouchableOpacity style={s.signOutBtn} onPress={onSignOut}>
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: s.tabBar, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textMuted, tabBarLabelStyle: s.tabLabel }}>
        <Tab.Screen name="Upload" options={{ tabBarIcon: () => <Text style={{ fontSize: 18 }}>📤</Text> }}>
          {() => <UploadScanTab {...shared} />}
        </Tab.Screen>
        <Tab.Screen name="Scans" options={{ tabBarIcon: () => <Text style={{ fontSize: 18 }}>🩻</Text>, tabBarBadge: scans.length || undefined }}>
          {() => <ScansTab {...shared} />}
        </Tab.Screen>
        <Tab.Screen name="Patients" options={{ tabBarIcon: () => <Text style={{ fontSize: 18 }}>👥</Text> }}>
          {() => <LabPatientsTab {...shared} />}
        </Tab.Screen>
      </Tab.Navigator>

      {!!toast && <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>}
    </SafeAreaView>
  );
}

/* ── UPLOAD SCAN TAB ───────────────────────────────────────── */
function UploadScanTab({ labTechId, profile, showToast }) {
  const [patQuery, setPatQuery]     = useState('');
  const [patResults, setPatResults] = useState([]);
  const [selPat, setSelPat]         = useState(null);
  const [scanType, setScanType]     = useState('X-Ray');
  const [bodyPart, setBodyPart]     = useState('Chest');
  const [findings, setFindings]     = useState('');
  const [status, setStatus]         = useState('normal');
  const [imageUrl, setImageUrl]     = useState('');
  const [typeOpen, setTypeOpen]     = useState(false);
  const [partOpen, setPartOpen]     = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const searchPat = async () => {
    if (!patQuery.trim()) return;
    const snap = await firestore().collection('patients')
      .orderBy('name').startAt(patQuery.trim()).endAt(patQuery.trim() + '').limit(10).get();
    setPatResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  const submit = async () => {
    if (!selPat) { showToast('Select a patient first'); return; }
    setSubmitting(true);
    try {
      await firestore().collection('labScans').add({
        patientId: selPat.id,
        patientName: selPat.name,
        labTechId,
        labTechName: profile?.name || 'Lab',
        orgName: profile?.orgName || null,
        scanType, bodyPart, findings: findings.trim(),
        status,
        imageUrl: imageUrl.trim() || null,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
      showToast(`✓ ${scanType} uploaded for ${selPat.name}`);
      setSelPat(null); setPatQuery(''); setPatResults([]);
      setFindings(''); setImageUrl(''); setStatus('normal');
    } catch (e) {
      showToast('Upload failed: ' + e.message);
    } finally { setSubmitting(false); }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Text style={s.sectionLabel}>Patient</Text>
      {selPat ? (
        <View style={s.selectedPat}>
          <View style={[s.avatarSm, { backgroundColor: avatarColors(selPat.name)[0] }]}>
            <Text style={s.avatarSmText}>{initials(selPat.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.patientName}>{selPat.name}</Text>
            <Text style={s.idText}>ID: {selPat.id.slice(0, 10).toUpperCase()}</Text>
          </View>
          <TouchableOpacity style={s.clearBtn} onPress={() => setSelPat(null)}><Text style={s.clearBtnText}>✕</Text></TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={s.searchRow}>
            <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={patQuery} onChangeText={setPatQuery} onSubmitEditing={searchPat} placeholder="Search patient…" placeholderTextColor={colors.textMuted} returnKeyType="search" />
            <TouchableOpacity style={s.searchBtn} onPress={searchPat}><Text style={{ color: '#fff', fontSize: 16 }}>🔍</Text></TouchableOpacity>
          </View>
          {patResults.map((p) => (
            <TouchableOpacity key={p.id} style={s.patPickRow} onPress={() => { setSelPat(p); setPatResults([]); }}>
              <View style={[s.avatarSm, { backgroundColor: avatarColors(p.name)[0] }]}><Text style={s.avatarSmText}>{initials(p.name)}</Text></View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.patientName}>{p.name}</Text>
                <Text style={s.idText}>ID: {p.id.slice(0, 10).toUpperCase()}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}

      <Text style={[s.sectionLabel, { marginTop: 16 }]}>Scan details</Text>

      <Text style={s.label}>Scan type</Text>
      <TouchableOpacity style={s.select} onPress={() => { setTypeOpen(!typeOpen); setPartOpen(false); }}>
        <Text style={s.selectText}>{scanType}</Text><Text style={s.selectArrow}>{typeOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {typeOpen && (
        <View style={s.dropdown}>
          {SCAN_TYPES.map((t) => (
            <TouchableOpacity key={t} style={s.dropItem} onPress={() => { setScanType(t); setTypeOpen(false); }}>
              <Text style={[s.dropItemText, scanType === t && { color: colors.primary, fontWeight: '700' }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={s.label}>Body part</Text>
      <TouchableOpacity style={s.select} onPress={() => { setPartOpen(!partOpen); setTypeOpen(false); }}>
        <Text style={s.selectText}>{bodyPart}</Text><Text style={s.selectArrow}>{partOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {partOpen && (
        <View style={s.dropdown}>
          {BODY_PARTS.map((b) => (
            <TouchableOpacity key={b} style={s.dropItem} onPress={() => { setBodyPart(b); setPartOpen(false); }}>
              <Text style={[s.dropItemText, bodyPart === b && { color: colors.primary, fontWeight: '700' }]}>{b}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={s.label}>Findings / notes</Text>
      <TextInput style={[s.input, { height: 90, textAlignVertical: 'top' }]} value={findings} onChangeText={setFindings} placeholder="No acute findings. Lungs clear…" placeholderTextColor={colors.textMuted} multiline />

      <Text style={s.label}>Result status</Text>
      <View style={s.statusRow}>
        {[['normal', '✓ Normal', colors.accent], ['abnormal', '⚠ Abnormal', colors.danger], ['pending', '… Pending', colors.warning]].map(([val, lbl, c]) => (
          <TouchableOpacity key={val} style={[s.statusChip, status === val && { backgroundColor: c, borderColor: c }]} onPress={() => setStatus(val)}>
            <Text style={[s.statusChipText, status === val && { color: '#fff' }]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.label}>Scan image URL (optional)</Text>
      <TextInput style={s.input} value={imageUrl} onChangeText={setImageUrl} placeholder="https://… (or leave blank)" placeholderTextColor={colors.textMuted} autoCapitalize="none" />

      <TouchableOpacity style={[s.primaryBtn, { marginTop: 8 }]} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>📤 Upload scan</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

/* ── SCANS LIST TAB ────────────────────────────────────────── */
function ScansTab({ scans }) {
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={s.sectionLabel}>Uploaded scans ({scans.length})</Text>
      {scans.length === 0
        ? <View style={s.emptyState}><Text style={s.emptyIcon}>🩻</Text><Text style={s.emptySub}>No scans uploaded yet</Text></View>
        : scans.map((sc) => <ScanCard key={sc.id} sc={sc} />)}
    </ScrollView>
  );
}

function ScanCard({ sc }) {
  const c = sc.status === 'abnormal' ? colors.danger : sc.status === 'pending' ? colors.warning : colors.accent;
  return (
    <View style={s.card}>
      <View style={base.spaceBetween}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>{sc.scanType} · {sc.bodyPart}</Text>
          <Text style={s.cardSub}>{sc.patientName} · ID {sc.patientId?.slice(0, 8).toUpperCase()}</Text>
        </View>
        <View style={[s.badge, { backgroundColor: c + '22' }]}><Text style={[s.badgeText, { color: c }]}>{sc.status}</Text></View>
      </View>
      {!!sc.findings && <View style={s.findingsBlock}><Text style={s.findingsText}>{sc.findings}</Text></View>}
      {!!sc.imageUrl && <Text style={s.linkText}>🔗 {sc.imageUrl}</Text>}
      <Text style={s.dateText}>{sc.createdAt?.toDate?.().toLocaleString() || 'just now'}</Text>
    </View>
  );
}

/* ── PATIENTS TAB ──────────────────────────────────────────── */
function LabPatientsTab() {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [searching, setSearch]  = useState(false);
  const [selected, setSelected] = useState(null);
  const [patScans, setPatScans] = useState([]);

  const search = async () => {
    if (!query.trim()) return;
    setSearch(true);
    try {
      const snap = await firestore().collection('patients')
        .orderBy('name').startAt(query.trim()).endAt(query.trim() + '').limit(20).get();
      setResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally { setSearch(false); }
  };

  const openPatient = async (p) => {
    const isOpen = selected?.id === p.id;
    setSelected(isOpen ? null : p);
    if (!isOpen) {
      const snap = await firestore().collection('labScans').where('patientId', '==', p.id).get();
      setPatScans(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <Text style={s.sectionLabel}>Patient lookup</Text>
      <View style={s.searchRow}>
        <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={query} onChangeText={setQuery} onSubmitEditing={search} placeholder="Search by name…" placeholderTextColor={colors.textMuted} returnKeyType="search" />
        <TouchableOpacity style={s.searchBtn} onPress={search}>{searching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontSize: 16 }}>🔍</Text>}</TouchableOpacity>
      </View>

      {results.map((p) => {
        const isOpen = selected?.id === p.id;
        return (
          <TouchableOpacity key={p.id} style={[s.card, isOpen && { borderColor: colors.primary, backgroundColor: colors.primaryTint }]} onPress={() => openPatient(p)}>
            <View style={s.cardRow}>
              <View style={[s.avatarSm, { backgroundColor: avatarColors(p.name)[0] }]}><Text style={s.avatarSmText}>{initials(p.name)}</Text></View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.patientName}>{p.name}</Text>
                <Text style={s.idText}>ID: {p.id.slice(0, 10).toUpperCase()}</Text>
              </View>
              <Text style={{ color: colors.textMuted }}>{isOpen ? '▲' : '▼'}</Text>
            </View>
            {isOpen && (
              <View style={{ marginTop: 10 }}>
                <Text style={s.sectionLabel}>Scan history ({patScans.length})</Text>
                {patScans.length === 0
                  ? <Text style={s.cardSub}>No scans on record</Text>
                  : patScans.map((sc) => (
                      <View key={sc.id} style={s.miniScan}>
                        <Text style={s.miniScanTitle}>{sc.scanType} · {sc.bodyPart}</Text>
                        <Text style={s.cardSub}>{sc.findings || '—'}</Text>
                      </View>
                    ))}
              </View>
            )}
          </TouchableOpacity>
        );
      })}
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
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  cardSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  idText: { fontSize: 11, color: colors.primary, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  searchBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, width: 44, alignItems: 'center', justifyContent: 'center' },
  input: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: colors.text, marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  select: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  selectText: { fontSize: 14, color: colors.text },
  selectArrow: { fontSize: 12, color: colors.textMuted },
  dropdown: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginBottom: 12, ...shadow.md, overflow: 'hidden' },
  dropItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropItemText: { fontSize: 14, color: colors.text },
  statusRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statusChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  statusChipText: { fontSize: 12, fontWeight: '700', color: colors.text },
  selectedPat: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primaryTint, borderRadius: radius.sm, padding: 12, marginBottom: 10 },
  avatarSm: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarSmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  patientName: { fontSize: 14, fontWeight: '700', color: colors.text },
  clearBtn: { backgroundColor: colors.danger, borderRadius: 100, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  clearBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  patPickRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: 13, alignItems: 'center', ...shadow.sm },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 100 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  findingsBlock: { marginTop: 10, backgroundColor: colors.bg, borderRadius: radius.sm, padding: 10, borderWidth: 1, borderColor: colors.border },
  findingsText: { fontSize: 12, color: colors.text, lineHeight: 18 },
  linkText: { fontSize: 11, color: colors.primary, marginTop: 8 },
  dateText: { fontSize: 10, color: colors.textMuted, marginTop: 8 },
  miniScan: { backgroundColor: colors.bg, borderRadius: radius.sm, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.border },
  miniScanTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptySub: { fontSize: 13, color: colors.textMuted },
  toast: { position: 'absolute', bottom: 80, alignSelf: 'center', backgroundColor: colors.text, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 100, ...shadow.lg },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '500' },
});
