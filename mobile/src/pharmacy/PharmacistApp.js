import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import firestore from '@react-native-firebase/firestore';
import { colors, radius, shadow, avatarColors, initials, base } from '../styles/theme';
import { decryptPrescription } from '../crypto';

const Tab = createBottomTabNavigator();

export default function PharmacistApp({ user, profile, onSignOut }) {
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 4000); };
  const shared = { user, profile, showToast };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.topbar}>
        <View>
          <Text style={s.topbarTitle}>{profile?.name || 'Pharmacist'}</Text>
          <View style={s.topbarRow}>
            <View style={s.rolePill}><Text style={s.rolePillText}>💊 PHARMACIST</Text></View>
            {!!profile?.orgName && <Text style={s.topbarSub}>{profile.orgName}</Text>}
          </View>
        </View>
        <TouchableOpacity style={s.signOutBtn} onPress={onSignOut}><Text style={s.signOutText}>Sign out</Text></TouchableOpacity>
      </View>

      <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: s.tabBar, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textMuted, tabBarLabelStyle: s.tabLabel }}>
        <Tab.Screen name="Dispense" options={{ tabBarIcon: () => <Text style={{ fontSize: 18 }}>💊</Text> }}>
          {() => <DispenseTab {...shared} />}
        </Tab.Screen>
      </Tab.Navigator>

      {!!toast && <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>}
    </SafeAreaView>
  );
}

function DispenseTab({ showToast }) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [rxList, setRxList]     = useState([]);
  const [loading, setLoading]   = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    const snap = await firestore().collection('patients')
      .orderBy('name').startAt(query.trim()).endAt(query.trim() + '').limit(15).get();
    setResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  const openPatient = async (p) => {
    const isOpen = selected?.id === p.id;
    setSelected(isOpen ? null : p);
    if (!isOpen) {
      setLoading(true);
      try {
        const snap = await firestore().collection('prescriptions').where('patientId', '==', p.id).get();
        const list = await Promise.all(snap.docs.map(async (d) => {
          const data = d.data();
          return decryptPrescription({ id: d.id, ...data }, data.encryptedBy || data.providerId);
        }));
        setRxList(list);
      } finally { setLoading(false); }
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <Text style={s.sectionLabel}>Verify & dispense</Text>
      <View style={s.searchRow}>
        <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={query} onChangeText={setQuery} onSubmitEditing={search} placeholder="Search patient…" placeholderTextColor={colors.textMuted} returnKeyType="search" />
        <TouchableOpacity style={s.searchBtn} onPress={search}><Text style={{ color: '#fff', fontSize: 16 }}>🔍</Text></TouchableOpacity>
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
                {loading ? <ActivityIndicator color={colors.primary} /> : (
                  <>
                    <Text style={s.sectionLabel}>Prescriptions ({rxList.length})</Text>
                    {rxList.length === 0 ? <Text style={s.cardSub}>No prescriptions</Text> : rxList.map((rx) => (
                      <View key={rx.id} style={s.rxRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.miniScanTitle}>{rx.drugName}</Text>
                          <Text style={s.cardSub}>{rx.dosage} · {rx.frequency}</Text>
                        </View>
                        <TouchableOpacity style={s.dispenseBtn} onPress={() => showToast(`✓ Dispensed ${rx.drugName}`)}>
                          <Text style={s.dispenseBtnText}>Dispense</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </>
                )}
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
  cardSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  idText: { fontSize: 11, color: colors.primary, fontWeight: '700', marginTop: 2 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  searchBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, width: 44, alignItems: 'center', justifyContent: 'center' },
  input: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: colors.text },
  avatarSm: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarSmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  patientName: { fontSize: 14, fontWeight: '700', color: colors.text },
  miniScanTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  rxRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: radius.sm, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.border },
  dispenseBtn: { backgroundColor: colors.accentTint, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 7 },
  dispenseBtnText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  toast: { position: 'absolute', bottom: 80, alignSelf: 'center', backgroundColor: colors.text, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 100, ...shadow.lg },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '500' },
});
