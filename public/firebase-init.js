// Single place for the Firebase web config. Every page imports { app, auth } from here.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js';
import { getAuth, connectAuthEmulator, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';

// Firebase project "Cinema Booking 02739322" (Auth, Firestore, Functions and Hosting all live here).
const productionConfig = {
    apiKey: 'AIzaSyBScB4D-X8k8LXXkhvbk3-y85uYVp4Ph74',
    authDomain: 'my-web-project-491413.firebaseapp.com',
    projectId: 'my-web-project-491413',
    storageBucket: 'my-web-project-491413.firebasestorage.app',
    messagingSenderId: '715589129555',
    appId: '1:715589129555:web:ea734759d339b51ea53da6',
    measurementId: 'G-XVH8R19HDM'
};

// `firebase emulators:start --project demo-cinema` serves the site on port 5050.
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
export const usingEmulators = isLocalHost && window.location.port === '5050';

export const firebaseConfig = usingEmulators
    ? { ...productionConfig, projectId: 'demo-cinema', authDomain: 'demo-cinema.firebaseapp.com' }
    : productionConfig;

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
if (usingEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

if (window.cinemaApi) {
    window.cinemaApi.attachAuth(auth, onAuthStateChanged);
}
