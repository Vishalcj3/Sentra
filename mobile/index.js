// Secure PRNG polyfill — MUST be imported before tweetnacl (via App -> crypto.js)
// so nacl picks up crypto.getRandomValues. Without this, nacl throws "no PRNG".
import 'react-native-get-random-values';
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately.
registerRootComponent(App);
