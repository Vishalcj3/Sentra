import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AuthScreen from './src/screens/AuthScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import PatientApp from './src/patient/PatientApp';
import DoctorApp from './src/doctor/DoctorApp';
import { colors } from './src/styles/theme';

const Stack = createNativeStackNavigator();

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export default function App() {
  const [user, setUser]       = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [role, setRole]       = useState(null);

  useEffect(() => {
    return auth().onAuthStateChanged(async (u) => {
      setUser(u ?? null);
      if (u) await resolveProfile(u.uid);
      else { setProfile(null); setRole(null); }
    });
  }, []);

  const resolveProfile = async (uid) => {
    try {
      const [patSnap, provSnap] = await Promise.all([
        firestore().collection('patients').doc(uid).get(),
        firestore().collection('providers').doc(uid).get(),
      ]);
      if (patSnap.exists) {
        setProfile({ id: uid, ...patSnap.data() });
        setRole('patient');
      } else if (provSnap.exists) {
        const data = provSnap.data();
        setProfile({ id: uid, ...data });
        setRole(data.role);
      } else {
        setProfile(null);
        setRole('unregistered');
      }
    } catch {
      setRole('unregistered');
    }
  };

  if (user === undefined) return <LoadingScreen />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!user ? (
            <Stack.Screen name="Auth" component={AuthScreen} />
          ) : role === 'unregistered' || !role ? (
            <Stack.Screen name="Register">
              {() => (
                <RegisterScreen
                  user={user}
                  onComplete={(newRole, profileData) => {
                    setProfile({ id: user.uid, ...profileData });
                    setRole(newRole);
                  }}
                />
              )}
            </Stack.Screen>
          ) : role === 'patient' ? (
            <Stack.Screen name="PatientApp">
              {() => (
                <PatientApp
                  user={user}
                  profile={profile}
                  onProfileUpdate={(u) => setProfile((p) => ({ ...p, ...u }))}
                  onSignOut={() => auth().signOut()}
                />
              )}
            </Stack.Screen>
          ) : (
            <Stack.Screen name="DoctorApp">
              {() => (
                <DoctorApp
                  user={user}
                  profile={profile}
                  onSignOut={() => auth().signOut()}
                />
              )}
            </Stack.Screen>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
