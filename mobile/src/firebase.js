import firebase from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import functions from '@react-native-firebase/functions';

// Firebase is auto-initialised via google-services.json / GoogleService-Info.plist
// No manual initializeApp() needed with @react-native-firebase

export { auth, firestore, storage, functions, firebase };
